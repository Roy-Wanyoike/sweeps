import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enqueueNextEpisode } from '@/lib/pipeline/runner';
import { checkWhatIfGate } from '@/services/what-if';

export const dynamic = 'force-dynamic';

/** POST /api/shows/[id]/episodes — queue the next episode for one arm.
 *  When the show's pre-flight gate is armed, arm-B episodes past the premiere
 *  require a PASSING what-if dry-run for that exact (arm, episode), graded
 *  against the current brief — otherwise the request is rejected with 428
 *  PRECONDITION REQUIRED and an explanation of what the gate saw. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { arm?: string };
    const arm = body.arm === 'B' ? 'B' : 'A';
    const show = await db.show.findUnique({ where: { id } });
    if (!show) return NextResponse.json({ error: 'show not found' }, { status: 404 });
    const existingCount = await db.episode.count({ where: { showId: id, arm } });
    const gate = await checkWhatIfGate(id, arm, existingCount + 1);
    if (gate.required && !gate.pass) {
      return NextResponse.json(
        {
          error: `Pre-flight gate is armed: Ep${existingCount + 1} (arm B) needs a passing what-if dry-run first`,
          detail: gate.latest
            ? `Latest dry-run graded ${gate.latest.grade} (${(gate.latest.keepRate * 100).toFixed(1)}% keep, fp ${gate.latest.fingerprint.slice(0, 8)}) — run a STRONG or PROMISING dry-run on the Arc tab against the current brief.`
            : 'No dry-run exists for this episode yet — open the Arc tab, load a plan, and run one ($0.000 spent).',
        },
        { status: 428 }
      );
    }
    const episodeId = await enqueueNextEpisode(id, arm);
    if (!episodeId) {
      return NextResponse.json({ error: 'episode limit reached for this arm' }, { status: 400 });
    }
    return NextResponse.json({ episodeId, gate: gate.pass ? { fingerprint: gate.pass.fingerprint, grade: gate.pass.grade } : null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
