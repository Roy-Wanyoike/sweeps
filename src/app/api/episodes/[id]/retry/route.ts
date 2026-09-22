import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enqueue } from '@/lib/pipeline/runner';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const episode = await db.episode.findUnique({ where: { id } });
    if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (episode.status === 'DONE') {
      return NextResponse.json({ error: 'episode already done' }, { status: 400 });
    }
    await db.episode.update({
      where: { id },
      data: { status: 'DRAFT', compileReport: null, repairLoops: 0 },
    });
    await db.beat.deleteMany({ where: { episodeId: id } });
    enqueue([{ kind: 'episode', episodeId: id }]);
    return NextResponse.json({ ok: true, queued: 1 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
