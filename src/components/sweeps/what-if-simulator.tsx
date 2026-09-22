'use client';

import { useMemo, useState } from 'react';
import {
  useRunWhatIf,
  useWhatIfTemplate,
  WhatIfResult,
} from '@/lib/queries';
import { ArchetypeDot } from '@/lib/archetype-colors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardPaste,
  FlaskConical,
  FileDown,
  Info,
  Loader2,
  Minus,
  Play,
  RotateCcw,
  Timer,
  XCircle,
  X,
} from 'lucide-react';

/**
 * What-if brief simulator — the pre-flight check BEFORE render dollars move.
 *
 * Paste (or template-load) a hypothetical beat plan; the whole simulated panel
 * watches it in dry-run against their arm-scoped FSRS memories, the plan is
 * checked against the current brief's machine contracts, and the projection is
 * compared to the arm's last screened episode. Zero AI, zero writes, zero
 * spend — the same plan always yields the same numbers (fingerprinted).
 */

const KIND_META: Record<
  WhatIfResult['compliance']['rows'][number]['kind'],
  { label: string; chip: string }
> = {
  PROTECT_BEAT: { label: 'protect beat', chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  CALLBACK: { label: 'callback', chip: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  HOOK: { label: 'hook', chip: 'bg-orange-500/15 text-orange-800 dark:text-orange-300' },
  COHORT: { label: 'cohort', chip: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  ECONOMY: { label: 'economy', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
};

const GRADE_STYLE: Record<WhatIfResult['grade'], { pill: string; blurb: string }> = {
  STRONG: {
    pill: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm',
    blurb: 'The panel keeps watching and every machine contract holds — safe to spend render dollars.',
  },
  PROMISING: {
    pill: 'bg-gradient-to-r from-primary to-amber-500 text-white shadow-sm',
    blurb: 'Competitive with the last screened episode — iterate once more or ship it.',
  },
  MIXED: {
    pill: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40',
    blurb: 'Noticeable churn — address the drops and missed contracts before rendering.',
  },
  WEAK: {
    pill: 'bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/40',
    blurb: 'The panel bails early — rework the outline here, in dry-run, before it costs anything.',
  },
};

interface CurveRow {
  beat: number;
  type: string;
  projected: number;
  baseline: number;
}

function SimulatorTooltip({ active, payload }: { active?: boolean; payload?: { payload: CurveRow }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md">
      <div className="font-semibold">
        beat {r.beat} · <span className="font-mono">{r.type}</span>
      </div>
      <div className="mt-1 grid gap-0.5">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary align-middle" aria-hidden /> projected:{' '}
          {(r.projected * 100).toFixed(0)}% still watching
        </span>
        <span className="text-muted-foreground">baseline (last screened): {(r.baseline * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function DeltaBadge({ pts, suffix = 'pts' }: { pts: number; suffix?: string }) {
  const positive = pts > 0.01;
  const negative = pts < -0.01;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-sm font-bold ${
        positive ? 'text-emerald-600 dark:text-emerald-400' : negative ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500'
      }`}
    >
      {positive ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : negative ? <ArrowDownRight className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
      {pts > 0 ? '+' : ''}
      {pts.toFixed(1)} {suffix}
    </span>
  );
}

export function WhatIfSimulator({ showId, arm }: { showId: string; arm: string }) {
  const [planText, setPlanText] = useState('');
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const { data: templateData, isLoading: templateLoading } = useWhatIfTemplate(showId, arm);
  const runWhatIf = useRunWhatIf(showId);

  // a result graded against another arm's brief+memories stays visible but is
  // explicitly marked stale — re-run to re-grade for the selected arm
  const stale = result !== null && result.arm !== arm;

  const template = templateData?.template ?? null;

  const loadTemplate = () => {
    if (!template) return;
    const plan = { beats: template.beats };
    setPlanText(JSON.stringify(plan, null, 1));
    setDirty(false);
    setResult(null);
    toast.success(`Ep${template.templateFrom.episodeNumber} plan loaded`, {
      description: 'Edit any field, then run the dry-run — the panel re-watches it instantly.',
    });
  };

  const run = async () => {
    if (!planText.trim()) {
      toast.error('Paste a beat plan first', { description: 'Or load the last episode\'s plan as a starting point.' });
      return;
    }
    try {
      const parsed = JSON.parse(planText);
      const res = await runWhatIf.mutateAsync({ arm, plan: parsed });
      setResult(res.result);
      setDirty(false);
      toast.success(`Dry-run complete — ${res.result.simulation.viewers} viewers, $0.000 spent`, {
        description: `Grade: ${res.result.grade}. Nothing was written to the season.`,
      });
    } catch (e) {
      if (e instanceof SyntaxError) {
        toast.error('Plan is not valid JSON', { description: e.message.slice(0, 140) });
      } else {
        toast.error(e instanceof Error ? e.message : 'Dry-run failed');
      }
    }
  };

  const downloadReport = () => {
    if (!result) return;
    const rows = result.compliance.rows
      .map((r) => `- [${r.kind}] ${r.title}: ${r.informational ? 'informational' : r.honored ? 'honored' : 'MISSED'} — ${r.evidence}`)
      .join('\n');
    const md = [
      `# What-if dry-run — ${result.arm.toUpperCase()} arm, target Ep${result.episodeNumber}`,
      '',
      `Plan: ${result.beatCount} beats · ${result.totalDurationSec}s runtime · fingerprint \`${result.fingerprint.slice(0, 12)}\``,
      `Brief fingerprint: \`${result.briefFingerprint.slice(0, 12)}\`${result.briefCohort ? ` (cohort: ${result.briefCohort})` : ''}`,
      '',
      `## Projection`,
      '',
      `- keep rate: ${(result.simulation.keepRate * 100).toFixed(1)}% (baseline Ep${result.baseline.episodeNumber}: ${(result.baseline.keepRate * 100).toFixed(1)}%)`,
      `- delta: ${result.delta.keepRatePts > 0 ? '+' : ''}${result.delta.keepRatePts} pts`,
      `- mean satisfaction: ${result.simulation.meanSatisfaction.toFixed(3)} (baseline ${result.baseline.meanSatisfaction.toFixed(3)})`,
      `- grade: ${result.grade}`,
      '',
      `## Compliance`,
      '',
      rows,
      '',
      `Zero AI, zero writes, zero spend — the whole panel watched this plan in dry-run against their arm-scoped memories.`,
    ].join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `what-if-ep${result.episodeNumber}-${result.arm.toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Dry-run report downloaded');
  };

  const curveRows: CurveRow[] = useMemo(
    () => result?.simulation.curve.map((c) => ({ beat: c.beat, type: c.type, projected: c.retention, baseline: c.baseline })) ?? [],
    [result]
  );

  // live plan preview while editing — beat count, runtime, type DNA, validity
  const preview = useMemo(() => {
    if (!planText.trim()) return null;
    try {
      const parsed = JSON.parse(planText);
      const beats: Array<{ type: string; durationSec: number }> = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.beats)
          ? parsed.beats
          : [];
      if (beats.length === 0) return { valid: false as const };
      const secs = beats.reduce((a, b) => a + (Number(b.durationSec) || 0), 0);
      return {
        valid: true as const,
        count: beats.length,
        secs,
        types: beats.map((b) => String(b.type ?? '?').slice(0, 2).toUpperCase()),
        inRange: beats.length >= 4 && beats.length <= 14,
      };
    } catch {
      return { valid: false as const };
    }
  }, [planText]);

  const grade = result ? GRADE_STYLE[result.grade] : null;
  const fp8 = result?.fingerprint.slice(0, 8) ?? '';

  return (
    <Card className="overflow-hidden border-teal-500/20">
      <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-primary to-amber-500/60" aria-hidden />
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden />
            What-if simulator
            <Badge variant="outline" className="border-teal-500/40 text-[10px] text-teal-700 dark:text-teal-300">
              pre-flight · zero spend
            </Badge>
            {result && (
              <Badge variant="outline" className="gap-1 text-[10px] font-mono" title={`Deterministic fingerprint (sha256): ${result.fingerprint}`}>
                fp {fp8}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Hand a hypothetical Ep{template?.templateFrom ? template.templateFrom.episodeNumber + 1 : 'N'} plan to the simulated panel before spending a single render
            dollar — it re-watches the plan against its FSRS memories and the current brief&apos;s machine contracts.
          </CardDescription>
        </div>
        <div data-slot="card-action">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={loadTemplate} disabled={!template || templateLoading}>
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
              Load Ep{template?.templateFrom.episodeNumber ?? 'N'} plan
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="relative">
          <textarea
            value={planText}
            onChange={(e) => {
              setPlanText(e.target.value);
              setDirty(true);
            }}
            placeholder={'{"beats":[{"index":0,"title":"Cold open — the signal returns","type":"HOOK","location":"Rooftop","timeOfDay":"NIGHT","durationSec":10,"cast":["Mara"],"dialogue":[{"char":"Mara","line":"It\'s back.","emotion":"hushed"}]}]}'}
            aria-label="Hypothetical beat plan JSON"
            spellCheck={false}
            className="h-44 w-full resize-y rounded-lg border bg-stone-950/95 p-3 font-mono text-[11px] leading-relaxed text-emerald-50/95 shadow-inner outline-none transition-colors placeholder:text-stone-500 focus-visible:border-teal-500/60 dark:bg-stone-950 dark:text-emerald-50/95 max-h-72 scrollbar-thin"
          />
          {planText && (
            <button
              onClick={() => {
                setPlanText('');
                setResult(null);
                setDirty(false);
              }}
              className="absolute right-2 top-2 rounded-md border bg-background/80 p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear plan"
              title="Clear plan"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>

        {/* live plan preview — validity, beat count, runtime, type DNA */}
        {preview && (
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            {preview.valid ? (
              <>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] ${
                    preview.inRange
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  {preview.count} beats · ~{preview.secs}s runtime
                  {!preview.inRange && ' · contract wants 4–14'}
                </span>
                <span className="flex gap-1" aria-hidden>
                  {preview.types.map((t, i) => (
                    <span
                      key={`${t}-${i}`}
                      className="flex h-5 w-6 items-center justify-center rounded bg-stone-500/10 font-mono text-[8px] font-bold text-stone-600 dark:text-stone-300"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2 py-1 font-mono text-[10px] text-rose-700 dark:text-rose-300">
                <XCircle className="h-3 w-3" aria-hidden /> not a parseable beat plan yet
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={run} disabled={runWhatIf.isPending} className="min-w-36">
            {runWhatIf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            Run dry-run · arm {arm}
          </Button>
          {result && (
            <>
              <Button size="sm" variant="outline" onClick={downloadReport}>
                <FileDown className="h-3.5 w-3.5" aria-hidden /> Report
              </Button>
              {stale ? (
                <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-300">
                  graded against arm {result.arm} — re-run for arm {arm}
                </Badge>
              ) : (
                dirty && (
                  <Badge variant="outline" className="text-[10px] border-dashed">
                    plan edited since last run
                  </Badge>
                )
              )}
            </>
          )}
          <span className="ml-auto hidden items-center gap-1 text-[10px] text-muted-foreground sm:inline-flex">
            <Timer className="h-3 w-3" aria-hidden /> deterministic · no LLM · nothing written
          </span>
        </div>

        {result && (
          <div className="grid gap-3 rounded-lg border bg-gradient-to-b from-teal-500/5 to-transparent p-3" data-testid="what-if-result">
            {/* verdict */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${grade!.pill}`}>
                {result.grade}
              </span>
              <span className="text-sm font-semibold">
                {(result.simulation.keepRate * 100).toFixed(1)}% keep rate
              </span>
              <DeltaBadge pts={result.delta.keepRatePts} />
              <span className="text-[11px] text-muted-foreground">
                vs Ep{result.baseline.episodeNumber} baseline ({(result.baseline.keepRate * 100).toFixed(1)}% · {result.baseline.panel} viewers)
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">{grade!.blurb}</p>

            {/* stat strip */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'mean satisfaction', value: result.simulation.meanSatisfaction.toFixed(3), sub: `baseline ${result.baseline.meanSatisfaction.toFixed(3)}` },
                { label: 'beats', value: String(result.beatCount), sub: `${result.totalDurationSec}s runtime` },
                { label: 'panel watched', value: `${result.simulation.viewers}`, sub: 'dry-run seats' },
                {
                  label: 'contracts',
                  value: `${result.compliance.honoredCheckable}/${result.compliance.checkable}`,
                  sub: result.compliance.allHonored ? 'all honored' : 'check receipts below',
                },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border bg-background/60 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
                  <div className="font-mono text-sm font-bold">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground/80">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* projected vs baseline curve */}
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground" aria-hidden>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded bg-primary" /> projected
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded border-t-2 border-dashed border-stone-400" /> baseline Ep
                  {result.baseline.episodeNumber}
                </span>
              </div>
              <div className="h-40 w-full" aria-label="Projected retention curve versus baseline">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={curveRows} margin={{ top: 8, right: 10, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.2)" vertical={false} />
                    <XAxis
                      dataKey="beat"
                      tick={{ fontSize: 10, fill: '#78716c' }}
                      axisLine={{ stroke: 'rgba(120,113,108,0.4)' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 1.02]}
                      ticks={[0, 0.25, 0.5, 0.75, 1]}
                      tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      tick={{ fontSize: 10, fill: '#78716c' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RTooltip content={<SimulatorTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="baseline"
                      stroke="#a8a29e"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line type="monotone" dataKey="projected" stroke="#0d9488" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* where the panel bails */}
            {result.simulation.drops.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">where the panel bails</div>
                <div className="flex flex-wrap gap-1.5">
                  {result.simulation.drops.map((d) => (
                    <span
                      key={d.beat}
                      className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px]"
                      title={`${d.type} — ${d.title}`}
                    >
                      <span className="font-mono font-bold text-rose-700 dark:text-rose-300">beat {d.beat}</span>
                      <span className="text-muted-foreground">{d.viewers} drop{d.viewers === 1 ? '' : 's'}</span>
                      <span className="hidden font-mono text-[9px] text-muted-foreground/70 sm:inline">{d.type}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* cohort movers */}
            {result.simulation.segments.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">cohort movers vs baseline</div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {result.simulation.segments
                    .filter((s) => s.baselineKeepRate >= 0)
                    .map((s) => {
                      const d = Number(((s.keepRate - s.baselineKeepRate) * 100).toFixed(1));
                      return (
                        <div key={s.archetype} className="flex items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-[11px]">
                          <ArchetypeDot archetype={s.archetype} className="h-2.5 w-2.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate font-medium">{s.archetype}</span>
                          <span className="font-mono text-muted-foreground">
                            {(s.keepRate * 100).toFixed(0)}% vs {(s.baselineKeepRate * 100).toFixed(0)}%
                          </span>
                          <span className={`w-14 text-right font-mono font-bold ${d > 0.05 ? 'text-emerald-600 dark:text-emerald-400' : d < -0.05 ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500'}`}>
                            {d > 0 ? '+' : ''}
                            {d.toFixed(1)} pts
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* compliance receipts */}
            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">brief compliance — pre-flight</span>
                {result.compliance.allHonored ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                    all contracts hold
                  </span>
                ) : (
                  <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-300">
                    {result.compliance.honoredCheckable}/{result.compliance.checkable} machine contracts honored
                  </Badge>
                )}
              </div>
              <div className="grid gap-1.5">
                {result.compliance.rows.map((r, i) => {
                  const meta = KIND_META[r.kind];
                  return (
                    <div key={`${r.kind}-${i}`} className="flex items-start gap-2 rounded-md bg-background/60 px-2 py-1.5">
                      <span className={`inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[9px] font-semibold uppercase tracking-wide ${meta.chip}`}>
                        {meta.label}
                      </span>
                      {r.informational ? (
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                      ) : r.honored ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1 text-[12px] leading-snug">
                        <span className={r.honored ? (r.informational ? 'text-muted-foreground' : 'text-emerald-800 dark:text-emerald-300') : 'text-rose-800 dark:text-rose-300'}>
                          {r.honored ? (r.informational ? 'no machine contract' : 'honored') : 'missed'}
                        </span>{' '}
                        <span className="text-muted-foreground">— {r.evidence}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <RotateCcw className="h-3 w-3 shrink-0" aria-hidden />
              The panel watched this plan in dry-run — no render dollars, no memory writes, nothing queued. Same plan + same
              memories always reproduces these numbers (fp {fp8}).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
