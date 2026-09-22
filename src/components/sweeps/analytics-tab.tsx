'use client';

import { useMemo, useState } from 'react';
import { ShowDetail, useShowAnalytics } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Flame, Grid3X3, TrendingDown, Users } from 'lucide-react';
import { toast } from 'sonner';

const COLORS = ['#d97706', '#e11d48', '#0d9488', '#ea580c', '#16a34a', '#a21caf', '#f59e0b', '#be123c', '#0f766e', '#c2410c', '#15803d', '#86198f'];
const ARM_COLOR: Record<string, string> = { A: '#0d9488', B: '#d97706' };
const COHORT_PALETTE = ['#d97706', '#0d9488', '#e11d48', '#16a34a', '#a21caf', '#ea580c', '#0f766e', '#be123c', '#f59e0b', '#15803d', '#86198f', '#c2410c'];

/** retention 0..1 → warm color (low = rose, high = emerald) */
function heatColor(r: number): string {
  // clamp
  const v = Math.max(0, Math.min(1, r));
  // interpolate rose (#e11d48) → amber (#d97706) → emerald (#059669) across 0.4..0.9
  if (v < 0.4) return 'bg-rose-500/80';
  if (v < 0.55) return 'bg-rose-400/70';
  if (v < 0.65) return 'bg-amber-500/70';
  if (v < 0.75) return 'bg-amber-400/70';
  if (v < 0.85) return 'bg-emerald-400/70';
  return 'bg-emerald-500/80';
}

function cliffColor(delta: number): string {
  if (delta >= 0.15) return 'text-rose-600 dark:text-rose-400 font-bold';
  if (delta >= 0.07) return 'text-rose-500 dark:text-rose-400/90 font-medium';
  if (delta >= 0.03) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

export function AnalyticsTab({ detail }: { detail: ShowDetail }) {
  const { data, isLoading } = useShowAnalytics(detail.show.id);
  const episodes = data?.episodes ?? [];
  const [focusId, setFocusId] = useState<string | null>(null);
  const focus = episodes.find((m) => m.episodeId === focusId) ?? episodes[episodes.length - 1];
  // cohort explorer state
  const [cohortEpId, setCohortEpId] = useState<string | null>(null);
  const cohortEp = episodes.find((m) => m.episodeId === cohortEpId) ?? episodes[episodes.length - 1];
  const [cohortEnabled, setCohortEnabled] = useState<Record<string, boolean>>({});

  const retentionData = useMemo(() => {
    if (episodes.length === 0) return [];
    const maxBeat = Math.max(...episodes.map((m) => m.curve.length));
    const rows: Record<string, number>[] = [];
    for (let b = 0; b < maxBeat; b++) {
      const row: Record<string, number> = { beat: b };
      for (const m of episodes) {
        const c = m.curve[b];
        if (c) row[`${m.arm}${m.number}`] = Number((c.retention * 100).toFixed(1));
      }
      rows.push(row);
    }
    return rows;
  }, [episodes]);

  // auto-domain: zoom the y axis to the data range so 65-75% curves are readable
  const yDomain = useMemo<[number, number]>(() => {
    const vals = retentionData.flatMap((r) => Object.entries(r).filter(([k]) => k !== 'beat').map(([, v]) => v));
    if (!vals.length) return [0, 100];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return [Math.max(0, Math.floor((min - 8) / 5) * 5), Math.min(100, Math.ceil((max + 4) / 5) * 5)];
  }, [retentionData]);

  const costData = episodes.map((m) => ({
    label: `E${m.number}(${m.arm})`,
    costPerRV: Number((m.costPerRetainedViewer * 100).toFixed(2)),
    retention: Number((m.overall * 100).toFixed(1)),
  }));

  // heatmap matrix: one row per episode, cells per beat
  const heat = useMemo(() => {
    const maxBeat = episodes.length ? Math.max(...episodes.map((m) => m.curve.length)) : 0;
    return episodes.map((m) => ({ m, cells: m.curve.map((c) => c.retention) , maxBeat }));
  }, [episodes]);

  // ---- cohort explorer data ----
  const cohortEpisodes = useMemo(
    () => episodes.filter((m) => (m.cohorts?.length ?? 0) > 0),
    [episodes]
  );
  // default selection: top-2 keepers + bottom-2 churners (the interesting extremes)
  const defaultCohortOn = (index: number, total: number): boolean =>
    total <= 4 ? true : index < 2 || index >= total - 2;
  const activeCohorts = useMemo(() => {
    if (!cohortEp) return [];
    return cohortEp.cohorts.filter(
      (c, i) => cohortEnabled[c.archetype] ?? defaultCohortOn(i, cohortEp.cohorts.length)
    );
  }, [cohortEp, cohortEnabled]);

  const cohortChartData = useMemo(() => {
    if (!cohortEp) return [];
    const beats = cohortEp.curve.map((c) => c.beat);
    return beats.map((b) => {
      const row: Record<string, number> = {
        beat: b,
        overall: Number((((cohortEp.curve.find((c) => c.beat === b)?.retention) ?? 0) * 100).toFixed(1)),
      };
      for (const c of activeCohorts) {
        const point = c.curve.find((p) => p.beat === b);
        if (point) row[c.archetype] = Number((point.retention * 100).toFixed(1));
      }
      return row;
    });
  }, [cohortEp, activeCohorts]);

  const cohortYDomain = useMemo<[number, number]>(() => {
    const vals = cohortChartData.flatMap((r) => Object.entries(r).filter(([k]) => k !== 'beat').map(([, v]) => v));
    if (!vals.length) return [0, 100];
    return [Math.max(0, Math.floor((Math.min(...vals) - 8) / 5) * 5), Math.min(100, Math.ceil((Math.max(...vals) + 4) / 5) * 5)];
  }, [cohortChartData]);

  const exportCsv = () => {
    if (!episodes.length) return;
    const maxBeat = Math.max(...episodes.map((m) => m.curve.length));
    const header = ['beat', ...episodes.map((m) => `Ep${m.number}_${m.arm}`)];
    const rows: string[] = [header.join(',')];
    for (let b = 0; b < maxBeat; b++) {
      const cells = episodes.map((m) => (m.curve[b] ? (m.curve[b].retention * 100).toFixed(2) : ''));
      rows.push([b, ...cells].join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${detail.show.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-retention.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Retention curves exported as CSV');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <div>
            <CardTitle>Retention curves — every episode, both arms</CardTitle>
            <CardDescription>
              % of the simulated panel still watching at each beat. Teal = control (A), amber = optimized (B).
            </CardDescription>
          </div>
          <div data-slot="card-action">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!episodes.length}>
              <Download className="mr-1 h-4 w-4" aria-hidden /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {episodes.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Run episodes to see retention curves.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={retentionData} margin={{ top: 5, right: 12, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="splitY" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.55} />
                      <stop offset="55%" stopColor="#d97706" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#e11d48" stopOpacity={0.45} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                  <XAxis dataKey="beat" tick={{ fontSize: 11 }} label={{ value: 'beat', position: 'insideBottomRight', offset: -2, fontSize: 10 }} />
                  <YAxis domain={yDomain} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => [`${v}% still watching`]}
                    labelFormatter={(l) => `Beat ${l}`}
                    contentStyle={{ borderRadius: 10, borderColor: 'rgba(0,0,0,0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {episodes.map((m, i) => (
                    <Line
                      key={m.episodeId}
                      type="monotone"
                      dataKey={`${m.arm}${m.number}`}
                      stroke={ARM_COLOR[m.arm] ?? COLORS[i % COLORS.length]}
                      strokeWidth={m.arm === 'B' ? 2.4 : 1.8}
                      strokeDasharray={m.arm === 'B' ? undefined : '0'}
                      dot={false}
                      activeDot={{ r: 3.5 }}
                      name={`Ep${m.number} (${m.arm === 'A' ? 'control' : 'optimized'})`}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Grid3X3 className="h-4 w-4 text-primary" aria-hidden /> Beat retention heatmap
          </CardTitle>
          <CardDescription>
            Cell = % of the panel still watching at that beat. Hover for exact values — cold rows lose the plot, warm rows hold it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!heat.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="mb-1 flex gap-1 pl-24 text-[9px] text-muted-foreground">
                  {Array.from({ length: heat[0].maxBeat }).map((_, b) => (
                    <div key={b} className="h-4 flex-1 text-center">
                      {b}
                    </div>
                  ))}
                </div>
                {heat.map(({ m, cells, maxBeat }) => (
                  <div key={m.episodeId} className="mb-1 flex items-center gap-1">
                    <div className="w-24 shrink-0 truncate text-[11px]">
                      <span className={m.arm === 'B' ? 'font-semibold text-primary' : 'font-medium'}>
                        Ep{m.number} ({m.arm})
                      </span>
                    </div>
                    {Array.from({ length: maxBeat }).map((_, b) => {
                      const r = cells[b];
                      return (
                        <div
                          key={b}
                          className={`h-7 flex-1 rounded-sm ${r === undefined ? 'bg-muted/40' : heatColor(r)} flex items-center justify-center text-[9px] font-semibold text-white/90 transition-transform hover:scale-110`}
                          title={r !== undefined ? `Ep${m.number} (${m.arm}) beat ${b} — ${(r * 100).toFixed(1)}% watching` : 'no data'}
                        >
                          {r !== undefined && maxBeat <= 12 ? `${(r * 100).toFixed(0)}` : ''}
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Flame className="h-3 w-3 text-rose-500" aria-hidden /> low retention
                  <div className="h-2 w-40 rounded-sm bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500" aria-hidden />
                  high retention
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" aria-hidden /> Cohort retention explorer
            </CardTitle>
            <CardDescription>
              Same episode, different tastes — per-archetype retention curves. Toggle cohorts, spot who churns where.
            </CardDescription>
          </div>
          {cohortEpisodes.length > 1 && (
            <div data-slot="card-action" className="flex flex-wrap gap-1.5">
              {cohortEpisodes.map((m) => (
                <button
                  key={m.episodeId}
                  onClick={() => setCohortEpId(m.episodeId)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    cohortEp?.episodeId === m.episodeId
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                  aria-pressed={cohortEp?.episodeId === m.episodeId}
                >
                  Ep{m.number} ({m.arm})
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!cohortEp ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Run episodes to explore cohorts.</p>
          ) : (
            <div className="grid gap-4">
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cohortChartData} margin={{ top: 5, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                    <XAxis dataKey="beat" tick={{ fontSize: 11 }} label={{ value: 'beat', position: 'insideBottomRight', offset: -2, fontSize: 10 }} />
                    <YAxis domain={cohortYDomain} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v) => [`${v}% still watching`]}
                      labelFormatter={(l) => `Beat ${l}`}
                      contentStyle={{ borderRadius: 10, borderColor: 'rgba(0,0,0,0.1)' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="overall"
                      stroke="#78716c"
                      strokeWidth={2.8}
                      strokeDasharray="5 3"
                      dot={false}
                      name="panel overall"
                    />
                    {activeCohorts.map((c, i) => (
                      <Line
                        key={c.archetype}
                        type="monotone"
                        dataKey={c.archetype}
                        stroke={COHORT_PALETTE[cohortEp.cohorts.findIndex((x) => x.archetype === c.archetype) % COHORT_PALETTE.length] ?? COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3 }}
                        name={c.archetype}
                      />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Toggle cohorts">
                {cohortEp.cohorts.map((c, i) => {
                  const on = cohortEnabled[c.archetype] ?? defaultCohortOn(i, cohortEp.cohorts.length);
                  const color = COHORT_PALETTE[i % COHORT_PALETTE.length];
                  return (
                    <button
                      key={c.archetype}
                      onClick={() => setCohortEnabled((s) => ({ ...s, [c.archetype]: !on }))}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                        on ? 'border-foreground/20 bg-muted text-foreground shadow-sm' : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground'
                      }`}
                      aria-pressed={on}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, opacity: on ? 1 : 0.35 }} aria-hidden />
                      {c.archetype}
                      <span className="text-muted-foreground">×{c.n}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-1.5 sm:grid-cols-2">
                {cohortEp.cohorts.map((c, i) => {
                  const delta = c.keepRate - cohortEp.overall;
                  const color = COHORT_PALETTE[i % COHORT_PALETTE.length];
                  return (
                    <div key={c.archetype} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-medium">{c.archetype}</span>
                          <span className="shrink-0 font-mono text-[11px]">{(c.keepRate * 100).toFixed(0)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(4, c.keepRate * 100)}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                      <span
                        className={`w-14 shrink-0 text-right font-mono text-[10px] ${
                          delta >= 0.02 ? 'text-emerald-600 dark:text-emerald-400' : delta <= -0.02 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                        }`}
                      >
                        {delta >= 0 ? '+' : ''}
                        {(delta * 100).toFixed(1)} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4 text-primary" aria-hidden /> Beat cliffs
          </CardTitle>
          <CardDescription>
            {focus ? `Where Ep${focus.number} (${focus.arm}) lost viewers — top drop-offs with quotes` : 'Largest retention drops per episode'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!focus ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <>
              {episodes.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {episodes.map((m) => (
                    <button
                      key={m.episodeId}
                      onClick={() => setFocusId(m.episodeId)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        focus.episodeId === m.episodeId
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                      aria-pressed={focus.episodeId === m.episodeId}
                    >
                      Ep{m.number} ({m.arm})
                    </button>
                  ))}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Beat</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="text-right">Δ retention</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {focus.cliffs.slice(0, 6).map((c) => (
                    <TableRow key={c.beat}>
                      <TableCell>{c.beat}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{c.type}</Badge>
                      </TableCell>
                      <TableCell className="max-w-40">
                        <div className="truncate">{c.title}</div>
                        {c.quote && <div className="truncate text-[10px] text-muted-foreground">“{c.quote}”</div>}
                      </TableCell>
                      <TableCell className={`text-right ${cliffColor(c.delta)}`}>
                        {(c.delta * 100).toFixed(1)} pts
                      </TableCell>
                    </TableRow>
                  ))}
                  {focus.cliffs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No cliffs — nobody dropped. 🎉
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cost per retained viewer</CardTitle>
          <CardDescription>Episode spend ÷ (panel × retention) — the efficiency metric that must fall</CardDescription>
        </CardHeader>
        <CardContent>
          {episodes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costData} margin={{ top: 5, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, name) => (name === 'costPerRV' ? [`$${v}/100 retained viewers`, 'cost/RV'] : [`${v}%`, 'retention'])} />
                  <Bar dataKey="costPerRV" fill="#d97706" radius={[4, 4, 0, 0]} name="costPerRV" />
                  <Bar dataKey="retention" fill="#0d9488" radius={[4, 4, 0, 0]} name="retention" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
