'use client';

import { useHealth, useLedger, useRunDemo, useShow, useShowAnalytics, useShows } from '@/lib/queries';
import { useSweeps } from '@/lib/store';
import { enterPresentMode, exitPresentMode } from '@/lib/url-sync';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreateShowDialog } from './create-show-dialog';
import { Clapperboard, Link2, MonitorPlay, Moon, PlayCircle, Sun, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

const STAGE_COLORS: Record<string, string> = {
  RENDER: 'bg-primary',
  WRITER: 'bg-rose-500',
  AUDIENCE: 'bg-teal-500',
  OPTIMIZER: 'bg-emerald-500',
  BIBLE: 'bg-orange-400',
  ANALYTICS: 'bg-neutral-400',
};
const STAGE_ORDER = ['RENDER', 'WRITER', 'AUDIENCE', 'OPTIMIZER', 'BIBLE', 'ANALYTICS'];

const NO_SHOW = '__none__';

function StageBudgetBar({
  byStage,
  totalUsd,
  budgetUsd,
}: {
  byStage: Record<string, number>;
  totalUsd: number;
  budgetUsd: number;
}) {
  if (budgetUsd <= 0) return null;
  const stages = STAGE_ORDER.filter((s) => (byStage[s] ?? 0) > 0);
  if (stages.length === 0) return <Progress value={0} className="h-2" />;
  return (
    <div
      className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round((totalUsd / budgetUsd) * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Budget used by stage"
    >
      {stages.map((s) => (
        <div
          key={s}
          className={`${STAGE_COLORS[s] ?? 'bg-neutral-400'} h-full transition-all`}
          style={{ width: `${Math.min(100, ((byStage[s] ?? 0) / budgetUsd) * 100)}%` }}
          title={`${s}: $${(byStage[s] ?? 0).toFixed(3)}`}
        />
      ))}
    </div>
  );
}

export function Header({ onShortcuts }: { onShortcuts?: () => void }) {
  const { data: health } = useHealth();
  const { data: showsData } = useShows();
  const activeShowId = useSweeps((s) => s.activeShowId);
  const readonly = useSweeps((s) => s.readonly);
  const setShow = useSweeps((s) => s.setShow);
  const { data: show } = useShow(activeShowId);
  const { data: ledger, isLoading: ledgerLoading } = useLedger(activeShowId);
  const { data: analytics } = useShowAnalytics(activeShowId);
  const runDemo = useRunDemo(activeShowId);
  const { theme, setTheme } = useTheme();

  const budgetPct = ledger && ledger.budgetUsd > 0 ? Math.min(100, (ledger.totalUsd / ledger.budgetUsd) * 100) : 0;
  const activeEpisodes = show?.episodes.filter((e) => !['DONE', 'COMPILE_FAILED', 'DRAFT', 'PIPELINE_ERROR'].includes(e.status)) ?? [];
  const busy = Boolean(show?.runner.running) || activeEpisodes.length > 0;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-rose-500 text-primary-foreground shadow-sm">
            <Clapperboard className="h-5 w-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-wide">SWEEPS</div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">Retention-Optimized AI Showrunner</div>
          </div>
        </div>

        <div className="min-w-[180px] flex-1 sm:max-w-xs">
          {/* sentinel keeps the Select permanently controlled (avoids the uncontrolled→controlled React warning during hydration) */}
          <Select value={activeShowId ?? NO_SHOW} onValueChange={(v) => v !== NO_SHOW && setShow(v)}>
            <SelectTrigger size="sm" aria-label="Select show">
              <SelectValue placeholder="Select a show" />
            </SelectTrigger>
            <SelectContent>
              {!activeShowId && (
                <SelectItem value={NO_SHOW} disabled>
                  No show selected
                </SelectItem>
              )}
              {(showsData?.shows ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title} · {s.mode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="hidden min-w-[170px] max-w-[230px] flex-1 md:block" aria-label={`Budget used ${budgetPct.toFixed(0)} percent`}>
          {ledgerLoading || !ledger ? (
            <div className="grid gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : (
            <>
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>
                  ${ledger.totalUsd.toFixed(3)} / ${ledger.budgetUsd.toFixed(2)}
                </span>
                <span className={budgetPct >= 90 ? 'font-semibold text-destructive' : ''}>{budgetPct.toFixed(0)}%</span>
              </div>
              <StageBudgetBar byStage={ledger.byStage} totalUsd={ledger.totalUsd} budgetUsd={ledger.budgetUsd} />
            </>
          )}
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Badge variant="outline" className="hidden lg:inline-flex" title={`Provider: ${health?.provider ?? '…'}, consistency gate ${health?.consistencyGate ? 'on' : 'off'}`}>
            {health?.provider === 'qwen' ? 'QWEN CLOUD' : 'SANDBOX AI'}
          </Badge>
          {busy && (
            <Badge variant="secondary" className="animate-pulse">
              pipeline running{show && show.runner.queued > 0 ? ` · ${show.runner.queued} queued` : ''}
            </Badge>
          )}
          {readonly ? (
            <Badge variant="secondary" className="gap-1.5 border border-primary/30 bg-primary/10 text-primary" title="Read-only present mode — run controls are hidden">
              <MonitorPlay className="h-3.5 w-3.5" aria-hidden /> PRESENT MODE
              <button
                onClick={exitPresentMode}
                className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-primary/20"
                aria-label="Exit present mode"
                title="Exit present mode"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </Badge>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() =>
                  runDemo.mutate(undefined, {
                    onSuccess: (r) => toast.success(`Demo queued: ${r.queued} episodes (control + treatment)`),
                    onError: (e) => toast.error(e.message),
                  })
                }
                disabled={!activeShowId || runDemo.isPending}
                title="Run the full dual-arm demo (Shift+D)"
              >
                <PlayCircle className="mr-1 h-4 w-4" aria-hidden />
                Run Full Demo
              </Button>
              <CreateShowDialog />
            </>
          )}
          {!readonly && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Enter present mode"
              title="Enter present mode — hides all run controls for sharing / demos"
              onClick={() => {
                enterPresentMode();
                toast.success('Present mode on', { description: 'Run controls hidden. “Rate it” stays available for the human panel.' });
              }}
            >
              <MonitorPlay className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Present</span>
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Copy shareable link"
            title="Copy shareable link to this view"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                toast.success('Shareable link copied', { description: 'Anyone opening it lands on this exact show + tab.' });
              } catch {
                toast.error('Could not copy — your browser blocked clipboard access');
              }
            }}
          >
            <Link2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Toggle theme"
            title="Toggle theme (T)"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div className="film-strip" aria-hidden />
      {analytics && analytics.episodes.length > 0 && (
        <div className="border-t bg-primary/5">
          <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 py-1.5 text-[11px] text-muted-foreground scrollbar-thin">
            {analytics.episodes.map((m) => (
              <span key={m.episodeId} className="whitespace-nowrap">
                <span className={`font-semibold ${m.arm === 'B' ? 'text-primary' : 'text-foreground'}`}>
                  Ep{m.number} ({m.arm})
                </span>{' '}
                retention {(m.overall * 100).toFixed(0)}% · ${m.costPerRetainedViewer.toFixed(3)} per retained viewer
              </span>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
