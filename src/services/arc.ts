import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { Beat, BeatType, ViewerPersona, WatchEvent, jparse, retrievability } from '@/lib/contracts';
import { keyMemoryStability, KEY_TYPES } from './audience';
import { canonicalJson } from './determinism';
import { computeMetrics } from './analytics';

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

  // panel-representative loyalty: the open-loops FSRS decay uses the shared memory
  // semantics with the panel's mean loyalty for the loyalty-coupled cliffhanger write
  const viewers = await db.viewer.findMany({ where: { showId }, select: { persona: true } });
  const loyalties = viewers
    .map((v) => jparse<ViewerPersona>(v.persona, null as unknown as ViewerPersona))
    .filter((p): p is ViewerPersona => Boolean(p))
    .map((p) => p.loyalty);
  const meanLoyalty = loyalties.length ? loyalties.reduce((a, b) => a + b, 0) / loyalties.length : 0.5;

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
        // memory stability derives from the SHARED write semantics (panel-representative loyalty)
        planted.set(key, {
          title: b.title,
          plantedEp: ep.number,
          type: b.type,
          stability: keyMemoryStability(b.type, meanLoyalty),
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

/* ------------------------------ writer's brief ------------------------------ */

/**
 * The Arc → Writer hand-off: turns measured season data into a numbered,
 * evidence-backed directive list for the next episode's outline. Zero AI — a
 * pure function of stored screenings, memories and plans, so the same data
 * always produces the same brief (fingerprint included).
 */

export type BriefKind = 'PROTECT_BEAT' | 'CALLBACK' | 'HOOK' | 'COHORT' | 'ECONOMY';

export interface BriefDirective {
  kind: BriefKind;
  title: string;
  body: string;
  evidence: string;
  severity: 'high' | 'medium' | 'low';
  /**
   * Machine-checkable contract for this directive. The compliance verifier
   * (brief-compliance.ts) uses it to PROVE the writer honored the brief —
   * the deterministic half of the loop closure.
   */
  check?: BriefCheck;
}

export type BriefCheck =
  | { type: 'CALLBACK'; threadTitle: string; withinFirstNBeats: number }
  | { type: 'HOOK'; cliffhangerTitle: string }
  | { type: 'PROTECT_BEAT'; maxFirstHalfSec: number }
  | { type: 'COHORT'; detailDensityMin: number }
  | { type: 'ECONOMY'; reuseRatioMin: number };

export interface WriterBrief {
  showId: string;
  title: string;
  arm: string;
  nextEpisodeNumber: number;
  basedOn: { episodes: number[]; viewers: number };
  directives: BriefDirective[];
  /** cohort lens this brief was written through (null = whole panel) */
  cohort: string | null;
  /** archetypes offered as lens chips (top-2 keepers + bottom-2 churners) */
  lenses: { archetype: string; keepRate: number; n: number }[];
  /** sha256 over the canonical directives — same measurements, same brief */
  fingerprint: string;
  generatedAt: string;
}

const SCREENED = ['DONE', 'RENDER_PARTIAL', 'ANALYZING'];
const SEVERITY_ORDER: Record<BriefDirective['severity'], number> = { high: 0, medium: 1, low: 2 };

export async function computeWriterBrief(showId: string, arm?: string, cohort?: string): Promise<WriterBrief | null> {
  const show = await db.show.findUnique({ where: { id: showId } });
  if (!show) return null;

  const allEps = await db.episode.findMany({
    where: { showId, status: { in: SCREENED } },
    include: { _count: { select: { screenings: true } } },
    orderBy: [{ arm: 'asc' }, { number: 'asc' }],
  });
  if (allEps.length === 0) return null;

  const arms = [...new Set(allEps.map((e) => e.arm))].sort();
  const chosenArm = arm && arms.includes(arm) ? arm : arms[arms.length - 1];
  const armEps = allEps.filter((e) => e.arm === chosenArm);
  const last = armEps[armEps.length - 1];
  const nextNumber = last.number + 1;

  const directives: BriefDirective[] = [];

  // ---- 0. cohort lens — resolve the requested archetype against the last episode's cohorts
  const metricsEarly = await computeMetrics(last.id);
  const cohortLens =
    cohort && metricsEarly ? metricsEarly.cohorts.find((c) => c.archetype === cohort) ?? null : null;

  // ---- 1. PROTECT_BEAT — the largest single-beat churn cliff in the latest episode
  //        (through the cohort lens: that cohort's own curve, not the panel mean)
  const lastBeats = parseBeats(last.beatPlan);
  const lastScreenings = await db.screening.findMany({ where: { episodeId: last.id }, select: { events: true } });
  const engagement = engagementByBeat(lastScreenings);
  let worstBeat: { index: number; s: number } | null = null;
  if (cohortLens) {
    for (const pt of cohortLens.curve) {
      if (!worstBeat || pt.retention < worstBeat.s) worstBeat = { index: pt.beat, s: pt.retention };
    }
  } else {
    for (const b of lastBeats) {
      const s = engagement.get(b.index);
      if (s === undefined) continue;
      if (!worstBeat || s < worstBeat.s) worstBeat = { index: b.index, s };
    }
  }
  if (worstBeat && worstBeat.s < 0.55) {
    const beatMeta = lastBeats.find((b) => b.index === worstBeat!.index);
    // machine contract: no first-half beat of the new episode may run longer than
    // the churn beat's own length (its ~15% trim, applied as a hard cap)
    const oldDur = beatMeta ? (beatMeta as { durationSec?: number }).durationSec ?? 12 : 12;
    const maxFirstHalfSec = Math.max(8, Math.round(oldDur * 0.85));
    directives.push({
      kind: 'PROTECT_BEAT',
      title: `Rework beat ${worstBeat.index} — "${beatMeta?.title ?? 'untitled'}"`,
      body: cohortLens
        ? `Through the ${cohortLens.archetype} lens: this is where their retention bottoms out (${(worstBeat.s * 100).toFixed(0)}% still watching). Keep every first-half beat ≤ ${maxFirstHalfSec}s — long static beats are where this cohort leaves.`
        : `It scored the lowest measured engagement of the episode (S = ${worstBeat.s.toFixed(2)} on the 0-1 panel scale). Cut its length ~15% and land the conflict one beat earlier — the panel decides to stay or leave in the two beats after this one.`,
      evidence: cohortLens
        ? `${cohortLens.archetype} retention ${(worstBeat.s * 100).toFixed(0)}% at beat ${worstBeat.index} · Ep${last.number}`
        : `lowest engagement S=${worstBeat.s.toFixed(2)} · Ep${last.number}`,
      severity: worstBeat.s < 0.45 ? 'high' : 'medium',
      check: { type: 'PROTECT_BEAT', maxFirstHalfSec },
    });
  }

  // ---- 2. CALLBACK — the most-at-risk still-alive thread at the next episode's open
  const planted = new Map<string, { title: string; plantedEp: number; type: string; stability: number }>();
  for (const ep of armEps) {
    const beats = parseBeats(ep.beatPlan);
    for (const b of beats) {
      if (!KEY_TYPES.has(b.type) || b.type === 'HOOK') continue;
      const key = b.type === 'CLIFFHANGER' ? 'cliffhanger:last' : `plot:ep${ep.number}:b${b.index}`;
      // loyalty passed as 0: plot-thread stability is loyalty-independent, and the
      // loyalty-coupled 'cliffhanger:last' row is filtered out of the callback pick below
      planted.set(key, { title: b.title, plantedEp: ep.number, type: b.type, stability: keyMemoryStability(b.type, 0) });
    }
  }
  const atRisk = [...planted.entries()]
    .map(([key, p]) => ({ key, ...p, strength: retrievability(p.stability, nextNumber - p.plantedEp) }))
    .filter((t) => t.strength >= ALIVE_THRESHOLD && t.key !== 'cliffhanger:last')
    .sort((a, b) => a.strength - b.strength)[0];
  if (atRisk) {
    directives.push({
      kind: 'CALLBACK',
      title: `Callback: "${atRisk.title}"`,
      body: `Planted in Ep${atRisk.plantedEp} (${atRisk.type.toLowerCase()}), its memory trace decays to ${(atRisk.strength * 100).toFixed(0)}% by Ep${nextNumber} — still above the 25% recall threshold, but fading. Reference it explicitly within the first two beats to re-consolidate the thread before it is lost.`,
      evidence: `FSRS retrievability ${(atRisk.strength * 100).toFixed(0)}% at Ep${nextNumber} open`,
      severity: atRisk.strength < 0.32 ? 'high' : 'medium',
      check: { type: 'CALLBACK', threadTitle: atRisk.title, withinFirstNBeats: 2 },
    });
  } else {
    directives.push({
      kind: 'CALLBACK',
      title: 'No live threads remain',
      body: `Every planted thread from Ep${armEps[0].number}-${last.number} has decayed below the 25% recall threshold. Open Ep${nextNumber} with a fresh reveal rather than a callback the panel can no longer feel.`,
      evidence: `0 of ${planted.size} threads retrievable at Ep${nextNumber}`,
      severity: 'medium',
    });
  }

  // ---- 3. HOOK — measured cliffhanger payoff (loyalty-coupled recall)
  for (let i = armEps.length - 2; i >= 0; i--) {
    const ep = armEps[i];
    const next = armEps[i + 1];
    const beats = parseBeats(ep.beatPlan);
    if (!beats.some((b) => b.type === 'CLIFFHANGER')) continue;
    const nextScreenings = await db.screening.findMany({ where: { episodeId: next.id }, select: { events: true } });
    const rate = hookPayoffRate(nextScreenings);
    if (rate !== null) {
      if (rate < 0.6) {
        directives.push({
          kind: 'HOOK',
          title: `Sharpen the Ep${ep.number} cliffhanger hand-off`,
          body: `Only ${(rate * 100).toFixed(0)}% of the panel recalled it when Ep${next.number} opened. Recall is loyalty-coupled (viewers with loyalty > 0.64 encode it strongly; everyone else holds a fading trace) — so re-state the stakes in Ep${next.number}'s first beat as a one-line callback, not a cold open.`,
          evidence: `hook payoff ${(rate * 100).toFixed(0)}% at Ep${next.number} beat 0`,
          severity: rate < 0.35 ? 'high' : 'medium',
          check: { type: 'HOOK', cliffhangerTitle: beats.find((b) => b.type === 'CLIFFHANGER')?.title ?? '' },
        });
      }
      break; // only the most recent measurable hand-off
    }
  }

  // ---- 4. COHORT — the archetype churning hardest in the latest episode
  //        (with a cohort lens active this becomes the lens directive itself)
  const metrics = metricsEarly;
  if (metrics && metrics.cohorts.length > 0) {
    if (cohortLens) {
      const panelAt = metrics.curve;
      let divergeBeat: { beat: number; type: string } | null = null;
      for (const c of cohortLens.curve) {
        const pAt = panelAt.find((x) => x.beat === c.beat);
        if (pAt && pAt.retention - c.retention > 0.1) {
          divergeBeat = { beat: c.beat, type: pAt.type };
          break;
        }
      }
      directives.push({
        kind: 'COHORT',
        title: `This brief is written through the ${cohortLens.archetype} lens`,
        body: `They keep ${(cohortLens.keepRate * 100).toFixed(0)}% vs the panel's ${(metrics.overall * 100).toFixed(0)}%${divergeBeat ? `, and diverge from the panel at beat ${divergeBeat.beat} (${divergeBeat.type.toLowerCase()})` : ''}. Every directive above is re-scored for THIS cohort. Contract: give them a detail-dense beat in the first half (≥ 3 concrete details — dialogue lines or prop actions) — attention-rewarding texture is what keeps this cohort seated.`,
        evidence: `${cohortLens.archetype} keep ${(cohortLens.keepRate * 100).toFixed(0)}% · n=${cohortLens.n}`,
        severity: cohortLens.keepRate < metrics.overall - 0.15 ? 'high' : 'medium',
        check: { type: 'COHORT', detailDensityMin: 3 },
      });
    } else {
      const weakest = [...metrics.cohorts].sort((a, b) => a.keepRate - b.keepRate)[0];
      const gap = weakest.keepRate - metrics.overall;
      if (gap < -0.05) {
        // where does their churn diverge from the panel?
        let divergeBeat: { beat: number; type: string } | null = null;
        for (const c of weakest.curve) {
          const panelAt = metrics.curve.find((x) => x.beat === c.beat);
          if (panelAt && panelAt.retention - c.retention > 0.1) {
            divergeBeat = { beat: c.beat, type: panelAt.type };
            break;
          }
        }
        directives.push({
          kind: 'COHORT',
          title: `Write for the ${weakest.archetype}s`,
          body: `They keep only ${(weakest.keepRate * 100).toFixed(0)}% vs the panel's ${(metrics.overall * 100).toFixed(0)}%${divergeBeat ? `, and their churn diverges from the panel at beat ${divergeBeat.beat} (${divergeBeat.type.toLowerCase()})` : ''}. Place a beat that rewards attention to detail in the first half of Ep${nextNumber} — this cohort is ${(weakest.n / Math.max(1, metrics.panel) * 100).toFixed(0)}% of the panel (n=${weakest.n}).`,
          evidence: `keep rate ${(weakest.keepRate * 100).toFixed(0)}% vs panel ${(metrics.overall * 100).toFixed(0)}%`,
          severity: gap < -0.15 ? 'high' : 'medium',
          check: { type: 'COHORT', detailDensityMin: 3 },
        });
      }
    }
  }

  // ---- 5. ECONOMY — cost-per-retained-viewer trend across the arm
  const cprv = (e: (typeof armEps)[number]) => e.spendUsd / Math.max(1, e._count.screenings * (e.retentionScore ?? 0));
  if (armEps.length >= 2) {
    const first = cprv(armEps[0]);
    const lastC = cprv(last);
    if (first > 0 && lastC > first * 1.25) {
      directives.push({
        kind: 'ECONOMY',
        title: 'Watch the cost curve',
        body: `Cost per retained viewer rose from $${first.toFixed(4)} (Ep${armEps[0].number}) to $${lastC.toFixed(4)} (Ep${last.number}). Bias Ep${nextNumber} toward beat shapes with high measured engagement per rendered beat — reuse proven setups instead of new set pieces.`,
        evidence: `$${first.toFixed(4)} → $${lastC.toFixed(4)} per retained viewer`,
        severity: lastC > first * 1.5 ? 'high' : 'medium',
        // machine contract: ≥ 60% of the new episode's beats reuse locations the
        // arm has already established (resolved by the verifier from the same plans)
        check: { type: 'ECONOMY', reuseRatioMin: 0.6 },
      });
    }
  }

  directives.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const fingerprint = createHash('sha256')
    .update(canonicalJson({ showId, arm: chosenArm, cohort: cohortLens?.archetype ?? null, nextEpisodeNumber: nextNumber, directives }))
    .digest('hex');

  // lens chips: top-2 keepers + bottom-2 churners (both extremes tell a story)
  const sorted = metrics ? [...metrics.cohorts].sort((a, b) => b.keepRate - a.keepRate) : [];
  const lenses = [...sorted.slice(0, 2), ...sorted.slice(-2)]
    .filter((c, i, arr) => arr.findIndex((x) => x.archetype === c.archetype) === i)
    .map((c) => ({ archetype: c.archetype, keepRate: c.keepRate, n: c.n }));

  return {
    showId,
    title: show.title,
    arm: chosenArm,
    nextEpisodeNumber: nextNumber,
    basedOn: { episodes: armEps.map((e) => e.number), viewers: metrics?.panel ?? 0 },
    directives,
    cohort: cohortLens?.archetype ?? null,
    lenses,
    fingerprint,
    generatedAt: new Date().toISOString(),
  };
}

/** Locations the arm has already established across its screened episodes (ECONOMY contract input). */
export async function knownLocationsForArm(showId: string, arm: string): Promise<Set<string>> {
  const eps = await db.episode.findMany({ where: { showId, arm, status: { in: SCREENED } }, select: { beatPlan: true } });
  const known = new Set<string>();
  for (const ep of eps) {
    for (const b of parseBeats(ep.beatPlan)) known.add(b.location);
  }
  return known;
}
