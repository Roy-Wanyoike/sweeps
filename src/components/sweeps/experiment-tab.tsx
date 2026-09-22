'use client';

import { ExperimentsData, useExperiments } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowDownRight, ArrowUpRight, FlaskConical, Minus, ReceiptText, Scale } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Micro-cost formatting: values are often a few tenths of a cent. */
function formatMicroUsd(v: number): string {
  if (v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(3)}`;
}

function deltaTone(deltaPts: number): string {
  if (deltaPts >= 2) return 'text-emerald-600 dark:text-emerald-400 font-bold';
  if (deltaPts >= 0.5) return 'text-emerald-600/90 dark:text-emerald-400/90 font-medium';
  if (deltaPts <= -2) return 'text-rose-600 dark:text-rose-400 font-bold';
  if (deltaPts <= -0.5) return 'text-rose-600/90 dark:text-rose-400/90 font-medium';
  return 'text-muted-foreground';
}

export function ExperimentTab({ showId }: { showId: string }) {
  const { data } = useExperiments(showId);
  const verdict = data?.verdict.verdict;
  const byArm = data?.verdict.byArm;
  const experiments = data?.experiments ?? [];

  // arm-by-episode rows for the receipt table + sparkline
  const rows = (() => {
    if (!byArm) return [];
    const a = byArm['A'];
    const b = byArm['B'];
    const n = Math.max(a?.numbers.length ?? 0, b?.numbers.length ?? 0);
    const out: {
      ep: number;
      retA: number | null;
      retB: number | null;
      spendA: number | null;
      spendB: number | null;
      costA: number | null;
      costB: number | null;
    }[] = [];
    for (let i = 0; i < n; i++) {
      out.push({
        ep: a?.numbers[i] ?? b?.numbers[i] ?? i + 1,
        retA: a?.retention[i] ?? null,
        retB: b?.retention[i] ?? null,
        spendA: a?.spend[i] ?? null,
        spendB: b?.spend[i] ?? null,
        costA: a?.costPerRV[i] ?? null,
        costB: b?.costPerRV[i] ?? null,
      });
    }
    return out;
  })();

  const sparkData = rows.map((r) => ({
    ep: `E${r.ep}`,
    A: r.retA !== null ? Number((r.retA * 100).toFixed(1)) : null,
    B: r.retB !== null ? Number((r.retB * 100).toFixed(1)) : null,
  }));

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

              {sparkData.length > 1 && (
                <div className="h-20" aria-hidden>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparkData} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
                      <XAxis dataKey="ep" tick={{ fontSize: 9 }} interval={0} axisLine={false} tickLine={false} />
                      <YAxis hide domain={['dataMin - 3', 'dataMax + 3']} />
                      <Tooltip
                        formatter={(v, name) => [`${v}%`, name === 'B' ? 'optimized' : 'control']}
                        contentStyle={{ borderRadius: 8, fontSize: 11 }}
                      />
                      <Line type="monotone" dataKey="A" stroke="#0d9488" strokeWidth={1.8} dot={{ r: 2 }} name="A" />
                      <Line type="monotone" dataKey="B" stroke="#d97706" strokeWidth={2.2} dot={{ r: 2 }} name="B" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

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
              {experiments.map((e) => {
                const ra = e.rewardA ?? 0;
                const rb = e.rewardB ?? 0;
                const total = Math.max(ra + rb, 0.0001);
                const pctB = (rb / total) * 100;
                return (
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
                    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="h-full bg-teal-500/70" style={{ width: `${100 - pctB}%` }} title={`A ${ra.toFixed(3)}`} />
                      <div className="h-full bg-amber-500/80" style={{ width: `${pctB}%` }} title={`B ${rb.toFixed(3)}`} />
                    </div>
                    {typeof e.evidence.prevCliffQuote === 'string' && e.evidence.prevCliffQuote && (
                      <div className="mt-1.5 text-xs italic text-muted-foreground">“{e.evidence.prevCliffQuote}”</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="h-4 w-4 text-primary" aria-hidden /> Arm-by-episode receipt
          </CardTitle>
          <CardDescription>
            Every episode, both arms, same numbers the optimizer saw — Δ is B − A in retention points
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No finished episodes yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Episode</TableHead>
                  <TableHead className="text-right">A retention</TableHead>
                  <TableHead className="text-right">B retention</TableHead>
                  <TableHead className="text-right">Δ (B − A)</TableHead>
                  <TableHead className="text-right">Spend A</TableHead>
                  <TableHead className="text-right">Spend B</TableHead>
                  <TableHead className="text-right">Cost/RV A → B</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const deltaPts =
                    r.retA !== null && r.retB !== null ? (r.retB - r.retA) * 100 : null;
                  const costTrend =
                    r.costA !== null && r.costB !== null && r.costA > 0 ? (r.costB - r.costA) / r.costA : null;
                  return (
                    <TableRow key={r.ep}>
                      <TableCell>
                        <span className="font-medium">Ep{r.ep}</span>
                        {r.ep === 1 && (
                          <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-[9px] text-muted-foreground">
                            paired premiere
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.retA !== null ? `${(r.retA * 100).toFixed(1)}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.retB !== null ? `${(r.retB * 100).toFixed(1)}%` : '—'}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-xs ${deltaPts !== null ? deltaTone(deltaPts) : ''}`}>
                        {deltaPts !== null ? (
                          <span className="inline-flex items-center gap-0.5">
                            {deltaPts > 0.05 ? (
                              <ArrowUpRight className="h-3 w-3" aria-hidden />
                            ) : deltaPts < -0.05 ? (
                              <ArrowDownRight className="h-3 w-3" aria-hidden />
                            ) : (
                              <Minus className="h-3 w-3" aria-hidden />
                            )}
                            {deltaPts >= 0 ? '+' : ''}
                            {deltaPts.toFixed(1)} pts
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.spendA !== null ? formatMicroUsd(r.spendA) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.spendB !== null ? formatMicroUsd(r.spendB) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.costA !== null && r.costB !== null ? (
                          <>
                            {formatMicroUsd(r.costA)} → {formatMicroUsd(r.costB)}
                            {costTrend !== null && Math.abs(costTrend) > 0.01 && (
                              <span className={`ml-1 ${costTrend < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                ({costTrend > 0 ? '+' : ''}
                                {(costTrend * 100).toFixed(0)}%)
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export type { ExperimentsData };
