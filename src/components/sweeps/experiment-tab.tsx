'use client';

import { ExperimentsData, useExperiments } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpRight, FlaskConical, Scale } from 'lucide-react';

/** Micro-cost formatting: values are often a few tenths of a cent. */
function formatMicroUsd(v: number): string {
  if (v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(3)}`;
}

export function ExperimentTab({ showId }: { showId: string }) {
  const { data } = useExperiments(showId);
  const verdict = data?.verdict.verdict;
  const experiments = data?.experiments ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" aria-hidden /> The verdict
          </CardTitle>
          <CardDescription>Control arm A vs audience-optimized arm B across the full run</CardDescription>
        </CardHeader>
        <CardContent>
          {!verdict ? (
            <p className="text-sm text-muted-foreground">
              Run the full demo on a DUAL show — the verdict lands here once both arms finish ≥2 episodes.
            </p>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-xl border bg-primary/5 p-4 text-center">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Retention lift (B − A)</div>
                <div className={`mt-1 text-4xl font-bold ${verdict.lift >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {verdict.lift >= 0 ? '+' : ''}
                  {(verdict.lift * 100).toFixed(1)} pts
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  A: {verdict.deltaA >= 0 ? '+' : ''}
                  {(verdict.deltaA * 100).toFixed(1)} pts · B: {verdict.deltaB >= 0 ? '+' : ''}
                  {(verdict.deltaB * 100).toFixed(1)} pts (last vs first episode)
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border p-2.5">
                  <div className="text-[10px] uppercase text-muted-foreground">cost / retained viewer</div>
                  <div className="mt-0.5">
                    A {formatMicroUsd(verdict.avgCostPerRV_A)} · B {formatMicroUsd(verdict.avgCostPerRV_B)}
                  </div>
                </div>
                <div className="rounded-lg border p-2.5">
                  <div className="text-[10px] uppercase text-muted-foreground">avg spend / episode</div>
                  <div className="mt-0.5">
                    A {formatMicroUsd(verdict.avgSpend_A)} · B {formatMicroUsd(verdict.avgSpend_B)}
                  </div>
                </div>
              </div>
              {verdict.lift !== 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                  {verdict.lift > 0
                    ? 'The audience loop is working: the optimized arm retains more viewers.'
                    : 'The loop under-performed the control this run — inspect the cliffs and experiments below.'}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" aria-hidden /> Experiment timeline
          </CardTitle>
          <CardDescription>
            Thompson-sampling decisions: two variants micro-screened on 40 viewers, winner written into the next episode
          </CardDescription>
        </CardHeader>
        <CardContent>
          {experiments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No experiments yet — they are created after arm-B episodes with retention cliffs.
            </p>
          ) : (
            <div className="grid max-h-96 gap-2 overflow-y-auto pr-1 scrollbar-thin">
              {experiments.map((e) => (
                <div key={e.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      EP{e.epNumber} · slot {e.slotIndex}
                    </Badge>
                    <span className="text-muted-foreground">
                      A {(e.rewardA ?? 0).toFixed(3)} vs B {(e.rewardB ?? 0).toFixed(3)}
                    </span>
                    <Badge className={e.chosen === 'B' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-teal-500/15 text-teal-700 dark:text-teal-400'}>
                      chose {e.chosen}
                    </Badge>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      n={String(e.evidence.n ?? '—')} · prev cliff {(Number(e.evidence.prevCliffDelta ?? 0) * 100).toFixed(1)} pts
                    </span>
                  </div>
                  {typeof e.evidence.prevCliffQuote === 'string' && e.evidence.prevCliffQuote && (
                    <div className="mt-1 text-xs italic text-muted-foreground">“{e.evidence.prevCliffQuote}”</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export type { ExperimentsData };
