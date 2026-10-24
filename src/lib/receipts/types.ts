// ============================================
// MediCMS Desktop — Receipts: books, numbers and register (§24–§29)
//
// Feature 3 of PAYMENTS_RECEIPTS_LEDGER_DESIGN.md, as data: a book that owns one
// range of numbers for one counter, and the events that consume a number without
// issuing a receipt. Like src/lib/ledger this folder is pure — relative imports
// only, no store, no clock — so the register, the numbering rule and the amount in
// words can be run against §29's sample under `node --test`.
//
// The number is never stored as "the next one": it is derived from what the book
// has consumed (a receipt in the ledger, a spoil, a skip), which is why the
// register can always explain every number (§30 "no silent gaps").
// ============================================

/** §24 "Mode": printed on the app's own paper, or a pre-printed slip book. */
export type ReceiptMode = 'Printed' | 'PrePrinted';

/** §24/§57 "Status". Full is derived from the numbers, never typed in by hand. */
export type BookStatus = 'Active' | 'Full' | 'Closed';

/** §24 — one numbered range, belonging to one counter or user. */
export interface ReceiptBook {
  /** `book-<n>` — stable and never reused. */
  id: string;
  /** For example "Book 1" (§24, §29). */
  name: string;
  /** For example `R-` (§24, §65 "Default receipt prefix"). */
  prefix: string;
  /** First number in the range, inclusive. */
  from: number;
  /** Last number in the range, inclusive. */
  to: number;
  /** The counter or user the book belongs to (§24 "Assigned to"). */
  assignedTo: string;
  mode: ReceiptMode;
  status: BookStatus;
  createdBy: string;
  createdAt: string;
  /** §57 — a book can be closed early, with a reason. */
  closedBy?: string;
  closedAt?: string;
  closeReason?: string;
}

/** §27.3 spoiled, §25 out-of-order skipped — both consume a number. */
export type ReceiptEventKind = 'Spoiled' | 'Skipped';

/** One number that was used up without a receipt being issued for it. */
export interface ReceiptEvent {
  id: string;
  bookId: string;
  number: number;
  kind: ReceiptEventKind;
  /** §27.3 "It needs a reason"; §25 the same for a skipped number. */
  reason: string;
  by: string;
  at: string;
}

/** §28 — the five states a number can be in. */
export type ReceiptStatus = 'Used' | 'Void' | 'Spoiled' | 'Skipped' | 'Unused';

/**
 * What the ledger knows about one issued receipt, as the register needs it. The
 * screen builds these from Payment entries; the core never reads the ledger.
 */
export interface ReceiptFacts {
  /** The number inside the book, parsed from the printed reference. */
  number: number;
  /** The reference exactly as the entry stored it, e.g. `R-1043`. */
  reference: string;
  studentSno: number;
  studentName?: string;
  amount: number;
  date: string;
  by: string;
  /** §27.2 — a voided receipt stays in the register with its number spent. */
  voided: boolean;
  /** §27.1 — every reprint is counted. */
  reprints: number;
}

/** One number of one book, with whatever happened to it (§28, §56.2). */
export interface RegisterRow {
  number: number;
  /** `R-1043` — the label the chip, the table and the receipt all print. */
  label: string;
  status: ReceiptStatus;
  receipt?: ReceiptFacts;
  event?: ReceiptEvent;
}

/** §28 — the register for one book: every number, every count, any gap. */
export interface RegisterSummary {
  rows: RegisterRow[];
  counts: Record<ReceiptStatus, number>;
  /**
   * Numbers at or below the issuing point with no status at all (§56.2
   * "Unaccounted number"). Always empty on well-formed data; reported rather than
   * hidden, because a gap is the warning sign the doc says it is.
   */
  gaps: number[];
  /** The next number the book would issue, or null when the book is full. */
  nextNumber: number | null;
  /** Numbers consumed so far — used, void, spoiled and skipped together. */
  issued: number;
  /** Numbers still to be issued (unused and not passed over). */
  left: number;
}

/**
 * §65 — the payment and receipt settings, with the doc's defaults. Kept beside
 * the rules that read them so a screen cannot invent a different default.
 */
export interface PaymentSettings {
  /** §17 "within 10 minutes of an earlier payment". */
  duplicateWindowMinutes: number;
  /** §17 "An amount above 500,000 asks for a second confirmation". */
  largeAmount: number;
  /** §17 "Credit above 10,000 needs an extra confirmation". */
  creditConfirm: number;
  /** §17/§65 "Back-date limit" — how many days back an Accountant may post. */
  backDateDays: number;
  /** §42/§65 Accountant cap per entry. */
  adjustmentLimit: number;
  /** §43/§65 Accountant cap per student. */
  writeOffLimit: number;
  /** §44/§65 Accountant cap. */
  refundLimit: number;
  /** §41 "overdue for a set number of days (default 30)". */
  lateFineAfterDays: number;
  /** §35/§65 "Cheque bounce fine — 0 until the institute sets one". */
  bounceFine: number;
  /** §24 "fewer than 20 receipts are left". */
  lowStock: number;
  /** §65 "Receipt copies on A4 — 2". */
  receiptCopies: number;
  /** §26/§65 "Receipt footer note" — empty until the institute sets one. */
  receiptFooter: string;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  duplicateWindowMinutes: 10,
  largeAmount: 500_000,
  creditConfirm: 10_000,
  backDateDays: 7,
  adjustmentLimit: 5_000,
  writeOffLimit: 5_000,
  refundLimit: 20_000,
  lateFineAfterDays: 30,
  bounceFine: 0,
  lowStock: 20,
  receiptCopies: 2,
  receiptFooter: '',
};
