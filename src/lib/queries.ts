'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BeatType, CompileReport, ViewerPersona } from '@/lib/contracts';

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const post = (url: string, body?: unknown, method: 'POST' | 'PATCH' = 'POST') => ({
  url,
  init: { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined },
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
  briefFingerprint?: string | null;
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

export interface ArcBeat {
  index: number;
  type: string;
  title: string;
  tension: number;
  engagement: number | null;
  isKey: boolean;
}

export interface ArcThread {
  key: string;
  title: string;
  plantedEp: number;
  type: string;
  strength: number;
  alive: boolean;
}

export interface ArcEpisode {
  episodeId: string;
  number: number;
  status: string;
  retention: number | null;
  globalBeatStart: number;
  beats: ArcBeat[];
  cliffhanger: { title: string; hookPayoffRate: number | null } | null;
  threadsPlanted: { title: string; type: string }[];
  openLoops: { alive: number; total: number; threads: ArcThread[] };
  cast: { name: string; beats: number }[];
}

export interface ArcData {
  showId: string;
  title: string;
  arms: { arm: string; episodes: ArcEpisode[] }[];
  cast: string[];
}

export interface BriefDirective {
  kind: 'PROTECT_BEAT' | 'CALLBACK' | 'HOOK' | 'COHORT' | 'ECONOMY';
  title: string;
  body: string;
  evidence: string;
  severity: 'high' | 'medium' | 'low';
  check?:
    | { type: 'CALLBACK'; threadTitle: string; withinFirstNBeats: number }
    | { type: 'HOOK'; cliffhangerTitle: string }
    | { type: 'PROTECT_BEAT'; maxFirstHalfSec: number }
    | { type: 'COHORT'; detailDensityMin: number }
    | { type: 'ECONOMY'; reuseRatioMin: number };
}

export interface WriterBriefData {
  showId: string;
  title: string;
  arm: string;
  nextEpisodeNumber: number;
  basedOn: { episodes: number[]; viewers: number };
  directives: BriefDirective[];
  cohort: string | null;
  lenses: { archetype: string; keepRate: number; n: number }[];
  fingerprint: string;
  generatedAt: string;
}

export interface BriefComplianceData {
  episodeId: string;
  episodeNumber: number;
  arm: string;
  briefFingerprint: string | null;
  cohort: string | null;
  rows: { kind: BriefDirective['kind']; title: string; honored: boolean; informational: boolean; evidence: string }[];
  honoredCount: number;
  honoredCheckable: number;
  checkable: number;
  total: number;
  allHonored: boolean;
}

/* ------------------------------- what-if ---------------------------------- */

export interface WhatIfCurvePoint {
  beat: number;
  type: string;
  retention: number;
  baseline: number;
}

export interface WhatIfDrop {
  beat: number;
  viewers: number;
  type: string;
  title: string;
}

export interface WhatIfSegment {
  archetype: string;
  keepRate: number;
  n: number;
  baselineKeepRate: number;
}

export interface WhatIfResult {
  showId: string;
  arm: string;
  episodeNumber: number;
  beatCount: number;
  totalDurationSec: number;
  briefFingerprint: string;
  briefCohort: string | null;
  fingerprint: string;
  compliance: {
    rows: BriefComplianceData['rows'];
    honoredCheckable: number;
    checkable: number;
    total: number;
    allHonored: boolean;
  };
  simulation: {
    viewers: number;
    keepRate: number;
    meanSatisfaction: number;
    curve: WhatIfCurvePoint[];
    drops: WhatIfDrop[];
    segments: WhatIfSegment[];
  };
  baseline: {
    episodeNumber: number;
    keepRate: number;
    meanSatisfaction: number;
    panel: number;
  };
  delta: {
    keepRatePts: number;
    satisfaction: number;
  };
  grade: 'STRONG' | 'PROMISING' | 'MIXED' | 'WEAK';
}

export interface WhatIfTemplate {
  arm: string;
  templateFrom: { episodeId: string; episodeNumber: number };
  beats: Beat[];
  brief: WriterBriefData | null;
}

export interface BriefBundleData {
  markdown: string;
  filename: string;
  sections: { label: string; fingerprint: string; directives: number }[];
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

/** Season arc planner — cross-episode tension, threads, hook payoffs, cast presence. */
export function useShowArc(showId: string | null) {
  return useQuery({
    queryKey: ['arc', showId],
    queryFn: () => j<ArcData>(`/api/shows/${showId}/arc`),
    enabled: Boolean(showId),
    staleTime: 30_000,
  });
}

/** Writer's brief — measured-data directives for the next episode (follows the selected arm).
 *  Pass a cohort archetype to write the brief through that cohort's lens. */
export function useWriterBrief(showId: string | null, arm: string, cohort: string | null = null) {
  return useQuery({
    queryKey: ['brief', showId, arm, cohort],
    queryFn: () =>
      j<{ brief: WriterBriefData }>(`/api/shows/${showId}/brief?arm=${arm}${cohort ? `&cohort=${encodeURIComponent(cohort)}` : ''}`),
    enabled: Boolean(showId),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** Directive-compliance receipt — per-directive proof the writer honored the brief. */
export function useBriefCompliance(episodeId: string | null) {
  return useQuery({
    queryKey: ['brief-compliance', episodeId],
    queryFn: () => j<{ compliance: BriefComplianceData }>(`/api/episodes/${episodeId}/brief-compliance`),
    enabled: Boolean(episodeId),
    refetchInterval: (query) => (query.state.error ? false : 4000),
    retry: false,
  });
}

/** What-if simulator template — the last screened episode's plan as the editable starting point. */
export function useWhatIfTemplate(showId: string | null, arm: string) {
  return useQuery({
    queryKey: ['what-if-template', showId, arm],
    queryFn: () => j<{ template: WhatIfTemplate }>(`/api/shows/${showId}/what-if?arm=${arm}`),
    enabled: Boolean(showId),
    staleTime: 30_000,
  });
}

/** What-if pre-flight dry-run — compliance + panel projection, zero spend. Manual fetch only. */
export function useRunWhatIf(showId: string | null) {
  return useMutation({
    mutationFn: async (body: { arm: string; plan: unknown; cohort?: string }) => {
      const { url, init } = post(`/api/shows/${showId}/what-if`, body);
      return j<{ result: WhatIfResult }>(url, init);
    },
  });
}

/** Writers-room brief bundle — every lens of the current brief as one markdown document. */
export function useBriefBundle(showId: string | null) {
  return useMutation({
    mutationFn: async (arm: string) => {
      return j<{ bundle: BriefBundleData }>(`/api/shows/${showId}/brief-bundle?arm=${arm}`);
    },
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

/** Extend the season order (up to 6) — the loop keeps running past the initial order. */
export function useExtendSeason(showId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (episodeCount: number) => {
      const { url, init } = post(`/api/shows/${showId}`, { episodeCount }, 'PATCH');
      return j<{ show: { id: string; episodeCount: number } }>(url, init);
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
