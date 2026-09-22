'use client';

import { useHealth, useLedger, useRunDemo, useShow, useShowAnalytics, useShows } from '@/lib/queries';
import { useSweeps } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreateShowDialog } from './create-show-dialog';
import { Clapperboard, Moon, PlayCircle, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

export function Header() {
  const { data: health } = useHealth();
  const { data: showsData } = useShows();
  const activeShowId = useSweeps((s) => s.activeShowId);
  const setShow = useSweeps((s) => s.setShow);
  const { data: show } = useShow(activeShowId);
  const { data: ledger } = useLedger(activeShowId);
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Clapperboard className="h-5 w-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-wide">SWEEPS</div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">Retention-Optimized AI Showrunner</div>
          </div>
        </div>

        <div className="min-w-[180px] flex-1 sm:max-w-xs">
          <Select value={activeShowId ?? undefined} onValueChange={(v) => setShow(v)}>
            <SelectTrigger size="sm" aria-label="Select show">
              <SelectValue placeholder="Select a show" />
            </SelectTrigger>
            <SelectContent>
              {(showsData?.shows ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title} · {s.mode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="hidden min-w-[140px] max-w-[220px] flex-1 md:block" aria-label={`Budget used ${budgetPct.toFixed(0)} percent`}>
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>
              ${ledger?.totalUsd.toFixed(3) ?? '0.000'} / ${ledger?.budgetUsd.toFixed(2) ?? '—'}
            </span>
            <span>{budgetPct.toFixed(0)}%</span>
          </div>
          <Progress value={budgetPct} className="h-2" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="hidden lg:inline-flex" title={`Provider: ${health?.provider ?? '…'}, consistency gate ${health?.consistencyGate ? 'on' : 'off'}`}>
            {health?.provider === 'qwen' ? 'QWEN CLOUD' : 'SANDBOX AI'}
          </Badge>
          {busy && (
            <Badge variant="secondary" className="animate-pulse">
              pipeline running{show && show.runner.queued > 0 ? ` · ${show.runner.queued} queued` : ''}
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() =>
              runDemo.mutate(undefined, {
                onSuccess: (r) => toast.success(`Demo queued: ${r.queued} episodes (control + treatment)`),
                onError: (e) => toast.error(e.message),
              })
            }
            disabled={!activeShowId || runDemo.isPending}
          >
            <PlayCircle className="mr-1 h-4 w-4" aria-hidden />
            Run Full Demo
          </Button>
          <CreateShowDialog />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {analytics && analytics.episodes.length > 0 && (
        <div className="border-t bg-primary/5">
          <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 py-1.5 text-[11px] text-muted-foreground scrollbar-thin">
            {analytics.episodes.map((m) => (
              <span key={m.episodeId} className="whitespace-nowrap">
                <span className="font-semibold text-foreground">
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
