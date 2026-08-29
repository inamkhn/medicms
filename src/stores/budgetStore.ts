// ============================================
// MediCMS Desktop v4.0 - Budget Store
// Monthly budget per expense category
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExpenseCategory } from '@/types';

export interface Budget {
  category: ExpenseCategory;
  month: string; // YYYY-MM
  amount: number;
}

interface BudgetState {
  budgets: Budget[];
  setBudget: (category: ExpenseCategory, month: string, amount: number) => void;
  getBudget: (category: ExpenseCategory, month: string) => number;
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      budgets: [
        { category: 'SAL', month: '2026-03', amount: 60000 },
        { category: 'BLDG', month: '2026-03', amount: 15000 },
        { category: 'UTIL', month: '2026-03', amount: 8000 },
      ],
      setBudget: (category, month, amount) => set((s) => {
        const idx = s.budgets.findIndex(b => b.category === category && b.month === month);
        if (idx >= 0) {
          const next = [...s.budgets];
          next[idx] = { category, month, amount };
          return { budgets: next };
        }
        return { budgets: [...s.budgets, { category, month, amount }] };
      }),
      getBudget: (category, month) => get().budgets.find(b => b.category === category && b.month === month)?.amount ?? 0,
    }),
    { name: 'medicms-budgets' }
  )
);
