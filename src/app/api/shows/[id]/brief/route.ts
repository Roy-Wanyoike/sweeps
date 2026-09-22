import { NextResponse } from 'next/server';
import { computeWriterBrief } from '@/services/arc';

export const dynamic = 'force-dynamic';

/** GET /api/shows/[id]/brief?arm=A|B — the Arc→Writer directive list for the next episode. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const arm = new URL(req.url).searchParams.get('arm') ?? undefined;
    const brief = await computeWriterBrief(id, arm ?? undefined);
    if (!brief) return NextResponse.json({ error: 'not enough screened episodes for a brief' }, { status: 404 });
    return NextResponse.json({ brief });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
