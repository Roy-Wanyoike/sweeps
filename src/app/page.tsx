'use client';

import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from '@/components/sweeps/header';
import { CreateShowDialog } from '@/components/sweeps/create-show-dialog';
import { StudioTab } from '@/components/sweeps/studio-tab';
import { EpisodesTab } from '@/components/sweeps/episodes-tab';
import { AudienceTab } from '@/components/sweeps/audience-tab';
import { AnalyticsTab } from '@/components/sweeps/analytics-tab';
import { ExperimentTab } from '@/components/sweeps/experiment-tab';
import { ShortcutsDialog } from '@/components/sweeps/shortcuts-dialog';
import { useCreateShow, useRunDemo, useShow, useShows } from '@/lib/queries';
import { useSweeps, TabKey } from '@/lib/store';
import { useUrlSync } from '@/lib/url-sync';
import { useTheme } from 'next-themes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  BarChart3,
  Clapperboard,
  Film,
  FlaskConical,
  Keyboard,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

const DEMO_PREMISE =
  'A washed-up radio DJ intercepts a numbers station broadcast that predicts deaths — and tonight it names her.';

const TAB_META: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'episodes', label: 'Episodes', icon: Film },
  { key: 'studio', label: 'Studio', icon: Clapperboard },
  { key: 'audience', label: 'Audience', icon: MessageSquare },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'experiment', label: 'Experiment', icon: FlaskConical },
];

function Landing() {
  const create = useCreateShow();
  const setShow = useSweeps((s) => s.setShow);
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-16 text-center sm:py-20">
      <div className="relative">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/15 blur-2xl" aria-hidden />
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20">
          <Clapperboard className="h-8 w-8" aria-hidden />
        </div>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">SWEEPS</h1>
        <p className="mt-2 text-lg font-medium text-muted-foreground">The Retention-Optimized AI Showrunner</p>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Every episode is compiled through a deterministic continuity gate (8 rules, zero AI, zero wasted tokens),
          rendered by the crew, then screened by a simulated audience of persona viewers with persistent, decaying
          memory. A Thompson-sampling optimizer rewrites the next episode against measured retention — and a dual-arm
          experiment proves the loop works.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2" aria-label="Key product numbers">
        {['8 rules · 0 tokens', '200 persona viewers', 'FSRS memory decay', '+4.5 pts measured lift'].map((chip) => (
          <Badge key={chip} variant="secondary" className="px-3 py-1 text-xs">
            {chip}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button
          size="lg"
          disabled={create.isPending}
          onClick={() =>
            create.mutate(
              { premise: DEMO_PREMISE, mode: 'DUAL', episodeCount: 3, budgetUsd: 5, panelSize: 200 },
              {
                onSuccess: (r) => setShow(r.id),
                onError: (e) => toast.error(e.message),
              }
            )
          }
        >
          <Sparkles className="mr-2 h-4 w-4" aria-hidden />
          {create.isPending ? 'Generating bible…' : 'Create the demo show'}
        </Button>
        <CreateShowDialog />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Power user? Press <Kbd>?</Kbd> for keyboard shortcuts.
      </p>
    </div>
  );
}

function Dashboard({ onShortcuts }: { onShortcuts: () => void }) {
  const activeShowId = useSweeps((s) => s.activeShowId);
  const activeTab = useSweeps((s) => s.activeTab);
  const setTab = useSweeps((s) => s.setTab);
  const setArm = useSweeps((s) => s.setArm);
  const selectEpisode = useSweeps((s) => s.selectEpisode);
  const { data: detail, isLoading } = useShow(activeShowId);
  const runDemo = useRunDemo(activeShowId);
  const { theme, setTheme } = useTheme();

  // auto-select the latest episode when landing on the episodes tab
  const autoPicked = useRef(false);
  useEffect(() => {
    if (detail && !autoPicked.current) {
      const latest = [...detail.episodes]
        .filter((e) => e.arm === 'A')
        .sort((a, b) => b.number - a.number)[0];
      if (latest) {
        selectEpisode(latest.id);
        autoPicked.current = true;
      }
    }
  }, [detail, selectEpisode]);

  // global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const tabByIndex: Record<string, TabKey> = { '1': 'episodes', '2': 'studio', '3': 'audience', '4': 'analytics', '5': 'experiment' };
      if (tabByIndex[k]) {
        setTab(tabByIndex[k]);
        return;
      }
      if (k === '?' || (k === '/' && e.shiftKey)) {
        onShortcuts();
        return;
      }
      if (k === 't' || k === 'T') {
        setTheme(theme === 'dark' ? 'light' : 'dark');
        return;
      }
      if (!detail) return;
      if (k === 'a' || k === 'A') setArm('A');
      if (k === 'b' || k === 'B') setArm('B');
      if (k === 'e' || k === 'E') {
        setTab('episodes');
        fetch(`/api/shows/${detail.show.id}/episodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ arm: useSweeps.getState().activeArm }),
        })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not queue episode'))))
          .then((r: { episodeId: string }) => {
            selectEpisode(r.episodeId);
            toast.success(`Episode queued for arm ${useSweeps.getState().activeArm}`);
          })
          .catch((err: Error) => toast.error(err.message));
      }
      if (k === 'D' && e.shiftKey) {
        runDemo.mutate(undefined, {
          onSuccess: (r) => toast.success(`Demo queued: ${r.queued} episodes (control + treatment)`),
          onError: (e) => toast.error(e.message),
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [detail, onShortcuts, runDemo, setArm, setTab, setTheme, selectEpisode, theme]);

  if (isLoading || !detail) {
    return (
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6">
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const busy = detail.runner.running || detail.episodes.some((e) => !['DONE', 'COMPILE_FAILED', 'DRAFT', 'PIPELINE_ERROR'].includes(e.status));

  return (
    <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabKey)} className="mx-auto max-w-7xl px-4 py-5">
      <TabsList className="mb-4 flex w-full justify-start overflow-x-auto scrollbar-thin sm:w-auto">
        {TAB_META.map(({ key, label, icon: Icon }, i) => (
          <TabsTrigger key={key} value={key} className="gap-1.5" title={`${label} (${i + 1})`}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
            {key === 'episodes' && busy && (
              <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-label="pipeline running" />
            )}
            <Kbd className="ml-1 hidden lg:inline-flex">{i + 1}</Kbd>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="episodes" className="fade-in">
        <EpisodesTab detail={detail} />
      </TabsContent>
      <TabsContent value="studio" className="fade-in">
        <StudioTab detail={detail} />
      </TabsContent>
      <TabsContent value="audience" className="fade-in">
        <AudienceTab detail={detail} />
      </TabsContent>
      <TabsContent value="analytics" className="fade-in">
        <AnalyticsTab detail={detail} />
      </TabsContent>
      <TabsContent value="experiment" className="fade-in">
        <ExperimentTab showId={detail.show.id} />
      </TabsContent>
    </Tabs>
  );
}

function Inner() {
  useUrlSync();
  const activeShowId = useSweeps((s) => s.activeShowId);
  const { data: showsData, isLoading } = useShows();
  const showExists = Boolean(activeShowId && showsData?.shows.some((s) => s.id === activeShowId));
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <Header onShortcuts={() => setShortcutsOpen(true)} />
      <main className="flex-1">
        {isLoading ? (
          <div className="mx-auto max-w-7xl px-4 py-10">
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !showExists ? (
          <Landing />
        ) : (
          <Dashboard onShortcuts={() => setShortcutsOpen(true)} />
        )}
      </main>
      <footer className="mt-auto border-t bg-gradient-to-r from-primary/5 via-transparent to-rose-500/5 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 text-center text-xs text-muted-foreground">
          <span className="font-semibold text-foreground/70">SWEEPS</span>
          <span aria-hidden>·</span>
          <span>deterministic continuity gates</span>
          <span aria-hidden>·</span>
          <span>simulated audiences with memory</span>
          <span aria-hidden>·</span>
          <span>measured attention per dollar</span>
          <button
            onClick={() => setShortcutsOpen(true)}
            className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard className="h-3 w-3" aria-hidden /> shortcuts
          </button>
        </div>
      </footer>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

export default function Page() {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 1500, retry: 1, refetchOnWindowFocus: false },
        },
      })
  );
  return (
    <QueryClientProvider client={qc}>
      <Inner />
    </QueryClientProvider>
  );
}
