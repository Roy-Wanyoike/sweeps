import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jparse } from '@/lib/contracts';
import { ViewerPersona } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewers = await db.viewer.findMany({
    where: { showId: id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, archetype: true, persona: true },
  });
  return NextResponse.json({
    viewers: viewers.map((v) => ({
      id: v.id,
      name: v.name,
      archetype: v.archetype,
      persona: jparse<ViewerPersona | null>(v.persona, null),
    })),
  });
}
