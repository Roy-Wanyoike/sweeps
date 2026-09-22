import { db } from '@/lib/db';
import { Beat, BeatType, WatchEvent, jparse, retrievability } from '@/lib/contracts';
import { IMPACT, KEY_TYPES } from './audience';

/**
 * Season arc planner: the writers-room view across episodes.
 *
 * Everything here is computed from already-stored artifacts (beat plans,
 * screenings, viewer memories) — zero AI, zero new spend:
 *
 *  - tension profile   — writer-intent tension per beat from the beat plan
 *  - engagement        — measured mean satisfaction S per beat from screenings
 *  - hook payoff rate  — share of viewers whose memory recalls the previous
 *                        episode's cliffhanger at the next episode's first beat
 *  - open loops        — plot threads still retrievable (FSRS) when an episode opens
 *  - cast presence     — beats per character per episode from the plan cast lists
 */

/** Writer-intent tension per beat type (story-shape heuristic, 0..1). */
export const TENSION: Record<BeatType, number> = {
  BREATH: 0.15,
  SETUP: 0.35,
  HOOK: 0.6,
  ESCALATION: 0.65,
  CONFLICT: 0.75,
  REVEAL: 0.8,
  TWIST: 0.9,
  CLIFFHANGER: 1.0,
};

/** Threads with retrievability above this count as "still traceable" at an episode open. */
const ALIVE_THRESHOLD = 0.25;

export interface ArcBeat {
  index: number;
  type: string;
  title: string;
  tension: number;
  /** measured mean satisfaction S across viewers at this beat (null if unscreened) */
  engagement: number | null;
  isKey: boolean;
}

export interface ArcThread {
  key: string;
  title: string;
  plantedEp: number;
  type: string;
  /** FSRS retrievability when this episode opens */
  strength: number;
  alive: boolean;
}

export interface ArcEpisode {
  episodeId: string;
  number: number;
  status: string;
  retention: number | null;
  globalBeatStart: number;
  beats: ArcBeat[];
  cliffhanger: { title: string; hookPayoffRate: number | null } | null;
  threadsPlanted: { title: string; type: string }[];
  openLoops: { alive: number; total: number; threads: ArcThread[] };
  cast: { name: string; beats: number }[];
}

export interface ArcArm {
  arm: string;
  episodes: ArcEpisode[];
}

export interface SeasonArc {
  showId: string;
  title: string;
  arms: ArcArm[];
  cast: string[];
}

function parseBeats(beatPlan: string | null): Beat[] {
  const stored = jparse<Beat[] | { beats: Beat[] } | null>(beatPlan, []);
  return Array.isArray(stored) ? stored : (stored?.beats ?? []);
}

/** Mean satisfaction S per beat index from one episode's stored screenings. */
function engagementByBeat(screenings: { events: string }[]): Map<number, number> {
  const sums = new Map<number, { total: number; n: number }>();
  for (const s of screenings) {
    for (const e of jparse<WatchEvent[]>(s.events, [])) {
      const cur = sums.get(e.beat) ?? { total: 0, n: 0 };
      cur.total += e.S;
      cur.n += 1;
      sums.set(e.beat, cur);
    }
  }
  const out = new Map<number, number>();
  for (const [beat, v] of sums) out.set(beat, Number((v.total / Math.max(1, v.n)).toFixed(4)));
  return out;
}

/** Hook payoff: share of next episode's viewers that recall `cliffhanger:last` at beat 0. */
function hookPayoffRate(nextScreenings: { events: string }[]): number | null {
  if (nextScreenings.length === 0) return null;
  let recalled = 0;
  for (const s of nextScreenings) {
    const events = jparse<WatchEvent[]>(s.events, []);
    if (events.some((e) => e.beat === 0 && e.recalled.includes('cliffhanger:last'))) recalled += 1;
  }
  return Number((recalled / nextScreenings.length).toFixed(4));
}

export async function computeSeasonArc(showId: string): Promise<SeasonArc | null> {
  const show = await db.show.findUnique({ where: { id: showId } });
  if (!show) return null;

  const episodes = await db.episode.findMany({
    where: { showId },
    orderBy: [{ arm: 'asc' }, { number: 'asc' }],
  });

  const armsSet = [...new Set(episodes.map((e) => e.arm))].sort();
  const castTotals = new Map<string, number>();
  const arms: ArcArm[] = [];

  for (const arm of armsSet) {
    const armEps = episodes.filter((e) => e.arm === arm).sort((a, b) => a.number - b.number);
    const out: ArcEpisode[] = [];
    let globalBeat = 0;

    // thread registry for this arm: plot memory key -> planted info
    const planted = new Map<string, { title: string; plantedEp: number; type: string; stability: number }>();

    for (let i = 0; i < armEps.length; i++) {
      const ep = armEps[i];
      const beats = parseBeats(ep.beatPlan);
      const screenings = await db.screening.findMany({
        where: { episodeId: ep.id },
        select: { events: true },
      });
      const engagement = engagementByBeat(screenings);

      // open loops at THIS episode's start (threads planted before it, FSRS-decayed)
      const threads: ArcThread[] = [];
      for (const [key, p] of planted) {
        const strength = retrievability(p.stability, ep.number - p.plantedEp);
        threads.push({
          key,
          title: p.title,
          plantedEp: p.plantedEp,
          type: p.type,
          strength: Number(strength.toFixed(3)),
          alive: strength >= ALIVE_THRESHOLD,
        });
      }
      threads.sort((a, b) => b.strength - a.strength);

      const arcBeats: ArcBeat[] = beats.map((b) => ({
        index: b.index,
        type: b.type,
        title: b.title,
        tension: TENSION[b.type] ?? 0.5,
        engagement: engagement.get(b.index) ?? null,
        isKey: KEY_TYPES.has(b.type),
      }));

      // register this episode's planted threads (REVEAL/TWIST/CLIFFHANGER; HOOK is setup, not a thread)
      const threadsPlanted: { title: string; type: string }[] = [];
      for (const b of beats) {
        if (!KEY_TYPES.has(b.type) || b.type === 'HOOK') continue;
        const key = b.type === 'CLIFFHANGER' ? 'cliffhanger:last' : `plot:ep${ep.number}:b${b.index}`;
        if (b.type !== 'CLIFFHANGER') threadsPlanted.push({ title: b.title, type: b.type });
        // memory stability mirrors simulateScreening's writes
        planted.set(key, {
          title: b.title,
          plantedEp: ep.number,
          type: b.type,
          stability: b.type === 'CLIFFHANGER' ? 0.95 : 0.5 + (IMPACT[b.type] ?? 0.4) / 2,
        });
      }

      // cliffhanger + measured hook payoff at the NEXT episode's first beat
      const cliffBeat = beats.find((b) => b.type === 'CLIFFHANGER');
      const next = armEps[i + 1];
      let nextScreenings: { events: string }[] = [];
      if (next) {
        nextScreenings = await db.screening.findMany({ where: { episodeId: next.id }, select: { events: true } });
      }
      const cliffhanger = cliffBeat
        ? { title: cliffBeat.title, hookPayoffRate: next ? hookPayoffRate(nextScreenings) : null }
        : null;

      // cast presence from the plan
      const castCount = new Map<string, number>();
      for (const b of beats) {
        for (const name of b.cast) castCount.set(name, (castCount.get(name) ?? 0) + 1);
      }
      const cast = [...castCount.entries()]
        .map(([name, n]) => ({ name, beats: n }))
        .sort((a, b) => b.beats - a.beats);
      for (const c of cast) castTotals.set(c.name, (castTotals.get(c.name) ?? 0) + c.beats);

      out.push({
        episodeId: ep.id,
        number: ep.number,
        status: ep.status,
        retention: ep.retentionScore,
        globalBeatStart: globalBeat,
        beats: arcBeats,
        cliffhanger,
        threadsPlanted,
        openLoops: {
          alive: threads.filter((t) => t.alive).length,
          total: threads.length,
          threads: threads.slice(0, 6),
        },
        cast,
      });
      globalBeat += beats.length;
    }

    arms.push({ arm, episodes: out });
  }

  const cast = [...castTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);

  return { showId, title: show.title, arms, cast };
}
