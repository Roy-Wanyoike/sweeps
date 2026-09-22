import { NextResponse } from 'next/server';
import { enqueueNextEpisode } from '@/lib/pipeline/runner';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { arm?: string };
    const arm = body.arm === 'B' ? 'B' : 'A';
    const episodeId = await enqueueNextEpisode(id, arm);
    if (!episodeId) {
      return NextResponse.json({ error: 'episode limit reached for this arm' }, { status: 400 });
    }
    return NextResponse.json({ episodeId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
