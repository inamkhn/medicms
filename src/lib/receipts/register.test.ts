// ============================================
// MediCMS Desktop — Receipt register tests (§25, §28, §29)
// §29's sample book at the end of 9 October 2026: 43 numbers consumed, 7 unused,
// next R-1044 — with a void and a spoil inside the range, and a gap reported when
// one exists.
// Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { LedgerEntry } from '../ledger/types.ts';
import { entryId } from '../ledger/entries.ts';
import { activeBookFor, bookGate, bookSummaries, receiptFactsOf, receiptRegister } from './register.ts';
import { DEFAULT_PAYMENT_SETTINGS, type ReceiptBook, type ReceiptEvent, type ReceiptFacts } from './types.ts';

const BOOK: ReceiptBook = {
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
};

function facts(number: number, over: Partial<ReceiptFacts> = {}): ReceiptFacts {
  return {
    number,
    reference: `R-${number}`,
    studentSno: 1,
    amount: 1000,
    date: '2026-10-09',
    by: 'Kamran Ali',
    voided: false,
    reprints: 0,
    ...over,
  };
}

/** §29: everything consumed up to R-1043, with R-1039 void and R-1041 spoiled. */
function sample(): { receipts: ReceiptFacts[]; events: ReceiptEvent[] } {
  const receipts: ReceiptFacts[] = [];
  for (let number = 1001; number <= 1043; number += 1) {
    if (number === 1039) receipts.push(facts(1039, { voided: true, studentSno: 3, amount: 20_000 }));
    else if (number === 1041) continue;
    else receipts.push(facts(number, { studentSno: number - 1000, amount: 1000 * (number % 7) }));
  }
  const events: ReceiptEvent[] = [
    {
      id: 'spoiled-1041',
      bookId: BOOK.id,
      number: 1041,
      kind: 'Spoiled',
      reason: 'Slip torn',
      by: 'Kamran Ali',
      at: '2026-10-09T10:05:00',
    },
  ];
  return { receipts, events };
}

describe('receipt register (§28, §29)', () => {
  it('counts the §29 sample the way the doc does', () => {
    const { receipts, events } = sample();
    const summary = receiptRegister(BOOK, receipts, events);

    equal(summary.rows.length, 50);
    equal(summary.issued, 43);
    equal(summary.left, 7);
    equal(summary.nextNumber, 1044);
    deepStrictEqual(summary.gaps, []);
    deepStrictEqual(summary.counts, { Used: 41, Void: 1, Spoiled: 1, Skipped: 0, Unused: 7 });
  });

  it('marks the voided number Void and never frees it', () => {
    const { receipts, events } = sample();
    const row = receiptRegister(BOOK, receipts, events).rows.find((r) => r.number === 1039);
    ok(row);
    equal(row.status, 'Void');
    equal(row.label, 'R-1039');
    equal(row.receipt?.amount, 20_000);
  });

  it('marks a spoiled number with its reason', () => {
    const row = receiptRegister(BOOK, sample().receipts, sample().events).rows.find(
      (r) => r.number === 1041,
    );
    ok(row);
    equal(row.status, 'Spoiled');
    equal(row.event?.reason, 'Slip torn');
  });

  it('reports a gap instead of hiding it', () => {
    const { receipts, events } = sample();
    const holed = receipts.filter((row) => row.number !== 1020);
    const summary = receiptRegister(BOOK, holed, events);
    deepStrictEqual(summary.gaps, [1020]);
    equal(summary.nextNumber, 1044);
    equal(summary.left, 7);
  });

  it('treats a skipped number as consumed (§25 out-of-order use)', () => {
    const { receipts, events: spoiled } = sample();
    const events: ReceiptEvent[] = [
      ...spoiled,
      {
        id: 'skip-1020',
        bookId: BOOK.id,
        number: 1020,
        kind: 'Skipped',
        reason: 'Slip missing from the book',
        by: 'Accountant',
        at: '2026-10-09T10:10:00',
      },
    ];
    const summary = receiptRegister(BOOK, receipts.filter((r) => r.number !== 1020), events);
    equal(summary.rows.find((r) => r.number === 1020)?.status, 'Skipped');
    deepStrictEqual(summary.gaps, []);
    equal(summary.counts.Skipped, 1);
  });

  it('is full and has no next number when the last number is used', () => {
    const receipts = [facts(1001), facts(1002)];
    const summary = receiptRegister({ ...BOOK, from: 1001, to: 1002 }, receipts, []);
    equal(summary.nextNumber, null);
    equal(summary.left, 0);
    equal(summary.issued, 2);
  });

  it('ignores receipts that belong to another range', () => {
    const summary = receiptRegister({ ...BOOK, from: 1001, to: 1002 }, [facts(1001), facts(2000)], []);
    equal(summary.counts.Used, 1);
  });
});

describe('book summaries and the active book (§24)', () => {
  const other: ReceiptBook = { ...BOOK, id: 'book-2', name: 'Book 2', from: 1051, to: 1100, assignedTo: 'Saba' };
  const closed: ReceiptBook = { ...BOOK, id: 'book-0', name: 'Book 0', from: 901, to: 950, status: 'Closed' };

  it('lists Active first, then the rest by range', () => {
    const slots = bookSummaries([closed, other, BOOK], [], []);
    deepStrictEqual(slots.map((slot) => slot.book.name), ['Book 1', 'Book 2', 'Book 0']);
  });

  it('finds the counter\'s own active book', () => {
    const slots = bookSummaries([closed, other, BOOK], [], []);
    equal(activeBookFor(slots, 'Kamran Ali')?.book.name, 'Book 1');
    equal(activeBookFor(slots, 'Nobody'), null);
  });

  it('still returns a book whose range is used up, so the gate can say "full"', () => {
    const spent = bookSummaries([{ ...BOOK, from: 1001, to: 1001 }], [facts(1001)], []);
    const slot = activeBookFor(spent, 'Kamran Ali');
    equal(slot?.book.name, 'Book 1');
    equal(bookGate(slot, DEFAULT_PAYMENT_SETTINGS).problem, 'Book 1 is full. Ask an Admin for a new book.');
  });

  it('prefers a book with numbers left when two are active', () => {
    const fresh = { ...BOOK, id: 'book-9', name: 'Book 9', from: 901, to: 1000 };
    const slots = bookSummaries([{ ...fresh }, BOOK], [], []);
    const spent = bookSummaries([{ ...BOOK, from: 1001, to: 1001 }, fresh], [facts(1001)], []);
    equal(activeBookFor(slots, 'Kamran Ali')?.book.name, 'Book 9');
    equal(activeBookFor(spent, 'Kamran Ali')?.book.name, 'Book 9');
  });
});

describe('the payment book gate (§17, §25)', () => {
  it('blocks with the Admin sentence when there is no book', () => {
    const gate = bookGate(null, DEFAULT_PAYMENT_SETTINGS);
    equal(gate.ok, false);
    equal(gate.problem, 'No active receipt book for this counter. Ask an Admin to assign one.');
    equal(gate.nextLabel, null);
  });

  it('gives the automatic number, never a typed one', () => {
    const slots = bookSummaries([{ ...BOOK, to: 1100 }], [facts(1042)], []);
    const gate = bookGate(activeBookFor(slots, 'Kamran Ali'), DEFAULT_PAYMENT_SETTINGS);
    equal(gate.ok, true);
    equal(gate.nextNumber, 1043);
    equal(gate.nextLabel, 'R-1043');
    equal(gate.warning, null);
  });

  it('warns before a book runs out', () => {
    const receipts = Array.from({ length: 44 }, (_, i) => facts(1001 + i));
    const slots = bookSummaries([BOOK], receipts, []);
    const gate = bookGate(activeBookFor(slots, 'Kamran Ali'), DEFAULT_PAYMENT_SETTINGS);
    equal(gate.ok, true);
    equal(gate.warning, 'Book 1 has 6 receipts left.');
  });

  it('blocks when the book is full', () => {
    const receipts = Array.from({ length: 50 }, (_, i) => facts(1001 + i));
    const slots = bookSummaries([BOOK], receipts, []);
    const gate = bookGate(activeBookFor(slots, 'Kamran Ali'), DEFAULT_PAYMENT_SETTINGS);
    equal(gate.ok, false);
    equal(gate.problem, 'Book 1 is full. Ask an Admin for a new book.');
  });
});

describe('receipts read back from the ledger (§27, §28)', () => {
  function payment(no: number, reference: string, over: Partial<LedgerEntry> = {}): LedgerEntry {
    return {
      id: entryId(1, no),
      studentSno: 1,
      entryNo: no,
      date: '2026-10-09',
      type: 'Payment',
      amount: 25_000,
      description: 'Fee payment',
      reference,
      paymentMode: 'Cash',
      createdBy: 'Kamran Ali',
      createdAt: '2026-10-09T14:15:00',
      balanceAfter: 0,
      ...over,
    };
  }

  it('reads a payment as a used receipt', () => {
    const entries = [payment(1, 'R-1043')];
    const [row] = receiptFactsOf(entries, BOOK);
    equal(row.number, 1043);
    equal(row.voided, false);
    equal(row.amount, 25_000);
  });

  it('marks a payment a reversal points at as void', () => {
    const paid = payment(1, 'R-1043');
    const entries: LedgerEntry[] = [
      paid,
      { ...payment(2, 'R-1043'), id: entryId(1, 2), type: 'Reversal', linkedEntryId: paid.id },
    ];
    const [row] = receiptFactsOf(entries, BOOK);
    equal(row.voided, true);
  });

  it('counts reprints from the audit log', () => {
    const entries = [payment(1, 'R-1043')];
    const [row] = receiptFactsOf(entries, BOOK, new Map([['R-1043', 2]]));
    equal(row.reprints, 2);
  });

  it('ignores references from another book or another type', () => {
    const entries = [
      payment(1, 'R-9'),
      payment(2, 'R-1043', { type: 'FeeCharge' }),
      payment(3, 'R-1044'),
    ];
    deepStrictEqual(receiptFactsOf(entries, BOOK).map((row) => row.number), [1044]);
  });
});
