// ============================================
// MediCMS Desktop — Day book tests (§9.2, §60)
// §9.2's sample totals for 9 October 2026 — cash 9 / 112,500, bank 2 / 50,000,
// online 2 / 15,000, cheque 1 / 10,000, total 14 / 187,500 — plus a void that
// must leave the collected figures and the counter filter operators see.
// Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import type { LedgerEntry, LedgerEntryType, PaymentMode } from '../ledger/types.ts';
import { cashTaken, dayBook } from './daybook.ts';

const DAY = '2026-10-09';

let seq = 0;

function entry(over: Partial<LedgerEntry> & { type: LedgerEntryType; amount: number }): LedgerEntry {
  seq += 1;
  return {
    id: `e-${over.studentSno ?? 1}-${seq}`,
    studentSno: 1,
    entryNo: seq,
    date: DAY,
    description: '',
    createdBy: 'Kamran Ali',
    createdAt: `2026-10-09T${String(9 + (seq % 8)).padStart(2, '0')}:15:00`,
    balanceAfter: 0,
    ...over,
  };
}

function payment(amount: number, mode: PaymentMode, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return entry({ type: 'Payment', amount, paymentMode: mode, reference: `R-${1000 + seq}`, ...over });
}

/** §9.2: 9 cash, 2 bank, 2 online, 1 cheque — 14 receipts, 187,500. */
function sampleDay(): LedgerEntry[] {
  const cash = Array.from({ length: 9 }, () => payment(12_500, 'Cash'));
  const bank = [payment(25_000, 'Bank'), payment(25_000, 'Bank')];
  const online = [payment(7_500, 'Online'), payment(7_500, 'Online')];
  const cheque = [payment(10_000, 'Cheque')];
  return [...cash, ...bank, ...online, ...cheque];
}

describe('day book — totals', () => {
  it('matches §9.2’s sample totals by mode', () => {
    const book = dayBook(sampleDay(), { date: DAY });
    deepStrictEqual(
      book.byMode.map((row) => [row.mode, row.count, row.amount]),
      [
        ['Cash', 9, 112_500],
        ['Bank', 2, 50_000],
        ['Online', 2, 15_000],
        ['Cheque', 1, 10_000],
      ],
    );
    equal(book.collectedCount, 14);
    equal(book.collected, 187_500);
    equal(cashTaken(book), 112_500);
  });

  it('ignores another day entirely', () => {
    const other = dayBook(sampleDay(), { date: '2026-10-10' });
    equal(other.rows.length, 0);
    equal(other.collected, 0);
    deepStrictEqual(other.byType, []);
  });

  it('keeps the four mode lines even when only one is used', () => {
    const book = dayBook([payment(1_000, 'Cash')], { date: DAY });
    equal(book.byMode.length, 4);
    equal(book.byMode[0].amount, 1_000);
    equal(book.byMode[3].amount, 0);
  });
});

describe('day book — voids and other entries', () => {
  it('moves a voided receipt out of collected and into the voids line', () => {
    const kept = payment(30_000, 'Cash');
    const voided = payment(20_000, 'Cash');
    const reversal = entry({ type: 'Reversal', amount: 20_000, linkedEntryId: voided.id, reason: 'Wrong student, corrected' });
    const book = dayBook([kept, voided, reversal], { date: DAY });

    equal(book.collected, 30_000);
    equal(book.collectedCount, 1);
    deepStrictEqual(book.voids, { count: 1, amount: 20_000 });
    equal(book.rows.find((row) => row.id === voided.id)?.voided, true);
  });

  it('totals by entry type without calling a concession money collected (§60)', () => {
    const book = dayBook(
      [
        payment(25_000, 'Cash'),
        entry({ type: 'Concession', amount: 12_000, reason: 'Management decision' }),
        entry({ type: 'Concession', amount: 12_000, reason: 'Sibling discount' }),
        entry({ type: 'SpecialCharge', amount: 2_500, dueDate: '2026-10-24' }),
        entry({ type: 'Refund', amount: 2_000, reason: 'Overpaid, returned' }),
      ],
      { date: DAY },
    );

    equal(book.collected, 25_000);
    const concession = book.byType.find((row) => row.type === 'Concession');
    deepStrictEqual([concession?.count, concession?.amount], [2, 24_000]);
    equal(book.byType.find((row) => row.type === 'SpecialCharge')?.amount, 2_500);
    equal(book.byType.find((row) => row.type === 'Refund')?.amount, 2_000);
    // A non-payment row carries no mode.
    equal(book.rows.find((row) => row.type === 'Refund')?.mode, null);
  });
});

describe('day book — filters', () => {
  it('shows a counter operator only their own entries (§60)', () => {
    const mine = payment(10_000, 'Cash');
    const theirs = payment(90_000, 'Cash', { createdBy: 'Farah Javed' });
    const book = dayBook([mine, theirs], { date: DAY, counter: 'Kamran Ali' });

    equal(book.rows.length, 1);
    equal(book.collected, 10_000);
    equal(cashTaken(book), 10_000);
  });

  it('narrows the totals when a mode is chosen', () => {
    const book = dayBook(sampleDay(), { date: DAY, mode: 'Bank' });
    equal(book.collected, 50_000);
    equal(book.collectedCount, 2);
    equal(book.rows.length, 2);
    equal(book.byMode[0].amount, 0);
    equal(book.byMode[1].amount, 50_000);
  });

  it('narrows the totals when a type is chosen', () => {
    const book = dayBook(
      [payment(25_000, 'Cash'), entry({ type: 'Concession', amount: 5_000, reason: 'Staff ward' })],
      { date: DAY, type: 'Concession' },
    );
    equal(book.collected, 0);
    equal(book.rows.length, 1);
    deepStrictEqual(book.byType.map((row) => row.type), ['Concession']);
  });

  it('names students when it is given their names', () => {
    const book = dayBook([payment(1_000, 'Cash', { studentSno: 42 })], {
      date: DAY,
      names: new Map([[42, 'Bilal Ahmed']]),
    });
    equal(book.rows[0].studentName, 'Bilal Ahmed');
  });
});
