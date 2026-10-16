// ============================================
// MediCMS Desktop — Ledger: entry model (§5, §6)
//
// One trustworthy list of every money entry for a student (§4). This folder is the
// calculation core of PAYMENTS_RECEIPTS_LEDGER_DESIGN.md Feature 1 and is
// deliberately dependency-free in the same way src/lib/fee is: relative imports
// only between these modules, no store, no component and no clock, so every
// function can be run against the §8 sample ledgers and stay reproducible under
// `node --test`.
//
// The rule the whole model rests on (§1, §6): an amount is ALWAYS a positive
// number of whole rupees and the TYPE decides which way it moves the balance.
// Charges are no longer stored as negative discounts.
// ============================================

import type { Allocation } from '../fee/types.ts';

/**
 * The eleven entry types of §6. Direction comes from the type (see entries.ts),
 * never from the sign of a number, so a report can always tell a real concession
 * from a charge.
 */
export type LedgerEntryType =
  | 'OpeningBalanceDues'
  | 'OpeningBalanceCredit'
  | 'FeeCharge'
  | 'SpecialCharge'
  | 'AdjustmentAdd'
  | 'Concession'
  | 'Payment'
  | 'AdjustmentReduce'
  | 'WriteOff'
  | 'Refund'
  | 'Reversal';

/** One itemised component of a fee charge (§5 "Lines", fee design §24). */
export interface LedgerEntryLine {
  name: string;
  amount: number;
}

/**
 * One line in a student's ledger (§5). Entries are never edited or deleted: a
 * mistake is fixed by a Reversal that points back at them (§7.1).
 */
export interface LedgerEntry {
  /** `e-<studentSno>-<entryNo>` — deterministic, so it cannot be reused (§5). */
  id: string;
  studentSno: number;
  /** Unique per student and never reused; the display number in the ledger. */
  entryNo: number;
  /** Posting date, local `YYYY-MM-DD` — not a UTC split (§5, §7.4). */
  date: string;
  type: LedgerEntryType;
  /** Whole rupees, always positive (§6). */
  amount: number;
  /** Plain words, e.g. "Term 1 fee charge" (§5). */
  description: string;
  /** Receipt number, cheque number, bank reference… (§5). */
  reference?: string | null;
  /** For fee charges: which term (§5). */
  term?: number | null;
  /** For fee charges, special charges and Adjustment (add) (§5). */
  dueDate?: string | null;
  /** For fee charges: the itemised components (§5). */
  lines?: LedgerEntryLine[];
  /** Concessions → the charge reduced; reversals → the entry reversed (§5). */
  linkedEntryId?: string | null;
  /** Which fee charge a payment paid off (§5, §25). */
  allocations?: Allocation[];
  /** Required for concessions, adjustments, write-offs, refunds and reversals (§5). */
  reason?: string | null;
  createdBy: string;
  createdAt: string;
  /** Filled in when approval was needed (§5, §46). */
  approvedBy?: string | null;
  /** Entries created by one action share it, so a payment, its bank deposit and
   *  its audit entry can be seen together (§5, §18). */
  actionNo?: string | null;
  /** Where the money physically came from; set on payments. */
  paymentMode?: PaymentMode;
  /**
   * Balance after this entry, stored only for speed (§7.3). Nothing may compute
   * from it: the ledger and every report read the recomputed running balance, and
   * the ledger check tool re-derives this figure and reports any difference.
   */
  balanceAfter: number;
}

/** Where the money physically came from (§14, §32). */
export type PaymentMode = 'Cash' | 'Bank' | 'Online' | 'Cheque';
