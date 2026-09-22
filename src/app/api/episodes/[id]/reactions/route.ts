import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { Beat, jparse } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

const HumanReactionSchema = z.object({
  name: z.string().min(1).max(40).default('You'),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(280).optional().nullable(),
});

function sentimentFor(rating: number): 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' {
  if (rating >= 4) return 'POSITIVE';
  if (rating === 3) return 'NEUTRAL';
  return 'NEGATIVE';
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const episode = await db.episode.findUnique({
    where: { id },
    include: {
      beats: { orderBy: { index: 'asc' } },
      screenings: { where: { comment: { not: null } }, include: { viewer: { select: { name: true, archetype: true } } } },
      humanReactions: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const beatTitles = new Map<number, string>();
  for (const b of episode.beats) {
    const beat = jparse<Beat | null>(b.payload, null);
    beatTitles.set(b.index, beat?.title ?? b.title);
  }
  const sim = episode.screenings.map((s) => ({
    source: 'SIM' as const,
    name: s.viewer.name,
    archetype: s.viewer.archetype,
    comment: s.comment,
    sentiment: s.sentiment,
    dropAtBeat: s.dropAtBeat,
    keepWatching: s.keepWatching,
    rating: null as number | null,
    beatTitle: s.dropAtBeat !== null ? beatTitles.get(s.dropAtBeat) : undefined,
  }));
  const human = episode.humanReactions.map((h) => ({
    source: 'HUMAN' as const,
    name: h.name,
    archetype: 'human panel',
    comment: h.comment,
    sentiment: h.sentiment,
    dropAtBeat: null as number | null,
    keepWatching: true,
    rating: h.rating,
    beatTitle: undefined as string | undefined,
  }));
  return NextResponse.json({ reactions: [...human, ...sim] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = HumanReactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 });
  }
  const episode = await db.episode.findUnique({ where: { id }, select: { id: true } });
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const created = await db.humanReaction.create({
    data: {
      episodeId: id,
      name: parsed.data.name.trim() || 'You',
      rating: parsed.data.rating,
      comment: parsed.data.comment?.trim() || null,
      sentiment: sentimentFor(parsed.data.rating),
    },
  });
  return NextResponse.json({
    reaction: {
      source: 'HUMAN' as const,
      name: created.name,
      archetype: 'human panel',
      comment: created.comment,
      sentiment: created.sentiment,
      dropAtBeat: null,
      keepWatching: true,
      rating: created.rating,
    },
  });
}
