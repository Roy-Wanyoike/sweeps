import { NextResponse } from 'next/server';
import { computeSeasonArc } from '@/services/arc';

export const dynamic = 'force-dynamic';

/** Season arc planner data: tension, engagement, threads, hook payoffs, cast presence. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const arc = await computeSeasonArc(id);
    if (!arc) return NextResponse.json({ error: 'show not found' }, { status: 404 });
    return NextResponse.json(arc);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to compute arc' },
      { status: 400 }
    );
  }
}
