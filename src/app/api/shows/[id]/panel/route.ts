import { NextResponse } from 'next/server';
import { ensurePanel } from '@/services/audience';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let regenerate = false;
  try {
    const body = (await req.json()) as { regenerate?: boolean };
    regenerate = Boolean(body.regenerate);
  } catch {
    regenerate = false;
  }
  if (regenerate) {
    const show = await db.show.findUnique({ where: { id } });
    if (!show) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await db.viewer.deleteMany({ where: { showId: id } });
    const seedBak = show.seed;
    await db.show.update({ where: { id }, data: { seed: seedBak + 7 } });
    const n = await ensurePanel(id);
    await db.show.update({ where: { id }, data: { seed: seedBak } });
    return NextResponse.json({ panel: n, regenerated: true });
  }
  const n = await ensurePanel(id);
  return NextResponse.json({ panel: n });
}
