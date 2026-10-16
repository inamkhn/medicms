// ============================================
// MediCMS Desktop — Ledger: building the entries the screens post
//
// Four screens bill a term — add a demand, promote a student, run a bulk demand,
// take an admission — and each of them has to fill in the same §5 fields: the
// itemised lines the template produces, which term it is, and the due date that
// makes the charge chaseable (§24.1). Written once here rather than four times,
// because a term number or a due date that disagrees between screens is exactly
// the second source of truth §4 is trying to avoid.
//
// Pure in the same way the rest of this folder is: the posting date arrives as an
// argument, so nothing here reads a clock and every case is reproducible.
// ============================================

import type { FeeTemplate } from '@/types';
import { termFeesOf } from '../fee/templateCompat.ts';
import { addDays } from '../dates.ts';
import { entryId, linesTotal } from './entries.ts';
import type { LedgerEntry, LedgerEntryLine } from './types.ts';

/** §5.1 — the fallback when a student has no template to read a due-date rule from. */
export const DEFAULT_TERM_DUE_DAYS = 15;

export interface FeeChargeDraft {
  studentSno: number;
  /** The student's next entry number, from the store (§5). */
  entryNo: number;
  /** Which term is being billed (§5 "Term"). */
  term: number;
  /**
   * Whole rupees the charge stands at. The screen decides — a re-billing uses the
   * template's term total, a promotion uses the rate locked at admission — and the
   * itemisation below has to add up to it (§5).
   */
  amount: number;
  /** The plan the charge is priced from, or null when the student has none. It sets
   *  the itemised lines and the due-date rule (§5.1). */
  template: FeeTemplate | null;
  /** Posting date, local `YYYY-MM-DD` (§5) — the caller's local day. */
  date: string;
  createdBy: string;
  description: string;
  /** Shared by every entry one action posts, so a bulk run reads as one act (§5, §18). */
  actionNo?: string | null;
}

/** The itemised components of one term, as the §54 `[lines]` expander wants them. */
export function termLinesOf(template: FeeTemplate, term: number): LedgerEntryLine[] {
  const billed = termFeesOf(template).terms.find((row) => row.term === term);
  if (!billed) return [];
  return billed.lines
    .filter((line) => line.amount > 0)
    .map((line) => ({ name: line.name, amount: line.amount }));
}

/** When a term's charge is due: the posting day plus the template's own rule (§5.1). */
export function termDueDateOf(template: FeeTemplate | null, date: string): string {
  return addDays(date, template?.termDueDays ?? DEFAULT_TERM_DUE_DAYS);
}

/**
 * A fee charge as a ledger entry (§5, §6): positive whole rupees, itemised, with a
 * term and a due date. `balanceAfter` is a placeholder — the store stamps the
 * running balance from the same fold the ledger check re-derives (§7.3), so no
 * screen decides what the balance figure is.
 */
export function feeChargeEntry(draft: FeeChargeDraft): LedgerEntry {
  const lines = draft.template ? termLinesOf(draft.template, draft.term) : [];
  const lineTotal = linesTotal(lines);
  // §5: the lines must add up to the entry. A student billed at the rate locked at
  // their admission is not billed at today's template, so the template's breakdown
  // is left off rather than stretched to fit a number it never produced.
  const itemised = lineTotal === draft.amount ? lines : undefined;

  return {
    id: entryId(draft.studentSno, draft.entryNo),
    studentSno: draft.studentSno,
    entryNo: draft.entryNo,
    date: draft.date,
    type: 'FeeCharge',
    amount: draft.amount,
    description: draft.description,
    term: draft.term,
    dueDate: termDueDateOf(draft.template, draft.date),
    lines: itemised,
    createdBy: draft.createdBy,
    createdAt: `${draft.date}T00:00:00.000Z`,
    actionNo: draft.actionNo ?? null,
    balanceAfter: 0,
  };
}
