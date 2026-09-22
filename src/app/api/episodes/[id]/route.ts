import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Beat, CompileReport, jparse } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const episode = await db.episode.findUnique({
    where: { id },
    include: { beats: { orderBy: { index: 'asc' } }, jobLogs: { orderBy: { createdAt: 'desc' }, take: 30 } },
  });
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { beatPlan, compileReport, ...rest } = episode;
  return NextResponse.json({
    episode: rest,
    plan: jparse<BeatPlanShape | null>(beatPlan, null),
    beats: episode.beats.map((b) => ({
      id: b.id,
      index: b.index,
      type: b.type,
      title: b.title,
      beat: jparse<Beat | null>(b.payload, null),
      compileStatus: b.compileStatus,
      renderStatus: b.renderStatus,
      stillPath: b.stillPath,
      estCostUsd: b.estCostUsd,
      engagement: b.engagement,
      dropCount: b.dropCount,
    })),
    compileReport: jparse<CompileReport | null>(compileReport, null),
    jobLogs: episode.jobLogs,
  });
}

interface BeatPlanShape {
  beats: Beat[];
  summary: string;
}
