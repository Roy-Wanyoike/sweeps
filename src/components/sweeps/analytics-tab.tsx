'use client';

import { useMemo, useState } from 'react';
import { ShowDetail, useShowAnalytics } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
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
import { TrendingDown } from 'lucide-react';

const COLORS = ['#d97706', '#e11d48', '#0d9488', '#ea580c', '#16a34a', '#a21caf'];
const ARM_COLOR: Record<string, string> = { A: '#0d9488', B: '#d97706' };

export function AnalyticsTab({ detail }: { detail: ShowDetail }) {
  const { data } = useShowAnalytics(detail.show.id);
  const episodes = data?.episodes ?? [];
  const [focusId, setFocusId] = useState<string | null>(null);
  const focus = episodes.find((m) => m.episodeId === focusId) ?? episodes[episodes.length - 1];

  const retentionData = (() => {
    if (episodes.length === 0) return [];
    const maxBeat = Math.max(...episodes.map((m) => m.curve.length));
    const rows = [];
    for (let b = 0; b < maxBeat; b++) {
      const row: Record<string, number> = { beat: b };
      for (const m of episodes) {
        const c = m.curve[b];
        if (c) row[`${m.arm}${m.number}`] = Number((c.retention * 100).toFixed(1));
      }
      rows.push(row);
    }
    return rows;
  })();

  const costData = episodes.map((m) => ({
    label: `E${m.number}(${m.arm})`,
    costPerRV: Number((m.costPerRetainedViewer * 100).toFixed(2)),
    retention: Number((m.overall * 100).toFixed(1)),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle>Retention curves — every episode, both arms</CardTitle>
          <CardDescription>
            % of the simulated panel still watching at each beat. Teal = control (A), amber = optimized (B).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {episodes.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Run episodes to see retention curves.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={retentionData} margin={{ top: 5, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                  <XAxis dataKey="beat" tick={{ fontSize: 11 }} label={{ value: 'beat', position: 'insideBottomRight', offset: -2, fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${v}% still watching`} labelFormatter={(l) => `Beat ${l}`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {episodes.map((m, i) => (
                    <Line
                      key={m.episodeId}
                      type="monotone"
                      dataKey={`${m.arm}${m.number}`}
                      stroke={ARM_COLOR[m.arm] ?? COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      name={`Ep${m.number} (${m.arm === 'A' ? 'control' : 'optimized'})`}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
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
                    <TableCell className="text-right font-medium text-rose-600 dark:text-rose-400">
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
