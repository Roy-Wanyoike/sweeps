'use client';

import { useEffect, useMemo, useState } from 'react';
import { EpisodeDetail } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Pause, Play, Star } from 'lucide-react';
import { kenBurns } from '@/services/storyboard';
import { toast } from 'sonner';

const MAX_BEAT_MS = 6000; // compressed playback for demo purposes

export function PlayerDialog({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: EpisodeDetail;
}) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [myRating, setMyRating] = useState(0);
  const [ratePending, setRatePending] = useState(false);

  const beats = useMemo(
    () => detail.beats.filter((b) => b.stillPath).map((b) => ({ row: b, beat: b.beat })),
    [detail.beats]
  );

  const [prevOpen, setPrevOpen] = useState(false);
  // reset playback whenever the dialog reopens (adjust-state-during-render pattern)
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCurrent(0);
      setPlaying(true);
      setMyRating(0);
    }
  }

  const cur = beats[current];

  useEffect(() => {
    if (!open || !playing || !cur) return;
    const dur = Math.min(MAX_BEAT_MS, Math.max(2500, (cur.beat?.durationSec ?? 8) * 1000 * 0.5));
    const t = setTimeout(() => {
      if (current < beats.length - 1) setCurrent(current + 1);
      else setPlaying(false);
    }, dur);
    return () => clearTimeout(t);
  }, [open, playing, current, cur, beats.length]);

  const submitRating = async (n: number) => {
    setMyRating(n);
    setRatePending(true);
    try {
      const res = await fetch(`/api/episodes/${detail.episode.id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'You (player)', rating: n }),
      });
      if (!res.ok) throw new Error('Could not save rating');
      toast.success(`Rated ${n}/5 — you're on the wall`, { description: 'See the Audience tab for your human-panel badge.' });
    } catch (e) {
      toast.error((e as Error).message);
      setMyRating(0);
    } finally {
      setRatePending(false);
    }
  };

  if (!open) return null;
  const kb = cur ? kenBurns(current + (detail.episode.number * 31 + detail.episode.arm.charCodeAt(0))) : null;
  const dialogue = cur?.beat?.dialogue ?? [];
  const progress = beats.length ? ((current + 1) / beats.length) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>
              Episode {detail.episode.number} ({detail.episode.arm}) — {detail.plan?.summary?.slice(0, 60) ?? '…'}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            {cur?.row.stillPath && kb && (              <img
                key={current}
                src={cur.row.stillPath}
                alt={`Scene ${current + 1}: ${cur.beat?.title ?? ''}`}
                className="kb-frame h-full w-full object-cover"
                style={
                  {
                    '--kb-dur': `${Math.min(MAX_BEAT_MS, Math.max(2500, (cur.beat?.durationSec ?? 8) * 500))}ms`,
                    '--kb-from': '1.02',
                    '--kb-to': kb.zoom,
                    '--kb-x': `${kb.panX}px`,
                    '--kb-y': `${kb.panY}px`,
                  } as React.CSSProperties
                }
              />
            )}
            <div className="absolute left-3 top-3 flex gap-1.5">
              <Badge className="bg-black/60 text-white hover:bg-black/60">{cur?.row.type}</Badge>
              <Badge className="bg-black/60 text-white hover:bg-black/60">
                beat {current + 1}/{beats.length}
              </Badge>
              {cur?.beat && (
                <Badge className="bg-black/60 text-white hover:bg-black/60">
                  {cur.beat.location} · {cur.beat.timeOfDay}
                </Badge>
              )}
            </div>
            {dialogue.length > 0 && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-10">
                {dialogue.map((d, i) => (
                  <div key={i} className="fade-in text-center text-sm text-white drop-shadow">
                    <span className="font-semibold text-amber-300">{d.char}: </span>
                    {d.line}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="h-1.5 w-full rounded bg-muted">
            <div className="h-1.5 rounded bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0} aria-label="Previous beat">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrent(Math.min(beats.length - 1, current + 1))}
                disabled={current >= beats.length - 1}
                aria-label="Next beat"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {current >= beats.length - 1 && !playing && (
                <div className="flex items-center gap-1.5 fade-in" aria-label="Rate this episode">
                  <span className="text-xs text-muted-foreground">Rate it:</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => submitRating(n)}
                      disabled={ratePending || myRating > 0}
                      aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                      className="rounded p-0.5 transition-transform hover:scale-125 disabled:cursor-default"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          n <= myRating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40 hover:text-amber-400'
                        }`}
                      />
                    </button>
                  ))}
                  {myRating > 0 && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">saved</span>}
                </div>
              )}
              <div className="max-w-[55%] truncate text-xs text-muted-foreground" title={cur?.beat?.purpose}>
                {cur?.beat?.purpose}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
