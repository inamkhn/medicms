// ============================================
// MediCMS Desktop — Receipt book rules tests (§24, §57)
// The labels every receipts screen prints, the status that is derived from the
// numbers rather than typed, and the range checks an Admin's save runs.
// Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import type { ReceiptBook } from './types.ts';
import {
  bookProblems,
  bookStateOf,
  formatReceiptNo,
  lowStockMessage,
  rangeLabel,
} from './books.ts';

function book(over: Partial<ReceiptBook> = {}): ReceiptBook {
  return {
    id: 'book-1',
    name: 'Book 1',
    prefix: 'R-',
    from: 1001,
    to: 1050,
    assignedTo: 'Kamran Ali',
    mode: 'Printed',
    status: 'Active',
    createdBy: 'Admin',
    createdAt: '2026-10-01T09:00:00',
    ...over,
  };
}

describe('receipt labels (§25)', () => {
  it('prints the prefix and the number together', () => {
    equal(formatReceiptNo('R-', 1043), 'R-1043');
    equal(formatReceiptNo('', 7), '7');
  });

  it('prints a book range as one line', () => {
    equal(rangeLabel(book()), 'R-1001 – R-1050');
  });
});

describe('book status (§24 "Full is derived")', () => {
  it('is Active while numbers are left', () => {
    equal(bookStateOf(book(), 1044), 'Active');
  });

  it('is Full when the range is exhausted', () => {
    equal(bookStateOf(book(), null), 'Full');
  });

  it('stays Closed whatever numbers are left', () => {
    equal(bookStateOf(book({ status: 'Closed' }), 1044), 'Closed');
  });
});

describe('low stock sentence (§24)', () => {
  it('warns below the threshold with the exact wording', () => {
    equal(lowStockMessage('Book 1', 8, 20), 'Book 1 has 8 receipts left.');
  });

  it('says nothing at or above the threshold', () => {
    equal(lowStockMessage('Book 1', 20, 20), null);
    equal(lowStockMessage('Book 1', 45, 20), null);
  });

  it('says one receipt, not one receipts', () => {
    equal(lowStockMessage('Book 1', 1, 20), 'Book 1 has 1 receipt left.');
  });

  it('sends the counter to an Admin when the book is empty', () => {
    equal(lowStockMessage('Book 1', 0, 20), 'Book 1 has no receipts left. Ask an Admin for a new book.');
  });
});

describe('book problems (§24, §57)', () => {
  const draft = { name: 'Book 2', prefix: 'R-', from: 1051, to: 1100, assignedTo: 'Saba' };

  it('accepts a clean book that follows on from the last range', () => {
    deepStrictEqual(bookProblems(draft, [book()]), []);
  });

  it('asks for a name, a prefix and an owner', () => {
    const problems = bookProblems(
      { name: '  ', prefix: '', from: 1051, to: 1100, assignedTo: ' ' },
      [book()],
    );
    equal(problems.length, 3);
    equal(problems[0].includes('name'), true);
    equal(problems[1].includes('prefix'), true);
    equal(problems[2].includes('counter or user'), true);
  });

  it('refuses a reversed range', () => {
    const problems = bookProblems({ ...draft, from: 1100, to: 1051 }, [book()]);
    deepStrictEqual(problems, ['The first number must not be after the last number.']);
  });

  it('refuses a range that starts at zero', () => {
    const problems = bookProblems({ ...draft, from: 0, to: 40 }, []);
    deepStrictEqual(problems, ['Receipt numbers start at 1; a range cannot begin at zero.']);
  });

  it('refuses a range that overlaps another book, and names it', () => {
    const problems = bookProblems({ ...draft, from: 1000, to: 1010 }, [book()]);
    equal(problems.length, 1);
    equal(problems[0].includes('overlaps Book 1'), true);
    equal(problems[0].includes('R-1001 – R-1050'), true);
  });

  it('allows the same numbers under a different prefix', () => {
    deepStrictEqual(bookProblems({ ...draft, prefix: 'B-' }, [book()]), []);
  });

  it('ignores the book being edited', () => {
    const existing = book();
    const problems = bookProblems(
      { name: 'Book 1', prefix: 'R-', from: 1001, to: 1050, assignedTo: 'Kamran Ali' },
      [existing],
      existing.id,
    );
    deepStrictEqual(problems, []);
  });
});
