// ============================================
// MediCMS Desktop — Receipt books: labels and range rules (§24, §57)
//
// A book is a promise: every number between its first and last belongs to one
// counter, and no other book may claim any of them (§24 "Ranges of different
// books cannot overlap"). These are the checks the receipt-books screen runs
// before an Admin saves a book, plus the label and the low-stock sentence every
// other receipts screen prints.
// ============================================

import type { BookStatus, ReceiptBook } from './types.ts';

/** §25 "Receipt number": prefix plus the number, as printed — `R-1043`. */
export function formatReceiptNo(prefix: string, number: number): string {
  return `${prefix}${number}`;
}

/** §57 the range as one line — `R-1001 – R-1050`. */
export function rangeLabel(book: ReceiptBook): string {
  return `${formatReceiptNo(book.prefix, book.from)} – ${formatReceiptNo(book.prefix, book.to)}`;
}

/**
 * §24 "Full is derived from the numbers, never typed in by hand." A closed book
 * stays closed whatever numbers are left in it; otherwise the range decides.
 */
export function bookStateOf(book: ReceiptBook, nextNumber: number | null): BookStatus {
  if (book.status === 'Closed') return 'Closed';
  return nextNumber === null ? 'Full' : 'Active';
}

/**
 * §24 "When fewer than 20 receipts are left, the dashboard shows 'Book 1 has 8
 * receipts left'." The same sentence warns the counter before a payment, so the
 * two screens cannot word it differently. Null while stock is comfortable.
 */
export function lowStockMessage(
  name: string,
  left: number,
  lowStock: number,
): string | null {
  if (left <= 0) return `${name} has no receipts left. Ask an Admin for a new book.`;
  if (left < lowStock) {
    return `${name} has ${left} receipt${left === 1 ? '' : 's'} left.`;
  }
  return null;
}

/** What the receipt-books form collects (§24). Status and the audit dates are derived. */
export interface BookDraft {
  name: string;
  prefix: string;
  from: number;
  to: number;
  assignedTo: string;
}

/**
 * Everything wrong with a book an Admin is about to save (§24, §57), in the order
 * the form shows the fields. Empty means it can be saved.
 *
 * Overlap is judged inside one prefix: `R-1001` and `B-1001` are different
 * numbers, so those two ranges may meet. `excludeId` lets a book be edited
 * against the list it is already part of.
 */
export function bookProblems(
  draft: BookDraft,
  books: readonly ReceiptBook[],
  excludeId?: string,
): string[] {
  const problems: string[] = [];
  const name = draft.name.trim();
  const prefix = draft.prefix.trim();
  const { from, to } = draft;

  if (!name) problems.push('A book needs a name, for example "Book 1".');
  if (!prefix) problems.push('A book needs a prefix, for example "R-".');
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    problems.push('The first and last numbers must be whole numbers.');
  } else if (from < 1 || to < 1) {
    problems.push('Receipt numbers start at 1; a range cannot begin at zero.');
  } else if (from > to) {
    problems.push('The first number must not be after the last number.');
  }
  if (!draft.assignedTo.trim()) {
    problems.push('Choose the counter or user this book belongs to.');
  }

  if (Number.isInteger(from) && Number.isInteger(to) && from <= to && prefix) {
    const other = books.find(
      (book) =>
        book.id !== excludeId &&
        book.prefix.toLowerCase() === prefix.toLowerCase() &&
        from <= book.to &&
        to >= book.from,
    );
    if (other) {
      problems.push(
        `${formatReceiptNo(prefix, from)} to ${formatReceiptNo(prefix, to)} overlaps ` +
          `${other.name} (${rangeLabel(other)}). Ranges of different books cannot overlap.`,
      );
    }
  }

  return problems;
}
