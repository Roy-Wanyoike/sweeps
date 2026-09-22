import { NextResponse } from 'next/server';
import { verifyDeterminism } from '@/services/determinism';

export const dynamic = 'force-dynamic';

/**
 * Determinism receipt: replay every screening from the master seed and
 * byte-compare the watch-event streams. Read-only, idempotent, zero AI spend.
 * GET = easy curl proof for judges, POST = explicit action from the UI.
 */
async function handle(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const receipt = await verifyDeterminism(id);
    return NextResponse.json({ receipt });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'verification failed' },
      { status: 400 }
    );
  }
}

export const GET = handle;
export const POST = handle;
