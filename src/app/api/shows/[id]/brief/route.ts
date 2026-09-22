import { NextResponse } from 'next/server';
import { computeWriterBrief } from '@/services/arc';

export const dynamic = 'force-dynamic';

/** GET /api/shows/[id]/brief?arm=A|B&cohort=Archetype — the Arc→Writer directive
 *  list for the next episode. Pass a cohort archetype to write the brief through
 *  that cohort's lens (their own churn curve, their own keep-rate contract). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const arm = url.searchParams.get('arm') ?? undefined;
    const cohort = url.searchParams.get('cohort') ?? undefined;
    const brief = await computeWriterBrief(id, arm ?? undefined, cohort ?? undefined);
    if (!brief) return NextResponse.json({ error: 'not enough screened episodes for a brief' }, { status: 404 });
    return NextResponse.json({ brief });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
