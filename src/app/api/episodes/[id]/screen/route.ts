import { NextResponse } from 'next/server';
import { ensurePanel, simulateScreening } from '@/services/audience';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const episode = await db.episode.findUnique({ where: { id }, include: { show: true } });
    if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await ensurePanel(episode.showId);
    const panel = await simulateScreening(id);
    await db.episode.update({ where: { id }, data: { status: 'DONE' } });
    return NextResponse.json({ ok: true, panel });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
