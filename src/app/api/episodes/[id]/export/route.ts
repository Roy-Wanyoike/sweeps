import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Beat, CompileReport, jparse } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

/**
 * GET /api/episodes/:id/export?format=md|json
 * Downloads the full episode as a portable artifact: beat plan, dialogue,
 * compile report, storyboard render status and screening metrics.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get('format') ?? 'md';

  const episode = await db.episode.findUnique({
    where: { id },
    include: {
      show: true,
      beats: { orderBy: { index: 'asc' } },
    },
  });
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const plan = jparse<{ beats: Beat[]; summary: string } | null>(episode.beatPlan, null);
  const report = jparse<CompileReport | null>(episode.compileReport, null);
  const beatRows = episode.beats;

  const safeTitle = `${episode.show.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-ep${episode.number}-${episode.arm.toLowerCase()}`;

  if (format === 'json') {
    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        show: { id: episode.show.id, title: episode.show.title, genre: episode.show.genre, seed: episode.show.seed },
        episode: {
          number: episode.number,
          arm: episode.arm,
          status: episode.status,
          repairLoops: episode.repairLoops,
          spendUsd: episode.spendUsd,
          retentionScore: episode.retentionScore,
        },
        plan,
        compileReport: report,
        storyboard: beatRows.map((b) => ({
          index: b.index,
          type: b.type,
          title: b.title,
          renderStatus: b.renderStatus,
          stillPath: b.stillPath,
          estCostUsd: b.estCostUsd,
          engagement: b.engagement,
          dropCount: b.dropCount,
        })),
      },
      null,
      2
    );
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeTitle}.json"`,
      },
    });
  }

  // format=md (default)
  const lines: string[] = [];
  lines.push(`# ${episode.show.title} — Episode ${episode.number} (arm ${episode.arm})`);
  lines.push('');
  lines.push(`> ${plan?.summary ?? episode.summary ?? 'No summary.'}`);
  lines.push('');
  lines.push('| field | value |');
  lines.push('|---|---|');
  lines.push(`| status | ${episode.status} |`);
  lines.push(`| repair loops | ${episode.repairLoops} |`);
  lines.push(`| spend | $${episode.spendUsd.toFixed(4)} |`);
  lines.push(`| retention | ${episode.retentionScore !== null ? `${(episode.retentionScore * 100).toFixed(1)}%` : '—'} |`);
  lines.push(`| seed | ${episode.show.seed} |`);
  lines.push('');
  if (report) {
    lines.push(`## Continuity report — ${report.status}`);
    lines.push('');
    lines.push(`Estimated render cost: $${report.estimatedCostUsd.toFixed(2)}. Violations: ${report.violations.length}.`);
    for (const v of report.violations) {
      lines.push(`- **${v.rule}** (beat ${v.beatIndex}, ${v.severity}) — ${v.message} _fix → ${v.fixSuggestion}_`);
    }
    lines.push('');
  }
  lines.push(`## Beat script (${plan?.beats.length ?? 0} beats)`);
  lines.push('');
  for (const b of plan?.beats ?? []) {
    const row = beatRows.find((r) => r.index === b.index);
    lines.push(`### ${b.index}. ${b.title} · \`${b.type}\``);
    lines.push('');
    lines.push(`- **Location:** ${b.location} (${b.timeOfDay}) · **Duration:** ${b.durationSec}s`);
    lines.push(`- **Cast:** ${b.cast.join(', ') || '—'}`);
    if (b.purpose) lines.push(`- **Purpose:** ${b.purpose}`);
    if (Object.keys(b.wardrobe).length) {
      lines.push(`- **Wardrobe:** ${Object.entries(b.wardrobe).map(([c, w]) => `${c}: ${w}`).join('; ')}`);
    }
    if (b.props.length) lines.push(`- **Props:** ${b.props.map((p) => `${p.ref} (${p.action})`).join(', ')}`);
    if (b.loreAssertions.length) lines.push(`- **Lore:** ${b.loreAssertions.map((l) => `${l.key}=${l.value}`).join('; ')}`);
    if (row) {
      lines.push(`- **Render:** ${row.renderStatus ?? '—'} · est $${row.estCostUsd.toFixed(3)}${row.engagement !== null ? ` · ${(row.engagement * 100).toFixed(0)}% watching · ${row.dropCount} drops` : ''}`);
    }
    if (b.dialogue.length) {
      lines.push('');
      for (const d of b.dialogue) lines.push(`> **${d.char}** _(${d.emotion})_: ${d.line}`);
    }
    lines.push('');
  }
  lines.push('## Audience engagement');
  lines.push('');
  const engagedRows = beatRows.filter((b) => b.engagement !== null);
  if (engagedRows.length) {
    lines.push('| beat | title | watching | drops |');
    lines.push('|---|---|---|---|');
    for (const b of engagedRows) {
      lines.push(`| ${b.index} | ${b.title} | ${((b.engagement ?? 0) * 100).toFixed(0)}% | ${b.dropCount} |`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('_Exported from SWEEPS — the retention-optimized AI showrunner._');

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeTitle}.md"`,
    },
  });
}
