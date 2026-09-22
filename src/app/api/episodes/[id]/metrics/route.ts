import { NextResponse } from 'next/server';
import { computeMetrics } from '@/services/analytics';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const metrics = await computeMetrics(id);
  if (!metrics) return NextResponse.json({ error: 'not found or no screenings' }, { status: 404 });
  return NextResponse.json({ metrics });
}
