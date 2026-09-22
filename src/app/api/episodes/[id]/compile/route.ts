import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { compileEpisodeNow, compileFixture } from '@/lib/pipeline/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let fixture = false;
    try {
      const body = (await req.json()) as { fixture?: boolean };
      fixture = Boolean(body.fixture);
    } catch {
      fixture = false;
    }
    if (fixture) {
      const report = await compileFixture();
      if (!report) return NextResponse.json({ error: 'fixture not found' }, { status: 500 });
      return NextResponse.json({ report, fixture: true });
    }
    const episode = await db.episode.findUnique({ where: { id } });
    if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const report = await compileEpisodeNow(id);
    if (!report) return NextResponse.json({ error: 'no plan to compile' }, { status: 400 });
    await db.episode.update({ where: { id }, data: { compileReport: JSON.stringify(report) } });
    return NextResponse.json({ report, fixture: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
