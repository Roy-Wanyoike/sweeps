import { NextResponse } from 'next/server';
import { enqueueDemo, runnerStatus } from '@/lib/pipeline/runner';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const queued = await enqueueDemo(id);
    return NextResponse.json({ queued, runner: runnerStatus() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
