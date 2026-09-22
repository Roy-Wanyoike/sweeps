'use client';

import { useMemo, useState } from 'react';
import {
  BriefComplianceData,
  EpisodeRow,
  useBriefCompliance,
  useExtendSeason,
  useRunEpisode,
  useShow,
  useWriterBrief,
  WriterBriefData,
} from '@/lib/queries';
import { useSweeps } from '@/lib/store';
import { ArchetypeDot } from '@/lib/archetype-colors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Anchor,
  CheckCircle2,
  Coins,
  Copy,
  Download,
  Eye,
  FileText,
  Info,
  Loader2,
  PenLine,
  Repeat2,
  ShieldAlert,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';

/**
 * Writer's brief — the Arc → Writer hand-off, CLOSED LOOP edition:
 *  1. directives derived from measured panel data (zero AI, fingerprinted),
 *  2. a "Write EpN from this brief" action that feeds them into the actual
 *     writer prompt (arm B — the treatment arm; arm A writes blind by design),
 *  3. a deterministic compliance receipt proving, per directive, whether the
 *     finished episode honored its machine contract.
 * Optional cohort lens: re-write the brief through a specific archetype's eyes.
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

const SCREENED = ['DONE', 'RENDER_PARTIAL', 'ANALYZING'];
const RUNNING_STATES = ['DRAFT', 'WRITING', 'COMPILING', 'RENDERING', 'RENDER_PARTIAL', 'SCREENING', 'ANALYZING', 'PIPELINE_ERROR'];

function briefToMarkdown(b: WriterBriefData): string {
  const lines = [
    `# Writer's brief — ${b.title} · Episode ${b.nextEpisodeNumber} (arm ${b.arm})`,
    '',
    `Derived from measured panel data of Ep${b.basedOn.episodes.join(', Ep')} (${b.basedOn.viewers} viewers).` +
      (b.cohort ? ` Written through the ${b.cohort} cohort lens.` : ''),
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

/* ------------------------------ compliance card ----------------------------- */

function ComplianceSection({ compliance, isLatest }: { compliance: BriefComplianceData; isLatest?: boolean }) {
  const allHonored = compliance.allHonored;
  return (
    <div className="mt-1 rounded-lg border bg-gradient-to-b from-muted/40 to-transparent p-3" data-testid="brief-compliance">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className={`h-4 w-4 ${allHonored ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} aria-hidden />
        <span className="text-sm font-semibold">
          Directive compliance — Ep{compliance.episodeNumber} ({compliance.arm})
        </span>
        {isLatest && (
          <Badge variant="outline" className="text-[9px] text-muted-foreground">
            last brief-fed episode
          </Badge>
        )}
        {allHonored ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            loop closed · {compliance.checkable}/{compliance.checkable} honored
          </span>
        ) : (
          <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-300">
            {compliance.honoredCheckable}/{compliance.checkable} machine contracts honored
          </Badge>
        )}
        {compliance.cohort && (
          <Badge variant="outline" className="gap-1 border-teal-500/40 text-[10px] text-teal-700 dark:text-teal-300">
            <Eye className="h-3 w-3" aria-hidden /> {compliance.cohort} lens
          </Badge>
        )}
      </div>
      <div className="mt-2 grid gap-1.5">
        {compliance.rows.map((r, i) => {
          const meta = KIND_META[r.kind];
          const Icon = meta.icon;
          return (
            <div key={`${r.kind}-${i}`} className="flex items-start gap-2 rounded-md bg-background/60 px-2 py-1.5">
              <span className={`inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[9px] font-semibold uppercase tracking-wide ${meta.chip}`}>
                <Icon className="h-2.5 w-2.5" aria-hidden /> {meta.label}
              </span>
              {r.informational ? (
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
              ) : r.honored ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
              )}
              <div className="min-w-0 flex-1 text-[12px] leading-snug">
                <span className={r.informational ? 'text-muted-foreground' : r.honored ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}>
                  {r.honored ? (r.informational ? 'no machine contract' : 'honored') : 'missed'}
                </span>{' '}
                <span className="text-muted-foreground">— {r.evidence}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Verified deterministically against the brief snapshot stored on the episode — the same plan and brief always
        produce the same verdict. Zero AI.
      </p>
    </div>
  );
}

/* --------------------------------- the card --------------------------------- */

export function WritersBrief({ showId, arm }: { showId: string; arm: string }) {
  const [lens, setLens] = useState<string | null>(null);
  const { data, isLoading, isError } = useWriterBrief(showId, arm, lens);
  const brief = data?.brief ?? null;

  const { data: showData } = useShow(showId);
  const readonly = useSweeps((s) => s.readonly);
  const episodes: EpisodeRow[] = useMemo(() => showData?.episodes ?? [], [showData]);
  const episodeCount = showData?.show.episodeCount ?? 0;
  const runnerBusy = Boolean(showData?.runner.running) || (showData?.runner.queued ?? 0) > 0;

  const runEpisode = useRunEpisode(showId);
  const extendSeason = useExtendSeason(showId);
  const [extending, setExtending] = useState(false);

  // the episode this brief targets — compliance receipt once it exists with a plan.
  // When the brief has advanced past every written episode (nothing to verify yet),
  // keep the LAST brief-fed episode's receipt visible: the loop-closure proof stays up.
  const targeted = useMemo(
    () => episodes.find((e) => e.arm === brief?.arm && e.number === brief?.nextEpisodeNumber) ?? null,
    [episodes, brief]
  );
  const lastBriefFed = useMemo(
    () =>
      [...episodes]
        .filter((e) => e.arm === brief?.arm && e.briefFingerprint && SCREENED.includes(e.status))
        .sort((a, b) => b.number - a.number)[0] ?? null,
    [episodes, brief]
  );
  const targetedDone = targeted ? SCREENED.includes(targeted.status) : false;
  const targetedRunning = targeted ? RUNNING_STATES.includes(targeted.status) && !targetedDone : false;
  const complianceEpisode = targetedDone ? targeted : targeted ? null : lastBriefFed;
  const { data: complianceData } = useBriefCompliance(complianceEpisode?.id ?? null);
  const compliance = complianceData?.compliance ?? null;

  const fp8 = useMemo(() => brief?.fingerprint.slice(0, 8) ?? '', [brief]);

  if (isLoading && !brief) {
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

  const writeToWriter = async () => {
    try {
      if (episodeCount < brief.nextEpisodeNumber) {
        setExtending(true);
        await extendSeason.mutateAsync(brief.nextEpisodeNumber);
        toast.success(`Season extended to ${brief.nextEpisodeNumber} episodes`, { description: 'The writers-room keeps its window open.' });
        setExtending(false);
      }
      await runEpisode.mutateAsync(brief.arm);
      toast.success(`Ep${brief.nextEpisodeNumber} (${brief.arm}) queued`, {
        description: `The writer receives this brief as prompt input — compliance is verified when it lands.`,
      });
    } catch (e) {
      setExtending(false);
      toast.error(e instanceof Error ? e.message : 'Failed to queue the episode');
    }
  };

  const canWrite = arm === 'B' && !readonly && !targeted;
  const needsExtend = episodeCount < brief.nextEpisodeNumber;
  const busy = runEpisode.isPending || extendSeason.isPending || extending || (runnerBusy && !targetedRunning);

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
            {brief.cohort && (
              <Badge variant="outline" className="gap-1 border-teal-500/40 text-[10px] text-teal-700 dark:text-teal-300">
                <Eye className="h-3 w-3" aria-hidden /> {brief.cohort} lens
              </Badge>
            )}
            <span className="text-[11px] font-normal text-muted-foreground">
              from Ep{brief.basedOn.episodes.join(', Ep')} · {brief.basedOn.viewers} viewers
            </span>
          </CardTitle>
          <CardDescription>
            Numbered directives for the next outline, derived from measured panel data — zero AI. Same data always
            yields the same brief{arm === 'B' ? ', and the writer receives this brief as prompt input.' : '.'}
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
        {/* cohort lens chips — re-write the brief through an archetype's eyes */}
        {brief.lenses.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Cohort lens">
            <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">lens</span>
            <button
              onClick={() => setLens(null)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                lens === null ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              <Users className="h-3 w-3" aria-hidden /> whole panel
            </button>
            {brief.lenses.map((l) => (
              <button
                key={l.archetype}
                onClick={() => setLens(lens === l.archetype ? null : l.archetype)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                  lens === l.archetype
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
                title={`Write the brief through the ${l.archetype} lens — keep rate ${(l.keepRate * 100).toFixed(0)}%`}
              >
                <ArchetypeDot archetype={l.archetype} className="h-2.5 w-2.5" />
                {l.archetype}
                <span className={`font-mono text-[10px] ${lens === l.archetype ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}`}>
                  {(l.keepRate * 100).toFixed(0)}%
                </span>
              </button>
            ))}
          </div>
        )}

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
                    {d.check && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300" title="This directive carries a machine-checkable contract — compliance is verified after the episode is written.">
                        contract: {d.check.type.toLowerCase().replace('_', '-')}
                      </span>
                    )}
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

        {/* loop-closure action row */}
        {arm === 'A' ? (
          <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
            <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-foreground">Arm A writes blind</span> — it is the control arm. This brief
              is computed for comparison only; the experiment depends on Ep{brief.nextEpisodeNumber} (A) never seeing it.
            </span>
          </div>
        ) : targetedRunning ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-[12px] text-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
            <span>
              Ep{targeted?.number} ({targeted?.arm}) is being written <span className="font-medium">from this brief</span> —
              the compliance receipt appears here the moment it lands.
            </span>
          </div>
        ) : canWrite ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-gradient-to-r from-primary/5 to-rose-500/5 px-3 py-2.5">
            <span className="text-[12px] leading-snug text-muted-foreground">
              Close the loop: hand this brief to the writer as prompt input for Ep{brief.nextEpisodeNumber} ({brief.arm})
              {needsExtend ? ' — extending the season first (max 6).' : '.'}
            </span>
            <Button size="sm" onClick={writeToWriter} disabled={busy} className="shrink-0">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <PenLine className="h-3.5 w-3.5" aria-hidden />}
              {needsExtend ? `Extend season & write Ep${brief.nextEpisodeNumber}` : `Write Ep${brief.nextEpisodeNumber} from this brief`}
            </Button>
          </div>
        ) : null}

        {/* compliance receipt */}
        {compliance && (
          <ComplianceSection
            compliance={compliance}
            isLatest={!targeted}
          />
        )}
      </CardContent>
    </Card>
  );
}
