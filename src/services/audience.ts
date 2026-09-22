import { db } from '@/lib/db';
import { Beat, BeatType, ViewerPersona, WatchEvent, jparse, retrievability } from '@/lib/contracts';
import { Rng, clamp, hashSeed } from '@/lib/sim/rng';
import { getAIProvider, meteredChat } from '@/lib/ai/provider';
import { stageBudget, stageSpend } from '@/lib/ai/cost-ledger';

/**
 * The simulated audience: deterministic persona generation, FSRS-inspired viewer
 * memory, seeded watch simulation, and LLM reactions (sampled, budget-aware).
 */

interface ArchetypeDef {
  name: string;
  occupation: string;
  base: Partial<Record<BeatType, number>>;
  attentionSpanBeats: number;
  churnThreshold: number;
  loyalty: number;
  commentProbability: number;
}

const ARCHETYPES: ArchetypeDef[] = [
  { name: 'Binge-Watcher', occupation: 'night-shift nurse', base: {}, attentionSpanBeats: 12, churnThreshold: 0.3, loyalty: 0.85, commentProbability: 0.35 },
  { name: 'Casual Scroller', occupation: 'delivery driver', base: { BREATH: -0.15, HOOK: 0.1 }, attentionSpanBeats: 6, churnThreshold: 0.48, loyalty: 0.3, commentProbability: 0.15 },
  { name: 'Genre Purist', occupation: 'film student', base: { TWIST: 0.2, REVEAL: 0.18, BREATH: -0.1 }, attentionSpanBeats: 10, churnThreshold: 0.42, loyalty: 0.6, commentProbability: 0.4 },
  { name: 'Drama Queen', occupation: 'hair stylist', base: { CONFLICT: 0.25, TWIST: 0.22 }, attentionSpanBeats: 9, churnThreshold: 0.4, loyalty: 0.5, commentProbability: 0.55 },
  { name: 'Cynic', occupation: 'tax auditor', base: { HOOK: -0.08, SETUP: -0.1, TWIST: 0.05 }, attentionSpanBeats: 8, churnThreshold: 0.52, loyalty: 0.2, commentProbability: 0.45 },
  { name: 'Completist', occupation: 'archivist', base: {}, attentionSpanBeats: 14, churnThreshold: 0.28, loyalty: 0.95, commentProbability: 0.25 },
  { name: 'Mood Viewer', occupation: 'freelance designer', base: {}, attentionSpanBeats: 8, churnThreshold: 0.45, loyalty: 0.45, commentProbability: 0.3 },
  { name: 'Loss-Averse Fan', occupation: 'account manager', base: { CLIFFHANGER: 0.15 }, attentionSpanBeats: 10, churnThreshold: 0.36, loyalty: 0.7, commentProbability: 0.3 },
  { name: 'Theory-Crafter', occupation: 'software engineer', base: { REVEAL: 0.22, TWIST: 0.2, HOOK: 0.1 }, attentionSpanBeats: 11, churnThreshold: 0.4, loyalty: 0.55, commentProbability: 0.5 },
  { name: 'Skimmer', occupation: 'barista', base: { SETUP: -0.12 }, attentionSpanBeats: 4, churnThreshold: 0.55, loyalty: 0.25, commentProbability: 0.12 },
  { name: 'Loyalist', occupation: 'teacher', base: {}, attentionSpanBeats: 11, churnThreshold: 0.32, loyalty: 0.9, commentProbability: 0.28 },
  { name: 'Critic', occupation: 'columnist', base: { HOOK: -0.05, ESCALATION: 0.08 }, attentionSpanBeats: 10, churnThreshold: 0.5, loyalty: 0.35, commentProbability: 0.6 },
];

const FIRST_NAMES = [
  'Ada', 'Bo', 'Cleo', 'Dara', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'June', 'Kip', 'Lena',
  'Milo', 'Nia', 'Otto', 'Pia', 'Quinn', 'Rosa', 'Sol', 'Tess', 'Uma', 'Vik', 'Wren', 'Xan', 'Yara', 'Zeke',
];

export const IMPACT: Partial<Record<BeatType, number>> = { CLIFFHANGER: 0.9, TWIST: 0.8, REVEAL: 0.6, HOOK: 0.4 };
export const KEY_TYPES = new Set<BeatType>(['HOOK', 'REVEAL', 'TWIST', 'CLIFFHANGER']);

export function generatePersonas(showId: string, panelSize: number, masterSeed: number): ViewerPersona[] {
  const personas: ViewerPersona[] = [];
  for (let i = 0; i < panelSize; i++) {
    const rng = new Rng(hashSeed(masterSeed, 'viewer', i));
    const arch = ARCHETYPES[i % ARCHETYPES.length];
    const affinities: Record<BeatType, number> = {
      HOOK: 0, SETUP: 0, ESCALATION: 0, REVEAL: 0, TWIST: 0, CONFLICT: 0, BREATH: 0, CLIFFHANGER: 0,
    };
    for (const t of Object.keys(affinities) as BeatType[]) {
      const base = arch.base[t] ?? 0;
      affinities[t] = clamp(0.5 + base + rng.normal(0, 0.09), 0.05, 0.95);
    }
    personas.push({
      name: `${FIRST_NAMES[rng.int(FIRST_NAMES.length)]} ${String.fromCharCode(65 + (i % 26))}.${i}`,
      archetype: arch.name,
      age: 18 + rng.int(50),
      occupation: arch.occupation,
      affinities,
      attentionSpanBeats: Math.max(3, arch.attentionSpanBeats + rng.int(3) - 1),
      churnThreshold: clamp(arch.churnThreshold + rng.normal(0, 0.03), 0.15, 0.7),
      loyalty: clamp(arch.loyalty + rng.normal(0, 0.05), 0, 1),
      commentProbability: clamp(arch.commentProbability + rng.normal(0, 0.05), 0.02, 0.95),
      seed: hashSeed(masterSeed, i),
    });
  }
  return personas;
}

export async function ensurePanel(showId: string): Promise<number> {
  const show = await db.show.findUnique({ where: { id: showId } });
  if (!show) return 0;
  const current = await db.viewer.count({ where: { showId } });
  if (current >= show.panelSize) return current;
  await db.viewer.deleteMany({ where: { showId } });
  const personas = generatePersonas(showId, show.panelSize, show.seed);
  await db.viewer.createMany({
    data: personas.map((p, i) => ({
      showId,
      name: p.name,
      archetype: p.archetype,
      persona: JSON.stringify(p),
      seed: hashSeed(show.seed, 'viewer', i),
    })),
  });
  return personas.length;
}

/* ------------------------------ watch simulation ----------------------------- */

interface MemoryLike {
  key: string;
  content: string;
  stability: number;
  lastSeenEp: number;
}

export interface SimResult {
  events: WatchEvent[];
  keepWatching: boolean;
  dropAtBeat: number | null;
  satisfaction: number;
}

/** Single-beat satisfaction (shared with the optimizer's micro-screening). */
export function singleBeatSatisfaction(
  persona: ViewerPersona,
  beat: Beat,
  tropeStrength: number
): number {
  const aff = persona.affinities[beat.type] ?? 0.5;
  const novelty = 1 - clamp(tropeStrength, 0, 1);
  // Idiosyncratic taste: deterministic per (persona, beat content). This makes the
  // model read the beat's actual text (title, purpose, dialogue) — so two A/B
  // variants of the same slot type score differently, as they must.
  const contentKey = `${beat.title}~${beat.purpose}~${beat.dialogue.map((d) => d.line).join(' ')}`;
  const taste = hashSeed(persona.seed, 'taste', contentKey) / 0x7fffffff; // 0..1
  const contentAffinity = 0.15 * (2 * taste - 1); // -0.15..+0.15
  return clamp(0.15 * beat.qualitySelfScore + 0.45 * aff + 0.25 * novelty + contentAffinity, 0, 1);
}

export function simulateWatch(
  persona: ViewerPersona,
  beats: Beat[],
  memories: MemoryLike[],
  epNumber: number
): SimResult {
  const rng = new Rng(hashSeed(persona.seed, 'ep', epNumber));
  // trope strengths seeded from cross-episode memory, decaying by episode gap
  const tropeStrength = new Map<BeatType, number>();
  for (const m of memories) {
    if (m.key.startsWith('trope:')) {
      const t = m.key.slice(6) as BeatType;
      const r = retrievability(m.stability, epNumber - m.lastSeenEp);
      tropeStrength.set(t, Math.max(tropeStrength.get(t) ?? 0, r));
    }
  }
  // returning-hook bonus: cliffhanger memory from previous episode
  let cliffR = 0;
  const cliffMem = memories.find((m) => m.key === 'cliffhanger:last');
  if (cliffMem && cliffMem.lastSeenEp === epNumber - 1) {
    cliffR = retrievability(cliffMem.stability, 1);
  }

  let S = 0.35 + 0.3 * persona.loyalty;
  let low = 0;
  let dropAt: number | null = null;
  const events: WatchEvent[] = [];
  const sList: number[] = [];

  for (const beat of beats) {
    const recalled: string[] = [];
    let bonus = 0;
    if (beat.index === 0 && cliffR > 0.5) {
      bonus += 0.1;
      recalled.push('cliffhanger:last');
    }
    const strength = tropeStrength.get(beat.type) ?? 0;
    const noise = rng.normal(0, 0.05);
    let s = singleBeatSatisfaction(persona, beat, strength) + bonus - 0.02 * beat.index + noise;
    s = clamp(s, 0, 1);
    S = 0.85 * S + 0.15 * s;
    if (S < persona.churnThreshold) low += 1;
    else low = 0;
    if (low >= 2 && dropAt === null) dropAt = beat.index;
    events.push({ beat: beat.index, s: Number(s.toFixed(4)), S: Number(S.toFixed(4)), recalled });
    sList.push(s);
    // in-episode trope strengthening (repeated types bore)
    if (tropeStrength.has(beat.type)) {
      tropeStrength.set(beat.type, Math.min(1, (tropeStrength.get(beat.type) ?? 0) + 0.3));
    } else {
      tropeStrength.set(beat.type, 0.15);
    }
  }
  return {
    events,
    keepWatching: dropAt === null,
    dropAtBeat: dropAt,
    satisfaction: sList.length ? sList.reduce((a, b) => a + b, 0) / sList.length : 0,
  };
}

export async function simulateScreening(episodeId: string): Promise<number> {
  const episode = await db.episode.findUnique({ where: { id: episodeId }, include: { show: true } });
  if (!episode) return 0;
  const stored = jparse<Beat[] | { beats: Beat[] } | null>(episode.beatPlan, []);
  const beats = Array.isArray(stored) ? stored : (stored?.beats ?? []);
  if (beats.length === 0) return 0;

  const viewers = await db.viewer.findMany({ where: { showId: episode.showId } });
  const epNumber = episode.number;
  const arm = episode.arm;
  const rows: {
    episodeId: string; viewerId: string; seed: number; keepWatching: boolean;
    dropAtBeat: number | null; satisfaction: number; events: string;
  }[] = [];
  const memoryUpdates: {
    viewerId: string; arm: string; key: string; content: string; stability: number; lastSeenEp: number;
  }[] = [];

  for (const viewer of viewers) {
    const persona = jparse<ViewerPersona>(viewer.persona, null as unknown as ViewerPersona);
    if (!persona) continue;
    // arm-scoped memories: each arm is a parallel timeline with its own continuity,
    // so the paired premiere screens against a pristine memory state in BOTH arms
    const memories = await db.viewerMemory.findMany({ where: { viewerId: viewer.id, arm } });
    const sim = simulateWatch(persona, beats, memories, epNumber);
    rows.push({
      episodeId,
      viewerId: viewer.id,
      seed: hashSeed(persona.seed, epNumber),
      keepWatching: sim.keepWatching,
      dropAtBeat: sim.dropAtBeat,
      satisfaction: sim.satisfaction,
      events: JSON.stringify(sim.events),
    });
    // memory writes
    for (const beat of beats) {
      if (!KEY_TYPES.has(beat.type)) continue;
      const impact = IMPACT[beat.type] ?? 0.4;
      memoryUpdates.push({
        viewerId: viewer.id,
        arm,
        key: `trope:${beat.type}`,
        content: beat.title,
        stability: 0.5 + impact / 2,
        lastSeenEp: epNumber,
      });
      if (beat.type === 'CLIFFHANGER') {
        memoryUpdates.push({
          viewerId: viewer.id,
          arm,
          key: 'cliffhanger:last',
          content: beat.title,
          stability: 0.95,
          lastSeenEp: epNumber,
        });
      } else if (beat.type !== 'HOOK') {
        memoryUpdates.push({
          viewerId: viewer.id,
          arm,
          key: `plot:ep${epNumber}:b${beat.index}`,
          content: beat.title,
          stability: 0.5 + impact / 2,
          lastSeenEp: epNumber,
        });
      }
    }
  }

  // persist screenings (upsert-safe via unique [episodeId, viewerId])
  for (const r of rows) {
    await db.screening.upsert({
      where: { episodeId_viewerId: { episodeId: r.episodeId, viewerId: r.viewerId } },
      create: r,
      update: {
        keepWatching: r.keepWatching,
        dropAtBeat: r.dropAtBeat,
        satisfaction: r.satisfaction,
        events: r.events,
        comment: null,
        sentiment: null,
      },
    });
  }
  // persist memory updates (upsert with growth)
  for (const m of memoryUpdates) {
    await db.viewerMemory.upsert({
      where: { viewerId_arm_key: { viewerId: m.viewerId, arm: m.arm, key: m.key } },
      create: m,
      update: {
        stability: { set: Math.min(1, m.stability) },
        lastSeenEp: { set: m.lastSeenEp },
        content: { set: m.content },
      },
    });
  }

  // per-beat engagement + drop counts
  await updateBeatStats(episodeId, rows);

  // reactions (budget-aware, sampled)
  await generateReactions(episode, beats, rows.length);
  return rows.length;
}

async function updateBeatStats(
  episodeId: string,
  rows: { dropAtBeat: number | null; satisfaction: number }[]
): Promise<void> {
  const beatRows = await db.beat.findMany({ where: { episodeId }, orderBy: { index: 'asc' } });
  for (const br of beatRows) {
    const still = rows.filter((r) => r.dropAtBeat === null || r.dropAtBeat > br.index).length;
    const dropped = rows.length - still;
    const engagement = rows.length ? still / rows.length : 0;
    await db.beat.update({ where: { id: br.id }, data: { engagement, dropCount: dropped } });
  }
}

const FALLBACK_COMMENTS = [
  'That last scene came out of nowhere — in a good way.',
  'I almost bailed at the middle but the twist bought me back.',
  'Why do I care about these people this much??',
  'The pacing dragged for me right about the midpoint.',
  'Okay the cliffhanger worked. I am not made of stone.',
  'This is fine background noise, nothing more.',
  'Whoever wrote this scene understood the assignment.',
  'Too much setup, not enough payoff, so far.',
  'I need the next episode immediately.',
  'The characters keep making the dumbest choices.',
];

async function generateReactions(
  episode: { id: string; showId: string; number: number },
  beats: Beat[],
  panelCount: number
): Promise<void> {
  const show = await db.show.findUnique({ where: { id: episode.showId } });
  if (!show) return;
  const provider = getAIProvider();
  const rng = new Rng(hashSeed(show.seed, 'reactions', episode.number));

  // budget check: degradation ladder for reactions
  const budget = stageBudget(show.budgetUsd, 'AUDIENCE');
  const spent = await stageSpend(show.id, 'AUDIENCE');
  let cap = Math.min(16, Math.max(6, Math.round(panelCount * 0.08)));
  if (spent > budget * 0.9) cap = Math.min(5, cap);

  const screenings = await db.screening.findMany({
    where: { episodeId: episode.id },
    include: { viewer: true },
  });
  const eligible = screenings.filter((s) => {
    const persona = jparse<ViewerPersona>(s.viewer.persona, null as unknown as ViewerPersona);
    return persona && rng.float() < persona.commentProbability * 0.35;
  });
  const sampled = eligible.slice(0, cap).map((s) => ({
    name: s.viewer.name,
    archetype: s.viewer.archetype,
    keepWatching: s.keepWatching,
    dropAtBeat: s.dropAtBeat,
    satisfaction: Number(s.satisfaction.toFixed(2)),
  }));
  if (sampled.length === 0) return;

  const beatList = beats.map((b) => `#${b.index} [${b.type}] ${b.title}`).join('\n');
  const system = `You simulate TV viewers posting reactions while watching an episode. Respond ONLY JSON: {"reactions":[{"name":"<exact viewer name>","comment":"<=140 chars, in their voice, referencing a specific beat number","sentiment":"POSITIVE|NEUTRAL|NEGATIVE"}]}. One reaction per listed viewer.`;
  const user = `Episode beats:\n${beatList}\n\nViewers (name | archetype | finished? | droppedAt | satisfaction):\n${sampled
    .map((v) => `${v.name} | ${v.archetype} | ${v.keepWatching ? 'finished' : `dropped@${v.dropAtBeat}`} | ${v.satisfaction}`)
    .join('\n')}`;

  const text = await meteredChat(provider, { showId: show.id, episodeId: episode.id, stage: 'AUDIENCE', tier: 'FAST', maxTokens: 3000 }, system, user);
  const map = new Map<string, { comment: string; sentiment: string }>();
  let ok = false;
  if (text) {
    try {
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
        reactions?: { name: string; comment: string; sentiment: string }[];
      };
      for (const r of parsed.reactions ?? []) {
        if (r.name && r.comment) {
          map.set(r.name, {
            comment: String(r.comment).slice(0, 220),
            sentiment: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'].includes(r.sentiment) ? r.sentiment : 'NEUTRAL',
          });
          ok = true;
        }
      }
    } catch {
      ok = false;
    }
  }
  let fi = 0;
  for (const s of sampled) {
    const llm = map.get(s.name);
    const fallback = FALLBACK_COMMENTS[(hashSeed(show.seed, s.name, episode.number) + fi++) % FALLBACK_COMMENTS.length];
    const sentiment = llm?.sentiment ?? (s.keepWatching ? (s.satisfaction > 0.55 ? 'POSITIVE' : 'NEUTRAL') : 'NEGATIVE');
    await db.screening.update({
      where: { episodeId_viewerId: { episodeId: episode.id, viewerId: (screenings.find((x) => x.viewer.name === s.name))?.viewer.id ?? '' } },
      data: { comment: llm?.comment ?? fallback, sentiment },
    }).catch(() => undefined);
  }
  await db.jobLog.create({
    data: {
      episodeId: episode.id,
      showId: show.id,
      step: 'REACTIONS',
      status: ok ? 'OK' : 'WARN',
      detail: JSON.stringify({ sampled: sampled.length, llm: ok, cap }),
    },
  });
}
