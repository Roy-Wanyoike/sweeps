import { NextResponse } from 'next/server';
import { buildBriefBundle } from '@/services/brief-bundle';

export const dynamic = 'force-dynamic';

/**
 * GET /api/shows/[id]/brief-bundle?arm=A|B
 *   — the writers-room export: every lens of the current brief (whole panel +
 *     each archetype lens) composed into ONE markdown document with a lens
 *     table. Deterministic, zero AI.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const arm = url.searchParams.get('arm') ?? undefined;
    const bundle = await buildBriefBundle(id, arm ?? undefined);
    if (!bundle) return NextResponse.json({ error: 'not enough screened episodes for a brief' }, { status: 404 });
    return NextResponse.json({ bundle });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
