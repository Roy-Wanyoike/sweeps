import { NextResponse } from 'next/server';
import { enqueueDemo, runnerStatus } from '@/lib/pipeline/runner';

export const dynamic = 'force-dynamic';

/** POST /api/shows/[id]/run-demo?gated=true — queue the full dual-arm demo.
 *  Standard mode: the autonomous showcase (an armed pre-flight gate is bypassed
 *  with an honest GATE/WARN receipt). Governed mode (?gated=true): the gate is
 *  enforced LIVE — held episodes trigger a deterministic auto-dry-run ($0),
 *  then PASS (admitted) or DENY (skipped, no spend). Every decision receipts
 *  to the job log. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const gated = new URL(req.url).searchParams.get('gated') === 'true';
    const queued = await enqueueDemo(id, { gated });
    return NextResponse.json({ queued, gated, runner: runnerStatus() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
