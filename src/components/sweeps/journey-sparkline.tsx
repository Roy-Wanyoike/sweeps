'use client';

/**
 * Hand-rolled SVG sparkline for a single viewer's satisfaction trace S(t)
 * across one episode — with the viewer's churn threshold, a drop marker,
 * and amber pips where a memory was recalled (cliffhanger bonus etc.).
 * No recharts: tiny, SSR-friendly, immune to chart remount churn.
 */

export interface JourneyPoint {
  beat: number;
  S: number;
  recalled: string[];
}

export function JourneySparkline({
  curve,
  threshold,
  dropAtBeat,
  finished,
  labelId,
}: {
  curve: JourneyPoint[];
  threshold: number;
  dropAtBeat: number | null;
  finished: boolean;
  labelId?: string;
}) {
  if (curve.length < 2) return null;

  const W = 160;
  const H = 36;
  const PAD = 2;
  const n = curve.length;
  const x = (i: number) => PAD + (i / (n - 1)) * (W - 2 * PAD);
  const y = (S: number) => H - PAD - Math.max(0, Math.min(1, S)) * (H - 2 * PAD);

  const pts = curve.map((p, i) => `${x(i).toFixed(1)},${y(p.S).toFixed(1)}`);
  const stroke = finished ? '#10b981' : '#f43f5e'; // emerald-500 / rose-500
  const last = curve[curve.length - 1];

  // area fill under the curve (subtle)
  const area = `M ${pts[0]} L ${pts.join(' L ')} L ${x(n - 1).toFixed(1)},${H - PAD} L ${x(0).toFixed(1)},${H - PAD} Z`;

  // drop marker index
  const dropIdx = dropAtBeat !== null ? curve.findIndex((p) => p.beat === dropAtBeat) : -1;
  const dropY = dropIdx >= 0 ? y(curve[dropIdx].S) : null;
  const dropX = dropIdx >= 0 ? x(dropIdx) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-9 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-labelledby={labelId}
    >
      {/* churn threshold — dashed amber line */}
      <line
        x1={PAD}
        x2={W - PAD}
        y1={y(threshold)}
        y2={y(threshold)}
        stroke="#f59e0b"
        strokeWidth={0.8}
        strokeDasharray="3 3"
        opacity={0.55}
      />
      <path d={area} fill={stroke} opacity={0.08} />
      <path d={`M ${pts.join(' L ')}`} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      {/* recalled-memory pips (amber dots on the curve) */}
      {curve.map((p, i) =>
        p.recalled.length > 0 ? (
          <circle key={`r${i}`} cx={x(i)} cy={y(p.S)} r={1.8} fill="#f59e0b" stroke="#fff" strokeWidth={0.5} />
        ) : null
      )}
      {/* drop marker: vertical line + dot where the viewer bailed */}
      {dropIdx >= 0 && dropX !== null && dropY !== null && (
        <>
          <line x1={dropX} x2={dropX} y1={PAD} y2={H - PAD} stroke="#f43f5e" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.6} />
          <circle cx={dropX} cy={dropY} r={2.4} fill="#f43f5e" stroke="#fff" strokeWidth={0.7} />
        </>
      )}
      {/* end dot when finished */}
      {finished && <circle cx={x(n - 1)} cy={y(last.S)} r={2} fill={stroke} stroke="#fff" strokeWidth={0.6} />}
    </svg>
  );
}
