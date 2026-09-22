import { IMAGE_COST_USD, VIDEO_COST_PER_SEC_USD, textCostUsd, tokensOf } from '@/lib/ai/prices';
import { db } from '@/lib/db';

export type Stage = 'BIBLE' | 'WRITER' | 'RENDER' | 'AUDIENCE' | 'ANALYTICS' | 'OPTIMIZER';
export type Kind = 'LLM' | 'IMAGE' | 'VIDEO' | 'TTS';

export interface CostInput {
  showId: string;
  episodeId?: string | null;
  stage: Stage;
  model: string;
  kind: Kind;
  tokens?: number;
  costUsd: number;
}

export async function recordCost(input: CostInput): Promise<void> {
  try {
    await db.costEntry.create({
      data: {
        showId: input.showId,
        episodeId: input.episodeId ?? null,
        stage: input.stage,
        model: input.model,
        kind: input.kind,
        tokens: input.tokens ?? 0,
        costUsd: input.costUsd,
      },
    });
    if (input.episodeId) {
      await db.episode.update({
        where: { id: input.episodeId },
        data: { spendUsd: { increment: input.costUsd } },
      });
    }
  } catch {
    // never let metering break the pipeline
  }
}

/** Metered LLM call helper: records cost for a chat call. */
export async function meteredChat(
  opts: { showId: string; episodeId?: string | null; stage: Stage; model: string },
  chars: number,
  run: () => Promise<string | null>
): Promise<string | null> {
  const cost = textCostUsd(opts.model, chars);
  await recordCost({ ...opts, kind: 'LLM', tokens: tokensOf(chars), costUsd: cost });
  return run();
}

export async function stageSpend(showId: string, stage: Stage): Promise<number> {
  const rows = await db.costEntry.groupBy({
    by: ['stage'],
    where: { showId, stage },
    _sum: { costUsd: true },
  });
  return rows[0]?._sum.costUsd ?? 0;
}

export function stageBudget(budgetUsd: number, stage: Stage): number {
  const share =
    stage === 'BIBLE'
      ? 0.05
      : stage === 'WRITER'
        ? 0.25
        : stage === 'RENDER'
          ? 0.45
          : stage === 'AUDIENCE'
            ? 0.2
            : stage === 'ANALYTICS'
              ? 0.02
              : 0.08;
  return budgetUsd * share;
}

export async function renderBudgetLeft(show: { id: string; budgetUsd: number }): Promise<number> {
  const spent = await stageSpend(show.id, 'RENDER');
  return Math.max(0, stageBudget(show.budgetUsd, 'RENDER') - spent);
}

export { IMAGE_COST_USD, VIDEO_COST_PER_SEC_USD };
