import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeVerdict } from '@/services/optimizer';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const experiments = await db.experiment.findMany({
    where: { showId: id },
    orderBy: [{ epNumber: 'asc' }, { slotIndex: 'asc' }],
  });
  const verdict = await computeVerdict(id);
  return NextResponse.json({
    experiments: experiments.map((e) => ({
      id: e.id,
      epNumber: e.epNumber,
      slotIndex: e.slotIndex,
      rewardA: e.rewardA,
      rewardB: e.rewardB,
      chosen: e.chosen,
      evidence: JSON.parse(e.evidence ?? '{}') as Record<string, unknown>,
    })),
    verdict,
  });
}
