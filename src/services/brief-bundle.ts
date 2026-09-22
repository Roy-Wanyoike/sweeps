import { computeWriterBrief } from './arc';

/**
 * Writers-room export bundle — every lens of the current brief (whole panel +
 * each archetype lens chip) composed into ONE markdown document, so the
 * writers' room can read the whole directive set side by side.
 *
 * Server-composed from the same deterministic computeWriterBrief calls the UI
 * uses — identical fingerprints, zero AI.
 */

export interface BriefBundle {
  markdown: string;
  filename: string;
  sections: { label: string; fingerprint: string; directives: number }[];
}

const KIND_ORDER = ['PROTECT_BEAT', 'HOOK', 'CALLBACK', 'COHORT', 'ECONOMY'];

function briefSection(
  label: string,
  brief: NonNullable<Awaited<ReturnType<typeof computeWriterBrief>>>
): string {
  const lines: string[] = [];
  lines.push(`## ${label}`, '');
  lines.push(
    `Targets Ep${brief.nextEpisodeNumber} · based on ${brief.basedOn.episodes.map((e) => `Ep${e}`).join(', ')} · ${brief.basedOn.viewers} viewers · fp \`${brief.fingerprint.slice(0, 8)}\``,
    ''
  );
  const sorted = [...brief.directives].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
  );
  for (const d of sorted) {
    lines.push(`### [${d.kind}] ${d.title} — ${d.severity} priority`);
    lines.push('', d.body, '');
    lines.push(`> evidence: ${d.evidence}`);
    if (d.check) lines.push(`> contract: ${d.check.type.toLowerCase().replace('_', '-')} — verified deterministically after the episode is written`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function buildBriefBundle(showId: string, arm?: string): Promise<BriefBundle | null> {
  const panelBrief = await computeWriterBrief(showId, arm);
  if (!panelBrief) return null;

  const showTitle = panelBrief.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const sections: BriefBundle['sections'] = [];
  const bodyParts: string[] = [];
  const tableRows: string[] = [];

  sections.push({
    label: 'whole panel',
    fingerprint: panelBrief.fingerprint.slice(0, 8),
    directives: panelBrief.directives.length,
  });
  tableRows.push(`| whole panel | Ep${panelBrief.nextEpisodeNumber} | \`${panelBrief.fingerprint.slice(0, 8)}\` |`);
  bodyParts.push(briefSection('Whole panel', panelBrief));

  const seen = new Set<string>(['whole panel']);
  for (const lens of panelBrief.lenses) {
    if (seen.has(lens.archetype)) continue;
    seen.add(lens.archetype);
    const lensBrief = await computeWriterBrief(showId, panelBrief.arm, lens.archetype);
    if (!lensBrief) continue;
    const label = `${lens.archetype} lens`;
    sections.push({
      label,
      fingerprint: lensBrief.fingerprint.slice(0, 8),
      directives: lensBrief.directives.length,
    });
    tableRows.push(`| ${label} | Ep${lensBrief.nextEpisodeNumber} | \`${lensBrief.fingerprint.slice(0, 8)}\` |`);
    bodyParts.push(briefSection(label, lensBrief));
  }

  const parts: string[] = [
    `# Writers-room brief bundle — ${panelBrief.title} · arm ${panelBrief.arm}`,
    '',
    `Every lens of the Ep${panelBrief.nextEpisodeNumber} brief in one document: the whole-panel directive set plus one section per cohort lens. All sections are derived from the same measured panel data — zero AI, deterministic fingerprints.`,
    '',
    `| lens | target | fingerprint |`,
    `|------|--------|-------------|`,
    ...tableRows,
    '',
  ];
  for (const body of bodyParts) {
    parts.push('---', '', body);
  }
  parts.push('---', '', `bundle generated: ${new Date().toISOString()}`);

  return {
    markdown: parts.join('\n'),
    filename: `brief-bundle-${showTitle}-ep${panelBrief.nextEpisodeNumber}-${panelBrief.arm}.md`,
    sections,
  };
}
