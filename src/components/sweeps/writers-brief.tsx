'use client';

import { useMemo } from 'react';
import { WriterBriefData, useWriterBrief } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Anchor,
  Coins,
  Copy,
  Download,
  FileText,
  PenLine,
  Repeat2,
  ShieldAlert,
  Users,
} from 'lucide-react';

/**
 * Writer's brief — the Arc → Writer hand-off. Turns measured season data
 * (worst beat, fading threads, hook payoff, weakest cohort, cost trend) into
 * a numbered, evidence-backed directive list for the next episode's outline.
 * Zero AI: the same measurements always produce the same brief (fingerprinted).
 */

const KIND_META: Record<
  WriterBriefData['directives'][number]['kind'],
  { label: string; icon: typeof ShieldAlert; chip: string }
> = {
  PROTECT_BEAT: { label: 'protect beat', icon: ShieldAlert, chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  CALLBACK: { label: 'callback', icon: Repeat2, chip: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  HOOK: { label: 'hook', icon: Anchor, chip: 'bg-orange-500/15 text-orange-800 dark:text-orange-300' },
  COHORT: { label: 'cohort', icon: Users, chip: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  ECONOMY: { label: 'economy', icon: Coins, chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
};

const SEVERITY_BAR: Record<WriterBriefData['directives'][number]['severity'], string> = {
  high: 'border-l-rose-500',
  medium: 'border-l-amber-500',
  low: 'border-l-stone-400',
};

const SEVERITY_LABEL: Record<WriterBriefData['directives'][number]['severity'], string> = {
  high: 'priority high',
  medium: 'priority med',
  low: 'priority low',
};

function briefToMarkdown(b: WriterBriefData): string {
  const lines = [
    `# Writer's brief — ${b.title} · Episode ${b.nextEpisodeNumber} (arm ${b.arm})`,
    '',
    `Derived from measured panel data of Ep${b.basedOn.episodes.join(', Ep')} (${b.basedOn.viewers} viewers).`,
    'Zero AI — same measurements always produce the same brief.',
    '',
    ...b.directives.flatMap((d, i) => [
      `## ${i + 1}. [${d.kind}] ${d.title}  (${SEVERITY_LABEL[d.severity]})`,
      '',
      d.body,
      '',
      `> evidence: ${d.evidence}`,
      '',
    ]),
    `---`,
    `fingerprint: ${b.fingerprint}`,
    `generated: ${b.generatedAt}`,
  ];
  return lines.join('\n');
}

export function WritersBrief({ showId, arm }: { showId: string; arm: string }) {
  const { data, isLoading, isError } = useWriterBrief(showId, arm);
  const brief = data?.brief ?? null;

  const fp8 = useMemo(() => brief?.fingerprint.slice(0, 8) ?? '', [brief]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-80" />
        </CardHeader>
        <CardContent className="grid gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-4/5" />
        </CardContent>
      </Card>
    );
  }

  // not enough screened episodes for a brief — stay invisible, the arc board still works
  if (isError || !brief || brief.directives.length === 0) return null;

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(briefToMarkdown(brief));
      toast.success('Brief copied as markdown', { description: 'Paste it straight into the writers-room doc.' });
    } catch {
      toast.error('Clipboard unavailable in this browser');
    }
  };

  const downloadBrief = () => {
    const blob = new Blob([briefToMarkdown(brief)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brief-${brief.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ep${brief.nextEpisodeNumber}-${brief.arm}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Brief downloaded', { description: `Episode ${brief.nextEpisodeNumber} outline directives (arm ${brief.arm}).` });
  };

  return (
    <Card className="overflow-hidden border-primary/20">
      <div className="h-1 w-full bg-gradient-to-r from-primary via-rose-500 to-primary/40" aria-hidden />
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <PenLine className="h-4 w-4 text-primary" aria-hidden />
            Writer&apos;s brief
            <Badge variant="outline" className="border-primary/40 text-[10px]">
              Ep{brief.nextEpisodeNumber} · arm {brief.arm}
            </Badge>
            <span className="text-[11px] font-normal text-muted-foreground">
              from Ep{brief.basedOn.episodes.join(', Ep')} · {brief.basedOn.viewers} viewers
            </span>
          </CardTitle>
          <CardDescription>
            Numbered directives for the next outline, derived from measured panel data — zero AI. Same data always
            yields the same brief.
          </CardDescription>
        </div>
        <div data-slot="card-action">
          <div className="flex items-center gap-1.5">
            <button
              onClick={copyBrief}
              className="hidden items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
              title={`Deterministic fingerprint (sha256): ${brief.fingerprint}`}
              aria-label="Copy brief fingerprint"
            >
              <FileText className="h-3 w-3" aria-hidden /> fp {fp8}
            </button>
            <Button size="sm" variant="ghost" onClick={copyBrief} title="Copy as markdown">
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
            </Button>
            <Button size="sm" variant="outline" onClick={downloadBrief} title="Download as .md">
              <Download className="h-3.5 w-3.5" aria-hidden /> Brief
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2.5">
        {brief.directives.map((d, i) => {
          const meta = KIND_META[d.kind];
          const Icon = meta.icon;
          return (
            <div
              key={`${d.kind}-${i}`}
              className={`group rounded-r-lg border border-l-[3px] bg-muted/20 p-3 transition-colors hover:bg-muted/40 ${SEVERITY_BAR[d.severity]}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-rose-500 text-[11px] font-bold text-primary-foreground shadow-sm transition-transform group-hover:scale-105"
                  aria-hidden
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.chip}`}>
                      <Icon className="h-3 w-3" aria-hidden /> {meta.label}
                    </span>
                    <span className="text-sm font-semibold leading-snug">{d.title}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{d.body}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-stone-500/10 px-1.5 py-0.5 font-mono text-[10px] text-stone-700 dark:text-stone-300">
                      evidence: {d.evidence}
                    </span>
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wide ${
                        d.severity === 'high' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                      }`}
                    >
                      {SEVERITY_LABEL[d.severity]}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
