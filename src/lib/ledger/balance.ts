// ============================================
// MediCMS Desktop — Ledger: the balance is always derived (§4, §6, §7.3)
//
// "The balance is always calculated from entries, never stored as a number that
// can drift" (§4). Everything the app prints as a balance comes from here, from
// the entry list alone — the stored `balanceAfter` is never an input.
// ============================================

import { entryDirection, entryResolver } from './entries.ts';
import type { LedgerEntry, LedgerEntryType } from './types.ts';

/** §6: **Balance** = entries that increase − entries that reduce. */
export interface BalanceSummary {
  increases: number;
  reduces: number;
  balance: number;
  /** Gross rupees per type, so a statement can name its own columns (§9.1). */
  byType: Record<LedgerEntryType, number>;
}

const ALL_TYPES: readonly LedgerEntryType[] = [
  'OpeningBalanceDues',
  'OpeningBalanceCredit',
  'FeeCharge',
  'SpecialCharge',
  'AdjustmentAdd',
  'Concession',
  'Payment',
  'AdjustmentReduce',
  'WriteOff',
  'Refund',
  'Reversal',
];

function emptyByType(): Record<LedgerEntryType, number> {
  return Object.fromEntries(ALL_TYPES.map((type) => [type, 0])) as Record<LedgerEntryType, number>;
}

/**
 * One pass over a student's entries. Reversals need the full list to know which
 * way they point, so the direction table is resolved against `entries` itself.
 */
export function computeEntryBalance(entries: readonly LedgerEntry[]): BalanceSummary {
  const resolve = entryResolver(entries);
  const byType = emptyByType();
  let increases = 0;
  let reduces = 0;
  for (const entry of entries) {
    byType[entry.type] += entry.amount;
    if (entryDirection(entry, resolve) === 1) increases += entry.amount;
    else reduces += entry.amount;
  }
  return { increases, reduces, balance: increases - reduces, byType };
}

/** The figure every screen labels "Balance". Positive = dues, negative = credit. */
export function liveBalanceOf(studentSno: number, entries: readonly LedgerEntry[]): number {
  return computeEntryBalance(entries.filter((e) => e.studentSno === studentSno)).balance;
}

/** Ledger order: the posting date, then the entry number within that day (§8). */
export function chronological(entries: readonly LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) =>
    a.date === b.date ? a.entryNo - b.entryNo : a.date < b.date ? -1 : 1,
  );
}

/** One row of the ledger: the entry, its signed effect and the running balance. */
export interface LedgerRow {
  entry: LedgerEntry;
  /** Rupees with the sign the §54 colour rule reads (+ dues / − credit). */
  signed: number;
  running: number;
}

/**
 * The running-balance column, in the order §8 prints it. Accumulated with a fold
 * so no render-scope variable is reassigned, and `resolve` is built once for the
 * whole list rather than per row.
 */
export function runningBalances(entries: readonly LedgerEntry[]): LedgerRow[] {
  const resolve = entryResolver(entries);
  let running = 0;
  return chronological(entries).map((entry) => {
    const signed = entryDirection(entry, resolve) * entry.amount;
    running += signed;
    return { entry, signed, running };
  });
}

/**
 * The stored copy of the running balance for a batch that is about to be appended
 * (§7.3 allows the copy "for speed", the ledger check re-verifies it).
 *
 * Screens post entries without deciding the figure themselves: the number written
 * is the one the fold above produces, so a fresh posting cannot disagree with the
 * balance the same code computes. Existing entries are never rewritten — append-
 * only (§7.1) — so if an older stored copy is already wrong, the check says so
 * rather than this quietly repairing history.
 */
export function withStoredBalances(
  existing: readonly LedgerEntry[],
  batch: readonly LedgerEntry[],
): LedgerEntry[] {
  const posted = new Set(batch.map((entry) => entry.id));
  const runningById = new Map<string, number>();

  const students = new Set(batch.map((entry) => entry.studentSno));
  for (const sno of students) {
    const list = [...existing, ...batch].filter((entry) => entry.studentSno === sno);
    for (const row of runningBalances(list)) {
      if (posted.has(row.entry.id)) runningById.set(row.entry.id, row.running);
    }
  }

  return batch.map((entry) => {
    const running = runningById.get(entry.id);
    return running === undefined ? entry : { ...entry, balanceAfter: running };
  });
}
