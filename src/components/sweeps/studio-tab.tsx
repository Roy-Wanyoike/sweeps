'use client';

import { jparse } from '@/lib/contracts';
import { ShowDetail, useRegenPanel } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Package, Users } from 'lucide-react';
import { toast } from 'sonner';

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
            <Button
              size="sm"
              variant="outline"
              disabled={regen.isPending}
              onClick={() => regen.mutate(undefined, { onError: (e) => toast.error(e.message) })}
            >
              {regen.isPending ? 'Regenerating…' : 'Regenerate panel'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget ledger</CardTitle>
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
      </div>
    </div>
  );
}
