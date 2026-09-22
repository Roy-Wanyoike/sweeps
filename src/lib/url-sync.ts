'use client';

import { useEffect } from 'react';
import { useSweeps, TabKey } from '@/lib/store';

const TABS: TabKey[] = ['episodes', 'studio', 'audience', 'analytics', 'experiment'];

/**
 * Two-way sync between the sweeps zustand store and the URL query string
 * (?show=..&tab=..&ep=..&view=1) so any dashboard view can be shared as a link.
 * ?view=1 puts the dashboard in read-only present mode (mutations hidden).
 */
export function useUrlSync() {
  const activeShowId = useSweeps((s) => s.activeShowId);
  const activeTab = useSweeps((s) => s.activeTab);
  const selectedEpisodeId = useSweeps((s) => s.selectedEpisodeId);
  const setShow = useSweeps((s) => s.setShow);
  const setTab = useSweeps((s) => s.setTab);
  const selectEpisode = useSweeps((s) => s.selectEpisode);
  const setReadonly = useSweeps((s) => s.setReadonly);

  // hydrate from URL once on mount (URL wins over persisted localStorage)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const show = params.get('show');
    const tab = params.get('tab') as TabKey | null;
    const ep = params.get('ep');
    const view = params.get('view');
    if (show) setShow(show);
    if (tab && TABS.includes(tab)) setTab(tab);
    if (ep) selectEpisode(ep);
    setReadonly(view === '1');
  }, []);

  // reflect store → URL (replaceState, no navigation)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const current = new URLSearchParams(params.toString());
    if (activeShowId) current.set('show', activeShowId);
    else current.delete('show');
    if (activeTab) current.set('tab', activeTab);
    if (selectedEpisodeId) current.set('ep', selectedEpisodeId);
    else current.delete('ep');
    const next = current.toString();
    const prev = params.toString();
    if (next !== prev) {
      const qs = next ? `?${next}` : '';
      window.history.replaceState(null, '', `${window.location.pathname}${qs}`);
    }
  }, [activeShowId, activeTab, selectedEpisodeId]);
}

/** Enter present mode: set the store flag + persist ?view=1 in the URL. */
export function enterPresentMode() {
  useSweeps.getState().setReadonly(true);
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('view', '1');
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

/** Exit present mode: clear the flag + drop ?view from the URL. */
export function exitPresentMode() {
  useSweeps.getState().setReadonly(false);
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.delete('view');
  const qs = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
}

/** Builds the shareable URL for the current view. */
export function buildShareUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.href;
}

/** Builds a read-only present-mode URL for the current view. */
export function buildPresentUrl(): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.searchParams.set('view', '1');
  return url.toString();
}
