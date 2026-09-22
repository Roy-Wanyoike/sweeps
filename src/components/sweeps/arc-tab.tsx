'use client';

import { useMemo, useState } from 'react';
import { ArcData, ArcEpisode, useShowArc } from '@/lib/queries';
import { useSweeps } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Anchor, GitBranch, Lightbulb, TrendingDown, Users } from 'lucide-react';

/**
 * Season arc planner — the writers-room view across episodes.
 * Tension vs measured engagement, beat-rhythm DNA, cliffhanger hook payoffs,
 * FSRS-decayed open plot loops, and cast presence.
 */

const ARM_COLOR: Record<string, string> = { A: '#d97706', B: '#0d9488' };

const TYPE_CODE: Record<string, string> = {
  HOOK: 'HK',
  SETUP: 'ST',
  ESCALATION: 'ES',
  REVEAL: 'RV',
  TWIST: 'TW',
  CONFLICT: 'CF',
  BREATH: 'BR',
  CLIFFHANGER: 'CL',
};

const TYPE_STYLE: Record<string, string> = {
  HOOK: 'bg-amber-500/20 text-amber-800 dark:text-amber-300',
  SETUP: 'bg-stone-500/15 text-stone-700 dark:text-stone-300',
  ESCALATION: 'bg-orange-500/20 text-orange-800 dark:text-orange-300',
  CONFLICT: 'bg-rose-500/15 text-rose-800 dark:text-rose-300',
  REVEAL: 'bg-amber-600/25 text-amber-900 dark:text-amber-200',
  TWIST: 'bg-rose-600/20 text-rose-900 dark:text-rose-200',
  BREATH: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  CLIFFHANGER: 'bg-rose-700/25 text-rose-950 dark:text-rose-100 font-bold',
};

function ArmPills({
  arms,
  value,
  onChange,
}: {
  arms: string[];
  value: string;
  onChange: (a: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Arm selection">
      {arms.map((arm) => (
        <button
          key={arm}
          role="tab"
          aria-selected={value === arm}
          onClick={() => onChange(arm)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === arm ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: ARM_COLOR[arm] ?? '#78716c' }} aria-hidden />
          {arm} · {arm === 'A' ? 'Control' : 'Optimized'}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- tension chart ------------------------------ */

interface ChartRow {
  x: number;
  ep: number;
  beat: number;
  type: string;
  title: string;
  ten: number;
  eng: number | null;
  engOther: number | null;
}

function buildChartRows(arc: ArcData, arm: string): ChartRow[] {
  const sel = arc.arms.find((a) => a.arm === arm) ?? arc.arms[0];
  const other = arc.arms.find((a) => a.arm !== sel?.arm);
  const rows: ChartRow[] = [];
  for (const ep of sel?.episodes ?? []) {
    ep.beats.forEach((b, i) => {
      rows.push({
        x: ep.globalBeatStart + i,
        ep: ep.number,
        beat: b.index,
        type: b.type,
        title: b.title,
        ten: b.tension,
        eng: b.engagement,
        engOther: other?.episodes.find((e) => e.number === ep.number)?.beats[i]?.engagement ?? null,
      });
    });
  }
  return rows;
}

function ArcTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md">
      <div className="font-semibold">
        Ep{r.ep} · beat {r.beat} · <span className="font-mono">{r.type}</span>
      </div>
      <div className="mb-1.5 max-w-56 text-muted-foreground">{r.title}</div>
      <div className="grid gap-0.5">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#d97706] align-middle" aria-hidden /> measured:{' '}
          {r.eng !== null ? `${(r.eng * 100).toFixed(0)}% engagement` : 'not screened yet'}
        </span>
        {r.engOther !== null && (
          <span className="text-muted-foreground">other arm: {(r.engOther * 100).toFixed(0)}% engagement</span>
        )}
        <span className="text-muted-foreground">writer tension: {(r.ten * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function TensionChart({ arc, arm }: { arc: ArcData; arm: string }) {
  const rows = useMemo(() => buildChartRows(arc, arm), [arc, arm]);
  const selEpisodes = arc.arms.find((a) => a.arm === arm)?.episodes ?? [];
  const color = ARM_COLOR[arm] ?? '#78716c';
  const dual = arc.arms.length > 1;

  return (
    <div className="h-56 w-full" aria-label="Tension versus measured engagement across the season">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 18, right: 12, bottom: 4, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.2)" vertical={false} />
          <XAxis dataKey="x" type="category" tick={false} axisLine={{ stroke: 'rgba(120,113,108,0.4)' }} tickLine={false} />
          <YAxis
            domain={[0, 1.02]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 10, fill: '#78716c' }}
            axisLine={false}
            tickLine={false}
          />
          <RTooltip content={<ArcTooltip />} />
          {selEpisodes.slice(1).map((ep) => (
            <ReferenceLine
              key={ep.number}
              x={ep.globalBeatStart}
              stroke="rgba(120,113,108,0.5)"
              strokeDasharray="4 4"
              label={{ value: `Ep${ep.number}`, position: 'insideTopLeft', fontSize: 10, fill: '#78716c' }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="eng"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          {dual && (
            <Line
              type="monotone"
              dataKey="engOther"
              stroke="#a8a29e"
              strokeWidth={1.5}
              strokeOpacity={0.55}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          <Line
            type="stepAfter"
            dataKey="ten"
            stroke="#a8a29e"
            strokeWidth={1}
            strokeDasharray="2 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------- rhythm strips ------------------------------ */

function RhythmStrips({ arc, arm }: { arc: ArcData; arm: string }) {
  return (
    <div className="grid gap-3">
      {arc.arms.map((a) => (
        <div
          key={a.arm}
          className={`rounded-xl border p-3 transition-opacity ${a.arm === arm ? '' : 'opacity-60'}`}
          aria-label={`Beat rhythm arm ${a.arm}`}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ARM_COLOR[a.arm] ?? '#78716c' }} aria-hidden />
            <span className="text-xs font-semibold">
              Arm {a.arm} · {a.arm === 'A' ? 'writer-only control' : 'audience-optimized'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.episodes.map((ep) => (
              <div key={ep.number} className="rounded-lg border bg-muted/30 p-1.5">
                <div className="mb-1 px-0.5 text-[10px] font-medium text-muted-foreground">
                  Ep{ep.number}
                  {ep.retention !== null && <span className="ml-1 font-semibold text-foreground/70">{(ep.retention * 100).toFixed(0)}%</span>}
                </div>
                <div className="flex gap-1">
                  {ep.beats.map((b) => (
                    <span
                      key={b.index}
                      title={`Ep${ep.number} b${b.index} ${b.type} — ${b.title} · tension ${(b.tension * 100).toFixed(0)}%${
                        b.engagement !== null ? ` · measured ${(b.engagement * 100).toFixed(0)}%` : ''
                      }`}
                      className={`flex h-6 w-7 cursor-default items-center justify-center rounded text-[9px] font-bold tracking-tight ${TYPE_STYLE[b.type] ?? ''} ${
                        b.isKey ? 'ring-1 ring-current/40' : ''
                      }`}
                    >
                      {TYPE_CODE[b.type] ?? b.type.slice(0, 2)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- hook payoff + loops ---------------------------- */

function HookPayoffCard({ episodes, arm }: { episodes: ArcEpisode[]; arm: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Anchor className="h-4 w-4 text-primary" aria-hidden /> Cliffhanger → hook payoff
          </CardTitle>
          <CardDescription>
            Share of viewers whose memory recalls the cliffhanger at the next episode&apos;s first beat (measured, not assumed)
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2.5">
        {episodes.length === 0 && <p className="text-sm text-muted-foreground">No episodes yet.</p>}
        {episodes.map((ep) => {
          const rate = ep.cliffhanger?.hookPayoffRate ?? null;
          const finale = ep.cliffhanger !== null && rate === null;
          return (
            <div key={ep.episodeId} className="rounded-lg border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold">
                    Ep{ep.number} <span className="font-mono text-[10px] text-rose-700 dark:text-rose-300">CL</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground" title={ep.cliffhanger?.title ?? ''}>
                    {ep.cliffhanger?.title ?? 'no cliffhanger written'}
                  </div>
                </div>
                {ep.cliffhanger === null ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    none
                  </Badge>
                ) : finale ? (
                  <Badge variant="outline" className="shrink-0 border-dashed text-[10px]">
                    season finale
                  </Badge>
                ) : (
                  <span className="shrink-0 font-mono text-sm font-bold text-primary">{((rate ?? 0) * 100).toFixed(0)}%</span>
                )}
              </div>
              {rate !== null && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-primary transition-all duration-700"
                    style={{ width: `${Math.max(2, rate * 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function OpenLoopsCard({ episodes, arm }: { episodes: ArcEpisode[]; arm: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-primary" aria-hidden /> Open loops (FSRS memory)
          </CardTitle>
          <CardDescription>
            Plot threads each episode opens with, decayed by the same retrievability model the audience uses —
            below 25% a thread is effectively forgotten
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2.5">
        {episodes.length === 0 && <p className="text-sm text-muted-foreground">No episodes yet.</p>}
        {episodes.map((ep) => (
          <div key={ep.episodeId} className="rounded-lg border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">Ep{ep.number} opens with</span>
              <span className="font-mono text-xs">
                <span className={ep.openLoops.alive > 0 ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-bold text-rose-600 dark:text-rose-400'}>
                  {ep.openLoops.alive}
                </span>
                <span className="text-muted-foreground"> / {ep.openLoops.total} traceable threads</span>
              </span>
            </div>
            {ep.openLoops.threads.length > 0 && (
              <div className="mt-2 grid gap-1">
                {ep.openLoops.threads.map((t) => (
                  <div key={t.key} className="flex items-center gap-2 text-[11px]">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.alive ? 'bg-emerald-500' : 'bg-stone-400'}`}
                      aria-hidden
                      title={t.alive ? 'still traceable' : 'forgotten by the audience'}
                    />
                    <span className={`min-w-0 flex-1 truncate ${t.alive ? '' : 'text-muted-foreground line-through decoration-stone-400/60'}`} title={t.title}>
                      {t.title}
                    </span>
                    <span className="shrink-0 text-muted-foreground">planted Ep{t.plantedEp}</span>
                    <div className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-muted" title={`strength ${(t.strength * 100).toFixed(0)}%`}>
                      <div
                        className={`h-full rounded-full ${t.alive ? 'bg-emerald-500' : 'bg-stone-400'}`}
                        style={{ width: `${Math.max(3, t.strength * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-muted-foreground">{(t.strength * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
            {ep.openLoops.total === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">Season premiere — memory starts pristine.</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- cast matrix ------------------------------- */

function CastMatrix({ arc, arm }: { arc: ArcData; arm: string }) {
  const episodes = arc.arms.find((a) => a.arm === arm)?.episodes ?? [];
  if (arc.cast.length === 0 || episodes.length === 0) return null;
  const heat = (n: number) =>
    n === 0
      ? 'bg-transparent text-muted-foreground/40'
      : n <= 1
        ? 'bg-amber-500/15 text-amber-900 dark:text-amber-200'
        : n <= 3
          ? 'bg-amber-500/30 text-amber-950 dark:text-amber-100'
          : 'bg-rose-500/30 text-rose-950 dark:text-rose-100 font-bold';
  return (
    <Card>
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" aria-hidden /> Cast presence
          </CardTitle>
          <CardDescription>Beats on screen per character per episode — continuity gaps show up as holes</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-80 text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left font-medium text-muted-foreground">Character</th>
                {episodes.map((ep) => (
                  <th key={ep.number} className="px-2 py-1 text-center font-medium text-muted-foreground">
                    Ep{ep.number}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {arc.cast.map((name) => (
                <tr key={name} className="border-t">
                  <td className="px-2 py-1.5 font-medium">{name}</td>
                  {episodes.map((ep) => {
                    const n = ep.cast.find((c) => c.name === name)?.beats ?? 0;
                    return (
                      <td key={ep.number} className="px-1 py-1">
                        <div className={`mx-auto flex h-6 w-full max-w-12 items-center justify-center rounded ${heat(n)}`} title={`${name}: ${n} beats in Ep${ep.number}`}>
                          {n === 0 ? '·' : n}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------- tab ----------------------------------- */

export function ArcTab({ showId, mode }: { showId: string; mode: string }) {
  const { data: arc, isLoading } = useShowArc(showId);
  const activeArm = useSweeps((s) => s.activeArm);
  const [armOverride, setArmOverride] = useState<string | null>(null);
  const arm = armOverride ?? (arc?.arms.some((a) => a.arm === activeArm) ? activeArm : (arc?.arms[0]?.arm ?? 'A'));
  const episodes = arc?.arms.find((a) => a.arm === arm)?.episodes ?? [];
  const totalThreads = episodes.reduce((n, e) => n + e.openLoops.total, 0);
  const aliveThreads = episodes.reduce((n, e) => n + e.openLoops.alive, 0);

  if (isLoading) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading season arc">
        <Skeleton className="h-64 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      </div>
    );
  }

  if (!arc || episodes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Lightbulb className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <div>
            <p className="font-medium">No season to plan yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run an episode and the arc board fills with its tension curve, beat rhythm, cliffhanger payoffs and open loops.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const dual = arc.arms.length > 1;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-2">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              Season arc <span className="text-sm font-normal text-muted-foreground">· {arc.title}</span>
              <Badge variant="outline" className="text-[10px]">
                {episodes.length} ep{episodes.length === 1 ? '' : 's'} · arm {arm}
              </Badge>
            </CardTitle>
            <CardDescription>
              Writer-intent tension vs measured engagement, beat by beat. The dashed step line is the plan; the solid
              line is what the panel actually felt.
            </CardDescription>
          </div>
          {dual && (
            <div data-slot="card-action">
              <ArmPills arms={arc.arms.map((a) => a.arm)} value={arm} onChange={setArmOverride} />
            </div>
          )}
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: ARM_COLOR[arm] ?? '#78716c' }} /> measured engagement
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded bg-stone-400/60" style={{ opacity: 0.7 }} /> other arm
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-px w-4 border-t border-dashed border-stone-400" /> writer tension
            </span>
          </div>
          <TensionChart arc={arc} arm={arm} />
          <RhythmStrips arc={arc} arm={arm} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <HookPayoffCard episodes={episodes} arm={arm} />
        <OpenLoopsCard episodes={episodes} arm={arm} />
      </div>

      <CastMatrix arc={arc} arm={arm} />

      <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <TrendingDown className="h-3.5 w-3.5" aria-hidden />
        {totalThreads > 0 ? (
          <>
            Across arm {arm}: {aliveThreads} of {totalThreads} planted threads are still traceable at some episode open —
            threads below 25% retrievability are effectively forgotten by the panel.
          </>
        ) : (
          <>Threads appear once episodes plant reveals or twists — the optimizer uses the same memory model.</>
        )}
      </p>
    </div>
  );
}
