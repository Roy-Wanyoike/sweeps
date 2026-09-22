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
    if (episode.status === 'COMPILE_FAILED') {
      // gate rejection: wipe artifacts so the writer produces a fresh plan
      await db.episode.update({
        where: { id },
        data: { status: 'DRAFT', beatPlan: null, summary: null, compileReport: null, repairLoops: 0, spendUsd: 0, retentionScore: null },
      });
      await db.beat.deleteMany({ where: { episodeId: id } });
      await db.screening.deleteMany({ where: { episodeId: id } });
    }
    // PIPELINE_ERROR (and any non-terminal state) resumes from persisted artifacts
    enqueue([{ kind: 'episode', episodeId: id }]);
    return NextResponse.json({ ok: true, queued: 1 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
