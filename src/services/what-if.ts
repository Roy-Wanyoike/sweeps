import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { Beat, BeatPlanSchema, ViewerPersona, jparse } from '@/lib/contracts';
import { canonicalJson } from './determinism';
import { computeWriterBrief, knownLocationsForArm, WriterBrief } from './arc';
import { simulateWatch } from './audience';
import { verifyPlanAgainstBrief, ComplianceRow } from './brief-compliance';

/**
 * What-if brief simulator — the pre-flight check BEFORE render dollars move.
 *
 * A hypothetical beat plan (pasted JSON, or the last screened episode's plan as
 * an editable template) is scored against the SAME machinery the pipeline uses:
 *
 *   1. plan validation      — zod BeatSchema, the exact writer contract
 *   2. brief compliance     — the same pure verifier that grades real episodes
 *   3. audience dry-run     — every persona watches the plan against their
 *                             arm-scoped FSRS memories (simulateWatch, zero writes)
 *   4. baseline comparison  — the arm's last screened episode, computed from
 *                             stored screenings without side effects
 *
 * Zero AI, zero writes, zero spend: same plan + same memories → same numbers.
 */

const SCREENED = ['DONE', 'RENDER_PARTIAL', 'ANALYZING'];
const GATE_PASSING = new Set(['STRONG', 'PROMISING']);

export interface WhatIfRunRow {
  id: string;
  arm: string;
  epNumber: number;
  cohort: string | null;
  grade: string;
  keepRate: number;
  deltaPts: number;
  beatCount: number;
  fingerprint: string;
  briefFp: string;
  createdAt: string;
}

export interface WhatIfCurvePoint {
  beat: number;
  type: string;
  retention: number;
  baseline: number;
}

export interface WhatIfDrop {
  beat: number;
  viewers: number;
  type: string;
  title: string;
}

export interface WhatIfSegment {
  archetype: string;
  keepRate: number;
  n: number;
  baselineKeepRate: number;
}

export interface WhatIfResult {
  showId: string;
  arm: string;
  episodeNumber: number;
  beatCount: number;
  totalDurationSec: number;
  briefFingerprint: string;
  briefCohort: string | null;
  fingerprint: string;
  compliance: {
    rows: ComplianceRow[];
    honoredCheckable: number;
    checkable: number;
    total: number;
    allHonored: boolean;
  };
  simulation: {
    viewers: number;
    keepRate: number;
    meanSatisfaction: number;
    curve: WhatIfCurvePoint[];
    drops: WhatIfDrop[];
    segments: WhatIfSegment[];
  };
  baseline: {
    episodeNumber: number;
    keepRate: number;
    meanSatisfaction: number;
    panel: number;
  };
  delta: {
    keepRatePts: number;
    satisfaction: number;
  };
  grade: 'STRONG' | 'PROMISING' | 'MIXED' | 'WEAK';
}

/* --------------------------------- template --------------------------------- */

/** The last screened episode's plan for an arm — the what-if starting point. */
export async function getWhatIfTemplate(showId: string, arm?: string) {
  const eps = await db.episode.findMany({
    where: { showId, status: { in: SCREENED } },
    orderBy: [{ arm: 'asc' }, { number: 'asc' }],
  });
  if (eps.length === 0) return null;
  const arms = [...new Set(eps.map((e) => e.arm))].sort();
  const chosen = arm && arms.includes(arm) ? arm : arms[arms.length - 1];
  const last = eps.filter((e) => e.arm === chosen).sort((a, b) => a.number - b.number).pop();
  if (!last) return null;
  const stored = jparse<Beat[] | { beats: Beat[] } | null>(last.beatPlan, []);
  const beats = Array.isArray(stored) ? stored : (stored?.beats ?? []);
  return {
    arm: chosen,
    templateFrom: { episodeId: last.id, episodeNumber: last.number },
    beats,
    brief: await computeWriterBrief(showId, chosen),
  };
}

/* ----------------------------------- run ------------------------------------ */

function parsePlan(raw: unknown): { beats: Beat[] } | { error: string } {
  if (raw === null || raw === undefined) return { error: 'plan is required' };
  let candidate: unknown = raw;
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return { error: 'plan is not valid JSON' };
    }
  }
  if (Array.isArray(candidate)) candidate = { beats: candidate };
  if (typeof candidate !== 'object' || candidate === null || !('beats' in candidate)) {
    return { error: 'plan must be a beat plan object with a "beats" array (or a bare array)' };
  }
  const parsed = BeatPlanSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.filter((p) => p !== 'beats').join('.');
    return { error: `beat plan violates the writer contract at beats.${path}: ${issue.message}` };
  }
  return { beats: parsed.data.beats };
}

/** Baseline for one episode, computed from stored screenings — no side effects. */
async function baselineFor(episodeId: string) {
  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: { screenings: { select: { dropAtBeat: true, satisfaction: true, keepWatching: true } }, beats: { select: { index: true } } },
  });
  if (!episode) return null;
  const n = Math.max(1, episode.screenings.length);
  const keep = episode.screenings.filter((s) => s.keepWatching).length;
  const curve = episode.beats
    .sort((a, b) => a.index - b.index)
    .map((b) => ({
      beat: b.index,
      baseline: Number(
        (episode.screenings.filter((s) => s.dropAtBeat === null || s.dropAtBeat > b.index).length / n).toFixed(4)
      ),
    }));
  return {
    episodeNumber: episode.number,
    keepRate: Number((keep / n).toFixed(4)),
    meanSatisfaction: Number(
      (episode.screenings.reduce((a, s) => a + s.satisfaction, 0) / n).toFixed(4)
    ),
    panel: episode.screenings.length,
    curve,
  };
}

function gradeOf(deltaPts: number, keepRate: number, compliance: { checkable: number; allHonored: boolean }): WhatIfResult['grade'] {
  if (keepRate >= 0.75 && deltaPts >= 2 && compliance.checkable > 0 && compliance.allHonored) return 'STRONG';
  if (deltaPts >= 0 || (keepRate >= 0.65 && compliance.allHonored)) return 'PROMISING';
  if (deltaPts >= -5) return 'MIXED';
  return 'WEAK';
}

export async function runWhatIf(
  showId: string,
  arm: string | undefined,
  planRaw: unknown,
  cohort?: string
): Promise<{ error: string; status: number } | { result: WhatIfResult }> {
  const show = await db.show.findUnique({ where: { id: showId } });
  if (!show) return { error: 'show not found', status: 404 };

  // 1. validate the plan against the writer contract
  const plan = parsePlan(planRaw);
  if ('error' in plan) return { error: plan.error, status: 400 };
  const beats = plan.beats;

  // 2. the brief this plan would be graded against
  const brief: WriterBrief | null = await computeWriterBrief(showId, arm, cohort);
  if (!brief) return { error: 'not enough screened episodes for a brief', status: 404 };
  const chosenArm = brief.arm;

  const eps = await db.episode.findMany({
    where: { showId, arm: chosenArm, status: { in: SCREENED } },
    orderBy: { number: 'asc' },
  });
  const last = eps[eps.length - 1];
  if (!last) return { error: 'no screened episodes in this arm', status: 404 };

  // 3. deterministic compliance (same verifier, same brief, same verdict rules)
  const known = await knownLocationsForArm(showId, chosenArm);
  const compliance = await verifyPlanAgainstBrief(brief, beats, known);

  // 4. audience dry-run — every persona, arm-scoped memories, zero writes
  const viewers = await db.viewer.findMany({ where: { showId } });
  if (viewers.length === 0) return { error: 'panel not generated yet', status: 400 };
  const epNumber = brief.nextEpisodeNumber;

  let keep = 0;
  let satTotal = 0;
  const still = new Array(beats.length).fill(0);
  const dropCounts = new Map<number, number>();
  const segMap = new Map<string, { keep: number; n: number }>();

  for (const viewer of viewers) {
    const persona = jparse<ViewerPersona>(viewer.persona, null as unknown as ViewerPersona);
    if (!persona) continue;
    const memories = await db.viewerMemory.findMany({ where: { viewerId: viewer.id, arm: chosenArm } });
    const sim = simulateWatch(persona, beats, memories, epNumber);
    if (sim.keepWatching) keep += 1;
    satTotal += sim.satisfaction;
    for (const e of sim.events) {
      if (sim.dropAtBeat === null || sim.dropAtBeat > e.beat) still[e.beat] += 1;
    }
    if (sim.dropAtBeat !== null) dropCounts.set(sim.dropAtBeat, (dropCounts.get(sim.dropAtBeat) ?? 0) + 1);
    const seg = segMap.get(persona.archetype) ?? { keep: 0, n: 0 };
    seg.n += 1;
    if (sim.keepWatching) seg.keep += 1;
    segMap.set(persona.archetype, seg);
  }

  const panel = viewers.length;
  const keepRate = Number((keep / panel).toFixed(4));
  const meanSatisfaction = Number((satTotal / panel).toFixed(4));

  const base = await baselineFor(last.id);
  const curve: WhatIfCurvePoint[] = beats.map((b, i) => ({
    beat: b.index,
    type: b.type,
    retention: Number((still[i] / panel).toFixed(4)),
    baseline: base?.curve.find((c) => c.beat === b.index)?.baseline ?? 1,
  }));

  const drops: WhatIfDrop[] = [...dropCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([beat, viewers]) => ({
      beat,
      viewers,
      type: beats[beat]?.type ?? '?',
      title: beats[beat]?.title ?? 'untitled',
    }));

  const segments: WhatIfSegment[] = [...segMap.entries()]
    .map(([archetype, v]) => ({ archetype, keepRate: Number((v.keep / v.n).toFixed(4)), n: v.n, baselineKeepRate: -1 }))
    .sort((a, b) => b.keepRate - a.keepRate);

  // baseline segments (from stored screenings) for honest per-cohort deltas
  if (base) {
    const screenings = await db.screening.findMany({ where: { episodeId: last.id }, include: { viewer: { select: { archetype: true } } } });
    const bSeg = new Map<string, { keep: number; n: number }>();
    for (const s of screenings) {
      const cur = bSeg.get(s.viewer.archetype) ?? { keep: 0, n: 0 };
      cur.n += 1;
      if (s.keepWatching) cur.keep += 1;
      bSeg.set(s.viewer.archetype, cur);
    }
    for (const seg of segments) {
      const b = bSeg.get(seg.archetype);
      seg.baselineKeepRate = b ? Number((b.keep / b.n).toFixed(4)) : -1;
    }
  }

  const deltaKeepPts = base ? Number(((keepRate - base.keepRate) * 100).toFixed(2)) : 0;
  const deltaSat = base ? Number((meanSatisfaction - base.meanSatisfaction).toFixed(4)) : 0;

  const fingerprint = createHash('sha256')
    .update(
      canonicalJson({
        showId,
        arm: chosenArm,
        epNumber,
        briefFp: brief.fingerprint,
        beats,
      })
    )
    .digest('hex');

  const result: WhatIfResult = {
    showId,
    arm: chosenArm,
    episodeNumber: epNumber,
    beatCount: beats.length,
    totalDurationSec: beats.reduce((a, b) => a + b.durationSec, 0),
    briefFingerprint: brief.fingerprint,
    briefCohort: brief.cohort,
    fingerprint,
    compliance: {
      rows: compliance.rows,
      honoredCheckable: compliance.honoredCheckable,
      checkable: compliance.checkable,
      total: compliance.total,
      allHonored: compliance.allHonored,
    },
    simulation: { viewers: panel, keepRate, meanSatisfaction, curve, drops, segments },
    baseline: base
      ? { episodeNumber: base.episodeNumber, keepRate: base.keepRate, meanSatisfaction: base.meanSatisfaction, panel: base.panel }
      : { episodeNumber: last.number, keepRate: 0, meanSatisfaction: 0, panel: 0 },
    delta: { keepRatePts: deltaKeepPts, satisfaction: deltaSat },
    grade: gradeOf(deltaKeepPts, keepRate, compliance),
  };

  // persist the dry-run receipt — auditable input for the pre-flight gate
  // (zero AI, tiny row; the full WhatIfResult stays in the API response)
  await db.whatIfRun
    .create({
      data: {
        showId,
        arm: chosenArm,
        epNumber,
        cohort: brief.cohort ?? null,
        grade: result.grade,
        keepRate,
        deltaPts: deltaKeepPts,
        beatCount: beats.length,
        fingerprint,
        briefFp: brief.fingerprint,
        planJson: JSON.stringify(beats),
      },
    })
    .catch(() => undefined);

  return { result };
}

/* ----------------------------- pre-flight gate ------------------------------ */

export interface GateStatus {
  /** true when the gate applies to this request (armed + treatment arm + ep > 1) */
  required: boolean;
  /** the show's gateOnWhatIf flag, echoed for the UI */
  armed: boolean;
  /** latest passing whole-panel dry-run for this (arm, ep) graded against the CURRENT brief */
  pass: WhatIfRunRow | null;
  /** latest dry-run of any grade for this (arm, ep) — explains WHY the gate blocked */
  latest: WhatIfRunRow | null;
}

function rowToWhatIfRun(r: {
  id: string; arm: string; epNumber: number; cohort: string | null; grade: string;
  keepRate: number; deltaPts: number; beatCount: number; fingerprint: string; briefFp: string; createdAt: Date;
}): WhatIfRunRow {
  return {
    id: r.id,
    arm: r.arm,
    epNumber: r.epNumber,
    cohort: r.cohort,
    grade: r.grade,
    keepRate: r.keepRate,
    deltaPts: r.deltaPts,
    beatCount: r.beatCount,
    fingerprint: r.fingerprint,
    briefFp: r.briefFp,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Recent dry-run receipts for a show, newest first (optionally arm-filtered). */
export async function listWhatIfRuns(showId: string, arm?: string, take = 12): Promise<WhatIfRunRow[]> {
  const runs = await db.whatIfRun.findMany({
    where: { showId, ...(arm ? { arm } : {}) },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return runs.map(rowToWhatIfRun);
}

/**
 * The pre-flight gate: when a show arms it, writing a treatment-arm episode
 * (arm B, number > 1) requires a PASSING what-if dry-run for that exact
 * (arm, episode) — STRONG or PROMISING — graded against the CURRENT brief
 * fingerprint. A stale dry-run (brief moved on, or graded through a cohort
 * lens) does not open the gate. The gate never applies to the control arm
 * (A writes blind by experimental design) or the paired premiere.
 */
export async function checkWhatIfGate(showId: string, arm: string, epNumber: number): Promise<GateStatus> {
  const show = await db.show.findUnique({ where: { id: showId } });
  const armed = show?.gateOnWhatIf ?? false;
  const required = armed && arm === 'B' && epNumber > 1;
  const latestRow = await db.whatIfRun.findFirst({
    where: { showId, arm, epNumber },
    orderBy: { createdAt: 'desc' },
  });
  let pass: WhatIfRunRow | null = null;
  if (required) {
    const brief = await computeWriterBrief(showId, 'B');
    if (brief && latestRow && GATE_PASSING.has(latestRow.grade) && latestRow.cohort === null && latestRow.briefFp === brief.fingerprint) {
      pass = rowToWhatIfRun(latestRow);
    }
  }
  return {
    required,
    armed,
    pass,
    latest: latestRow ? rowToWhatIfRun(latestRow) : null,
  };
}
