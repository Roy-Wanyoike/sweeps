import { Rng, hashSeed } from '@/lib/sim/rng';

/**
 * Deterministic procedural storyboard/character/prop cards (SVG data URIs).
 * Zero AI cost fallback visuals that always render.
 */

const KIND_LABEL: Record<string, string> = {
  BEAT: 'SCENE',
  CHARACTER: 'CAST',
  LOCATION: 'LOCATION',
  PROP: 'PROP',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur += ' ' + w;
    }
  }
  if (lines.length < maxLines && cur.trim()) lines.push(cur.trim());
  return lines.slice(0, maxLines);
}

export function makeCard(opts: {
  kind: 'BEAT' | 'CHARACTER' | 'LOCATION' | 'PROP';
  title: string;
  sub?: string;
  lines?: string[];
  seed: number;
}): string {
  const rng = new Rng(hashSeed(opts.seed, opts.title));
  const hue = rng.int(360);
  const hue2 = (hue + 40 + rng.int(80)) % 360;
  const W = 1344;
  const H = 768;
  const titleLines = wrap(opts.title, 26, 2);
  const bodyLines = (opts.lines ?? []).flatMap((l) => wrap(l, 58, 2)).slice(0, 4);

  const decor = Array.from({ length: 7 }, (_, i) => {
    const cx = rng.int(W);
    const cy = rng.int(H);
    const r = 40 + rng.int(180);
    const o = (0.04 + rng.float() * 0.08).toFixed(3);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${(hue + i * 25) % 360} 60% 55%)" opacity="${o}"/>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 32% 12%)"/>
      <stop offset="100%" stop-color="hsl(${hue2} 28% 22%)"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 80% 60%)" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="hsl(${hue} 80% 60%)" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${decor}
  <rect width="${W}" height="220" fill="url(#glow)"/>
  <text x="72" y="86" font-family="monospace" font-size="30" letter-spacing="10" fill="hsl(${hue} 85% 72%)">${esc(KIND_LABEL[opts.kind] ?? 'SCENE')}</text>
  <rect x="72" y="110" width="120" height="6" rx="3" fill="hsl(${hue} 85% 60%)"/>
  ${titleLines
    .map(
      (l, i) =>
        `<text x="72" y="${210 + i * 74}" font-family="Arial, sans-serif" font-weight="bold" font-size="62" fill="hsl(40 40% 96%)">${esc(l)}</text>`
    )
    .join('')}
  ${opts.sub ? `<text x="72" y="${210 + titleLines.length * 74 + 8}" font-family="Arial, sans-serif" font-size="30" fill="hsl(40 20% 78%)">${esc(opts.sub)}</text>` : ''}
  ${bodyLines
    .map(
      (l, i) =>
        `<text x="72" y="${H - 150 + i * 40}" font-family="Arial, sans-serif" font-size="27" fill="hsl(40 15% 85%)" opacity="0.9">${esc(l)}</text>`
    )
    .join('')}
  <text x="${W - 72}" y="${H - 52}" text-anchor="end" font-family="monospace" font-size="24" fill="hsl(40 20% 70%)" opacity="0.8">SWEEPS</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Ken Burns parameters derived deterministically from a seed — no storage needed. */
export function kenBurns(seed: number): { panX: number; panY: number; zoom: number } {
  const rng = new Rng(hashSeed(seed, 'kenburns'));
  return {
    panX: Math.round(rng.range(-40, 40)),
    panY: Math.round(rng.range(-30, 30)),
    zoom: Number(rng.range(1.06, 1.16).toFixed(3)),
  };
}
