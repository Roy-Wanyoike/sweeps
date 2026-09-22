import { db } from '@/lib/db';
import { Beat, ViewerPersona, jparse } from '@/lib/contracts';
import { Rng, clamp, hashSeed } from '@/lib/sim/rng';
import { computeMetrics } from './analytics';
import { WriteCtx, proposeVariants, fallbackVariants } from './writer';
import { microScreenBeat } from './audience';

export interface SlotDirective {
  slotIndex: number;
  beat: Beat;
  rationale: string;
}

/**
 * Thompson-sampling optimizer: after a treatment-arm episode, take the worst
 * retention cliffs, generate two variant beats per cliff, micro-screen them on a
 * viewer subsample (text-only, cheap), and persist the winning variant as a
 * directive for the NEXT episode.
 *
 * The micro-screen is MEMORY-AWARE: each sampled viewer scores the variants
 * through microScreenBeat() with their own arm-scoped FSRS memories, their real
 * last smoothed satisfaction from the previous screening, and the loyalty-coupled
 * returning-hook recall — the same machinery the full panel screening uses, in
 * miniature. Rewards stay on the mean-satisfaction scale (discriminative at
 * n=40); keep and hook-recall counts ride along as evidence.
 */
export async function prepareTreatmentDirectives(
  ctx: WriteCtx,
  nextEpNumber: number
): Promise<SlotDirective[]> {
  if (nextEpNumber <= 1) return [];
  const prev = await db.episode.findFirst({
    where: { showId: ctx.show.id, arm: 'B', number: nextEpNumber - 1, status: 'DONE' },
  });
  if (!prev) return [];

  const metrics = await computeMetrics(prev.id);
  if (!metrics || metrics.cliffs.length === 0) return [];

  const worst = metrics.cliffs.slice(0, 2);
  const stored = jparse<Beat[] | { beats: Beat[] } | null>(prev.beatPlan, []);
  const prevPlan = Array.isArray(stored) ? stored : (stored?.beats ?? []);
  const directives: SlotDirective[] = [];

  const viewers = await db.viewer.findMany({ where: { showId: ctx.show.id }, take: 60 });
  if (viewers.length === 0) return [];

  // per-viewer micro-screen context: real last smoothed satisfaction from the
  // previous episode's screening + the viewer's arm-scoped FSRS memories
  const prevScreenings = await db.screening.findMany({ where: { episodeId: prev.id } });
  const lastSByViewer = new Map<string, number>();
  for (const s of prevScreenings) {
    const events = jparse<{ beat: number; s: number; S: number }[]>(s.events, []);
    const lastS = events.length > 0 ? events[events.length - 1].S : null;
    if (lastS !== null) lastSByViewer.set(s.viewerId, lastS);
  }
  const subsample = viewers.slice(0, 40);
  const memRows = await db.viewerMemory.findMany({
    where: { viewerId: { in: subsample.map((v) => v.id) }, arm: 'B' },
  });
  const memoriesByViewer = new Map<string, { key: string; content: string; stability: number; lastSeenEp: number }[]>();
  for (const m of memRows) {
    const list = memoriesByViewer.get(m.viewerId) ?? [];
    list.push({ key: m.key, content: m.content, stability: m.stability, lastSeenEp: m.lastSeenEp });
    memoriesByViewer.set(m.viewerId, list);
  }

  for (const cliff of worst) {
    const beat = prevPlan[cliff.beat];
    if (!beat) continue;

    let variants: Beat[] | null = null;
    try {
      variants = await proposeVariants(ctx, beat, { delta: cliff.delta, quote: cliff.quote });
    } catch {
      variants = null;
    }
    if (!variants || variants.length !== 2) {
      variants = fallbackVariants(beat, ctx.show.seed + cliff.beat);
    }
    const [variantA, variantB] = variants;

    // memory-aware micro-screen on the 40-viewer subsample (pure, deterministic)
    let rewardA = 0;
    let rewardB = 0;
    let keepsA = 0;
    let keepsB = 0;
    let recallA = 0;
    let recallB = 0;
    let n = 0;
    for (const v of subsample) {
      const persona = jparse<ViewerPersona>(v.persona, null as unknown as ViewerPersona);
      if (!persona) continue;
      const lastS = lastSByViewer.get(v.id) ?? 0.35 + 0.3 * persona.loyalty;
      const memories = memoriesByViewer.get(v.id) ?? [];
      const outA = microScreenBeat(persona, memories, lastS, variantA, cliff.beat, nextEpNumber);
      const outB = microScreenBeat(persona, memories, lastS, variantB, cliff.beat, nextEpNumber);
      rewardA += outA.satisfaction;
      rewardB += outB.satisfaction;
      if (outA.keep) keepsA += 1;
      if (outB.keep) keepsB += 1;
      if (outA.recalledHook) recallA += 1;
      if (outB.recalledHook) recallB += 1;
      n += 1;
    }
    rewardA = Number((rewardA / Math.max(1, n)).toFixed(4));
    rewardB = Number((rewardB / Math.max(1, n)).toFixed(4));

    // Thompson sampling with Beta(1 + successes, 1 + failures)
    const alphaA = 1 + rewardA * n;
    const betaA = 1 + n - rewardA * n;
    const alphaB = 1 + rewardB * n;
    const betaB = 1 + n - rewardB * n;
    const rng = new Rng(hashSeed(ctx.show.seed, 'thompson', nextEpNumber, cliff.beat));
    const sampleA = rng.float() < alphaA / (alphaA + betaA) ? rng.float() : 0;
    const sampleB = rng.float() < alphaB / (alphaB + betaB) ? rng.float() : 0;
    const chosen: 'A' | 'B' = sampleA >= sampleB ? 'A' : 'B';

    const winner = chosen === 'A' ? variantA : variantB;
    const evidence = {
      n,
      prevCliffDelta: cliff.delta,
      prevCliffQuote: cliff.quote ?? null,
      alphaA,
      betaA,
      alphaB,
      betaB,
      method: 'thompson_sampling_memory',
      keepsA,
      keepsB,
      recallA,
      recallB,
      memoryAware: true,
    };
    // one receipt per (show, episode, slot) — retries update instead of duplicating
    await db.experiment.upsert({
      where: { showId_epNumber_slotIndex: { showId: ctx.show.id, epNumber: nextEpNumber, slotIndex: cliff.beat } },
      create: {
        showId: ctx.show.id,
        epNumber: nextEpNumber,
        slotIndex: cliff.beat,
        variantA: JSON.stringify(variantA),
        variantB: JSON.stringify(variantB),
        rewardA,
        rewardB,
        chosen,
        evidence: JSON.stringify(evidence),
      },
      update: {
        variantA: JSON.stringify(variantA),
        variantB: JSON.stringify(variantB),
        rewardA,
        rewardB,
        chosen,
        evidence: JSON.stringify(evidence),
      },
    });

    directives.push({
      slotIndex: cliff.beat,
      beat: { ...winner, index: cliff.beat, cast: winner.cast.length > 0 ? winner.cast : beat.cast, location: beat.location },
      rationale: `cliff @beat ${cliff.beat} (${(cliff.delta * 100).toFixed(1)} pts) → variant ${chosen} (memory-aware sat A=${rewardA}, B=${rewardB}; keeps ${keepsA}/${n} vs ${keepsB}/${n})`,
    });
  }
  return directives;
}

/** Headline verdict: control vs treatment across the run. */
export async function computeVerdict(showId: string) {
  const episodes = await db.episode.findMany({
    where: { showId, status: 'DONE' },
    orderBy: [{ arm: 'asc' }, { number: 'asc' }],
  });
  const byArm: Record<string, { numbers: number[]; retention: number[]; costPerRV: number[]; spend: number[] }> = {};
  for (const ep of episodes) {
    const arm = byArm[ep.arm] ?? { numbers: [], retention: [], costPerRV: [], spend: [] };
    arm.numbers.push(ep.number);
    arm.retention.push(Number((ep.retentionScore ?? 0).toFixed(4)));
    arm.spend.push(Number(ep.spendUsd.toFixed(4)));
    const metrics = await computeMetrics(ep.id);
    arm.costPerRV.push(metrics?.costPerRetainedViewer ?? 0);
    byArm[ep.arm] = arm;
  }
  const deltaFor = (arm: { retention: number[] }) =>
    arm.retention.length >= 2 ? arm.retention[arm.retention.length - 1] - arm.retention[0] : 0;
  const a = byArm['A'];
  const b = byArm['B'];
  const verdict =
    a && b && a.retention.length >= 2 && b.retention.length >= 2
      ? {
          deltaA: Number(deltaFor(a).toFixed(4)),
          deltaB: Number(deltaFor(b).toFixed(4)),
          lift: Number((deltaFor(b) - deltaFor(a)).toFixed(4)),
          avgCostPerRV_A: Number((a.costPerRV.reduce((x, y) => x + y, 0) / a.costPerRV.length).toFixed(4)),
          avgCostPerRV_B: Number((b.costPerRV.reduce((x, y) => x + y, 0) / b.costPerRV.length).toFixed(4)),
          avgSpend_A: Number((a.spend.reduce((x, y) => x + y, 0) / a.spend.length).toFixed(4)),
          avgSpend_B: Number((b.spend.reduce((x, y) => x + y, 0) / b.spend.length).toFixed(4)),
        }
      : null;
  return { byArm, verdict };
}

export { clamp };
