'use client';

import { ExperimentsData, useExperiments, useVerifyDeterminism } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Copy,
  Download,
  FlaskConical,
  Fingerprint,
  Minus,
  ReceiptText,
  RefreshCw,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

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

/**
 * Determinism receipt: replays every screening from the master seed and
 * byte-compares the watch-event streams. The project's core proof, one click.
 */
function DeterminismCard({ showId }: { showId: string }) {
  const { data, isFetching, refetch } = useVerifyDeterminism(showId);
  const receipt = data?.receipt;
  const verified = receipt?.episodes ?? [];

  const copyFingerprint = () => {
    if (!receipt) return;
    navigator.clipboard
      .writeText(receipt.fingerprint)
      .then(() => toast.success('Fingerprint copied — same seed always regenerates it'))
      .catch(() => toast.error('Clipboard unavailable'));
  };

  return (
    <Card className="lg:col-span-3 border-dashed">
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Fingerprint className="h-4 w-4 text-primary" aria-hidden /> Determinism receipt
          </CardTitle>
          <CardDescription>
            Replay every screening from the master seed — no AI, no DB writes — then byte-compare each viewer&apos;s
            watch-event stream against what actually aired
          </CardDescription>
        </div>
        <div data-slot="card-action">
          {receipt && verified.length > 0 && (
            <a
              href={`/api/shows/${showId}/verify?download=1`}
              download
              className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-transparent px-3 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
              title="Download the portable HMAC-signed verification artifact"
            >
              <Download className="h-3.5 w-3.5" aria-hidden /> Receipt
            </a>
          )}
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} title="Re-run the verification">
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
            {isFetching ? 'Verifying…' : 'Re-verify'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!receipt && isFetching && (
          <div className="grid gap-2" aria-busy="true" aria-label="Verifying determinism">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-12 w-full" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </div>
        )}
        {receipt && verified.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing to verify yet — screen an episode and this receipt will fill with hashes.
          </p>
        )}
        {receipt && verified.length > 0 && (
          <div className="grid gap-3">
            {receipt.allMatch ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    REPRODUCIBLE — {verified.filter((e) => e.match).length}/{verified.length} episodes byte-identical
                  </div>
                  <div className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    Every stored screening was regenerated exactly from seed {receipt.seed}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <ShieldAlert className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
                <div>
                  <div className="text-sm font-bold text-rose-700 dark:text-rose-400">
                    DRIFT DETECTED — {receipt.mismatchRows} row{receipt.mismatchRows === 1 ? '' : 's'} differ
                  </div>
                  <div className="text-xs text-rose-700/80 dark:text-rose-400/80">
                    Honest verification: this flags curve drift after re-compiles or panel regeneration. Re-screen affected episodes to restore.
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">rows verified</div>
                <div className="font-mono text-sm font-semibold">{receipt.checkedRows.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">viewers × episodes</div>
                <div className="font-mono text-sm font-semibold">
                  {receipt.viewerCount} × {verified.length}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">replay time</div>
                <div className="font-mono text-sm font-semibold">{receipt.durationMs} ms</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">AI tokens spent</div>
                <div className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">0</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-xs">
                <tbody>
                  {verified.map((e) => (
                    <tr key={`${e.arm}-${e.epNumber}`} className="border-b last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                        Ep{e.epNumber} ({e.arm})
                      </td>
                      <td className="px-2 py-1.5">
                        {e.match ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                            <BadgeCheck className="mr-0.5 h-2.5 w-2.5" aria-hidden /> identical
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400">
                            <ShieldAlert className="mr-0.5 h-2.5 w-2.5" aria-hidden /> {e.mismatchRows} differ
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
                        {e.checkedRows} rows · {e.beatCount} beats
                      </td>
                      <td
                        className="hidden px-3 py-1.5 text-right font-mono text-[10px] text-muted-foreground sm:table-cell"
                        title={`computed ${e.computedHash} · stored ${e.storedHash}`}
                      >
                        sha {e.computedHash.slice(0, 10)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={copyFingerprint}
              className="group flex items-center gap-2 self-start rounded-lg border border-dashed bg-muted/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              title="Copy the full fingerprint"
            >
              <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" aria-hidden />
              fingerprint {receipt.fingerprint.slice(0, 24)}…
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="min-w-0 lg:col-span-1">
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
                <div
                  className={`flex items-center gap-2 rounded-lg p-2.5 text-sm ${
                    verdict.lift > 0
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {verdict.lift > 0 ? (
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" aria-hidden />
                  )}
                  {verdict.lift > 0
                    ? 'The audience loop is working: the optimized arm retains more viewers.'
                    : 'The loop under-performed the control this run — inspect the cliffs and experiments below.'}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" aria-hidden /> Experiment timeline
          </CardTitle>
          <CardDescription>
            Thompson-sampling decisions: two variants micro-screened on 40 viewers through their own FSRS memories and last
            satisfaction state — winner written into the next episode
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
                const memoryAware = String(e.evidence.method ?? '') === 'thompson_sampling_memory';
                const n = Number(e.evidence.n ?? 0) || null;
                return (
                  <div key={e.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        EP{e.epNumber} · slot {e.slotIndex}
                      </Badge>
                      <span className="text-muted-foreground">
                        {memoryAware ? 'sat ' : ''}A {(e.rewardA ?? 0).toFixed(3)} vs B {(e.rewardB ?? 0).toFixed(3)}
                      </span>
                      <Badge className={e.chosen === 'B' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-teal-500/15 text-teal-700 dark:text-teal-400'}>
                        chose {e.chosen}
                      </Badge>
                      {memoryAware && (
                        <Badge variant="outline" className="border-teal-500/40 text-[9px] font-mono text-teal-700 dark:text-teal-300" title="Each sampled viewer scored the variants through their own FSRS memories, real last satisfaction state, and loyalty-coupled hook recall.">
                          memory-aware
                        </Badge>
                      )}
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        n={String(e.evidence.n ?? '—')} · prev cliff {(Number(e.evidence.prevCliffDelta ?? 0) * 100).toFixed(1)} pts
                      </span>
                    </div>
                    {memoryAware && n !== null && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-stone-500/10 px-1.5 py-0.5 font-mono text-[10px] text-stone-700 dark:text-stone-300" title="Viewers whose smoothed satisfaction would hold above their own churn threshold after this beat">
                          keeps A {Number(e.evidence.keepsA ?? 0)}/{n} · B {Number(e.evidence.keepsB ?? 0)}/{n}
                        </span>
                        {(Number(e.evidence.recallA ?? 0) > 0 || Number(e.evidence.recallB ?? 0) > 0) && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-1.5 py-0.5 font-mono text-[10px] text-orange-800 dark:text-orange-300" title="Sampled viewers whose loyalty-coupled memory actually recalled the previous cliffhanger (loyalty > 0.64)">
                            hook recall A {Number(e.evidence.recallA ?? 0)} · B {Number(e.evidence.recallB ?? 0)}
                          </span>
                        )}
                      </div>
                    )}
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

      <Card className="min-w-0 lg:col-span-3">
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
            <div className="overflow-x-auto">
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
            </div>
          )}
        </CardContent>
      </Card>

      <DeterminismCard showId={showId} />
    </div>
  );
}

export type { ExperimentsData };
