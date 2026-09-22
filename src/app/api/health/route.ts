import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAIProvider } from '@/lib/ai/provider';
import { runnerStatus } from '@/lib/pipeline/runner';

export const dynamic = 'force-dynamic';

export async function GET() {
  let dbOk = false;
  try {
    await db.show.count();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const provider = getAIProvider();
  return NextResponse.json({
    ok: dbOk,
    provider: provider.name,
    video: provider.hasVideo(),
    runner: runnerStatus(),
    consistencyGate: process.env.CONSISTENCY_GATE !== 'off',
    renderImageBeats: process.env.RENDER_IMAGE_BEATS || 'HOOK,REVEAL,TWIST,CLIFFHANGER',
  });
}
