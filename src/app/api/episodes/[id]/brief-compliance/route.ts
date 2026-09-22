import { NextResponse } from 'next/server';
import { verifyBriefCompliance } from '@/services/brief-compliance';

export const dynamic = 'force-dynamic';

/** GET /api/episodes/[id]/brief-compliance — deterministic per-directive proof
 *  that the writer honored the brief snapshot stored on this episode. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const compliance = await verifyBriefCompliance(id);
    if (!compliance) {
      return NextResponse.json({ error: 'no brief snapshot on this episode (written blind or plan missing)' }, { status: 404 });
    }
    return NextResponse.json({ compliance });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
