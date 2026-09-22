import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runnerStatus } from '@/lib/pipeline/runner';
import { stageSpend } from '@/lib/ai/cost-ledger';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const show = await db.show.findUnique({
    where: { id },
    include: {
      characters: true,
      entities: true,
      episodes: { orderBy: [{ number: 'asc' }, { arm: 'asc' }] },
    },
  });
  if (!show) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const panelCount = await db.viewer.count({ where: { showId: id } });
  const [bible, writer, render, audience, analytics, optimizer] = await Promise.all([
    stageSpend(id, 'BIBLE'),
    stageSpend(id, 'WRITER'),
    stageSpend(id, 'RENDER'),
    stageSpend(id, 'AUDIENCE'),
    stageSpend(id, 'ANALYTICS'),
    stageSpend(id, 'OPTIMIZER'),
  ]);
  const { lore, ...rest } = show;
  void lore;
  return NextResponse.json({
    show: rest,
    characters: show.characters,
    entities: show.entities,
    episodes: show.episodes.map((e) => ({
      id: e.id,
      number: e.number,
      arm: e.arm,
      status: e.status,
      repairLoops: e.repairLoops,
      spendUsd: e.spendUsd,
      retentionScore: e.retentionScore,
      summary: e.summary,
    })),
    panelCount,
    runner: runnerStatus(),
    budget: {
      budgetUsd: show.budgetUsd,
      byStage: { BIBLE: bible, WRITER: writer, RENDER: render, AUDIENCE: audience, ANALYTICS: analytics, OPTIMIZER: optimizer },
      totalUsd: Number((bible + writer + render + audience + analytics + optimizer).toFixed(4)),
    },
  });
}
