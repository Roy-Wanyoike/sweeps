import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runnerStatus } from '@/lib/pipeline/runner';
import { stageSpend } from '@/lib/ai/cost-ledger';

export const dynamic = 'force-dynamic';

const MAX_EPISODES = 6;

/** PATCH /api/shows/[id] — extend the season. Body: { episodeCount: number }.
 *  Owners can grow the season (up to 6) so the brief→writer→panel loop keeps
 *  running past the initial order; the count can never shrink below what exists. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { episodeCount?: unknown };
    const count = Math.round(Number(body.episodeCount));
    if (!Number.isFinite(count) || count < 1 || count > MAX_EPISODES) {
      return NextResponse.json({ error: `episodeCount must be an integer between 1 and ${MAX_EPISODES}` }, { status: 400 });
    }
    const show = await db.show.findUnique({ where: { id }, include: { episodes: { select: { number: true } } } });
    if (!show) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const maxExisting = show.episodes.reduce((m, e) => Math.max(m, e.number), 0);
    if (count < maxExisting) {
      return NextResponse.json({ error: `cannot shrink below existing episode ${maxExisting}` }, { status: 400 });
    }
    const updated = await db.show.update({ where: { id }, data: { episodeCount: count } });
    return NextResponse.json({ show: { id: updated.id, episodeCount: updated.episodeCount } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}

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
      briefFingerprint: e.briefFingerprint,
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
