'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BeatType, CompileReport, ViewerPersona } from '@/lib/contracts';

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const post = (url: string, body?: unknown) => ({
  url,
  init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined },
});

/* --------------------------------- types --------------------------------- */

export interface Health {
  ok: boolean;
  provider: string;
  video: boolean;
  runner: { queued: number; running: boolean; current?: unknown; lastError?: string };
  consistencyGate: boolean;
  renderImageBeats: string;
}

export interface ShowRow {
  id: string;
  title: string;
  premise: string;
  mode: string;
  status: string;
  episodeCount: number;
  seed: number;
}

export interface CharacterRow {
  id: string;
  name: string;
  role: string;
  appearance: string;
  personality: string;
  voiceStyle: string;
  refImage: string | null;
  attrs: string;
}

export interface EntityRow {
  id: string;
  kind: string;
  name: string;
  desc: string;
  refImage: string | null;
}

export interface EpisodeRow {
  id: string;
  number: number;
  arm: string;
  status: string;
  repairLoops: number;
  spendUsd: number;
  retentionScore: number | null;
  summary: string | null;
}

export interface ShowDetail {
  show: ShowRow & { genre: string; visualStyle: string; budgetUsd: number; panelSize: number; createdAt: string };
  characters: CharacterRow[];
  entities: EntityRow[];
  episodes: EpisodeRow[];
  panelCount: number;
  runner: { queued: number; running: boolean; current?: unknown; lastError?: string };
  budget: { budgetUsd: number; byStage: Record<string, number>; totalUsd: number };
}

export interface Beat {
  index: number;
  title: string;
  type: BeatType;
  location: string;
  timeOfDay: string;
  durationSec: number;
  cast: string[];
  purpose: string;
  visualPrompt: string;
  qualitySelfScore: number;
  dialogue: { char: string; line: string; emotion: string }[];
  loreAssertions: { key: string; value: string }[];
  props: { ref: string; action: string }[];
  wardrobe: Record<string, string>;
}

export interface BeatRow {
  id: string;
  index: number;
  type: string;
  title: string;
  beat: Beat | null;
  compileStatus: string | null;
  renderStatus: string | null;
  stillPath: string | null;
  estCostUsd: number;
  engagement: number | null;
  dropCount: number;
}

export interface JobLogRow {
  id: string;
  step: string;
  status: string;
  detail: string | null;
  createdAt: string;
}

export interface EpisodeDetail {
  episode: EpisodeRow & { id: string; beatPlan: string | null };
  plan: { beats: Beat[]; summary: string } | null;
  beats: BeatRow[];
  compileReport: CompileReport | null;
  jobLogs: JobLogRow[];
}

export interface MetricsData {
  metrics: {
    episodeId: string;
    arm: string;
    number: number;
    panel: number;
    curve: { beat: number; type: string; title: string; retention: number }[];
    km: { beat: number; survival: number }[];
    cliffs: { beat: number; type: string; title: string; delta: number; quote?: string; sentiment?: string }[];
    segments: { archetype: string; keepRate: number; n: number }[];
    cohorts: { archetype: string; n: number; keepRate: number; curve: { beat: number; retention: number }[] }[];
    overall: number;
    meanSatisfaction: number;
    costPerRetainedViewer: number;
    spendUsd: number;
    dropReasons: { quote: string; sentiment: string }[];
  };
}

export interface LedgerData {
  budgetUsd: number;
  totalUsd: number;
  byStage: Record<string, number>;
  byEpisode: { episode: string; spendUsd: number }[];
  recent: { stage: string; model: string; kind: string; tokens: number; costUsd: number; createdAt: string }[];
}

export interface ExperimentsData {
  experiments: {
    id: string;
    epNumber: number;
    slotIndex: number;
    rewardA: number | null;
    rewardB: number | null;
    chosen: string | null;
    evidence: Record<string, unknown>;
  }[];
  verdict: {
    byArm: Record<string, { numbers: number[]; retention: number[]; costPerRV: number[]; spend: number[] }>;
    verdict: {
      deltaA: number;
      deltaB: number;
      lift: number;
      avgCostPerRV_A: number;
      avgCostPerRV_B: number;
      avgSpend_A: number;
      avgSpend_B: number;
    } | null;
  };
}

export interface PersonaRow {
  id: string;
  name: string;
  archetype: string;
  persona: ViewerPersona | null;
}

export interface ViewerDetail {
  viewer: { id: string; name: string; archetype: string; persona: ViewerPersona | null };
  memories: { key: string; content: string; stability: number; lastSeenEp: number; retrievability: number }[];
  screenings: {
    episodeNumber: number;
    arm: string;
    keepWatching: boolean;
    dropAtBeat: number | null;
    satisfaction: number;
    comment: string | null;
    sentiment: string | null;
    curve: { beat: number; S: number; recalled: string[] }[];
  }[];
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
  fingerprint: string;
  durationMs: number;
  verifiedAt: string;
  aiTokensSpent: 0;
}

export interface ReactionsData {
  reactions: {
    source: 'SIM' | 'HUMAN';
    name: string;
    archetype: string;
    comment: string | null;
    sentiment: string | null;
    dropAtBeat: number | null;
    keepWatching: boolean;
    rating: number | null;
    beatTitle?: string;
  }[];
}

/* ---------------------------------- queries --------------------------------- */

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: () => j<Health>('/api/health'), refetchInterval: 8000 });
}

export function useShows() {
  return useQuery({ queryKey: ['shows'], queryFn: () => j<{ shows: ShowRow[] }>('/api/shows') });
}

export function useShow(id: string | null) {
  return useQuery({
    queryKey: ['show', id],
    queryFn: () => j<ShowDetail>(`/api/shows/${id}`),
    enabled: Boolean(id),
    refetchInterval: 3000,
  });
}

export function useEpisode(id: string | null) {
  return useQuery({
    queryKey: ['episode', id],
    queryFn: () => j<EpisodeDetail>(`/api/episodes/${id}`),
    enabled: Boolean(id),
    refetchInterval: 3000,
  });
}

export function useMetrics(id: string | null) {
  return useQuery({
    queryKey: ['metrics', id],
    queryFn: () => j<MetricsData>(`/api/episodes/${id}/metrics`),
    enabled: Boolean(id),
  });
}

export function useLedger(id: string | null) {
  return useQuery({
    queryKey: ['ledger', id],
    queryFn: () => j<LedgerData>(`/api/shows/${id}/ledger`),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
}

export function useExperiments(id: string | null) {
  return useQuery({
    queryKey: ['experiments', id],
    queryFn: () => j<ExperimentsData>(`/api/shows/${id}/experiments`),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
}

export function useShowAnalytics(id: string | null) {
  return useQuery({
    queryKey: ['analytics', id],
    queryFn: () => j<{ episodes: MetricsData['metrics'][] }>(`/api/shows/${id}/analytics`),
    enabled: Boolean(id),
    refetchInterval: 8000,
  });
}

export function usePersonas(id: string | null) {
  return useQuery({
    queryKey: ['personas', id],
    queryFn: () => j<{ viewers: PersonaRow[] }>(`/api/shows/${id}/personas`),
    enabled: Boolean(id),
  });
}

export function useViewer(showId: string | null, viewerId: string | null, arm: string = 'A') {
  return useQuery({
    queryKey: ['viewer', showId, viewerId, arm],
    queryFn: () => j<ViewerDetail>(`/api/shows/${showId}/viewers/${viewerId}?arm=${arm}`),
    enabled: Boolean(showId && viewerId),
  });
}

export function useReactions(episodeId: string | null) {
  return useQuery({
    queryKey: ['reactions', episodeId],
    queryFn: () => j<ReactionsData>(`/api/episodes/${episodeId}/reactions`),
    enabled: Boolean(episodeId),
  });
}

/** Determinism receipt — replay + byte-compare. Cached for the session; refetch() to re-verify. */
export function useVerifyDeterminism(showId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['verify', showId],
    queryFn: () => j<{ receipt: VerifyReceipt }>(`/api/shows/${showId}/verify`),
    enabled: Boolean(showId) && enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useSubmitReaction(episodeId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; rating: number; comment?: string }) => {
      const { url, init } = post(`/api/episodes/${episodeId}/reactions`, body);
      return j<{ reaction: unknown }>(url, init);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reactions', episodeId] }),
  });
}

/* --------------------------------- mutations -------------------------------- */

export function useCreateShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { url, init } = post('/api/shows', body);
      return j<{ id: string }>(url, init);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows'] }),
  });
}

export function useRunDemo(showId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { url, init } = post(`/api/shows/${showId}/run-demo`);
      return j<{ queued: number }>(url, init);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['show', showId] });
    },
  });
}

export function useRunEpisode(showId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arm: string) => {
      const { url, init } = post(`/api/shows/${showId}/episodes`, { arm });
      return j<{ episodeId: string }>(url, init);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['show', showId] }),
  });
}

export function useGateTest() {
  return useMutation({
    mutationFn: async (episodeId: string) => {
      const { url, init } = post(`/api/episodes/${episodeId}/compile`, { fixture: true });
      return j<{ report: CompileReport }>(url, init);
    },
  });
}

export function useRecompile(showId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (episodeId: string) => {
      const { url, init } = post(`/api/episodes/${episodeId}/compile`);
      return j<{ report: CompileReport }>(url, init);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['show', showId] });
    },
  });
}

export function useRegenPanel(showId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { url, init } = post(`/api/shows/${showId}/panel`, { regenerate: true });
      return j<{ panel: number }>(url, init);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['show', showId] }),
  });
}
