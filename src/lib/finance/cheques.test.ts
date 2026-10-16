// ============================================
// MediCMS Desktop — Finance core: issued cheques (§31) tests
// §79.15 (issue/clear the available balance), §79.16 (cancel leaves the number
// spent), §79.17 (a stale cheque flags), §79.18 (a post-dated cheque cannot be
// cleared early), plus the §31.1 book rules. No store, no clock. Run: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, notEqual, ok } from 'node:assert/strict';

import type { MoneyAccount, MoneyEntry } from './types.ts';
import { accountBalance } from './entries.ts';
import type { EntrySeries } from './flows.ts';
import {
  availableBalance,
  cancelCheque,
  chequeDisplayStatus,
  chequebookProblems,
  clearCheque,
  issueCheque,
  isStale,
  nextChequeNo,
  unclearedIssuedTotal,
  type Chequebook,
  type ChequeContext,
  type IssuedCheque,
} from './cheques.ts';

const NOW = '2026-10-20T10:00:00';
const SERIES: EntrySeries = { entryNo: 100, actionNo: 50, now: NOW };

function account(id: string, type: MoneyAccount['type'], over: Partial<MoneyAccount> = {}): MoneyAccount {
  return { id, name: id, type, status: 'Active', ...over };
}
const BANK = account('acc-bank', 'bank');
const ACCOUNTS = [BANK];

function opening(no: number, amount: number): MoneyEntry {
  return {
    id: `me-${no}`, no, date: '2026-10-01', accountId: 'acc-bank', direction: 'In',
    amount, kind: 'OpeningBalance', actionId: `a-${no}`, createdBy: 'Setup',
    cleared: true, reconciled: false, createdAt: NOW,
  };
}

const BOOK: Chequebook = { id: 'ckb-1', bankAccountId: 'acc-bank', fromNo: '004850', toNo: '004899', status: 'Active' };

function ctx(over: Partial<ChequeContext> = {}): ChequeContext {
  return {
    accounts: ACCOUNTS,
    entries: [opening(1, 1_172_000)],
    chequebooks: [BOOK],
    cheques: [],
    today: '2026-10-20',
    now: NOW,
    ...over,
  };
}

function issued(over: Partial<IssuedCheque> = {}): IssuedCheque {
  return {
    id: 'chq-1', chequebookId: 'ckb-1', bankAccountId: 'acc-bank', chequeNo: '004871',
    payee: 'City Teaching Hospital', amount: 30_000, issueDate: '2026-10-20', chequeDate: '2026-10-20',
    acPayee: false, status: 'Issued', createdBy: 'Saba', createdAt: NOW, ...over,
  };
}

describe('§31.1 chequebooks', () => {
  it('refuses an overlapping range on the same bank', () => {
    const problems = chequebookProblems(
      { id: 'ckb-2', bankAccountId: 'acc-bank', fromNo: '004890', toNo: '004950', status: 'Active' },
      [BOOK],
      ACCOUNTS,
    );
    ok(problems.some((p) => p.includes('overlap')));
  });

  it('requires a bank account and an ordered numeric range', () => {
    const cash = account('acc-counter', 'counterCash');
    ok(chequebookProblems({ id: 'x', bankAccountId: 'acc-counter', fromNo: '1', toNo: '5', status: 'Active' }, [], [cash])
      .some((p) => p.includes('bank account')));
    ok(chequebookProblems({ id: 'x', bankAccountId: 'acc-bank', fromNo: '004899', toNo: '004850', status: 'Active' }, [], ACCOUNTS)
      .some((p) => p.includes('before the from number')));
  });

  it('suggests the next unused number and never reuses one', () => {
    equal(nextChequeNo(BOOK, []), '004850');
    equal(nextChequeNo(BOOK, [issued({ chequeNo: '004850' }), issued({ chequeNo: '004851', id: 'chq-2' })]), '004852');
    // A cancelled number stays spent.
    equal(nextChequeNo(BOOK, [issued({ chequeNo: '004850', status: 'Cancelled' })]), '004851');
  });
});

describe('§31.2 issuing a cheque (§79.15)', () => {
  it('records the cheque without touching the money books', () => {
    const result = issueCheque(ctx(), {
      chequebookId: 'ckb-1', chequeNo: '004871', payee: 'City Teaching Hospital', amount: 30_000,
      chequeDate: '2026-10-20', issueDate: '2026-10-20', createdBy: 'Saba',
    });
    if (!result.ok) throw new Error('issue should succeed');
    const cheque = result.cheque;
    equal(cheque.status, 'Issued');
    // §79.15: on issue the bank balance is unchanged but the available falls.
    const withCheque = ctx({ cheques: [cheque] });
    equal(accountBalance(withCheque.entries, 'acc-bank'), 1_172_000);
    equal(availableBalance(withCheque.entries, withCheque.cheques, 'acc-bank'), 1_142_000);
    equal(unclearedIssuedTotal(withCheque.cheques, 'acc-bank'), 30_000);
  });

  it('refuses a number outside the book, a future issue date and a reused number', () => {
    const outside = issueCheque(ctx(), { chequebookId: 'ckb-1', chequeNo: '005000', payee: 'X', amount: 1000, chequeDate: '2026-10-20', issueDate: '2026-10-20', createdBy: 'Saba' });
    if (outside.ok) throw new Error('expected refusal');
    ok(outside.errors.some((e) => e.includes('outside the book')));

    const future = issueCheque(ctx(), { chequebookId: 'ckb-1', chequeNo: '004871', payee: 'X', amount: 1000, chequeDate: '2026-10-25', issueDate: '2026-11-01', createdBy: 'Saba' });
    if (future.ok) throw new Error('expected refusal');
    ok(future.errors.some((e) => e.includes('future')));

    const dup = issueCheque(ctx({ cheques: [issued()] }), { chequebookId: 'ckb-1', chequeNo: '004871', payee: 'X', amount: 1000, chequeDate: '2026-10-20', issueDate: '2026-10-20', createdBy: 'Saba' });
    if (dup.ok) throw new Error('expected refusal');
    ok(dup.errors.some((e) => e.includes('never reused')));
  });
});

describe('§31.2 clearing an issued cheque (§79.15)', () => {
  it('posts the bank money-out dated the clearing day; balance falls, available holds', () => {
    const cheque = issued();
    const base = ctx({ cheques: [cheque], today: '2026-10-31' });
    const before = availableBalance(base.entries, base.cheques, 'acc-bank'); // 1,142,000
    const result = clearCheque(base, { chequeId: cheque.id, clearDate: '2026-10-24', reference: 'STL-9', createdBy: 'Imran' }, SERIES);
    if (!result.ok) throw new Error('clear should succeed');
    equal(result.entries.length, 1);
    const entry = result.entries[0];
    equal(entry.kind, 'ChequeClearedOut');
    equal(entry.direction, 'Out');
    equal(entry.date, '2026-10-24');
    equal(entry.amount, 30_000);

    // Now the cheque is Cleared and the entry is in the books.
    const cleared = { ...cheque, status: 'Cleared' as const, clearedDate: '2026-10-24', clearedEntryId: entry.id };
    const after = ctx({ entries: [...base.entries, entry], cheques: [cleared] });
    equal(accountBalance(after.entries, 'acc-bank'), 1_142_000);   // balance fell by 30,000
    equal(availableBalance(after.entries, after.cheques, 'acc-bank'), before); // available unchanged
  });

  it('allows an overdraft as a warning, not a block (§6.3)', () => {
    const cheque = issued({ amount: 2_000_000 });
    const result = clearCheque(ctx({ cheques: [cheque], today: '2026-10-31' }), { chequeId: cheque.id, clearDate: '2026-10-24', createdBy: 'Imran' }, SERIES);
    if (!result.ok) throw new Error('overdraft should warn, not block');
    ok(result.warnings.some((w) => w.includes('overdraft')));
  });

  it('refuses to clear a post-dated cheque before its own date (§79.18)', () => {
    const cheque = issued({ chequeDate: '2026-11-10' });
    const base = ctx({ cheques: [cheque], today: '2026-10-20' });
    equal(chequeDisplayStatus(cheque, base.today), 'Post-dated');
    const result = clearCheque(base, { chequeId: cheque.id, clearDate: '2026-10-25', createdBy: 'Imran' }, SERIES);
    if (result.ok) throw new Error('expected refusal');
    ok(result.errors.some((e) => e.includes('cannot be cleared before')));
  });

  it('refuses to clear a cancelled or already-cleared cheque', () => {
    const cancelled = clearCheque(ctx({ cheques: [issued({ status: 'Cancelled' })] }), { chequeId: 'chq-1', clearDate: '2026-10-24', createdBy: 'x' }, SERIES);
    ok(!cancelled.ok);
    const already = clearCheque(ctx({ cheques: [issued({ status: 'Cleared' })] }), { chequeId: 'chq-1', clearDate: '2026-10-24', createdBy: 'x' }, SERIES);
    ok(!already.ok);
  });
});

describe('§31.2 cancelling a cheque (§79.16)', () => {
  it('needs a reason, leaves the uncleared set and keeps the number spent', () => {
    const cheque = issued();
    const noReason = cancelCheque(ctx({ cheques: [cheque] }), { chequeId: cheque.id, reason: '' });
    ok(!noReason.ok);

    const result = cancelCheque(ctx({ cheques: [cheque] }), { chequeId: cheque.id, reason: 'Superseded by PV-0440' });
    if (!result.ok) throw new Error('cancel should succeed');
    equal(result.cheque.status, 'Cancelled');
    const after = ctx({ cheques: [result.cheque] });
    equal(unclearedIssuedTotal(after.cheques, 'acc-bank'), 0);
    equal(availableBalance(after.entries, after.cheques, 'acc-bank'), 1_172_000);
    // The number is never offered again.
    notEqual(nextChequeNo(BOOK, [result.cheque]), '004871');
  });

  it('refuses to cancel one that already cleared (§34 reverses its entry instead)', () => {
    const result = cancelCheque(ctx({ cheques: [issued({ status: 'Cleared' })] }), { chequeId: 'chq-1', reason: 'x' });
    if (result.ok) throw new Error('expected refusal');
    ok(result.errors.some((e) => e.includes('reverse its bank entry')));
  });
});

describe('§31.2 a stale cheque (§79.17)', () => {
  it('flags one a day past six months, not one exactly six months old', () => {
    const cheque = issued({ chequeDate: '2026-04-01' });
    // Exactly six months on — not yet stale.
    equal(isStale(cheque, '2026-10-01'), false);
    equal(chequeDisplayStatus(cheque, '2026-10-01'), 'Issued');
    // A day later it is stale.
    equal(isStale(cheque, '2026-10-02'), true);
    equal(chequeDisplayStatus(cheque, '2026-10-02'), 'Stale');
  });

  it('never flags a cleared or cancelled cheque', () => {
    equal(isStale(issued({ chequeDate: '2025-01-01', status: 'Cleared' }), '2026-10-02'), false);
    equal(isStale(issued({ chequeDate: '2025-01-01', status: 'Cancelled' }), '2026-10-02'), false);
  });

  it('honours the §77 stale-after months the register passes', () => {
    const fiveMonthsOn = issued({ chequeDate: '2026-05-01' });
    // Under the default 6 months it is not yet stale …
    equal(chequeDisplayStatus(fiveMonthsOn, '2026-10-01'), 'Issued');
    // … but the register reading a 3-month §77 setting flags it.
    equal(chequeDisplayStatus(fiveMonthsOn, '2026-10-01', 3), 'Stale');
  });
});
