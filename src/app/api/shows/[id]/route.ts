import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runnerStatus } from '@/lib/pipeline/runner';
import { stageSpend } from '@/lib/ai/cost-ledger';

export const dynamic = 'force-dynamic';

const MAX_EPISODES = 6;

/** PATCH /api/shows/[id] — extend the season ({ episodeCount }) and/or toggle the
 *  pre-flight gate ({ gateOnWhatIf }). Owners can grow the season (up to 6) so the
 *  brief→writer→panel loop keeps running past the initial order; the count can
 *  never shrink below what exists. The gate makes arm-B episodes require a passing
 *  what-if dry-run before any render dollars move. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { episodeCount?: unknown; gateOnWhatIf?: unknown };
    const show = await db.show.findUnique({ where: { id }, include: { episodes: { select: { number: true } } } });
    if (!show) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const data: { episodeCount?: number; gateOnWhatIf?: boolean } = {};

    if (body.episodeCount !== undefined) {
      const count = Math.round(Number(body.episodeCount));
      if (!Number.isFinite(count) || count < 1 || count > MAX_EPISODES) {
        return NextResponse.json({ error: `episodeCount must be an integer between 1 and ${MAX_EPISODES}` }, { status: 400 });
      }
      const maxExisting = show.episodes.reduce((m, e) => Math.max(m, e.number), 0);
      if (count < maxExisting) {
        return NextResponse.json({ error: `cannot shrink below existing episode ${maxExisting}` }, { status: 400 });
      }
      data.episodeCount = count;
    }

    if (body.gateOnWhatIf !== undefined) {
      if (typeof body.gateOnWhatIf !== 'boolean') {
        return NextResponse.json({ error: 'gateOnWhatIf must be a boolean' }, { status: 400 });
      }
      data.gateOnWhatIf = body.gateOnWhatIf;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'nothing to update — send episodeCount and/or gateOnWhatIf' }, { status: 400 });
    }

    const updated = await db.show.update({ where: { id }, data });
    return NextResponse.json({ show: { id: updated.id, episodeCount: updated.episodeCount, gateOnWhatIf: updated.gateOnWhatIf } });
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
  // show-level governance receipts — the pre-flight gate's and adoptions' audit trail
  const governance = await db.jobLog.findMany({
    where: { showId: id, step: { in: ['GATE', 'ADOPTION'] } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
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
      adoptedFromFp: e.adoptedFromFp,
    })),
    governance: governance.map((g) => ({
      id: g.id,
      step: g.step,
      status: g.status,
      detail: g.detail,
      createdAt: g.createdAt.toISOString(),
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
