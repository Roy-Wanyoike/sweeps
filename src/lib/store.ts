'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Arm = 'A' | 'B';
export type TabKey = 'studio' | 'episodes' | 'audience' | 'analytics' | 'experiment';

interface SweepsState {
  activeShowId: string | null;
  activeArm: Arm;
  selectedEpisodeId: string | null;
  selectedViewerId: string | null;
  activeTab: TabKey;
  /** Present/share mode: hide all mutating controls (URL-driven, never persisted). */
  readonly: boolean;
  setShow: (id: string | null) => void;
  setArm: (arm: Arm) => void;
  selectEpisode: (id: string | null) => void;
  selectViewer: (id: string | null) => void;
  setTab: (tab: TabKey) => void;
  setReadonly: (v: boolean) => void;
}

export const useSweeps = create<SweepsState>()(
  persist(
    (set) => ({
      activeShowId: null,
      activeArm: 'A',
      selectedEpisodeId: null,
      selectedViewerId: null,
      activeTab: 'episodes',
      readonly: false,
      setShow: (id) => set({ activeShowId: id, selectedEpisodeId: null, selectedViewerId: null }),
      setArm: (arm) => set({ activeArm: arm }),
      selectEpisode: (id) => set({ selectedEpisodeId: id }),
      selectViewer: (id) => set({ selectedViewerId: id }),
      setTab: (tab) => set({ activeTab: tab }),
      setReadonly: (v) => set({ readonly: v }),
    }),
    {
      name: 'sweeps-ui',
      partialize: (s) => ({
        activeShowId: s.activeShowId,
        activeArm: s.activeArm,
        selectedEpisodeId: s.selectedEpisodeId,
        selectedViewerId: s.selectedViewerId,
        activeTab: s.activeTab,
      }),
    }
  )
);
