// ============================================
// MediCMS Desktop v4.0 - Expense Store
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_EXPENSES } from '@/lib/mockData';
import type { Expense } from '@/types';

interface ExpenseState {
  expenses: Expense[];
  addExpense: (exp: Expense) => void;
  updateExpense: (id: string, patch: Partial<Expense>) => void;
}

export const useExpenseStore = create<ExpenseState>()(
  persist(
    (set) => ({
      expenses: [...MOCK_EXPENSES],
      addExpense: (exp) => set((s) => ({ expenses: [...s.expenses, exp] })),
      updateExpense: (id, patch) => set((s) => ({ expenses: s.expenses.map(e => e.id === id ? { ...e, ...patch } : e) })),
    }),
    { name: 'medicms-expenses' }
  )
);
