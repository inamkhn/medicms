// ============================================
// MediCMS Desktop v4.0 - Ledger Store
// Live ledger transactions (seeded from mock data; will be backed by SQLite later)
// Replaces direct MOCK_LEDGER imports to ensure reads reflect writes
// ============================================

import { create } from 'zustand';
import { MOCK_LEDGER } from '@/lib/mockData';
import type { LedgerTransaction } from '@/types';

interface LedgerState {
  transactions: LedgerTransaction[];
  addTransaction: (tx: LedgerTransaction) => void;
  getByStudent: (sno: number) => LedgerTransaction[];
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  transactions: [...MOCK_LEDGER],

  addTransaction: (tx) =>
    set((state) => ({ transactions: [...state.transactions, tx] })),

  getByStudent: (sno) => get().transactions.filter((t) => t.studentSno === sno),
}));

export function getNextTxnNo(transactions: LedgerTransaction[], studentSno: number): number {
  const max = Math.max(0, ...transactions.filter(t => t.studentSno === studentSno).map(t => t.txnNo));
  return max + 1;
}
