'use client';

import { jparse } from '@/lib/contracts';
import { ShowDetail, useRegenPanel } from '@/lib/queries';
import { useSweeps } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Package, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';

/** status → color for governance receipts (same coding as the episode job log) */
function govStatusStyle(status: string): string {
  if (status === 'DENY' || status === 'BLOCK') return 'font-bold text-rose-600 dark:text-rose-400';
  if (status === 'PASS') return 'font-bold text-emerald-600 dark:text-emerald-400';
  if (status === 'DRYRUN') return 'font-bold text-teal-600 dark:text-teal-400';
  if (status === 'WARN') return 'font-bold text-amber-600 dark:text-amber-400';
  if (status === 'OK') return 'font-bold text-emerald-600 dark:text-emerald-400';
  return 'font-bold text-primary';
}

const STAGE_LABELS: Record<string, string> = {
  BIBLE: 'Bible',
  WRITER: 'Writer',
  RENDER: 'Render',
  AUDIENCE: 'Audience',
  ANALYTICS: 'Analytics',
  OPTIMIZER: 'Optimizer',
};
const STAGE_CAPS: Record<string, number> = {
  BIBLE: 0.05,
  WRITER: 0.25,
  RENDER: 0.45,
  AUDIENCE: 0.2,
  ANALYTICS: 0.02,
  OPTIMIZER: 0.08,
};

export function StudioTab({ detail }: { detail: ShowDetail }) {
  const readonly = useSweeps((s) => s.readonly);
  const regen = useRegenPanel(detail.show.id);
  const budget = detail.budget;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {detail.show.title}
            <Badge variant="secondary">{detail.show.genre}</Badge>
            <Badge variant="outline">{detail.show.mode === 'DUAL' ? 'Dual arm (A/B)' : 'Single arm'}</Badge>
            <Badge variant="outline">seed {detail.show.seed}</Badge>
          </CardTitle>
          <CardDescription>{detail.show.premise}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cast bible</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {detail.characters.map((c) => {
              const attrs = jparse<Record<string, string>>(c.attrs, {});
              return (
                <div key={c.id} className="overflow-hidden rounded-lg border bg-card">
                  <div className="relative aspect-[4/3] bg-muted">
                    {c.refImage ? (                      <img src={c.refImage} alt={`Reference still of ${c.name}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Skeleton className="h-3/4 w-3/4" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.role}</div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.appearance}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(attrs).slice(0, 3).map(([k, v]) => (
                        <Badge key={k} variant="outline" className="text-[10px]">
                          {k}: {v.length > 18 ? v.slice(0, 18) + '…' : v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator className="my-4" />

          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Locations
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {detail.entities.filter((e) => e.kind === 'LOCATION').map((l) => (
              <div key={l.id} className="rounded-lg border p-2.5">
                <div className="text-sm font-medium">{l.name}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground">{l.desc}</div>
              </div>
            ))}
          </div>
          <div className="mb-2 mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Package className="h-3.5 w-3.5" aria-hidden /> Props (continuity-tracked)
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.entities.filter((e) => e.kind === 'PROP').map((p) => (
              <Badge key={p.id} variant="secondary" title={p.desc}>
                {p.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" aria-hidden /> Simulated audience
            </CardTitle>
            <CardDescription>
              {detail.panelCount} of {detail.show.panelSize} persona viewers — deterministic (seed {detail.show.seed})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {readonly ? (
              <p className="text-xs text-muted-foreground">Panel is seeded and read-only in present mode.</p>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={regen.isPending}
                onClick={() => regen.mutate(undefined, { onError: (e) => toast.error(e.message) })}
              >
                {regen.isPending ? 'Regenerating…' : 'Regenerate panel'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">Budget ledger</CardTitle>
            <CardDescription>
              ${budget.totalUsd.toFixed(3)} of ${budget.budgetUsd.toFixed(2)} — stage caps enforced, degradation automatic
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2.5">
            {Object.entries(STAGE_CAPS).map(([stage, cap]) => {
              const spent = budget.byStage[stage] ?? 0;
              const pct = Math.min(100, (spent / (budget.budgetUsd * cap || 1)) * 100);
              return (
                <div key={stage}>
                  <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
                    <span>{STAGE_LABELS[stage]}</span>
                    <span>
                      ${spent.toFixed(3)} / ${(budget.budgetUsd * cap).toFixed(2)}
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5" aria-label={`${STAGE_LABELS[stage]} budget usage`} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-emerald-500/20">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-transparent" aria-hidden />
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden /> Governance receipts
              {detail.show.gateOnWhatIf ? (
                <Badge variant="outline" className="border-emerald-500/40 text-[9px] text-emerald-700 dark:text-emerald-300">
                  gate armed
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] text-muted-foreground">gate disarmed</Badge>
              )}
            </CardTitle>
            <CardDescription>
              The pre-flight gate&apos;s and every plan adoption&apos;s decisions — an append-only audit trail of when spend was allowed, held, or refused.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {detail.governance.length > 0 ? (
              <div className="grid max-h-56 gap-1.5 overflow-y-auto scrollbar-thin">
                {detail.governance.map((g) => (
                  <div key={g.id} className="rounded-md border bg-background/60 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed">
                    <span className={govStatusStyle(g.status)}>[{g.status}]</span>{' '}
                    <span className="text-muted-foreground/70">{g.step}</span> {g.detail?.slice(0, 160)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                No governance decisions yet. Arm the pre-flight gate on the Arc tab (or run the governed demo) and every
                hold, dry-run, admission and refusal will be receipted here.
              </p>
            )}
            {detail.governance.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                <ScrollText className="h-3 w-3 shrink-0" aria-hidden /> newest first · append-only · never rewritten
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
