// ============================================
// MediCMS Desktop v4.0 - Settings Store
// Persisted UI preferences (e.g. show test records)
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  showTestRecords: boolean;
  setShowTestRecords: (v: boolean) => void;
  toggleShowTestRecords: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      showTestRecords: false,
      setShowTestRecords: (v) => set({ showTestRecords: v }),
      toggleShowTestRecords: () => set((s) => ({ showTestRecords: !s.showTestRecords })),
    }),
    { name: 'medicms-settings' }
  )
);
