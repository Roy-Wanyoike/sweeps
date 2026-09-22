import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enqueueNextEpisode } from '@/lib/pipeline/runner';
import { checkWhatIfGate } from '@/services/what-if';

export const dynamic = 'force-dynamic';

/** POST /api/shows/[id]/episodes — queue the next episode for one arm.
 *  Body: { arm, adoptRunId? }.
 *
 *  When the show's pre-flight gate is armed, arm-B episodes past the premiere
 *  require a PASSING what-if dry-run for that exact (arm, episode), graded
 *  against the current brief — otherwise the request is rejected with 428
 *  PRECONDITION REQUIRED and an explanation of what the gate saw.
 *
 *  adoptRunId: HUMAN-IN-THE-LOOP greenlight — the referenced dry-run receipt
 *  must be passing, whole-panel, and graded against the current brief; its
 *  exact simulated plan becomes the shooting script (writer LLM skipped).
 *  A failing adoption check is rejected with 409 CONFLICT and the reason. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { arm?: string; adoptRunId?: string };
    const arm = body.arm === 'B' ? 'B' : 'A';
    const show = await db.show.findUnique({ where: { id } });
    if (!show) return NextResponse.json({ error: 'show not found' }, { status: 404 });
    const existingCount = await db.episode.count({ where: { showId: id, arm } });
    // With adoptRunId the adoption validator IS the gate (same passing bar, plus
    // receipt identity) — it answers with a precise 409 instead of the generic 428.
    const gate = body.adoptRunId ? null : await checkWhatIfGate(id, arm, existingCount + 1);
    if (gate && gate.required && !gate.pass) {
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
    const result = await enqueueNextEpisode(id, arm, { adoptRunId: body.adoptRunId });
    if (result === null) {
      return NextResponse.json({ error: 'episode limit reached for this arm' }, { status: 400 });
    }
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      episodeId: result.id,
      adopted: Boolean(body.adoptRunId),
      gate: gate?.pass ? { fingerprint: gate.pass.fingerprint, grade: gate.pass.grade } : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
