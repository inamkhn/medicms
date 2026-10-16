// ============================================
// MediCMS Desktop v4.0 - Audit Store
// Live audit log, INSERT-ONLY and persisted, so the history an operator wrote
// before closing the app is still there when they open it again.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_AUDIT } from '@/lib/mockData';
import type { AuditLog, AuditAction } from '@/types';

interface AuditState {
  logs: AuditLog[];
  addLog: (entry: Omit<AuditLog, 'id' | 'timestamp' | 'synced'>) => void;
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set) => ({
      logs: [...MOCK_AUDIT],

      addLog: (entry) =>
        set((state) => ({
          logs: [
            {
              ...entry,
              id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp: new Date().toISOString(),
              synced: false,
            } as AuditLog,
            ...state.logs,
          ],
        })),
    }),
    {
      name: 'medicms-audit',
      partialize: (s) => ({ logs: s.logs }),
    }
  )
);

export function buildAuditDetails(action: AuditAction, studentSno?: number, extra?: string): string {
  if (extra) return extra;
  if (studentSno) return `SNO: ${studentSno}`;
  return action;
}
