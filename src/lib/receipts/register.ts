// ============================================
// MediCMS Desktop — Receipts: the register and the book gate (§25, §28, §29)
//
// §23 "Every receipt number is accounted for: used, void, spoiled or unused. No
// silent gaps." The register is that promise made visible: one row per number in
// the book, each with its status, and a gap reported rather than hidden.
//
// The next number is never stored. It is the highest consumed number plus one,
// which is why a void, a spoil or a skip can never free a number for reuse
// (§25 "A number is never reused, even when its receipt is void").
// ============================================

import { reversedEntryIds } from '../ledger/entries.ts';
import type { LedgerEntry } from '../ledger/types.ts';
import { bookStateOf, formatReceiptNo, lowStockMessage } from './books.ts';
import type {
  PaymentSettings,
  ReceiptBook,
  ReceiptEvent,
  ReceiptFacts,
  ReceiptStatus,
  RegisterRow,
  RegisterSummary,
} from './types.ts';

const ALL_STATUSES: ReceiptStatus[] = ['Used', 'Void', 'Spoiled', 'Skipped', 'Unused'];

/**
 * §28 the register for one book: every number from first to last, the counts per
 * status, the next number and how many are left. §29's sample — 1001 to 1050
 * with everything consumed up to R-1043 — comes out as 43 issued, 7 left, next
 * R-1044.
 */
export function receiptRegister(
  book: ReceiptBook,
  receipts: readonly ReceiptFacts[],
  events: readonly ReceiptEvent[],
): RegisterSummary {
  const factsByNumber = new Map<number, ReceiptFacts>();
  for (const facts of receipts) {
    if (facts.number >= book.from && facts.number <= book.to) factsByNumber.set(facts.number, facts);
  }
  const eventsByNumber = new Map<number, ReceiptEvent>();
  for (const event of events) {
    if (event.number >= book.from && event.number <= book.to) eventsByNumber.set(event.number, event);
  }

  const rows: RegisterRow[] = [];
  const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<ReceiptStatus, number>;
  let highest = book.from - 1;

  for (let number = book.from; number <= book.to; number += 1) {
    const receipt = factsByNumber.get(number);
    const event = eventsByNumber.get(number);
    let status: ReceiptStatus = 'Unused';
    if (receipt) status = receipt.voided ? 'Void' : 'Used';
    else if (event) status = event.kind;

    counts[status] += 1;
    if (status !== 'Unused' && number > highest) highest = number;
    rows.push({
      number,
      label: formatReceiptNo(book.prefix, number),
      status,
      receipt,
      event,
    });
  }

  // A hole below the issuing point: a number that was passed over without a
  // void, spoil or skip to explain it (§28 "highlights any gap").
  const gaps = rows
    .filter((row) => row.status === 'Unused' && row.number <= highest)
    .map((row) => row.number);

  const nextNumber = highest >= book.to ? null : highest + 1;

  return {
    rows,
    counts,
    gaps,
    nextNumber,
    issued: counts.Used + counts.Void + counts.Spoiled + counts.Skipped,
    left: nextNumber === null ? 0 : book.to - nextNumber + 1,
  };
}

/** One book with its register — what the receipts list and the book gate read. */
export interface BookSlot {
  book: ReceiptBook;
  summary: RegisterSummary;
}

/**
 * Every book with its register, Active first, then Full, then Closed, oldest
 * range first inside a group — the order §56.1's list shows.
 */
export function bookSummaries(
  books: readonly ReceiptBook[],
  receipts: readonly ReceiptFacts[],
  events: readonly ReceiptEvent[],
): BookSlot[] {
  const rank: Record<string, number> = { Active: 0, Full: 1, Closed: 2 };
  return books
    .map((book) => ({ book, summary: receiptRegister(book, receipts, events) }))
    .sort((a, b) => rank[bookStateOf(a.book, a.summary.nextNumber)] - rank[bookStateOf(b.book, b.summary.nextNumber)] || a.book.from - b.book.from);
}

/**
 * §24 "A counter has one Active book at a time." If data ever holds two, the
 * older range wins, so numbering continues in the book already in use instead of
 * jumping between them; a book with numbers left is preferred to an exhausted
 * one. An exhausted book is still returned — the gate's message ("Book 1 is
 * full") is more use to the counter than "no active book".
 */
export function activeBookFor(slots: readonly BookSlot[], counter: string): BookSlot | null {
  const mine = slots
    .filter((slot) => slot.book.assignedTo === counter && slot.book.status === 'Active')
    .sort(
      (a, b) =>
        Number(a.summary.nextNumber === null) - Number(b.summary.nextNumber === null) ||
        a.book.from - b.book.from,
    );
  return mine[0] ?? null;
}

/** §17 receipt-book row: whether a payment can be given a number at all. */
export interface BookGate {
  ok: boolean;
  /** Blocks the save — no active book, or the book is full. */
  problem: string | null;
  /** §24 "fewer than 20 receipts are left" — shown, never blocking. */
  warning: string | null;
  /** The number this payment will take, and its printed label. */
  nextNumber: number | null;
  nextLabel: string | null;
}

/**
 * §17 "No active book, or the book is full: blocked with a message to ask an
 * Admin for a new book." §25 "The next number is automatic. Operators cannot
 * type a free number." — so the gate returns the number the receipt will carry.
 */
export function bookGate(slot: BookSlot | null, settings: PaymentSettings): BookGate {
  if (!slot) {
    return {
      ok: false,
      problem: 'No active receipt book for this counter. Ask an Admin to assign one.',
      warning: null,
      nextNumber: null,
      nextLabel: null,
    };
  }
  const { book, summary } = slot;
  if (summary.nextNumber === null) {
    return {
      ok: false,
      problem: `${book.name} is full. Ask an Admin for a new book.`,
      warning: null,
      nextNumber: null,
      nextLabel: null,
    };
  }
  return {
    ok: true,
    problem: null,
    warning: lowStockMessage(book.name, summary.left, settings.lowStock),
    nextNumber: summary.nextNumber,
    nextLabel: formatReceiptNo(book.prefix, summary.nextNumber),
  };
}

/**
 * The receipt numbers a book has issued, read from the ledger's payment entries.
 * A receipt is Void when a Reversal points at its payment (§27.2) — the number
 * stays spent either way (§28).
 *
 * `reprints` is the audit log's count per printed reference (§27.1 "each reprint
 * is counted"); the register shows it beside the number.
 */
export function receiptFactsOf(
  entries: readonly LedgerEntry[],
  book: ReceiptBook,
  reprints: ReadonlyMap<string, number> = new Map(),
): ReceiptFacts[] {
  const reversed = reversedEntryIds(entries);
  const facts: ReceiptFacts[] = [];
  for (const entry of entries) {
    if (entry.type !== 'Payment' || !entry.reference) continue;
    const number = numberIn(book, entry.reference);
    if (number === null) continue;
    facts.push({
      number,
      reference: entry.reference,
      studentSno: entry.studentSno,
      amount: entry.amount,
      date: entry.date,
      by: entry.createdBy,
      voided: reversed.has(entry.id),
      reprints: reprints.get(entry.reference) ?? 0,
    });
  }
  return facts;
}

/** `R-1043` inside this book's range → 1043; anything else → null. */
function numberIn(book: ReceiptBook, reference: string): number | null {
  if (!reference.startsWith(book.prefix)) return null;
  const number = Number(reference.slice(book.prefix.length));
  if (!Number.isInteger(number)) return null;
  return number >= book.from && number <= book.to ? number : null;
}
