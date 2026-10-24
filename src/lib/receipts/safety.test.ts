// ============================================
// MediCMS Desktop — Payment safety tests (§17, §21)
// One row of the §17 table per test: the duplicate warning, the four date rules,
// the closed day, over-payment, the large amount, zero, no dues, the receipt book
// and the struck-off banner.
// Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { LedgerEntry } from '../ledger/types.ts';
import { entryId } from '../ledger/entries.ts';
import { backDateRule, paymentSafety, type PaymentSafetyInput } from './safety.ts';
import { DEFAULT_PAYMENT_SETTINGS } from './types.ts';

const TODAY = '2026-10-09';
const NOW = '2026-10-09T14:15:00';

function lower(message: string): string {
  return message.toLowerCase();
}

function input(over: Partial<PaymentSafetyInput> = {}): PaymentSafetyInput {
  return {
    studentSno: 1,
    amount: 25_000,
    date: TODAY,
    mode: 'Cash',
    today: TODAY,
    now: NOW,
    role: 'Counter',
    settings: DEFAULT_PAYMENT_SETTINGS,
    entries: [],
    dues: 78_000,
    credit: 0,
    ...over,
  };
}

function payment(no: number, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: entryId(1, no),
    studentSno: 1,
    entryNo: no,
    date: TODAY,
    type: 'Payment',
    amount: 25_000,
    description: 'Fee payment',
    paymentMode: 'Cash',
    createdBy: 'Kamran Ali',
    createdAt: '2026-10-09T14:05:00',
    balanceAfter: 0,
    ...over,
  };
}

describe('a clean payment', () => {
  it('has nothing to say', () => {
    const safety = paymentSafety(input());
    deepStrictEqual(safety.blockers, []);
    deepStrictEqual(safety.confirms, []);
    deepStrictEqual(safety.notices, []);
    equal(safety.duplicateOf, null);
  });
});

describe('date rules (§17)', () => {
  it('blocks a future date', () => {
    const safety = paymentSafety(input({ date: '2026-10-10', role: 'Admin' }));
    deepStrictEqual(safety.blockers, ['A payment cannot be dated in the future.']);
  });

  it('keeps a counter operator on today only (§21)', () => {
    const safety = paymentSafety(input({ date: '2026-10-08' }));
    deepStrictEqual(safety.blockers, ["A counter operator can record today's payments only."]);
  });

  it('lets an accountant back-date seven days with a reason (§21)', () => {
    const safety = paymentSafety(
      input({ role: 'Accountant', date: '2026-10-02', reason: 'Bank slip from Friday' }),
    );
    deepStrictEqual(safety.blockers, []);
  });

  it('stops an accountant beyond seven days (§21)', () => {
    const safety = paymentSafety(
      input({ role: 'Accountant', date: '2026-10-01', reason: 'Too old' }),
    );
    equal(safety.blockers.length, 1);
    equal(safety.blockers[0].includes('up to 7 days'), true);
  });

  it('asks for the reason a back-dated payment needs', () => {
    const safety = paymentSafety(input({ role: 'Accountant', date: '2026-10-08' }));
    deepStrictEqual(safety.blockers, ['Write the reason for the back-dated payment.']);
  });

  it('asks an Admin for a reason but not for a limit', () => {
    const old = paymentSafety(input({ role: 'Admin', date: '2026-07-01' }));
    deepStrictEqual(old.blockers, ['Write the reason for the back-dated payment.']);
    const reasoned = paymentSafety(input({ role: 'Admin', date: '2026-07-01', reason: 'Old slip' }));
    deepStrictEqual(reasoned.blockers, []);
  });

  it('blocks a closed day until it is reopened', () => {
    const safety = paymentSafety(input({ closedDays: [TODAY] }));
    equal(safety.blockers.length, 1);
    equal(safety.blockers[0].includes('This day is closed'), true);
  });
});

describe('amount rules (§17)', () => {
  it('blocks zero and negative amounts', () => {
    equal(paymentSafety(input({ amount: 0 })).blockers[0], 'Enter an amount above zero.');
    equal(paymentSafety(input({ amount: -500 })).blockers[0], 'Enter an amount above zero.');
  });

  it('refuses decimals (§20)', () => {
    const safety = paymentSafety(input({ amount: 2_500.5 }));
    equal(safety.blockers[0].includes('decimals'), true);
  });

  it('asks twice above 500,000', () => {
    const safety = paymentSafety(input({ amount: 600_000, dues: 900_000 }));
    equal(safety.confirms.length, 1);
    equal(safety.confirms[0].includes('large amount'), true);
  });

  it('does not ask at exactly 500,000', () => {
    const safety = paymentSafety(input({ amount: 500_000, dues: 900_000 }));
    deepStrictEqual(safety.confirms, []);
  });
});

describe('over-payment and credit (§17)', () => {
  it('states the credit below the confirmation threshold', () => {
    const safety = paymentSafety(input({ credit: 5_000 }));
    deepStrictEqual(safety.notices, ['This leaves 5,000 as credit.']);
    deepStrictEqual(safety.confirms, []);
  });

  it('confirms a credit above 10,000', () => {
    const safety = paymentSafety(input({ credit: 12_000 }));
    deepStrictEqual(safety.confirms, ['A credit this large needs an extra confirmation.']);
    deepStrictEqual(safety.notices, []);
  });

  it('warns when the student has no dues at all', () => {
    const safety = paymentSafety(input({ dues: 0, credit: 25_000 }));
    ok(safety.notices.includes('This student has no dues. The whole amount will be credit.'));
  });
});

describe('duplicate warning (§17)', () => {
  it('flags the same amount and mode inside ten minutes', () => {
    const safety = paymentSafety(input({ entries: [payment(1)] }));
    deepStrictEqual(safety.confirms, [
      'A similar payment was recorded at 14:05 by Kamran Ali. Record anyway?',
    ]);
    equal(safety.duplicateOf?.entryNo, 1);
  });

  it('says nothing outside the window', () => {
    const safety = paymentSafety(input({ entries: [payment(1, { createdAt: '2026-10-09T13:50:00' })] }));
    deepStrictEqual(safety.confirms, []);
  });

  it('ignores another mode, another amount, or a reversed payment', () => {
    const entries: LedgerEntry[] = [
      payment(1, { paymentMode: 'Bank' }),
      payment(2, { amount: 24_000 }),
      payment(3),
      { ...payment(4), id: entryId(1, 4), type: 'Reversal', linkedEntryId: entryId(1, 3) },
    ];
    deepStrictEqual(paymentSafety(input({ entries })).confirms, []);
  });
});

describe('receipt book and student state (§17)', () => {
  it('blocks when there is no book to number the receipt from', () => {
    const safety = paymentSafety(input({ bookProblem: 'Book 1 is full. Ask an Admin for a new book.' }));
    deepStrictEqual(safety.blockers, ['Book 1 is full. Ask an Admin for a new book.']);
  });

  it('allows a struck-off student with a banner', () => {
    const safety = paymentSafety(input({ studentFlag: 'struckOff' }));
    deepStrictEqual(safety.blockers, []);
    equal(safety.notices.length, 1);
    ok(lower(safety.notices[0]).includes('struck off'));
  });

  it('allows a completed student with a banner', () => {
    const safety = paymentSafety(input({ studentFlag: 'completed' }));
    equal(safety.notices.length, 1);
    ok(lower(safety.notices[0]).includes('completed'));
  });
});

describe('back-date rules per role (§17)', () => {
  it('reads the accountant limit from settings, not from a constant', () => {
    const settings = { ...DEFAULT_PAYMENT_SETTINGS, backDateDays: 3 };
    equal(backDateRule('Accountant', settings).days, 3);
    equal(backDateRule('Counter', settings).days, 0);
    equal(backDateRule('Admin', settings).days, null);
    equal(backDateRule('Accountant', settings).label, 'Today or up to 3 days back, with a reason.');
  });

  it('blocks at the configured limit rather than the default', () => {
    const settings = { ...DEFAULT_PAYMENT_SETTINGS, backDateDays: 3 };
    const safety = paymentSafety(
      input({ role: 'Accountant', date: '2026-10-05', reason: 'Late slip', settings }),
    );
    equal(safety.blockers.length, 1);
    equal(safety.blockers[0].includes('up to 3 days'), true);
  });
});
