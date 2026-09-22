'use client';

import { useEffect, useMemo, useState } from 'react';
import { EpisodeDetail, EpisodeRow, useEpisode, useGateTest, useRecompile, useRunEpisode, ShowDetail } from '@/lib/queries';
import { useSweeps } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerDialog } from './player-dialog';
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  CircleDashed,
  Clapperboard,
  Download,
  FileText,
  FlaskConical,
  Loader2,
  Play,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { CompileReport } from '@/lib/contracts';
import { toast } from 'sonner';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-secondary text-secondary-foreground',
  WRITING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  COMPILING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  COMPILE_FAILED: 'bg-destructive/15 text-destructive',
  PIPELINE_ERROR: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  RENDERING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  RENDER_PARTIAL: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  SCREENING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  ANALYZING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  DONE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
};

const STEPS = ['WRITING', 'COMPILING', 'RENDERING', 'SCREENING', 'ANALYZING'] as const;

function stepIndex(status: string): number {
  const idx = STEPS.indexOf(status as (typeof STEPS)[number]);
  if (status === 'DONE' || status === 'RENDER_PARTIAL') return STEPS.length;
  if (status === 'COMPILE_FAILED') return 1;
  if (status === 'PIPELINE_ERROR') return 0;
  return idx === -1 ? 0 : idx;
}

export function EpisodesTab({ detail }: { detail: ShowDetail }) {
  const activeArm = useSweeps((s) => s.activeArm);
  const setArm = useSweeps((s) => s.setArm);
  const selectedEpisodeId = useSweeps((s) => s.selectedEpisodeId);
  const selectEpisode = useSweeps((s) => s.selectEpisode);
  const runEpisode = useRunEpisode(detail.show.id);
  const recompile = useRecompile(detail.show.id);
  const gateTest = useGateTest();
  const [gateReport, setGateReport] = useState<CompileReport | null>(null);

  const armEpisodes = useMemo(
    () => detail.episodes.filter((e) => e.arm === activeArm).sort((a, b) => a.number - b.number),
    [detail.episodes, activeArm]
  );
  const current = selectedEpisodeId ?? armEpisodes[armEpisodes.length - 1]?.id ?? null;
  const { data: ep } = useEpisode(current);
  const busy = detail.runner.running || armEpisodes.some((e) => !['DONE', 'COMPILE_FAILED', 'DRAFT', 'PIPELINE_ERROR'].includes(e.status));

  const runNext = () => {
    runEpisode.mutate(activeArm, {
      onSuccess: (r) => {
        selectEpisode(r.episodeId);
        toast.success(`Episode queued for arm ${activeArm}`);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="grid content-start gap-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Run control</CardTitle>
            <CardDescription>
              {detail.show.mode === 'DUAL'
                ? 'Arm A = writer-only control. Arm B = audience-optimized treatment.'
                : 'Single arm: writer only.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {detail.show.mode === 'DUAL' && (
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Arm selection">
                {(['A', 'B'] as const).map((arm) => (
                  <button
                    key={arm}
                    role="tab"
                    aria-selected={activeArm === arm}
                    onClick={() => setArm(arm)}
                    className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                      activeArm === arm ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {arm === 'A' ? 'A · Control' : 'B · Optimized'}
                  </button>
                ))}
              </div>
            )}
            <Button onClick={runNext} disabled={busy || runEpisode.isPending}>
              {busy ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> Pipeline running…
                </>
              ) : (
                <>
                  <Clapperboard className="mr-1 h-4 w-4" aria-hidden /> Run next episode
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                gateTest.mutate(current ?? '', {
                  onSuccess: (r) => setGateReport(r.report),
                  onError: (e) => toast.error(e.message),
                })
              }
              disabled={!current || gateTest.isPending}
            >
              <FlaskConical className="mr-1 h-4 w-4" aria-hidden /> Test the Gate (bad script)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Episodes · arm {activeArm}</CardTitle>
          </CardHeader>
          <CardContent className="grid max-h-[420px] gap-2 overflow-y-auto scrollbar-thin">
            {armEpisodes.length === 0 && <p className="text-sm text-muted-foreground">No episodes yet — run one.</p>}
            {armEpisodes.map((e: EpisodeRow) => (
              <button
                key={e.id}
                onClick={() => selectEpisode(e.id)}
                className={`rounded-lg border p-2.5 text-left transition-colors hover:border-primary/60 ${
                  current === e.id ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">Episode {e.number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[e.status] ?? ''}`}>
                    {e.status}
                  </span>
                </div>
                <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                  <span>{e.retentionScore !== null ? `retention ${(e.retentionScore * 100).toFixed(0)}%` : '—'}</span>
                  <span>${e.spendUsd.toFixed(3)}</span>
                  {e.repairLoops > 0 && <span>repairs: {e.repairLoops}</span>}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        {!ep || !current ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              Select or run an episode to open the studio pipeline.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span>
                    Episode {ep.episode.number} · arm {ep.episode.arm}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge className={STATUS_STYLES[ep.episode.status] ?? ''}>{ep.episode.status}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" disabled={ep.episode.status !== 'DONE' && ep.episode.status !== 'RENDER_PARTIAL'} title="Download the episode as a portable artifact">
                          <Download className="mr-1 h-3.5 w-3.5" aria-hidden /> Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={`/api/episodes/${ep.episode.id}/export?format=md`} download>
                            <FileText className="mr-2 h-4 w-4" aria-hidden /> Markdown script (.md)
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/api/episodes/${ep.episode.id}/export?format=json`} download>
                            <Braces className="mr-2 h-4 w-4" aria-hidden /> Full data (.json)
                          </a>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                </CardTitle>
                <CardDescription>{ep.plan?.summary ?? 'Writing…'}</CardDescription>
              </CardHeader>
              <CardContent>
                <PipelineStepper status={ep.episode.status} />
                <JobLogStrip logs={ep.jobLogs} />
              </CardContent>
            </Card>

            <CompileReportCard report={ep.compileReport} repairLoops={ep.episode.repairLoops} onRecompile={() => recompile.mutate(current, { onError: (e) => toast.error(e.message) })} />

            <StoryboardStrip detail={ep} />
          </>
        )}
      </div>

      <Dialog open={Boolean(gateReport)} onOpenChange={(o) => !o && setGateReport(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> Continuity Gate — fixture demo
            </DialogTitle>
            <DialogDescription>
              A deliberately broken script, compiled against its own context. Zero generation tokens were spent.
            </DialogDescription>
          </DialogHeader>
          {gateReport && <ReportBody report={gateReport} repairLoops={0} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PipelineStepper({ status }: { status: string }) {
  const idx = stepIndex(status);
  const failed = status === 'COMPILE_FAILED';
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Pipeline progress">
      {STEPS.map((s, i) => {
        const done = failed ? i < idx : i < idx || status === 'DONE';
        const active = !failed && i === idx && status !== 'DONE';
        return (
          <div key={s} className="flex items-center gap-1.5">
            {i > 0 && <span className="h-px w-4 bg-border sm:w-6" aria-hidden />}
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                failed && s === 'COMPILING'
                  ? 'bg-destructive/15 text-destructive'
                  : done
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : active
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
              }`}
            >
              {failed && s === 'COMPILING' ? (
                <XCircle className="h-3 w-3" aria-hidden />
              ) : done ? (
                <CheckCircle2 className="h-3 w-3" aria-hidden />
              ) : active ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <CircleDashed className="h-3 w-3" aria-hidden />
              )}
              {s.toLowerCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function JobLogStrip({ logs }: { logs: EpisodeDetail['jobLogs'] }) {
  if (!logs || logs.length === 0) return null;
  return (
    <div className="mt-3 max-h-24 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground scrollbar-thin">
      {logs.map((l) => (
        <div key={l.id}>
          <span className={l.status === 'ERROR' ? 'text-destructive' : l.status === 'WARN' ? 'text-amber-600' : ''}>
            [{l.status}]
          </span>{' '}
          {l.step} {l.detail ? `· ${l.detail.slice(0, 140)}` : ''}
        </div>
      ))}
    </div>
  );
}

function ReportBody({ report, repairLoops }: { report: CompileReport; repairLoops: number }) {
  const errors = report.violations.filter((v) => v.severity === 'ERROR');
  const warns = report.violations.filter((v) => v.severity === 'WARN');
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge
          className={
            report.status === 'PASS'
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
              : report.status === 'WARN'
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                : 'bg-destructive/15 text-destructive'
          }
        >
          {report.status}
        </Badge>
        <span className="text-muted-foreground">
          est. render cost ${report.estimatedCostUsd.toFixed(2)}
          {report.status === 'FAIL' && (
            <span className="ml-2 font-medium text-emerald-600">· ${report.estimatedCostUsd.toFixed(2)} of video spend saved by the gate</span>
          )}
        </span>
        {repairLoops > 0 && <Badge variant="outline">repair loops: {repairLoops}</Badge>}
      </div>
      <div className="grid max-h-[300px] gap-2 overflow-y-auto scrollbar-thin">
        {[...errors, ...warns].map((v, i) => (
          <div key={i} className={`rounded-lg border p-2.5 text-sm ${v.severity === 'ERROR' ? 'border-destructive/40' : 'border-amber-500/40'}`}>
            <div className="flex items-center gap-2">
              {v.severity === 'ERROR' ? <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />}
              <Badge variant="outline" className="font-mono text-[10px]">{v.rule}</Badge>
              <span className="text-xs text-muted-foreground">beat {v.beatIndex}</span>
            </div>
            <div className="mt-1">{v.message}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">fix → {v.fixSuggestion}</div>
          </div>
        ))}
        {report.violations.length === 0 && <div className="text-sm text-emerald-600">All 8 rules pass. Script is renderable.</div>}
      </div>
    </div>
  );
}

function CompileReportCard({
  report,
  repairLoops,
  onRecompile,
}: {
  report: CompileReport | null;
  repairLoops: number;
  onRecompile: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Continuity Compiler
          </CardTitle>
          <CardDescription>8 deterministic rules · zero AI · runs before any generation spend</CardDescription>
        </div>
        <div data-slot="card-action">
          <Button size="sm" variant="outline" onClick={onRecompile} title="Re-run the 8 deterministic rules against this script">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden /> Re-compile
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!report ? (
          <p className="text-sm text-muted-foreground">No compile report yet.</p>
        ) : (
          <ReportBody report={report} repairLoops={repairLoops} />
        )}
      </CardContent>
    </Card>
  );
}

function StoryboardStrip({ detail }: { detail: EpisodeDetail }) {
  const [playerOpen, setPlayerOpen] = useState(false);
  if (!detail.beats.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="text-base">Storyboard · {detail.beats.length} beats</CardTitle>
          <CardDescription>
            AI stills on key beats, deterministic cards elsewhere · click to play (Ken Burns)
          </CardDescription>
        </div>
        <div data-slot="card-action">
          <Button size="sm" variant="outline" onClick={() => setPlayerOpen(true)}>
            <Play className="mr-1 h-4 w-4" aria-hidden /> Play
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {detail.beats.map((b) => (
            <button
              key={b.id}
              onClick={() => setPlayerOpen(true)}
              className="group w-40 shrink-0 overflow-hidden rounded-lg border text-left transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-video bg-muted">
                {b.stillPath ? (                  <img src={b.stillPath} alt={`Storyboard frame for beat ${b.index}: ${b.title}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">rendering…</div>
                )}
                <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  {b.type}
                </span>
                {b.beat && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
                    {b.beat.durationSec}s
                  </span>
                )}
              </div>
              <div className="p-2">
                <div className="line-clamp-1 text-xs font-medium">{b.title}</div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{b.renderStatus === 'STILL' ? 'AI still' : 'card'}</span>
                  <span>
                    {b.engagement !== null ? `${(b.engagement * 100).toFixed(0)}% watching` : `$${b.estCostUsd.toFixed(3)}`}
                  </span>
                </div>
                {b.engagement !== null && (
                  <div className="mt-1 h-1 w-full rounded bg-muted">
                    <div
                      className="h-1 rounded bg-primary"
                      style={{ width: `${Math.max(2, (b.engagement ?? 0) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </CardContent>
      <PlayerDialog open={playerOpen} onOpenChange={setPlayerOpen} detail={detail} />
    </Card>
  );
}
