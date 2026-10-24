// ============================================
// MediCMS Desktop — Finance core: the §8 automatic-flow tests
// §79 cases 5–8: money follows a payment by route without any retyping, a void
// reverses in the same account, a cheque lands in the bank only when it
// clears, and a day-closing count difference makes the account equal the cash.
// Pure generators, no store, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { MoneyAccount, MoneyEntry } from './types.ts';
import { accountBalance, moneyEntryProblems, spendCheck } from './entries.ts';
import {
  bankChargeEntry,
  chequeClearedEntry,
  chequesInHandTotal,
  clearedChequesThisMonth,
  dayCloseDifference,
  handEntryProblems,
  incomingChequeRows,
  nextRefundNo,
  otherReceiptEntry,
  ownerWithdrawalEntry,
  paymentMoneyEntry,
  refundMoneyEntry,
  refundRows,
  resolvePaymentAccount,
  voidPaymentEntry,
  voidablePaymentEntry,
  type EntrySeries,
} from './flows.ts';
import { DEFAULT_FINANCE_LIMITS } from './limits.ts';

const NOW = '2026-10-09T10:00:00';
const DATE = '2026-10-06';
const SERIES: EntrySeries = { entryNo: 10, actionNo: 6, now: NOW };

function account(id: string, name: string, type: MoneyAccount['type'], over: Partial<MoneyAccount> = {}): MoneyAccount {
  return { id, name, type, status: 'Active', ...over };
}

const COUNTER = account('acc-counter', 'Counter cash', 'counterCash');
const BANK = account('acc-bank', 'Meezan, main', 'bank');
const PETTY = account('acc-petty', 'Petty cash', 'pettyCash');
const CHEQUES = account('acc-cheques', 'Cheques in hand', 'chequesInHand');
const ISSUED = account('acc-issued', 'Issued cheques', 'issuedCheques');
const ACCOUNTS = [COUNTER, BANK, PETTY, CHEQUES, ISSUED];

function opening(no: number, accountId: string, amount: number): MoneyEntry {
  return {
    id: `me-${no}`, no, date: '2026-10-01', accountId, direction: 'In', amount,
    kind: 'OpeningBalance', actionId: `a-${no}`, createdBy: 'Setup',
    cleared: true, reconciled: false, createdAt: NOW,
  };
}

const OPENINGS = [opening(1, 'acc-bank', 1_172_000), opening(2, 'acc-counter', 352_000), opening(3, 'acc-petty', 73_000)];

const check = (entry: MoneyEntry, entries: readonly MoneyEntry[] = OPENINGS) =>
  moneyEntryProblems(entry, { accounts: ACCOUNTS, entries });

describe('the route decides the account (§8, §79.5)', () => {
  it('cash goes to a counter, bank and online to the bank, cheques to the hold', () => {
    equal(resolvePaymentAccount(ACCOUNTS, 'Cash')?.id, 'acc-counter');
    equal(resolvePaymentAccount(ACCOUNTS, 'Bank')?.id, 'acc-bank');
    equal(resolvePaymentAccount(ACCOUNTS, 'Online')?.id, 'acc-bank');
    equal(resolvePaymentAccount(ACCOUNTS, 'Cheque')?.id, 'acc-cheques');
  });

  it('online falls back to a wallet when there is no bank; nothing set up gives nothing', () => {
    const walletOnly = [account('w', 'JazzCash', 'wallet'), COUNTER, CHEQUES];
    equal(resolvePaymentAccount(walletOnly, 'Online')?.id, 'w');
    equal(resolvePaymentAccount([COUNTER], 'Bank'), undefined);
  });

  it('a cash payment is money in on the counter, and the books accept it', () => {
    const entry = paymentMoneyEntry(
      { accountId: 'acc-counter', amount: 40_000, mode: 'Cash', payee: 'Ali Raza (SNO 42)', receiptNo: 'R-1043', date: DATE, createdBy: 'Clerk' },
      SERIES,
    );
    deepStrictEqual(check(entry), []);
    equal(entry.kind, 'StudentPayment');
    equal(entry.direction, 'In');
    equal(entry.linkedDoc, 'R-1043');
    equal(accountBalance([...OPENINGS, entry], 'acc-counter'), 392_000);
    equal(accountBalance([...OPENINGS, entry], 'acc-bank'), 1_172_000);
  });

  it('a cheque is held, not counted — and lands in the bank only when it clears (§79.5)', () => {
    const held = paymentMoneyEntry(
      { accountId: 'acc-cheques', amount: 38_000, mode: 'Cheque', payee: 'Sara (SNO 9)', receiptNo: 'R-1044', moneyRef: '004801', date: DATE, createdBy: 'Clerk' },
      SERIES,
    );
    deepStrictEqual(check(held), []);
    equal(held.reference, '004801');
    equal(accountBalance([...OPENINGS, held], 'acc-bank'), 1_172_000); // unchanged while held

    const cleared = chequeClearedEntry(held, { bankAccountId: 'acc-bank', date: '2026-10-12', reference: 'STM-88', createdBy: 'Accountant' }, { ...SERIES, entryNo: 11, actionNo: 7 });
    deepStrictEqual(check(cleared, [...OPENINGS, held]), []);
    equal(cleared.kind, 'ChequeClearedIn');
    equal(cleared.linkedDoc, 'R-1044');
    equal(accountBalance([...OPENINGS, held, cleared], 'acc-bank'), 1_210_000);
  });
});

describe('a void reverses in the same account (§8, §79.6)', () => {
  const paid = paymentMoneyEntry(
    { accountId: 'acc-counter', amount: 5_000, mode: 'Cash', payee: 'Ali (SNO 42)', receiptNo: 'R-1043', date: DATE, createdBy: 'Clerk' },
    SERIES,
  );
  const withPaid = [...OPENINGS, paid];

  it('money out of the receiving counter, naming what it stands against', () => {
    const voided = voidPaymentEntry(paid, { date: '2026-10-07', reason: 'Receipt R-1043 voided — wrong student', createdBy: 'Admin' }, { ...SERIES, entryNo: 11, actionNo: 7 });
    deepStrictEqual(check(voided, withPaid), []);
    equal(voided.kind, 'StudentPaymentReversal');
    equal(voided.direction, 'Out');
    equal(voided.accountId, paid.accountId);
    equal(voided.amount, paid.amount);
    equal(voided.reverses, paid.id);
    equal(accountBalance([...withPaid, voided], 'acc-counter'), 352_000); // back to before
  });

  it('a reason is not optional, and one payment voids once (§34)', () => {
    const noReason = voidPaymentEntry(paid, { date: DATE, reason: '', createdBy: 'Admin' }, SERIES);
    ok(check(noReason, withPaid).some((p) => p.includes('needs a reason')));

    const voided = voidPaymentEntry(paid, { date: '2026-10-07', reason: 'Voided', createdBy: 'Admin' }, { ...SERIES, entryNo: 11, actionNo: 7 });
    const twice = voidPaymentEntry(paid, { date: '2026-10-07', reason: 'Voided again', createdBy: 'Admin' }, { ...SERIES, entryNo: 12, actionNo: 8 });
    ok(check(twice, [...withPaid, voided]).some((p) => p.includes('already reversed')));
  });

  it('only money in on a payment route is voidable', () => {
    equal(voidablePaymentEntry(paid), true);
    equal(voidablePaymentEntry(opening(1, 'acc-bank', 10)), false); // an opening is voided via the generic reversal
    equal(voidablePaymentEntry({ ...paid, direction: 'Out' }), false);
    equal(voidablePaymentEntry(undefined), false);
  });

  it('a bounced cheque reverses the held entry, leaving the bank untouched (§8)', () => {
    const held = paymentMoneyEntry(
      { accountId: 'acc-cheques', amount: 30_000, mode: 'Cheque', payee: 'Bilal (SNO 3)', receiptNo: 'R-1050', moneyRef: '004810', date: DATE, createdBy: 'Clerk' },
      SERIES,
    );
    const bounced = voidPaymentEntry(held, { date: '2026-10-09', reason: 'Cheque 004810 returned — insufficient funds', createdBy: 'Accountant' }, { ...SERIES, entryNo: 11, actionNo: 7 });
    deepStrictEqual(check(bounced, [...OPENINGS, held]), []);
    equal(bounced.accountId, 'acc-cheques');
    equal(accountBalance([...OPENINGS, held, bounced], 'acc-bank'), 1_172_000);
  });
});

describe('a held cheque waits, clears or bounces (§8, §17, §18)', () => {
  const held = paymentMoneyEntry(
    { accountId: 'acc-cheques', amount: 38_000, mode: 'Cheque', payee: 'Sara (SNO 9)', receiptNo: 'R-1044', moneyRef: '004801', date: DATE, createdBy: 'Clerk' },
    SERIES,
  );
  const books = [...OPENINGS, held];

  it('the register lists it in hand, and it is nobody\'s balance yet', () => {
    const rows = incomingChequeRows(ACCOUNTS, books);
    equal(rows.length, 1);
    equal(rows[0]?.status, 'Received');
    equal(chequesInHandTotal(rows), 38_000);
    equal(accountBalance(books, 'acc-bank'), 1_172_000);
  });

  it('clearing moves the money into the bank and leaves nothing in hand', () => {
    const cleared = chequeClearedEntry(
      held,
      { bankAccountId: 'acc-bank', date: '2026-10-12', reference: 'STM-88', createdBy: 'Accountant' },
      { ...SERIES, entryNo: 11, actionNo: 7 },
    );
    const rows = incomingChequeRows(ACCOUNTS, [...books, cleared]);
    equal(rows[0]?.status, 'Cleared');
    equal(rows[0]?.cleared?.id, 'me-11');
    equal(chequesInHandTotal(rows), 0);
    equal(accountBalance([...books, cleared], 'acc-bank'), 1_210_000);
  });

  it('a bounce reverses the hold; a later void stands against the bank entry (§17)', () => {
    const bounced = voidPaymentEntry(
      held,
      { date: '2026-10-09', reason: 'Cheque 004801 returned — insufficient funds', createdBy: 'Accountant' },
      { ...SERIES, entryNo: 11, actionNo: 7 },
    );
    const rows = incomingChequeRows(ACCOUNTS, [...books, bounced]);
    equal(rows[0]?.status, 'Bounced');
    equal(chequesInHandTotal(rows), 0);

    // Cleared, then its receipt voided: the reversal names the bank entry, so
    // the register still shows a clearing and the bank nets back to the opening.
    const cleared = chequeClearedEntry(
      held,
      { bankAccountId: 'acc-bank', date: '2026-10-12', createdBy: 'Accountant' },
      { ...SERIES, entryNo: 11, actionNo: 7 },
    );
    const voided = voidPaymentEntry(
      cleared,
      { date: '2026-10-13', reason: 'Receipt R-1044 voided after it cleared', createdBy: 'Admin' },
      { ...SERIES, entryNo: 12, actionNo: 8 },
    );
    equal(incomingChequeRows(ACCOUNTS, [...books, cleared, voided])[0]?.status, 'Cleared');
    equal(accountBalance([...books, cleared, voided], 'acc-bank'), 1_172_000);
  });

  it('only money held in a cheques-in-hand account appears (§5)', () => {
    const cash = paymentMoneyEntry(
      { accountId: 'acc-counter', amount: 5_000, mode: 'Cash', payee: 'Ali', receiptNo: 'R-1045', date: DATE, createdBy: 'Clerk' },
      { ...SERIES, entryNo: 11, actionNo: 7 },
    );
    equal(incomingChequeRows(ACCOUNTS, [...books, cash]).length, 1);
    equal(incomingChequeRows([], [...books, cash]).length, 0);
  });
});

describe('a day close makes the account equal the count (§11, §79.8)', () => {
  const counterRows = (amount: number) => [opening(1, 'acc-counter', amount)];

  it('a shortage of 500 is a money-out Cash difference of 500', () => {
    const entries = dayCloseDifference(
      { accountId: 'acc-counter', expected: 112_500, counted: 112_000, note: 'Counted short at close', date: DATE, createdBy: 'Clerk' },
      SERIES,
    );
    equal(entries.length, 1);
    deepStrictEqual(check(entries[0], counterRows(112_500)), []);
    equal(entries[0].kind, 'CashDifference');
    equal(entries[0].direction, 'Out');
    equal(entries[0].amount, 500);
    equal(accountBalance([...counterRows(112_500), ...entries], 'acc-counter'), 112_000);
  });

  it('an excess is money in; an equal count makes nothing; no note is refused', () => {
    const excess = dayCloseDifference(
      { accountId: 'acc-counter', expected: 40_000, counted: 40_500, note: 'Old ₹500 found in the drawer', date: DATE, createdBy: 'Clerk' },
      SERIES,
    );
    equal(excess[0]?.direction, 'In');
    equal(accountBalance([...counterRows(40_000), ...excess], 'acc-counter'), 40_500);

    equal(dayCloseDifference({ accountId: 'acc-counter', expected: 40_000, counted: 40_000, note: 'even', date: DATE, createdBy: 'Clerk' }, SERIES).length, 0);

    const noNote = dayCloseDifference({ accountId: 'acc-counter', expected: 10_000, counted: 9_000, note: '  ', date: DATE, createdBy: 'Clerk' }, SERIES);
    ok(check(noNote[0], counterRows(10_000)).some((p) => p.includes('needs a reason')));
  });
});

describe('a refund is money out, categorised (§8, §79.7 shape)', () => {
  it('leaves the chosen account under Student refunds', () => {
    const refund = refundMoneyEntry(
      { accountId: 'acc-counter', amount: 12_000, payee: 'Hina (SNO 12)', refundNo: 'RF-014', date: DATE, createdBy: 'Accountant' },
      SERIES,
    );
    deepStrictEqual(check(refund), []);
    equal(refund.kind, 'RefundToStudent');
    equal(refund.direction, 'Out');
    equal(refund.category, 'Student refunds');
    equal(refund.linkedDoc, 'RF-014');
    // The counter can pay it…
    equal(spendCheck(ACCOUNTS, OPENINGS, 'acc-counter', 12_000).problem, undefined);
    // …and cannot when the cash is not there (§6.2).
    const thin = [opening(1, 'acc-counter', 10_000)];
    ok(spendCheck(ACCOUNTS, thin, 'acc-counter', 12_000).problem);
  });

  it('numbers go on without reuse and the register reads them back (§7.1, §79.7)', () => {
    // An empty book starts at RF-001.
    equal(nextRefundNo(OPENINGS), 'RF-001');
    const first = refundMoneyEntry(
      { accountId: 'acc-counter', amount: 12_000, payee: 'Hina (SNO 12)', refundNo: 'RF-001', date: DATE, createdBy: 'Accountant' },
      SERIES,
    );
    const second = refundMoneyEntry(
      { accountId: 'acc-bank', amount: 5_000, payee: 'Bilal (SNO 3)', refundNo: 'RF-002', date: '2026-10-07', createdBy: 'Accountant' },
      { ...SERIES, entryNo: 11, actionNo: 7 },
    );
    // The next number sits one past the highest held, never a used one.
    equal(nextRefundNo([...OPENINGS, first, second]), 'RF-003');
    // The register is the two refunds, newest first — nothing else shows.
    deepStrictEqual(refundRows([...OPENINGS, first, second]).map((e) => e.linkedDoc), ['RF-002', 'RF-001']);
    equal(refundRows([...OPENINGS, first, second]).every((e) => e.kind === 'RefundToStudent'), true);
  });
});

describe('numbers carry on from the books (§7.1)', () => {
  it('the series stamps id, no and action together', () => {
    const entry = paymentMoneyEntry(
      { accountId: 'acc-bank', amount: 1_000, mode: 'Bank', payee: 'Test', receiptNo: 'R-1', date: DATE, createdBy: 'Tester' },
      { entryNo: 42, actionNo: 9, now: NOW },
    );
    equal(entry.id, 'me-42');
    equal(entry.no, 42);
    equal(entry.actionId, 'a-9');
    equal(entry.createdAt, NOW);
  });
});

describe('the four hand entries at the bank (§20, §33, §60.2, §71)', () => {
  it('a bank charge is money out under Bank charges (§60.2)', () => {
    const charge = bankChargeEntry(
      { accountId: 'acc-bank', amount: 1_500, note: 'Statement fee', date: DATE, createdBy: 'Accountant' },
      SERIES,
    );
    deepStrictEqual(check(charge), []);
    equal(charge.kind, 'BankCharge');
    equal(charge.direction, 'Out');
    equal(charge.category, 'Bank charges');
    equal(accountBalance([...OPENINGS, charge], 'acc-bank'), 1_172_000 - 1_500);
  });

  it('an other receipt is money in, categorised outside fee income (§20)', () => {
    const receipt = otherReceiptEntry(
      { accountId: 'acc-bank', amount: 800, receiptKind: 'Bank profit', reason: 'Profit on a term deposit', date: DATE, createdBy: 'Accountant' },
      SERIES,
    );
    deepStrictEqual(check(receipt), []);
    equal(receipt.kind, 'OtherReceipt');
    equal(receipt.direction, 'In');
    equal(receipt.category, 'Bank profit');
    equal(accountBalance([...OPENINGS, receipt], 'acc-bank'), 1_172_800);
  });

  it('an owner withdrawal is money out, with no expense category (§33)', () => {
    const taken = ownerWithdrawalEntry(
      { accountId: 'acc-bank', amount: 50_000, reason: 'Personal use', date: DATE, createdBy: 'Admin' },
      SERIES,
    );
    deepStrictEqual(check(taken), []);
    equal(taken.kind, 'OwnerWithdrawal');
    equal(taken.direction, 'Out');
    equal(taken.category, undefined);
    equal(accountBalance([...OPENINGS, taken], 'acc-bank'), 1_172_000 - 50_000);
  });

  it('the limit and the role decide who may post what (§3, §20, §33, §77)', () => {
    // An Accountant is capped at the other-entry limit; an Admin is not.
    deepStrictEqual(handEntryProblems({ kind: 'BankCharge', role: 'Accountant', amount: 50_000 }, DEFAULT_FINANCE_LIMITS), []);
    ok(handEntryProblems({ kind: 'BankCharge', role: 'Accountant', amount: 50_001 }, DEFAULT_FINANCE_LIMITS)
      .some((p) => p.includes('above your limit')));
    deepStrictEqual(handEntryProblems({ kind: 'BankCharge', role: 'Admin', amount: 500_000 }, DEFAULT_FINANCE_LIMITS), []);

    // An other receipt needs a reason for anyone.
    ok(handEntryProblems({ kind: 'OtherReceipt', role: 'Admin', amount: 800 }, DEFAULT_FINANCE_LIMITS)
      .some((p) => p.includes('needs a reason')));
    deepStrictEqual(handEntryProblems({ kind: 'OtherReceipt', role: 'Admin', amount: 800, reason: 'Bank profit' }, DEFAULT_FINANCE_LIMITS), []);

    // An owner withdrawal is Admin only, always with a reason.
    ok(handEntryProblems({ kind: 'OwnerWithdrawal', role: 'Accountant', amount: 1, reason: 'x' }, DEFAULT_FINANCE_LIMITS)
      .some((p) => p.includes('posted by an Admin')));
    ok(handEntryProblems({ kind: 'OwnerWithdrawal', role: 'Admin', amount: 1 }, DEFAULT_FINANCE_LIMITS)
      .some((p) => p.includes('needs a reason')));
    deepStrictEqual(handEntryProblems({ kind: 'OwnerWithdrawal', role: 'Admin', amount: 50_000, reason: 'Personal use' }, DEFAULT_FINANCE_LIMITS), []);
  });
});

describe('a held cheque moves through its states (§34, §58)', () => {
  const held = paymentMoneyEntry(
    { accountId: 'acc-cheques', amount: 38_000, mode: 'Cheque', payee: 'Sara (SNO 9)', receiptNo: 'R-1044', moneyRef: '004801', date: DATE, createdBy: 'Clerk' },
    SERIES,
  );
  const books = [...OPENINGS, held];

  it('a deposit turns Received into Deposited, still nobody\'s balance (§34, §35)', () => {
    const rows = incomingChequeRows(ACCOUNTS, books, [{ heldId: held.id, bankAccountId: 'acc-bank', date: '2026-10-07' }]);
    equal(rows[0]?.status, 'Deposited');
    equal(rows[0]?.deposit?.bankAccountId, 'acc-bank');
    equal(chequesInHandTotal(rows), 38_000);
    equal(accountBalance(books, 'acc-bank'), 1_172_000);
  });

  it('clearedChequesThisMonth counts only clearings in that month (§58)', () => {
    const cleared = chequeClearedEntry(
      held,
      { bankAccountId: 'acc-bank', date: '2026-10-12', createdBy: 'Accountant' },
      { ...SERIES, entryNo: 11, actionNo: 7 },
    );
    const rows = incomingChequeRows(ACCOUNTS, [...books, cleared]);
    deepStrictEqual(clearedChequesThisMonth(rows, '2026-10'), { count: 1, amount: 38_000 });
    deepStrictEqual(clearedChequesThisMonth(rows, '2026-11'), { count: 0, amount: 0 });
  });

  it('a reversal marked Returned reads as Returned, not Bounced (§34)', () => {
    const returned = {
      ...voidPaymentEntry(
        held,
        { date: '2026-10-09', reason: 'Student took the cheque back', createdBy: 'Counter' },
        { ...SERIES, entryNo: 11, actionNo: 7 },
      ),
      outcome: 'Returned' as const,
    };
    const rows = incomingChequeRows(ACCOUNTS, [...books, returned]);
    equal(rows[0]?.status, 'Returned');
    equal(chequesInHandTotal(rows), 0);
  });
});
