import { NextResponse } from 'next/server';
import { getWhatIfTemplate, listWhatIfRuns, runWhatIf } from '@/services/what-if';

export const dynamic = 'force-dynamic';

/**
 * GET /api/shows/[id]/what-if?arm=A|B
 *   — the what-if starting point: the last screened episode's plan as an
 *     editable template, the current brief it would be graded against, and the
 *     show's recent persisted dry-run receipts (the pre-flight gate's audit log).
 *
 * POST /api/shows/[id]/what-if   { arm, plan, cohort? }
 *   — the pre-flight dry-run: validate the plan against the writer contract,
 *     verify brief compliance deterministically, then let the whole simulated
 *     panel watch it against their arm-scoped memories. Zero AI, zero spend —
 *     same plan + same memories always yield the same numbers. Each run is
 *     persisted as a receipt so the gate's decisions are auditable.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const arm = url.searchParams.get('arm') ?? undefined;
    const template = await getWhatIfTemplate(id, arm ?? undefined);
    if (!template) return NextResponse.json({ error: 'no screened episodes to template from' }, { status: 404 });
    const runs = await listWhatIfRuns(id, arm ?? undefined);
    return NextResponse.json({ template, runs });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { arm?: string; plan?: unknown; cohort?: string };
    const outcome = await runWhatIf(id, body.arm, body.plan, body.cohort ?? undefined);
    if ('error' in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json({ result: outcome.result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
