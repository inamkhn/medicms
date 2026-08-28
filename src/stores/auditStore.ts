// ============================================
// MediCMS Desktop v4.0 - Audit Store
// Live audit log (seeded from mock data; INSERT-ONLY)
// ============================================

import { create } from 'zustand';
import { MOCK_AUDIT } from '@/lib/mockData';
import type { AuditLog, AuditAction } from '@/types';

interface AuditState {
  logs: AuditLog[];
  addLog: (entry: Omit<AuditLog, 'id' | 'timestamp' | 'synced'>) => void;
}

export const useAuditStore = create<AuditState>((set) => ({
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
}));

export function buildAuditDetails(action: AuditAction, studentSno?: number, extra?: string): string {
  if (extra) return extra;
  if (studentSno) return `SNO: ${studentSno}`;
  return action;
}
