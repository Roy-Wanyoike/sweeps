import { db } from '@/lib/db';
import { Beat, WatchEvent, jparse } from '@/lib/contracts';
import { stageSpend } from '@/lib/ai/cost-ledger';

export interface Cliff {
  beat: number;
  type: string;
  title: string;
  delta: number;
  quote?: string;
  sentiment?: string;
}

export interface Segment {
  archetype: string;
  keepRate: number;
  n: number;
}

export interface Metrics {
  episodeId: string;
  arm: string;
  number: number;
  panel: number;
  curve: { beat: number; type: string; title: string; retention: number }[];
  km: { beat: number; survival: number }[];
  cliffs: Cliff[];
  segments: Segment[];
  overall: number;
  meanSatisfaction: number;
  costPerRetainedViewer: number;
  spendUsd: number;
  dropReasons: { quote: string; sentiment: string }[];
}

export async function computeMetrics(episodeId: string): Promise<Metrics | null> {
  const episode = await db.episode.findUnique({ where: { id: episodeId }, include: { show: true, beats: true, screenings: { include: { viewer: true } } } });
  if (!episode) return null;
  const stored = jparse<Beat[] | { beats: Beat[] } | null>(episode.beatPlan, []);
  const beats = Array.isArray(stored) ? stored : (stored?.beats ?? []);
  const screenings = episode.screenings;
  const panel = screenings.length || 1;

  const sorted = [...screenings].sort((a, b) => (a.dropAtBeat ?? 999) - (b.dropAtBeat ?? 999));

  const curve = beats.map((b) => {
    const still = screenings.filter((s) => s.dropAtBeat === null || s.dropAtBeat > b.index).length;
    return {
      beat: b.index,
      type: b.type,
      title: b.title,
      retention: Number((still / panel).toFixed(4)),
    };
  });

  const km = curve.map((c) => ({ beat: c.beat, survival: c.retention }));

  const cliffs: Cliff[] = [];
  for (let i = 1; i < curve.length; i++) {
    const delta = curve[i].retention - curve[i - 1].retention;
    if (delta < -0.001) {
      const droppedViewer = sorted.find((s) => s.dropAtBeat === curve[i].beat);
      cliffs.push({
        beat: curve[i].beat,
        type: curve[i].type,
        title: curve[i].title,
        delta: Number(delta.toFixed(4)),
        quote: droppedViewer?.comment ?? undefined,
        sentiment: droppedViewer?.sentiment ?? undefined,
      });
    }
  }
  cliffs.sort((a, b) => a.delta - b.delta);

  // archetype segments
  const segMap = new Map<string, { keep: number; n: number }>();
  for (const s of screenings) {
    const key = s.viewer.archetype;
    const cur = segMap.get(key) ?? { keep: 0, n: 0 };
    cur.n += 1;
    if (s.keepWatching) cur.keep += 1;
    segMap.set(key, cur);
  }
  const segments: Segment[] = [...segMap.entries()]
    .map(([archetype, v]) => ({ archetype, keepRate: Number((v.keep / v.n).toFixed(4)), n: v.n }))
    .sort((a, b) => b.keepRate - a.keepRate);

  const overall = curve.length ? curve[curve.length - 1].retention : 0;
  const meanSatisfaction = screenings.length
    ? screenings.reduce((a, s) => a + s.satisfaction, 0) / screenings.length
    : 0;

  const renderSpend = await stageSpend(episode.showId, 'RENDER');
  const spendUsd = episode.spendUsd;
  const costPerRetainedViewer = spendUsd / Math.max(1, panel * overall);

  const dropReasons = screenings
    .filter((s) => s.sentiment === 'NEGATIVE' && s.comment)
    .slice(0, 3)
    .map((s) => ({ quote: s.comment as string, sentiment: 'NEGATIVE' }));

  void renderSpend;

  await db.episode.update({ where: { id: episodeId }, data: { retentionScore: overall } });

  return {
    episodeId,
    arm: episode.arm,
    number: episode.number,
    panel: screenings.length,
    curve,
    km,
    cliffs,
    segments,
    overall: Number(overall.toFixed(4)),
    meanSatisfaction: Number(meanSatisfaction.toFixed(4)),
    costPerRetainedViewer: Number(costPerRetainedViewer.toFixed(4)),
    spendUsd: Number(spendUsd.toFixed(4)),
    dropReasons,
  };
}

/** Beat-level events of one screening (for UI drill-down). */
export function parseEvents(s: string): WatchEvent[] {
  return jparse<WatchEvent[]>(s, []);
}
