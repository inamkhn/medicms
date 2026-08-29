// ============================================
// MediCMS Desktop v4.0 - Bank Store
// ============================================

import { create } from 'zustand';
import { MOCK_BANK } from '@/lib/mockData';
import type { BankTransaction } from '@/types';

interface BankState {
  transactions: BankTransaction[];
  addTransaction: (tx: BankTransaction) => void;
}

export const useBankStore = create<BankState>((set) => ({
  transactions: [...MOCK_BANK],
  addTransaction: (tx) => set((s) => ({ transactions: [...s.transactions, tx] })),
}));

export function getNextBankSno(transactions: BankTransaction[]): number {
  return Math.max(0, ...transactions.map(t => t.sno)) + 1;
}
