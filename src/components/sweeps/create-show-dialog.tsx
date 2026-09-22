'use client';

import { useState } from 'react';
import { useCreateShow } from '@/lib/queries';
import { useSweeps } from '@/lib/store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

const DEMO_PREMISE =
  'A washed-up radio DJ intercepts a numbers station broadcast that predicts deaths — and tonight it names her.';

export function CreateShowDialog() {
  const [open, setOpen] = useState(false);
  const [premise, setPremise] = useState('');
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('noir thriller');
  const [style, setStyle] = useState('cinematic, rain-slicked neon');
  const [mode, setMode] = useState('DUAL');
  const [episodeCount, setEpisodeCount] = useState(3);
  const [budget, setBudget] = useState(5);
  const [panel, setPanel] = useState(200);
  const create = useCreateShow();
  const setShow = useSweeps((s) => s.setShow);

  const submit = () => {
    create.mutate(
      { premise, title, genre, visualStyle: style, mode, episodeCount, budgetUsd: budget, panelSize: panel },
      {
        onSuccess: (r) => {
          toast.success('Show created — bible + audience panel generated');
          setShow(r.id);
          setOpen(false);
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-4 w-4" aria-hidden /> New Show
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a show</DialogTitle>
          <DialogDescription>
            One premise in — the showrunner generates the bible and the audience panel. No API keys needed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="premise">Premise</Label>
            <Textarea
              id="premise"
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              placeholder="Describe your series in one or two sentences…"
              rows={3}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-fit px-2 text-xs"
              onClick={() => setPremise(DEMO_PREMISE)}
            >
              <Wand2 className="mr-1 h-3 w-3" aria-hidden /> Use demo premise
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="title">Title (optional)</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-generated" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="genre">Genre</Label>
              <Input id="genre" value={genre} onChange={(e) => setGenre(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Run mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger aria-label="Run mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DUAL">DUAL — control vs optimizer</SelectItem>
                  <SelectItem value="SINGLE">SINGLE — writer only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="style">Visual style</Label>
              <Input id="style" value={style} onChange={(e) => setStyle(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <div className="flex justify-between">
              <Label>Episodes per arm: {episodeCount}</Label>
            </div>
            <Slider value={[episodeCount]} min={1} max={5} step={1} onValueChange={([v]) => setEpisodeCount(v)} aria-label="Episodes per arm" />
          </div>
          <div className="grid gap-1.5">
            <div className="flex justify-between">
              <Label>Audience panel: {panel} viewers</Label>
            </div>
            <Slider value={[panel]} min={50} max={1000} step={50} onValueChange={([v]) => setPanel(v)} aria-label="Panel size" />
          </div>
          <div className="grid gap-1.5">
            <div className="flex justify-between">
              <Label>Budget cap: ${budget.toFixed(2)}</Label>
            </div>
            <Slider value={[budget]} min={1} max={20} step={0.5} onValueChange={([v]) => setBudget(v)} aria-label="Budget" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={premise.trim().length < 8 || create.isPending}>
            {create.isPending ? 'Generating bible…' : 'Create show'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
