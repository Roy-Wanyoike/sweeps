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
import { Download, Flame, Grid3X3, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

const COLORS = ['#d97706', '#e11d48', '#0d9488', '#ea580c', '#16a34a', '#a21caf'];
const ARM_COLOR: Record<string, string> = { A: '#0d9488', B: '#d97706' };

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
