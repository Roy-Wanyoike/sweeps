import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeMetrics } from '@/services/analytics';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const episodes = await db.episode.findMany({
    where: { showId: id, status: 'DONE' },
    orderBy: [{ arm: 'asc' }, { number: 'asc' }],
  });
  const out = [];
  for (const ep of episodes) {
    const metrics = await computeMetrics(ep.id);
    if (metrics) out.push(metrics);
  }
  return NextResponse.json({ episodes: out });
}
