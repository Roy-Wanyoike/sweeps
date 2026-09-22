import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const show = await db.show.findUnique({ where: { id } });
  if (!show) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const entries = await db.costEntry.findMany({ where: { showId: id }, orderBy: { createdAt: 'desc' }, take: 500 });
  const byStage: Record<string, number> = {};
  const byEpisode = new Map<string, { label: string; spend: number }>();
  for (const e of entries) {
    byStage[e.stage] = (byStage[e.stage] ?? 0) + e.costUsd;
    if (e.episodeId) {
      const cur = byEpisode.get(e.episodeId) ?? { label: e.episodeId, spend: 0 };
      cur.spend += e.costUsd;
      byEpisode.set(e.episodeId, cur);
    }
  }
  const episodes = await db.episode.findMany({ where: { showId: id }, select: { id: true, number: true, arm: true } });
  const epMeta = new Map(episodes.map((e) => [e.id, `Ep${e.number} (${e.arm})`]));
  const total = entries.reduce((a, e) => a + e.costUsd, 0);
  return NextResponse.json({
    budgetUsd: show.budgetUsd,
    totalUsd: Number(total.toFixed(4)),
    byStage: Object.fromEntries(Object.entries(byStage).map(([k, v]) => [k, Number(v.toFixed(4))])),
    byEpisode: [...byEpisode.entries()].map(([eid, v]) => ({
      episode: epMeta.get(eid) ?? eid,
      spendUsd: Number(v.spend.toFixed(4)),
    })),
    recent: entries.slice(0, 25).map((e) => ({
      stage: e.stage,
      model: e.model,
      kind: e.kind,
      tokens: e.tokens,
      costUsd: e.costUsd,
      createdAt: e.createdAt,
    })),
  });
}
