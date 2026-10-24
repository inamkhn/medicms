// ============================================
// MediCMS Desktop — Budget Store (§47, §68)
//
// A plan per cost category per month. The arithmetic — what was spent, what is
// still unpaid and committed, the 80 and 100 percent alerts — lives in
// `src/lib/finance/budgets.ts`; this store only keeps the lines. An Accountant
// may look, but only an Admin edits (§81.9), which the page enforces.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BudgetLine } from '@/lib/finance';
import { setBudgetLine, spreadYearly } from '@/lib/finance';

/**
 * §79.31: the October sample adds up to the document's own 440,000 — with the
 * demo bills (385,000 spent and unpaid) that is the 88 percent it prints.
 */
const SEED_LINES: BudgetLine[] = [
  { categoryId: 'cat-rent', month: '2026-10', amount: 150_000 },
  { categoryId: 'cat-clinical-training', month: '2026-10', amount: 90_000 },
  { categoryId: 'cat-utilities-electric', month: '2026-10', amount: 70_000 },
  { categoryId: 'cat-utilities-internet', month: '2026-10', amount: 30_000 },
  { categoryId: 'cat-books-stationery', month: '2026-10', amount: 40_000 },
  { categoryId: 'cat-other', month: '2026-10', amount: 60_000 },
];

interface BudgetState {
  budgets: BudgetLine[];
  /** §68: set one category's amount for one month; zero clears the line. */
  setBudget: (categoryId: string, month: string, amount: number) => void;
  /** §68 "copy last month": carry every line of one month into another. */
  copyMonth: (fromMonth: string, toMonth: string) => void;
  /** §68 "spread yearly": the same figure in each of the twelve months of a year. */
  spreadYear: (categoryId: string, year: number, amount: number) => void;
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set) => ({
      budgets: SEED_LINES,
      setBudget: (categoryId, month, amount) =>
        set((s) => ({ budgets: setBudgetLine(s.budgets, categoryId, month, amount) })),
      copyMonth: (fromMonth, toMonth) =>
        set((s) => ({
          budgets: s.budgets
            .filter((line) => line.month === fromMonth)
            .reduce((lines, line) => setBudgetLine(lines, line.categoryId, toMonth, line.amount), s.budgets),
        })),
      spreadYear: (categoryId, year, amount) =>
        set((s) => ({
          budgets: spreadYearly(categoryId, year, amount).reduce(
            (lines, line) => setBudgetLine(lines, line.categoryId, line.month, line.amount),
            s.budgets,
          ),
        })),
    }),
    {
      name: 'medicms-budgets',
      version: 2,
      partialize: (state) => ({ budgets: state.budgets }),
      // v1 held the legacy `{ category: 'SAL' | 'BLDG' | 'UTIL' }` rows, which no
      // cost category of §24 answers to; the finance categories replace them (§78.2).
      migrate: (persisted) => {
        const stored = persisted as { budgets?: BudgetLine[] } | undefined;
        const lines = stored?.budgets;
        const valid = Array.isArray(lines) && lines.every((line) => typeof line?.categoryId === 'string');
        return { budgets: valid ? (lines as BudgetLine[]) : SEED_LINES };
      },
    },
  ),
);
