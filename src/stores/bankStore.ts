// ============================================
// MediCMS Desktop v4.0 - Bank Store
// Bank transactions, persisted alongside the ledger so a deposit made for a
// receipt is still there after a reload - and so is the expense that links to it.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_BANK } from '@/lib/mockData';
import type { BankTransaction } from '@/types';

interface BankState {
  transactions: BankTransaction[];
  addTransaction: (tx: BankTransaction) => void;
}

export const useBankStore = create<BankState>()(
  persist(
    (set) => ({
      transactions: [...MOCK_BANK],
      addTransaction: (tx) => set((s) => ({ transactions: [...s.transactions, tx] })),
    }),
    {
      name: 'medicms-bank',
      partialize: (s) => ({ transactions: s.transactions }),
    }
  )
);

export function getNextBankSno(transactions: BankTransaction[]): number {
  return Math.max(0, ...transactions.map(t => t.sno)) + 1;
}
