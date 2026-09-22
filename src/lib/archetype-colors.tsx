/**
 * Shared archetype → color mapping so a viewer's archetype reads consistently
 * across the persona gallery, memory inspector, journey timeline and analytics.
 * Warm/teal palette only (no indigo/blue) — matches the analytics COHORT_PALETTE.
 */

const PALETTE = [
  '#d97706', // amber-600
  '#0d9488', // teal-600
  '#e11d48', // rose-600
  '#16a34a', // green-600
  '#a21caf', // fuchsia-700
  '#ea580c', // orange-600
  '#0f766e', // teal-700
  '#be123c', // rose-700
  '#f59e0b', // amber-500
  '#15803d', // green-700
  '#86198f', // purple-700
  '#c2410c', // orange-700
];

const ARCHETYPE_COLORS: Record<string, string> = {
  'Binge-Watcher': '#d97706',
  'Casual Scroller': '#0d9488',
  'Genre Purist': '#e11d48',
  'Drama Queen': '#a21caf',
  Cynic: '#be123c',
  Completist: '#16a34a',
  'Mood Viewer': '#ea580c',
  'Loss-Averse Fan': '#0f766e',
  'Theory-Crafter': '#c2410c',
  Skimmer: '#f59e0b',
  Loyalist: '#15803d',
  Critic: '#86198f',
};

export function archetypeColor(archetype: string): string {
  if (ARCHETYPE_COLORS[archetype]) return ARCHETYPE_COLORS[archetype];
  let h = 0;
  for (let i = 0; i < archetype.length; i++) h = (h * 31 + archetype.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Small colored dot that identifies an archetype at a glance. */
export function ArchetypeDot({ archetype, className = '' }: { archetype: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: archetypeColor(archetype) }}
    />
  );
}
