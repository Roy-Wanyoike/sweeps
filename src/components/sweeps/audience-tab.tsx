'use client';

import { useMemo, useState } from 'react';
import { ShowDetail, Beat as QueriesBeat, useEpisode, useMetrics, usePersonas, useReactions, useViewer } from '@/lib/queries';
import { useSweeps } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Eye, MessageSquare, Search, Star, UserRound, Users } from 'lucide-react';
import { RateDialog } from './rate-dialog';

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

const AVATAR_STYLES: Record<string, string> = {
  POSITIVE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  NEGATIVE: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  NEUTRAL: 'bg-secondary text-secondary-foreground',
};

function initials(name: string): string {
  return name
    .split(/[.\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function AudienceTab({ detail }: { detail: ShowDetail }) {
  const selectedViewerId = useSweeps((s) => s.selectedViewerId);
  const selectViewer = useSweeps((s) => s.selectViewer);
  const doneEpisodes = detail.episodes.filter((e) => e.status === 'DONE' || e.status === 'ANALYZING');
  const [epId, setEpId] = useState<string | null>(doneEpisodes[doneEpisodes.length - 1]?.id ?? null);
  const currentEpId = epId ?? doneEpisodes[doneEpisodes.length - 1]?.id ?? null;
  const [query, setQuery] = useState('');
  const [rateOpen, setRateOpen] = useState(false);

  const { data: epData } = useEpisode(currentEpId);
  const { data: reactions } = useReactions(currentEpId);
  const { data: personas } = usePersonas(detail.show.id);
  // memories are arm-scoped (parallel timelines per arm) — follow the selected episode's arm
  const { data: viewer } = useViewer(detail.show.id, selectedViewerId, epData?.episode.arm ?? 'A');

  const { data: metricsQ } = useMetrics(currentEpId);
  const beats: QueriesBeat[] = epData?.plan?.beats ?? [];
  const beatTitle = (i: number | null) => (i === null ? undefined : beats[i]?.title);

  const archetypeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of personas?.viewers ?? []) m.set(v.archetype, (m.get(v.archetype) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [personas]);

  const filteredViewers = useMemo(() => {
    const viewers = personas?.viewers ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return viewers;
    return viewers.filter((v) => v.name.toLowerCase().includes(q) || v.archetype.toLowerCase().includes(q));
  }, [personas, query]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" aria-hidden /> Reaction wall
            </CardTitle>
            <CardDescription>
              Sampled viewers comment in-voice while watching — with sentiment and drop-point attribution
            </CardDescription>
          </div>
          <div data-slot="card-action">
            <div className="flex items-center gap-2">
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
              <Button size="sm" variant="outline" onClick={() => setRateOpen(true)} title="Rate this episode yourself">
                <Star className="mr-1 h-3.5 w-3.5" aria-hidden /> Rate it
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96 pr-3">
            <div className="grid gap-2.5">
              {(reactions?.reactions ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No reactions yet — screen an episode first.</p>
              )}
              {(reactions?.reactions ?? []).map((r, i) => {
                const s = r.sentiment ?? 'NEUTRAL';
                const human = r.source === 'HUMAN';
                return (
                  <div key={i} className={`flex items-start gap-2.5 ${human ? 'rounded-xl border border-primary/30 bg-primary/[0.04] p-2' : ''}`}>
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        human ? 'bg-gradient-to-br from-primary to-rose-500 text-white' : AVATAR_STYLES[s]
                      }`}
                      aria-hidden
                    >
                      {human ? <UserRound className="h-4 w-4" /> : initials(r.name)}
                    </div>
                    <div
                      className={`relative flex-1 rounded-xl rounded-tl-sm border bg-gradient-to-br p-2.5 ${
                        human
                          ? 'border-primary/25 from-primary/5 to-transparent'
                          : s === 'NEGATIVE'
                            ? 'border-rose-500/25 from-rose-500/5 to-transparent'
                            : s === 'POSITIVE'
                              ? 'border-emerald-500/25 from-emerald-500/5 to-transparent'
                              : 'from-muted/50 to-transparent'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{r.name}</span>
                        {human ? (
                          <Badge className="bg-gradient-to-r from-primary to-rose-500 text-primary-foreground hover:from-primary hover:to-rose-500">
                            <UserRound className="mr-0.5 h-2.5 w-2.5" aria-hidden /> human panel
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{r.archetype}</Badge>
                        )}
                        {human && r.rating !== null && (
                          <span className="flex items-center gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star key={n} className={`h-3 w-3 ${n <= (r.rating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} aria-hidden />
                            ))}
                          </span>
                        )}
                        <SentimentBadge sentiment={r.sentiment} />
                        {!human && !r.keepWatching && r.dropAtBeat !== null && (
                          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-medium text-rose-600 dark:text-rose-400">
                            dropped @ beat {r.dropAtBeat}{beatTitle(r.dropAtBeat) ? ` — “${beatTitle(r.dropAtBeat)}”` : ''}
                          </span>
                        )}
                      </div>
                      {r.comment && <p className="mt-1 text-sm leading-relaxed">{r.comment}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <RateDialog open={rateOpen} onOpenChange={setRateOpen} episodeId={currentEpId} episodeLabel={`Ep${doneEpisodes.find((e) => e.id === currentEpId)?.number ?? ''} (${doneEpisodes.find((e) => e.id === currentEpId)?.arm ?? ''})`} />

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
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or archetype…"
                className="h-8 pl-8 text-xs"
                aria-label="Filter viewers"
              />
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {archetypeCounts.map(([a, n]) => (
                <button
                  key={a}
                  onClick={() => setQuery(query === a ? '' : a)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    query === a ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  }`}
                  aria-pressed={query === a}
                  title={`Filter by ${a}`}
                >
                  {a} ×{n}
                </button>
              ))}
            </div>
            <ScrollArea className="max-h-56 pr-2">
              <div className="grid grid-cols-2 gap-1.5">
                {filteredViewers.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => selectViewer(v.id)}
                    className={`rounded-md border px-2 py-1.5 text-left text-xs transition-all hover:border-primary/60 hover:shadow-sm ${
                      selectedViewerId === v.id ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : ''
                    }`}
                  >
                    <div className="truncate font-medium">{v.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{v.archetype}</div>
                  </button>
                ))}
                {filteredViewers.length === 0 && (
                  <p className="col-span-2 py-4 text-center text-xs text-muted-foreground">No viewers match “{query}”.</p>
                )}
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
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{viewer.viewer.name}</div>
                  <Badge variant="outline" className="text-[10px]">{viewer.viewer.archetype}</Badge>
                </div>
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
                    .map((s) => `Ep${s.episodeNumber}(${s.arm}) ${s.keepWatching ? '✓ finished' : `✗ dropped@${s.dropAtBeat}`}`)
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
