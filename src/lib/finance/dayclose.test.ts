// ============================================
// MediCMS Desktop — Finance core: accounts screens' pure rules (§12, §14)
// The cash book's running balance survives filtering, a day close creates the
// entry that makes the account equal the count, and the cash deposit screen
// lists each closed day not yet deposited — the §14 acceptance lines the F2
// screens stand on. No store, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { MoneyAccount, MoneyEntry } from './types.ts';
import { accountBalance, cashBookRows } from './entries.ts';
import { postCashDeposit, postTransfer } from './transfer.ts';
import {
  postDayClose,
  undepositedDayClosings,
  type DayClosing,
  type EntrySeries,
} from './flows.ts';

const NOW = '2026-10-09T10:00:00';
const SERIES: EntrySeries = { entryNo: 10, actionNo: 6, now: NOW };

function account(id: string, name: string, type: MoneyAccount['type'], over: Partial<MoneyAccount> = {}): MoneyAccount {
  return { id, name, type, status: 'Active', ...over };
}

const COUNTER = account('acc-counter', 'Counter cash', 'counterCash');
const BANK = account('acc-bank', 'Meezan, main', 'bank');
const PETTY = account('acc-petty', 'Petty cash', 'pettyCash');
const ACCOUNTS = [COUNTER, BANK, PETTY];

function entry(no: number, over: Partial<MoneyEntry> = {}): MoneyEntry {
  return {
    id: `me-${no}`, no, date: '2026-10-05', accountId: 'acc-counter', direction: 'In',
    amount: 1000, kind: 'StudentPayment', actionId: `a-${no}`, createdBy: 'Tester',
    cleared: true, reconciled: false, createdAt: NOW, ...over,
  };
}

describe('the cash book runs its balance from the start (§12, §14)', () => {
  const rows = [
    entry(1, { date: '2026-10-01', kind: 'OpeningBalance', amount: 10_000 }),
    entry(2, { date: '2026-10-02', amount: 4_000 }),
    entry(3, { date: '2026-10-02', direction: 'Out', kind: 'RefundToStudent', amount: 1_500 }),
    entry(4, { date: '2026-10-03', amount: 2_000, cleared: false }),
  ];

  it("lists one account's entries in date order with the running balance", () => {
    const book = cashBookRows([...rows, entry(9, { accountId: 'acc-bank', amount: 7000 })], 'acc-counter');
    equal(book.length, 4);
    deepStrictEqual(book.map((r) => r.entry.no), [1, 2, 3, 4]);
    deepStrictEqual(book.map((r) => r.runningBalance), [10_000, 14_000, 12_500, 12_500]);
  });

  it('filtering the rows for display never changes the balance shown', () => {
    const full = cashBookRows(rows, 'acc-counter');
    const outOnly = full.filter((r) => r.entry.direction === 'Out');
    deepStrictEqual(outOnly.map((r) => r.runningBalance), [12_500]);
    const oct3 = full.filter((r) => r.entry.date === '2026-10-03');
    deepStrictEqual(oct3.map((r) => r.runningBalance), [12_500]);
  });

  it('an uncleared entry shows but does not move the balance', () => {
    const last = cashBookRows(rows, 'acc-counter').at(-1);
    ok(last);
    equal(last?.entry.cleared, false);
    equal(last?.runningBalance, accountBalance(rows, 'acc-counter'));
  });
});

describe('closing a day makes the account equal the count (§11, §33)', () => {
  // The §33 sample: expected 112,500, counted 112,000, difference -500.
  const paid = [
    entry(1, { date: '2026-10-01', kind: 'OpeningBalance', amount: 12_500 }),
    entry(2, { date: '2026-10-08', amount: 100_000 }),
  ];
  const baseInput = {
    accounts: ACCOUNTS,
    entries: paid,
    closings: [] as DayClosing[],
    today: '2026-10-09',
  };

  it('an even count closes the day with no entry at all', () => {
    const out = postDayClose(baseInput, { accountId: 'acc-counter', date: '2026-10-09', counted: 112_500, createdBy: 'Saba Noor' }, SERIES);
    deepStrictEqual(out.errors, []);
    equal(out.expected, 112_500);
    equal(out.closing.difference, 0);
    equal(out.entries.length, 0);
  });

  it('a shortage of 500 becomes money out of 500 with the note as its reason', () => {
    const out = postDayClose(
      baseInput,
      { accountId: 'acc-counter', date: '2026-10-09', counted: 112_000, note: 'Short change given to a student.', createdBy: 'Saba Noor' },
      SERIES,
    );
    deepStrictEqual(out.errors, []);
    equal(out.closing.difference, -500);
    equal(out.entries.length, 1);
    equal(out.entries[0].direction, 'Out');
    equal(out.entries[0].amount, 500);
    equal(out.entries[0].kind, 'CashDifference');
    equal(out.entries[0].reason, 'Short change given to a student.');
    // §11: after the entry, the account equals the physical count.
    equal(accountBalance([...paid, ...out.entries], 'acc-counter'), 112_000);
  });

  it('a difference cannot be saved without a note (§33.6)', () => {
    const out = postDayClose(baseInput, { accountId: 'acc-counter', date: '2026-10-09', counted: 112_000, createdBy: 'Saba Noor' }, SERIES);
    ok(out.errors.some((e) => e.includes('without a note')));
    equal(out.entries.length, 0);
  });

  it("a day closes once; the next morning it takes yesterday's counted cash", () => {
    const first = postDayClose(baseInput, { accountId: 'acc-counter', date: '2026-10-09', counted: 112_500, createdBy: 'Saba' }, SERIES);
    deepStrictEqual(first.errors, []);
    const twice = postDayClose({ ...baseInput, closings: [first.closing] }, { accountId: 'acc-counter', date: '2026-10-09', counted: 112_500, createdBy: 'Saba' }, SERIES);
    ok(twice.errors.some((e) => e.includes('already closed')));
    // The 10th's expected is the 9th's counted figure, not the books after it.
    const next = postDayClose({ ...baseInput, today: '2026-10-10', closings: [first.closing] }, { accountId: 'acc-counter', date: '2026-10-10', counted: 112_500, createdBy: 'Saba' }, SERIES);
    deepStrictEqual(next.errors, []);
    equal(next.expected, 112_500);
  });

  it('refuses a future day, a closed month, a negative count and a non-counter', () => {
    const future = postDayClose(baseInput, { accountId: 'acc-counter', date: '2026-10-20', counted: 0, createdBy: 'Saba' }, SERIES);
    ok(future.errors.some((e) => e.includes('cannot be in the future')));
    const closedMonth = postDayClose(
      { ...baseInput, closedMonths: ['2026-10'] },
      { accountId: 'acc-counter', date: '2026-10-09', counted: 112_500, createdBy: 'Saba' },
      SERIES,
    );
    ok(closedMonth.errors.some((e) => e.includes('closed month')));
    const negative = postDayClose(baseInput, { accountId: 'acc-counter', date: '2026-10-09', counted: -1, note: 'nonsense', createdBy: 'Saba' }, SERIES);
    ok(negative.errors.some((e) => e.includes('whole rupees')));
    const bank = postDayClose(baseInput, { accountId: 'acc-bank', date: '2026-10-09', counted: 0, note: 'x', createdBy: 'Saba' }, SERIES);
    ok(bank.errors.some((e) => e.includes("counter's cash drawer")));
  });
});

describe('the cash deposit screen lists undeposited days (§9, §14)', () => {
  const closings: DayClosing[] = [
    { date: '2026-10-08', accountId: 'acc-counter', expected: 112_500, counted: 112_500, difference: 0, closedBy: 'Saba', closedAt: NOW },
    { date: '2026-10-09', accountId: 'acc-counter', expected: 112_500, counted: 112_000, difference: -500, note: 'Short change.', closedBy: 'Saba', closedAt: NOW },
  ];

  it('every closed day starts undeposited', () => {
    deepStrictEqual(undepositedDayClosings(closings), closings);
  });

  it('a deposit marks the ticked day through its slip number', () => {
    const ctx = {
      accounts: ACCOUNTS,
      // The counter holds the day's counted cash — no floor refusal (§6.2).
      entries: [entry(1, { date: '2026-10-01', kind: 'OpeningBalance', amount: 112_500 })],
      now: NOW,
    };
    const deposit = postCashDeposit(
      ctx,
      { fromAccountId: 'acc-counter', bankAccountId: 'acc-bank', amount: 112_500, date: '2026-10-08', slipNo: 'SLIP-01', daysTotal: 112_500, createdBy: 'Saba' },
    );
    ok(deposit.ok);
    // The screen carries the posted slip onto the ticked day's record.
    const marked = closings.map((d) => (d.date === '2026-10-08' ? { ...d, depositRefs: ['SLIP-01'] } : d));
    deepStrictEqual(undepositedDayClosings(marked).map((d) => d.date), ['2026-10-09']);
  });

  it('a short deposit needs a note, and the difference stays in the counter (§9)', () => {
    const ctx = {
      accounts: ACCOUNTS,
      entries: [entry(1, { date: '2026-10-01', kind: 'OpeningBalance', amount: 352_000 })],
      now: NOW,
    };
    const short = postCashDeposit(
      ctx,
      { fromAccountId: 'acc-counter', bankAccountId: 'acc-bank', amount: 100_000, date: '2026-10-09', slipNo: 'SLIP-02', daysTotal: 112_000, createdBy: 'Saba' },
    );
    ok(!short.ok);
    ok(short.errors.some((e) => e.includes('a note is required')));
    const noted = postCashDeposit(
      ctx,
      { fromAccountId: 'acc-counter', bankAccountId: 'acc-bank', amount: 100_000, date: '2026-10-09', slipNo: 'SLIP-02', daysTotal: 112_000, note: 'Balance kept for tomorrow.', createdBy: 'Saba' },
    );
    ok(noted.ok);
  });
});

describe('a simple transfer posts both sides together (§9)', () => {
  it('bank to petty tops the float with one action and two entries', () => {
    const ctx = {
      accounts: ACCOUNTS,
      entries: [entry(1, { date: '2026-10-01', accountId: 'acc-bank', kind: 'OpeningBalance', amount: 1_172_000 })],
      now: NOW,
    };
    const out = postTransfer(ctx, { fromAccountId: 'acc-bank', toAccountId: 'acc-petty', amount: 30_000, date: '2026-10-09', createdBy: 'Saba' });
    ok(out.ok);
    equal(out.entries.length, 2);
    deepStrictEqual(out.entries.map((e) => e.kind), ['TransferOut', 'TransferIn']);
    equal(out.entries[0].actionId, out.entries[1].actionId);
    equal(accountBalance([...ctx.entries, ...out.entries], 'acc-petty'), 30_000);
    // Transfers never count as income or expense: neither side is anything
    // a payment route produces (§13).
    deepStrictEqual(out.entries.map((e) => (e.kind === 'StudentPayment' || e.kind === 'ChequeClearedIn' ? 1 : 0)), [0, 0]);
  });

  it('a cash account may not be taken below zero', () => {
    const ctx = {
      accounts: ACCOUNTS,
      entries: [entry(1, { date: '2026-10-01', kind: 'OpeningBalance', amount: 10_000 })],
      now: NOW,
    };
    const out = postTransfer(ctx, { fromAccountId: 'acc-counter', toAccountId: 'acc-bank', amount: 20_000, date: '2026-10-09', createdBy: 'Saba' });
    ok(!out.ok);
    ok(out.errors.some((e) => e.includes('Not enough cash')));
  });
});
