'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Star, UserRound } from 'lucide-react';
import { toast } from 'sonner';

export function RateDialog({
  open,
  onOpenChange,
  episodeId,
  episodeLabel,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  episodeId: string | null;
  episodeLabel: string;
  onSubmitted?: () => void;
}) {
  const [name, setName] = useState('');
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!episodeId || rating === 0) {
      toast.error('Pick a star rating first');
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'You', rating, comment: comment.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      toast.success('Rating added to the reaction wall', { description: 'Your reaction now sits beside the simulated panel.' });
      onSubmitted?.();
      onOpenChange(false);
      setRating(0);
      setComment('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-primary" aria-hidden /> Join the panel — {episodeLabel}
          </DialogTitle>
          <DialogDescription>
            Watch the episode, then rate it. Your reaction lands on the wall next to the 200 simulated viewers.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Your rating</div>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Star
                    className={`h-7 w-7 transition-colors ${
                      n <= (hover || rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  {rating === 5 ? 'instant rewatch' : rating === 4 ? 'would recommend' : rating === 3 ? 'decent' : rating === 2 ? 'weak' : 'dropped it'}
                </span>
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="rate-name" className="text-xs font-medium text-muted-foreground">
              Display name (optional)
            </label>
            <Input id="rate-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="You" maxLength={40} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="rate-comment" className="text-xs font-medium text-muted-foreground">
              Reaction (optional)
            </label>
            <Textarea
              id="rate-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Where did you lean forward? Where did you check your phone?"
              rows={3}
              maxLength={280}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || rating === 0}>
            {pending ? 'Submitting…' : 'Submit rating'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
