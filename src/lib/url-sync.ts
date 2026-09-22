'use client';

import { useEffect } from 'react';
import { useSweeps, TabKey } from '@/lib/store';

const TABS: TabKey[] = ['episodes', 'studio', 'audience', 'analytics', 'experiment'];

/**
 * Two-way sync between the sweeps zustand store and the URL query string
 * (?show=..&tab=..&ep=..) so any dashboard view can be shared as a link.
 */
export function useUrlSync() {
  const activeShowId = useSweeps((s) => s.activeShowId);
  const activeTab = useSweeps((s) => s.activeTab);
  const selectedEpisodeId = useSweeps((s) => s.selectedEpisodeId);
  const setShow = useSweeps((s) => s.setShow);
  const setTab = useSweeps((s) => s.setTab);
  const selectEpisode = useSweeps((s) => s.selectEpisode);

  // hydrate from URL once on mount (URL wins over persisted localStorage)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const show = params.get('show');
    const tab = params.get('tab') as TabKey | null;
    const ep = params.get('ep');
    if (show) setShow(show);
    if (tab && TABS.includes(tab)) setTab(tab);
    if (ep) selectEpisode(ep);
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

/** Builds the shareable URL for the current view. */
export function buildShareUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.href;
}
