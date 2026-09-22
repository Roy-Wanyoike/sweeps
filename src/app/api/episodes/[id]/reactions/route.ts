import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Beat, jparse } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const episode = await db.episode.findUnique({
    where: { id },
    include: {
      beats: { orderBy: { index: 'asc' } },
      screenings: { where: { comment: { not: null } }, include: { viewer: { select: { name: true, archetype: true } } } },
    },
  });
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const beatTitles = new Map<number, string>();
  for (const b of episode.beats) {
    const beat = jparse<Beat | null>(b.payload, null);
    beatTitles.set(b.index, beat?.title ?? b.title);
  }
  return NextResponse.json({
    reactions: episode.screenings.map((s) => ({
      name: s.viewer.name,
      archetype: s.viewer.archetype,
      comment: s.comment,
      sentiment: s.sentiment,
      dropAtBeat: s.dropAtBeat,
      keepWatching: s.keepWatching,
      beatTitle: s.dropAtBeat !== null ? beatTitles.get(s.dropAtBeat) : undefined,
    })),
  });
}
