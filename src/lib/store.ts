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
  setShow: (id: string | null) => void;
  setArm: (arm: Arm) => void;
  selectEpisode: (id: string | null) => void;
  selectViewer: (id: string | null) => void;
  setTab: (tab: TabKey) => void;
}

export const useSweeps = create<SweepsState>()(
  persist(
    (set) => ({
      activeShowId: null,
      activeArm: 'A',
      selectedEpisodeId: null,
      selectedViewerId: null,
      activeTab: 'episodes',
      setShow: (id) => set({ activeShowId: id, selectedEpisodeId: null, selectedViewerId: null }),
      setArm: (arm) => set({ activeArm: arm }),
      selectEpisode: (id) => set({ selectedEpisodeId: id }),
      selectViewer: (id) => set({ selectedViewerId: id }),
      setTab: (tab) => set({ activeTab: tab }),
    }),
    { name: 'sweeps-ui' }
  )
);
