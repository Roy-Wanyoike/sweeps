import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jparse, retrievability } from '@/lib/contracts';
import { ViewerPersona } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; viewerId: string }> }) {
  const { viewerId } = await params;
  const viewer = await db.viewer.findUnique({
    where: { id: viewerId },
    include: {
      memories: { orderBy: { lastSeenEp: 'desc' } },
      screenings: { include: { episode: { select: { number: true, arm: true } } }, orderBy: { id: 'asc' } },
    },
  });
  if (!viewer) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const latestEp = viewer.screenings.reduce((a, s) => Math.max(a, s.episode.number), 1);
  return NextResponse.json({
    viewer: {
      id: viewer.id,
      name: viewer.name,
      archetype: viewer.archetype,
      persona: jparse<ViewerPersona | null>(viewer.persona, null),
    },
    memories: viewer.memories.map((m) => ({
      key: m.key,
      content: m.content,
      stability: m.stability,
      lastSeenEp: m.lastSeenEp,
      retrievability: Number(retrievability(m.stability, Math.max(0, latestEp - m.lastSeenEp)).toFixed(3)),
    })),
    screenings: viewer.screenings.map((s) => ({
      episodeNumber: s.episode.number,
      arm: s.episode.arm,
      keepWatching: s.keepWatching,
      dropAtBeat: s.dropAtBeat,
      satisfaction: s.satisfaction,
      comment: s.comment,
    })),
  });
}
