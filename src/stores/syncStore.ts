// ============================================
// MediCMS Desktop v4.0 - Sync Store
// ============================================

import { create } from 'zustand';
import type { SyncStatusType } from '@/types';

interface SyncState {
  status: SyncStatusType;
  lastSync: string | null;
  pendingCount: number;
  error: string | null;
  
  // Actions
  setOnline: () => void;
  setOffline: () => void;
  setSyncing: () => void;
  setError: (error: string) => void;
  syncComplete: (pushed: number, pulled: number) => void;
  incrementPending: () => void;
  decrementPending: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'online',
  lastSync: null,
  pendingCount: 0,
  error: null,
  
  setOnline: () => set({ status: 'online', error: null }),
  
  setOffline: () => set({ status: 'offline' }),
  
  setSyncing: () => set({ status: 'syncing' }),
  
  setError: (error) => set({ status: 'error', error }),
  
  syncComplete: (_pushed, _pulled) => set({
    status: 'online',
    lastSync: new Date().toISOString(),
    pendingCount: 0,
    error: null,
  }),
  
  incrementPending: () => set((s) => ({ pendingCount: s.pendingCount + 1 })),
  
  decrementPending: () => set((s) => ({ 
    pendingCount: Math.max(0, s.pendingCount - 1) 
  })),
}));

// --- Sync indicator helpers ---
export function getSyncIndicator(status: SyncStatusType): { dot: string; label: string } {
  switch (status) {
    case 'online':
      return { dot: '🟢', label: 'Online' };
    case 'syncing':
      return { dot: '🔄', label: 'Syncing...' };
    case 'offline':
      return { dot: '🔴', label: 'Offline' };
    case 'error':
      return { dot: '🟡', label: 'Sync Error' };
  }
}
