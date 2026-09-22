'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Keyboard } from 'lucide-react';

const GROUPS: { title: string; keys: { combo: string; action: string }[] }[] = [
  {
    title: 'Navigate',
    keys: [
      { combo: '1', action: 'Episodes tab' },
      { combo: '2', action: 'Studio tab' },
      { combo: '3', action: 'Audience tab' },
      { combo: '4', action: 'Analytics tab' },
      { combo: '5', action: 'Experiment tab' },
    ],
  },
  {
    title: 'Run',
    keys: [
      { combo: 'A', action: 'Select arm A · control' },
      { combo: 'B', action: 'Select arm B · optimized' },
      { combo: 'E', action: 'Run next episode' },
      { combo: 'Shift + D', action: 'Run the full dual-arm demo' },
    ],
  },
  {
    title: 'System',
    keys: [
      { combo: 'T', action: 'Toggle light / dark theme' },
      { combo: '?', action: 'Show this help' },
      { combo: 'Esc', action: 'Close dialogs' },
    ],
  },
  {
    title: 'Sharing',
    keys: [
      { combo: '?view=1', action: 'Present mode — read-only link' },
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" aria-hidden /> Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>Drive the whole studio without leaving the keyboard.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map((g) => (
            <div key={g.title} className="grid content-start gap-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</div>
              {g.keys.map((k) => (
                <div key={k.combo} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{k.action}</span>
                  <Kbd className="shrink-0">{k.combo}</Kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
