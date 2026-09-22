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
import { useCreateShow, useShow, useShows } from '@/lib/queries';
import { useSweeps, TabKey } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clapperboard, Sparkles } from 'lucide-react';

const DEMO_PREMISE =
  'A washed-up radio DJ intercepts a numbers station broadcast that predicts deaths — and tonight it names her.';

function Landing() {
  const create = useCreateShow();
  const setShow = useSweeps((s) => s.setShow);
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
        <Clapperboard className="h-8 w-8" aria-hidden />
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
      <div className="flex flex-wrap justify-center gap-3">
        <Button
          size="lg"
          disabled={create.isPending}
          onClick={() =>
            create.mutate(
              { premise: DEMO_PREMISE, mode: 'DUAL', episodeCount: 3, budgetUsd: 5, panelSize: 200 },
              {
                onSuccess: (r) => setShow(r.id),
                onError: (e) => alert(e.message),
              }
            )
          }
        >
          <Sparkles className="mr-2 h-4 w-4" aria-hidden />
          {create.isPending ? 'Generating bible…' : 'Create the demo show'}
        </Button>
        <CreateShowDialog />
      </div>
    </div>
  );
}

function Dashboard() {
  const activeShowId = useSweeps((s) => s.activeShowId);
  const activeTab = useSweeps((s) => s.activeTab);
  const setTab = useSweeps((s) => s.setTab);
  const selectEpisode = useSweeps((s) => s.selectEpisode);
  const { data: detail, isLoading } = useShow(activeShowId);

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

  return (
    <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabKey)} className="mx-auto max-w-7xl px-4 py-5">
      <TabsList className="mb-4 flex w-full justify-start overflow-x-auto scrollbar-thin sm:w-auto">
        <TabsTrigger value="episodes">Episodes</TabsTrigger>
        <TabsTrigger value="studio">Studio</TabsTrigger>
        <TabsTrigger value="audience">Audience</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="experiment">Experiment</TabsTrigger>
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
  const activeShowId = useSweeps((s) => s.activeShowId);
  const { data: showsData, isLoading } = useShows();
  const showExists = Boolean(activeShowId && showsData?.shows.some((s) => s.id === activeShowId));

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {isLoading ? (
          <div className="mx-auto max-w-7xl px-4 py-10">
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !showExists ? (
          <Landing />
        ) : (
          <Dashboard />
        )}
      </main>
      <footer className="mt-auto border-t py-4 text-center text-xs text-muted-foreground">
        SWEEPS · deterministic continuity gates · simulated audiences with memory · measured attention per dollar
      </footer>
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
