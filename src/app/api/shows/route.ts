import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createShowWithBible } from '@/lib/pipeline/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  const shows = await db.show.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, premise: true, mode: true, status: true, episodeCount: true, seed: true, createdAt: true },
  });
  return NextResponse.json({ shows });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      premise?: string;
      title?: string;
      genre?: string;
      visualStyle?: string;
      mode?: string;
      episodeCount?: number;
      budgetUsd?: number;
      panelSize?: number;
      seed?: number;
    };
    if (!body.premise || body.premise.trim().length < 8) {
      return NextResponse.json({ error: 'premise must be at least 8 characters' }, { status: 400 });
    }
    const id = await createShowWithBible({
      premise: body.premise.trim(),
      title: body.title,
      genre: body.genre,
      visualStyle: body.visualStyle,
      mode: body.mode === 'SINGLE' ? 'SINGLE' : 'DUAL',
      episodeCount: body.episodeCount,
      budgetUsd: body.budgetUsd,
      panelSize: body.panelSize,
      seed: body.seed,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
