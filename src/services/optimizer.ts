import { db } from '@/lib/db';
import { Beat, jparse } from '@/lib/contracts';
import { Rng, clamp, hashSeed } from '@/lib/sim/rng';
import { computeMetrics } from './analytics';
import { WriteCtx, proposeVariants, fallbackVariants } from './writer';
import { singleBeatSatisfaction } from './audience';
import { ViewerPersona } from '@/lib/contracts';

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

    // micro-screen on a subsample of 40 viewers (text-only, deterministic)
    const subsample = viewers.slice(0, 40);
    let rewardA = 0;
    let rewardB = 0;
    for (const v of subsample) {
      const persona = jparse<ViewerPersona>(v.persona, null as unknown as ViewerPersona);
      if (!persona) continue;
      rewardA += singleBeatSatisfaction(persona, variantA, 0.3);
      rewardB += singleBeatSatisfaction(persona, variantB, 0.3);
    }
    rewardA = Number((rewardA / Math.max(1, subsample.length)).toFixed(4));
    rewardB = Number((rewardB / Math.max(1, subsample.length)).toFixed(4));

    // Thompson sampling with Beta(1 + successes, 1 + failures)
    const n = Math.max(1, subsample.length);
    const alphaA = 1 + rewardA * n;
    const betaA = 1 + n - rewardA * n;
    const alphaB = 1 + rewardB * n;
    const betaB = 1 + n - rewardB * n;
    const rng = new Rng(hashSeed(ctx.show.seed, 'thompson', nextEpNumber, cliff.beat));
    const sampleA = rng.float() < alphaA / (alphaA + betaA) ? rng.float() : 0;
    const sampleB = rng.float() < alphaB / (alphaB + betaB) ? rng.float() : 0;
    const chosen: 'A' | 'B' = sampleA >= sampleB ? 'A' : 'B';

    const winner = chosen === 'A' ? variantA : variantB;
    await db.experiment.create({
      data: {
        showId: ctx.show.id,
        epNumber: nextEpNumber,
        slotIndex: cliff.beat,
        variantA: JSON.stringify(variantA),
        variantB: JSON.stringify(variantB),
        rewardA,
        rewardB,
        chosen,
        evidence: JSON.stringify({
          n,
          prevCliffDelta: cliff.delta,
          prevCliffQuote: cliff.quote ?? null,
          alphaA,
          betaA,
          alphaB,
          betaB,
          method: 'thompson_sampling',
        }),
      },
    });

    directives.push({
      slotIndex: cliff.beat,
      beat: { ...winner, index: cliff.beat, cast: winner.cast.length > 0 ? winner.cast : beat.cast, location: beat.location },
      rationale: `cliff @beat ${cliff.beat} (${(cliff.delta * 100).toFixed(1)} pts) → variant ${chosen} (rewardA=${rewardA}, rewardB=${rewardB})`,
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
