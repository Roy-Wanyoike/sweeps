'use client';

import { useMemo, useState } from 'react';
import { ShowDetail, useEpisode, useMetrics, usePersonas, useReactions, useViewer } from '@/lib/queries';
import { useSweeps } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Eye, MessageSquare, Users } from 'lucide-react';
import { Beat } from '@/lib/contracts';

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  const s = sentiment ?? 'NEUTRAL';
  return (
    <Badge
      className={
        s === 'POSITIVE'
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
          : s === 'NEGATIVE'
            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
            : 'bg-secondary text-secondary-foreground'
      }
    >
      {s.toLowerCase()}
    </Badge>
  );
}

export function AudienceTab({ detail }: { detail: ShowDetail }) {
  const selectedViewerId = useSweeps((s) => s.selectedViewerId);
  const selectViewer = useSweeps((s) => s.selectViewer);
  const doneEpisodes = detail.episodes.filter((e) => e.status === 'DONE' || e.status === 'ANALYZING');
  const [epId, setEpId] = useState<string | null>(doneEpisodes[doneEpisodes.length - 1]?.id ?? null);
  const currentEpId = epId ?? doneEpisodes[doneEpisodes.length - 1]?.id ?? null;

  const { data: epData } = useEpisode(currentEpId);
  const { data: reactions } = useReactions(currentEpId);
  const { data: personas } = usePersonas(detail.show.id);
  const { data: viewer } = useViewer(detail.show.id, selectedViewerId);

  const { data: metricsQ } = useMetrics(currentEpId);
  const beats: Beat[] = epData?.plan?.beats ?? [];
  const beatTitle = (i: number | null) => (i === null ? undefined : beats[i]?.title);

  const archetypeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of personas?.viewers ?? []) m.set(v.archetype, (m.get(v.archetype) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [personas]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" aria-hidden /> Reaction wall
            </CardTitle>
            <CardDescription>
              Sampled viewers comment in-voice while watching — with sentiment and drop-point attribution
            </CardDescription>
          </div>
          <Select value={currentEpId ?? undefined} onValueChange={setEpId}>
            <SelectTrigger size="sm" className="w-40" aria-label="Select episode">
              <SelectValue placeholder="Episode" />
            </SelectTrigger>
            <SelectContent>
              {doneEpisodes.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  Ep{e.number} ({e.arm})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96 pr-3">
            <div className="grid gap-2">
              {(reactions?.reactions ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No reactions yet — screen an episode first.</p>
              )}
              {(reactions?.reactions ?? []).map((r, i) => (
                <div key={i} className="rounded-lg border p-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{r.name}</span>
                    <Badge variant="outline" className="text-[10px]">{r.archetype}</Badge>
                    <SentimentBadge sentiment={r.sentiment} />
                    {!r.keepWatching && r.dropAtBeat !== null && (
                      <span className="text-rose-600 dark:text-rose-400">dropped @ beat {r.dropAtBeat}{beatTitle(r.dropAtBeat) ? ` — “${beatTitle(r.dropAtBeat)}”` : ''}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{r.comment}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" aria-hidden /> Persona gallery
            </CardTitle>
            <CardDescription>
              {detail.panelCount} deterministic viewers · {archetypeCounts.length} archetypes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex flex-wrap gap-1">
              {archetypeCounts.map(([a, n]) => (
                <Badge key={a} variant="secondary" className="text-[10px]">
                  {a} ×{n}
                </Badge>
              ))}
            </div>
            <ScrollArea className="max-h-56 pr-2">
              <div className="grid grid-cols-2 gap-1.5">
                {(personas?.viewers ?? []).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => selectViewer(v.id)}
                    className={`rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:border-primary/60 ${
                      selectedViewerId === v.id ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="truncate font-medium">{v.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{v.archetype}</div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" aria-hidden /> Memory inspector
            </CardTitle>
            <CardDescription>FSRS-inspired retention — R decays with episode gap, grows on re-exposure</CardDescription>
          </CardHeader>
          <CardContent>
            {!viewer ? (
              <p className="text-sm text-muted-foreground">Select a viewer to inspect their memory.</p>
            ) : (
              <div className="grid gap-2">
                <div className="text-sm font-semibold">{viewer.viewer.name}</div>
                <ScrollArea className="max-h-56 pr-2">
                  <div className="grid gap-1.5">
                    {viewer.memories.map((m) => (
                      <div key={m.key} className="rounded-md border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-[10px] text-muted-foreground">{m.key}</span>
                          <span className="whitespace-nowrap font-medium">R={m.retrievability.toFixed(2)}</span>
                        </div>
                        <div className="mt-1 h-1 w-full rounded bg-muted">
                          <div className="h-1 rounded bg-primary" style={{ width: `${Math.max(3, m.retrievability * 100)}%` }} />
                        </div>
                        <div className="mt-1 truncate text-muted-foreground">{m.content}</div>
                      </div>
                    ))}
                    {viewer.memories.length === 0 && <p className="text-xs text-muted-foreground">No memories yet.</p>}
                  </div>
                </ScrollArea>
                <div className="rounded-md bg-muted/60 p-2 text-[11px] text-muted-foreground">
                  <Eye className="mr-1 inline h-3 w-3" aria-hidden />
                  Watch history:{' '}
                  {viewer.screenings
                    .map((s) => `Ep${s.episode.number}(${s.arm}) ${s.keepWatching ? '✓ finished' : `✗ dropped@${s.dropAtBeat}`}`)
                    .join(' · ') || 'none yet'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {metricsQ && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Keep-rate by archetype</CardTitle>
              <CardDescription>Ep{metricsQ.metrics.number} ({metricsQ.metrics.arm})</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1.5">
              {metricsQ.metrics.segments.slice(0, 6).map((s) => (
                <div key={s.archetype} className="flex items-center gap-2 text-xs">
                  <span className="w-28 truncate">{s.archetype}</span>
                  <div className="h-1.5 flex-1 rounded bg-muted">
                    <div className="h-1.5 rounded bg-primary" style={{ width: `${Math.max(2, s.keepRate * 100)}%` }} />
                  </div>
                  <span className="w-10 text-right text-muted-foreground">{(s.keepRate * 100).toFixed(0)}%</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

