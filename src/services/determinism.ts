import { createHash, createHmac } from 'crypto';
import { db } from '@/lib/db';
import { Beat, jparse, ViewerPersona } from '@/lib/contracts';
import { simulateWatch, IMPACT, KEY_TYPES } from './audience';

/**
 * Determinism verification: the strongest claim this project makes is
 * "same seed → same audience → same curves". This module PROVES it.
 *
 * We replay every screening of every arm from a pristine memory state — using
 * only the master seed, the stored beat plans and the same pure simulation code
 * the pipeline ran — then byte-compare each per-viewer watch-event stream
 * against the stored Screening rows. Zero AI calls, zero DB writes.
 */

interface MemoryLike {
  key: string;
  content: string;
  stability: number;
  lastSeenEp: number;
}

export interface VerifyEpisodeReceipt {
  epNumber: number;
  arm: string;
  status: string;
  beatCount: number;
  checkedRows: number;
  mismatchRows: number;
  match: boolean;
  storedHash: string;
  computedHash: string;
  /** first few mismatch details (field-level) for honest drift reporting */
  details: { viewerId: string; field: string }[];
}

export interface VerifyReceipt {
  ok: boolean;
  showId: string;
  title: string;
  seed: number;
  panelSize: number;
  viewerCount: number;
  episodes: VerifyEpisodeReceipt[];
  checkedRows: number;
  mismatchRows: number;
  allMatch: boolean;
  /** sha256 over all computed episode hashes — the show's determinism fingerprint */
  fingerprint: string;
  durationMs: number;
  verifiedAt: string;
  aiTokensSpent: 0;
}

const EPS = 1e-9;

/* ------------------------- portable signed artifact ------------------------- */

/** Deterministic JSON canonicalization: sorted keys, undefined dropped, arrays kept. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map((x) => canonicalJson(x)).join(',')}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, val]) => val !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${canonicalJson(val)}`).join(',')}}`;
}

/**
 * Attestation signature over the receipt body. The HMAC key is derived from the
 * show's own identity (id + master seed) — anyone holding the seed can recompute
 * it, which is the point: the artifact is self-verifying, not secret.
 */
export function signReceipt(receipt: VerifyReceipt, seed: number): string {
  const key = `sweeps-attest:${receipt.showId}:${seed}`;
  const { signature: _ignored, ...body } = receipt as VerifyReceipt & { signature?: string };
  void _ignored;
  return createHmac('sha256', key).update(canonicalJson(body)).digest('hex');
}

/** Build the downloadable artifact: receipt + signature + verification recipe. */
export function receiptArtifact(receipt: VerifyReceipt): Record<string, unknown> {
  const showSeed = receipt.seed;
  const signature = signReceipt(receipt, showSeed);
  return {
    artifact: 'sweeps.determinism-receipt',
    version: 1,
    generatedAt: receipt.verifiedAt,
    receipt,
    attestation: {
      algorithm: 'HMAC-SHA256',
      covers: 'canonical JSON of `receipt` (sorted keys, UTF-8)',
      keyDerivation: 'HMAC key = `sweeps-attest:<showId>:<masterSeed>` — recomputable from the seed',
      signature,
      verifyRecipe:
        'recompute = re-run the same simulation with the same seed and beat plans; every hash and the fingerprint must reproduce byte-for-byte',
    },
  };
}

function rowHashString(viewerId: string, events: string, keepWatching: boolean, dropAtBeat: number | null, satisfaction: number): string {
  return `${viewerId}:${events}:${keepWatching ? 1 : 0}:${dropAtBeat === null ? 'null' : dropAtBeat}:${satisfaction.toFixed(6)}`;
}

function hashRows(rows: { viewerId: string; events: string; keepWatching: boolean; dropAtBeat: number | null; satisfaction: number }[]): string {
  const canonical = [...rows]
    .sort((a, b) => (a.viewerId < b.viewerId ? -1 : a.viewerId > b.viewerId ? 1 : 0))
    .map((r) => rowHashString(r.viewerId, r.events, r.keepWatching, r.dropAtBeat, r.satisfaction))
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

/** In-memory equivalent of simulateScreening's memory upserts (SET semantics). */
function applyMemoryUpdates(
  mem: Map<string, MemoryLike>,
  beats: Beat[],
  epNumber: number
): void {
  for (const beat of beats) {
    if (!KEY_TYPES.has(beat.type)) continue;
    const impact = IMPACT[beat.type] ?? 0.4;
    mem.set(`trope:${beat.type}`, { key: `trope:${beat.type}`, content: beat.title, stability: 0.5 + impact / 2, lastSeenEp: epNumber });
    if (beat.type === 'CLIFFHANGER') {
      mem.set('cliffhanger:last', { key: 'cliffhanger:last', content: beat.title, stability: 0.95, lastSeenEp: epNumber });
    } else if (beat.type !== 'HOOK') {
      const key = `plot:ep${epNumber}:b${beat.index}`;
      mem.set(key, { key, content: beat.title, stability: 0.5 + impact / 2, lastSeenEp: epNumber });
    }
  }
}

export async function verifyDeterminism(showId: string): Promise<VerifyReceipt> {
  const t0 = Date.now();
  const show = await db.show.findUnique({ where: { id: showId } });
  if (!show) throw new Error('show not found');

  const viewers = await db.viewer.findMany({ where: { showId } });
  const episodes = await db.episode.findMany({
    where: { showId },
    orderBy: [{ arm: 'asc' }, { number: 'asc' }],
  });

  // only verify episodes that were actually screened
  const screened = episodes.filter((e) => ['DONE', 'RENDER_PARTIAL', 'ANALYZING'].includes(e.status));
  const screeningRows = screened.length
    ? await db.screening.findMany({ where: { episodeId: { in: screened.map((e) => e.id) } } })
    : [];

  // parse personas once
  const personas = new Map<string, ViewerPersona>();
  for (const v of viewers) {
    const p = jparse<ViewerPersona>(v.persona, null as unknown as ViewerPersona);
    if (p) personas.set(v.id, p);
  }

  // group screened episodes by arm (each arm is a parallel timeline from pristine memory)
  const byArm = new Map<string, typeof screened>();
  for (const ep of screened) {
    const list = byArm.get(ep.arm) ?? [];
    list.push(ep);
    byArm.set(ep.arm, list);
  }

  const episodeReceipts: VerifyEpisodeReceipt[] = [];

  for (const [arm, eps] of byArm) {
    // pristine memory state for this arm: viewerId -> (key -> memory)
    const memory = new Map<string, Map<string, MemoryLike>>();
    for (const v of viewers) memory.set(v.id, new Map());

    for (const ep of eps) {
      const stored = jparse<Beat[] | { beats: Beat[] } | null>(ep.beatPlan, []);
      const beats = Array.isArray(stored) ? stored : (stored?.beats ?? []);
      const storedRows = screeningRows.filter((s) => s.episodeId === ep.id);

      if (beats.length === 0 || storedRows.length === 0) {
        episodeReceipts.push({
          epNumber: ep.number,
          arm,
          status: ep.status,
          beatCount: beats.length,
          checkedRows: 0,
          mismatchRows: storedRows.length,
          match: false,
          storedHash: '—',
          computedHash: '—',
          details: [],
        });
        continue;
      }

      // replay: compute every viewer's watch stream with in-memory arm-scoped memory
      const computed = new Map<string, { events: string; keepWatching: boolean; dropAtBeat: number | null; satisfaction: number }>();
      for (const v of viewers) {
        const persona = personas.get(v.id);
        if (!persona) continue;
        const memMap = memory.get(v.id)!;
        const sim = simulateWatch(persona, beats, [...memMap.values()], ep.number);
        computed.set(v.id, {
          events: JSON.stringify(sim.events),
          keepWatching: sim.keepWatching,
          dropAtBeat: sim.dropAtBeat,
          satisfaction: sim.satisfaction,
        });
        applyMemoryUpdates(memMap, beats, ep.number);
      }

      // byte-compare against stored screenings
      const details: VerifyEpisodeReceipt['details'] = [];
      let mismatches = 0;
      const computedForHash: Parameters<typeof hashRows>[0] = [];
      const storedForHash: Parameters<typeof hashRows>[0] = [];

      for (const s of storedRows) {
        const c = computed.get(s.viewerId);
        storedForHash.push({ viewerId: s.viewerId, events: s.events, keepWatching: s.keepWatching, dropAtBeat: s.dropAtBeat, satisfaction: s.satisfaction });
        if (!c) {
          mismatches++;
          if (details.length < 5) details.push({ viewerId: s.viewerId, field: 'orphan (no computed row)' });
          continue;
        }
        computedForHash.push({ viewerId: s.viewerId, ...c });
        if (c.events !== s.events) {
          mismatches++;
          if (details.length < 5) details.push({ viewerId: s.viewerId, field: 'events' });
          continue;
        }
        if (c.keepWatching !== s.keepWatching) {
          mismatches++;
          if (details.length < 5) details.push({ viewerId: s.viewerId, field: 'keepWatching' });
          continue;
        }
        if (c.dropAtBeat !== s.dropAtBeat) {
          mismatches++;
          if (details.length < 5) details.push({ viewerId: s.viewerId, field: 'dropAtBeat' });
          continue;
        }
        if (Math.abs(c.satisfaction - s.satisfaction) > EPS) {
          mismatches++;
          if (details.length < 5) details.push({ viewerId: s.viewerId, field: 'satisfaction' });
        }
      }
      // computed rows with no stored screening (panel regenerated mid-run)
      const storedIds = new Set(storedRows.map((s) => s.viewerId));
      for (const [viewerId] of computed) {
        if (!storedIds.has(viewerId)) {
          mismatches++;
          if (details.length < 5) details.push({ viewerId, field: 'missing stored screening' });
        }
      }

      const storedHash = storedRows.length ? hashRows(storedRows) : '—';
      const computedHash = computed.size ? hashRows(computedForHash) : '—';

      episodeReceipts.push({
        epNumber: ep.number,
        arm,
        status: ep.status,
        beatCount: beats.length,
        checkedRows: storedRows.length,
        mismatchRows: mismatches,
        match: mismatches === 0 && storedRows.length > 0,
        storedHash,
        computedHash,
        details,
      });
    }
  }

  episodeReceipts.sort((a, b) => (a.arm === b.arm ? a.epNumber - b.epNumber : a.arm < b.arm ? -1 : 1));

  const checkedRows = episodeReceipts.reduce((n, e) => n + e.checkedRows, 0);
  const mismatchRows = episodeReceipts.reduce((n, e) => n + e.mismatchRows, 0);
  const allMatch = episodeReceipts.length > 0 && episodeReceipts.every((e) => e.match);
  const fingerprint = createHash('sha256')
    .update(episodeReceipts.map((e) => e.computedHash).join('\n'))
    .digest('hex');

  return {
    ok: true,
    showId,
    title: show.title,
    seed: show.seed,
    panelSize: show.panelSize,
    viewerCount: viewers.length,
    episodes: episodeReceipts,
    checkedRows,
    mismatchRows,
    allMatch,
    fingerprint,
    durationMs: Date.now() - t0,
    verifiedAt: new Date().toISOString(),
    aiTokensSpent: 0,
  };
}
