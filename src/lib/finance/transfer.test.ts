// ============================================
// MediCMS Desktop — Finance core: transfer and reversal tests (§9, §34)
// §79 case 2 (a transfer is two entries and not income or expense), the §9
// rules (no negative cash, no closed months, slip numbers, short deposits)
// and §34 (a transfer reversed as a pair). Pure functions, no clock, no store.
// Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, ok } from 'node:assert/strict';

import type { MoneyAccount, MoneyAccountType, MoneyEntry } from './types.ts';
import { accountBalance, externalTotals } from './entries.ts';
import {
  correctionNeedsAdmin,
  correctionRoute,
  postCashDeposit,
  postTransfer,
  reversibleEntry,
  reverseMoneyEntry,
  reverseTransfer,
  type PostingContext,
  type PostingResult,
  type TransferDraft,
} from './transfer.ts';
import { DEFAULT_FINANCE_LIMITS } from './limits.ts';

const NOW = '2026-10-09T10:00:00';

function account(id: string, name: string, type: MoneyAccountType, over: Partial<MoneyAccount> = {}): MoneyAccount {
  return { id, name, type, status: 'Active', ...over };
}

function entry(no: number, over: Partial<MoneyEntry> = {}): MoneyEntry {
  return {
    id: `me-${no}`,
    no,
    date: '2026-10-05',
    accountId: 'bank',
    direction: 'In',
    amount: 1000,
    kind: 'OtherReceipt',
    actionId: `a-${no}`,
    createdBy: 'Tester',
    cleared: true,
    reconciled: false,
    createdAt: NOW,
    ...over,
  };
}

/** Unwrap a posting the test expects to pass; a refusal prints its sentences. */
function accepted(result: PostingResult): { entries: MoneyEntry[]; warnings: string[] } {
  if (!result.ok) throw new Error(`refused: ${result.errors.join(' | ')}`);
  return { entries: result.entries, warnings: result.warnings };
}

/** Unwrap a posting the test expects to be refused, and hand back the sentences. */
function refused(result: PostingResult): string[] {
  if (result.ok) throw new Error(`accepted: ${result.entries.map((e) => e.id).join(', ')}`);
  return result.errors;
}

const BANK = account('bank', 'Meezan, main', 'bank');
const COUNTER = account('counter', 'Counter cash', 'counterCash');
const PETTY = account('petty', 'Petty cash', 'pettyCash');
const CHEQUES = account('chq', 'Cheques in hand', 'chequesInHand');
const ACCOUNTS = [BANK, COUNTER, PETTY, CHEQUES];

/** The §13 opening positions. */
const OPENINGS: MoneyEntry[] = [
  entry(1, { accountId: 'bank', kind: 'OpeningBalance', amount: 1_172_000, date: '2026-10-01' }),
  entry(2, { accountId: 'counter', kind: 'OpeningBalance', amount: 352_000, date: '2026-10-01' }),
  entry(3, { accountId: 'petty', kind: 'OpeningBalance', amount: 73_000, date: '2026-10-01' }),
];

const ctx = (entries: readonly MoneyEntry[] = OPENINGS, over: { closedMonths?: string[] } = {}): PostingContext => ({
  accounts: ACCOUNTS,
  entries,
  now: NOW,
  ...over,
});

/** Counter 700,000, bank 100,000 — enough for the 600,000 deposit to succeed. */
const RICH = ctx([
  entry(1, { accountId: 'bank', kind: 'OpeningBalance', amount: 100_000, date: '2026-10-01' }),
  entry(2, { accountId: 'counter', kind: 'OpeningBalance', amount: 700_000, date: '2026-10-01' }),
]);

const deposit: TransferDraft = {
  fromAccountId: 'counter',
  toAccountId: 'bank',
  amount: 600_000,
  date: '2026-10-06',
  reference: 'DS-771',
  createdBy: 'Accountant',
};

describe('transfers (§9, §79.2)', () => {
  it('creates both sides under one action, and moves exactly the amount (§79.2)', () => {
    const { entries: pair } = accepted(postTransfer(RICH, deposit));
    equal(pair.length, 2);
    equal(pair[0].actionId, pair[1].actionId);
    equal(pair[0].kind, 'TransferOut');
    equal(pair[1].kind, 'TransferIn');
    const all = [...RICH.entries, ...pair];
    equal(accountBalance(all, 'counter'), 100_000);
    equal(accountBalance(all, 'bank'), 700_000);
  });

  it('counter 352,000 cannot give 600,000 (§6.2)', () => {
    const errors = refused(postTransfer(ctx(), deposit));
    ok(errors.some((e) => e.includes('Not enough cash in Counter cash')));
  });

  it('outside money in and out are unchanged by a transfer (§79.2)', () => {
    const before = externalTotals(RICH.entries, RICH.accounts);
    const { entries: pair } = accepted(postTransfer(RICH, deposit));
    const after = externalTotals([...RICH.entries, ...pair], RICH.accounts);
    equal(after.moneyIn, before.moneyIn);
    equal(after.moneyOut, before.moneyOut);
    equal(after.net, before.net);
  });

  it('the pair shares consecutive numbers and a linked document (§7.1)', () => {
    const { entries: pair } = accepted(postTransfer(RICH, deposit));
    const [out, inE] = pair;
    equal(out.no + 1, inE.no);
    equal(out.id, `me-${out.no}`);
    equal(out.linkedDoc, out.actionId);
    equal(inE.linkedDoc, out.actionId);
    equal(out.reference, 'DS-771');
    // The next action and entry numbers continue from the pair.
    const { entries: again } = accepted(postTransfer({ ...RICH, entries: [...RICH.entries, ...pair] }, { ...deposit, amount: 50_000 }));
    ok(again[0].actionId !== out.actionId);
    ok(again[0].no > inE.no);
  });

  it('petty cash 20,000 giving 25,000 is blocked (§79.3)', () => {
    const poor = ctx([entry(1, { accountId: 'petty', kind: 'OpeningBalance', amount: 20_000 })]);
    const errors = refused(postTransfer(poor, {
      fromAccountId: 'petty', toAccountId: 'counter', amount: 25_000, date: '2026-10-06', createdBy: 'Accountant',
    }));
    ok(errors.some((e) => e.includes('Top up first')));
  });

  it('a bank giving below zero is allowed with a warning (§79.4)', () => {
    const thin = ctx([entry(1, { accountId: 'bank', kind: 'OpeningBalance', amount: 10_000 })]);
    const { warnings } = accepted(postTransfer(thin, {
      fromAccountId: 'bank', toAccountId: 'petty', amount: 15_000, date: '2026-10-06', createdBy: 'Accountant',
    }));
    equal(warnings.length, 1);
    ok(warnings[0].includes('overdraft'));
  });

  it('system accounts, closed accounts and self-deposits are refused (§5, §6.4, §9)', () => {
    const intoSystem = refused(postTransfer(ctx(), { ...deposit, toAccountId: 'chq' }));
    ok(intoSystem.some((e) => e.includes('system account')));

    const shut = account('old', 'Old wallet', 'wallet', { status: 'Closed' });
    const toClosed = refused(postTransfer(
      { ...ctx(), accounts: [...ACCOUNTS, shut] },
      { fromAccountId: 'bank', toAccountId: 'old', amount: 1000, date: '2026-10-06', createdBy: 'Accountant' },
    ));
    ok(toClosed.some((e) => e.includes('Closed')));

    const selfish = refused(postTransfer(ctx(), { ...deposit, fromAccountId: 'bank', toAccountId: 'bank' }));
    ok(selfish.some((e) => e.includes('two different accounts')));
  });

  it('nothing is dated into a closed month (§9)', () => {
    const closed = ctx([
      entry(1, { accountId: 'counter', kind: 'OpeningBalance', amount: 700_000 }),
      entry(2, { accountId: 'bank', kind: 'OpeningBalance', amount: 100_000 }),
    ], { closedMonths: ['2026-10'] });
    const errors = refused(postTransfer(closed, deposit));
    ok(errors.some((e) => e.includes('closed month')));
  });

  it('only the §9 links are transfers: petty cash to a wallet is not', () => {
    const wallet = account('w', 'JazzCash', 'wallet');
    const errors = refused(postTransfer(
      { ...ctx(), accounts: [...ACCOUNTS, wallet] },
      { fromAccountId: 'petty', toAccountId: 'w', amount: 1_000, date: '2026-10-06', createdBy: 'Accountant' },
    ));
    ok(errors.some((e) => e.includes('No transfer is defined')));
  });
});

describe('cash deposit to the bank (§9)', () => {
  const draft = {
    fromAccountId: 'counter',
    bankAccountId: 'bank',
    amount: 130_000,
    date: '2026-10-06',
    slipNo: 'DS-772',
    createdBy: 'Accountant',
  };
  const counted = ctx([entry(1, { accountId: 'counter', kind: 'OpeningBalance', amount: 137_500 })]);

  it('requires the deposit slip number', () => {
    const errors = refused(postCashDeposit(counted, { ...draft, slipNo: '  ' }));
    ok(errors.some((e) => e.includes('deposit slip number')));
  });

  it('a short deposit without a note is blocked (§79.9)', () => {
    const errors = refused(postCashDeposit(counted, { ...draft, daysTotal: 137_500 }));
    ok(errors.some((e) => e.includes('a note is required')));
  });

  it('a short deposit with a note leaves the difference as counter cash (§79.9)', () => {
    const { entries: pair } = accepted(postCashDeposit(counted, { ...draft, daysTotal: 137_500, note: 'kept for Monday' }));
    const all = [...counted.entries, ...pair];
    equal(accountBalance(all, 'counter'), 7_500);
    equal(accountBalance(all, 'bank'), 130_000);
    equal(pair[0].reference, 'DS-772');
  });

  it('lands in a bank, from a counter (§9)', () => {
    ok(refused(postCashDeposit(ctx(), { ...draft, bankAccountId: 'chq' })).some((e) => e.includes('bank account')));
    ok(refused(postCashDeposit(ctx(), { ...draft, fromAccountId: 'petty' })).some((e) => e.includes('counter cash account')));
  });
});

describe('corrections by reversal only (§34)', () => {
  const paid = entry(2, { accountId: 'counter', kind: 'StudentPayment', amount: 5_000 });
  const withPaid = ctx([entry(1, { accountId: 'counter', kind: 'OpeningBalance', amount: 100_000 }), paid]);

  it('a reversal nets the entry to zero in its own account (§79.6 shape)', () => {
    const { entries } = accepted(reverseMoneyEntry(withPaid, {
      targetEntryId: paid.id, date: '2026-10-07', reason: 'Receipt voided by mistake', createdBy: 'Admin',
    }));
    equal(entries.length, 1);
    const r = entries[0];
    equal(r.kind, 'Reversal');
    equal(r.direction, 'Out');
    equal(r.accountId, paid.accountId);
    equal(r.amount, paid.amount);
    equal(r.reverses, paid.id);
    equal(accountBalance([...withPaid.entries, r], 'counter'), 100_000);
  });

  it('needs a reason, cannot double-reverse, and never reverses a reversal', () => {
    ok(refused(reverseMoneyEntry(withPaid, { targetEntryId: paid.id, date: '2026-10-07', reason: '', createdBy: 'Admin' }))
      .some((e) => e.includes('needs a reason')));

    const { entries } = accepted(reverseMoneyEntry(withPaid, {
      targetEntryId: paid.id, date: '2026-10-07', reason: 'Voided', createdBy: 'Admin',
    }));
    const twice = { ...withPaid, entries: [...withPaid.entries, ...entries] };
    ok(refused(reverseMoneyEntry(twice, { targetEntryId: paid.id, date: '2026-10-07', reason: 'Voided again', createdBy: 'Admin' }))
      .some((e) => e.includes('already reversed')));

    ok(refused(reverseMoneyEntry(twice, { targetEntryId: entries[0].id, date: '2026-10-08', reason: 'Undo the undo', createdBy: 'Admin' }))
      .some((e) => e.includes('not itself reversed')));
  });

  it('one side of a transfer must go through reverseTransfer (§34)', () => {
    const { entries: pair } = accepted(postTransfer(RICH, deposit));
    const withPair = { ...RICH, entries: [...RICH.entries, ...pair] };
    const single = refused(reverseMoneyEntry(withPair, {
      targetEntryId: pair[0].id, date: '2026-10-08', reason: 'Wrong slip', createdBy: 'Admin',
    }));
    ok(single.some((e) => e.includes('as a pair')));

    const { entries: back } = accepted(reverseTransfer(withPair, {
      targetEntryId: pair[1].id, date: '2026-10-08', reason: 'Wrong slip', createdBy: 'Admin',
    }));
    equal(back.length, 2);
    equal(back[0].actionId, back[1].actionId); // both sides, one new action
    ok(back[0].actionId !== pair[0].actionId);
    const all = [...withPair.entries, ...back];
    equal(accountBalance(all, 'counter'), 700_000); // the money came back…
    equal(accountBalance(all, 'bank'), 100_000); // …and nothing was created or lost
  });

  it('a closed month blocks reversing what it holds (§34, §79.30 shape)', () => {
    const closed = ctx([
      entry(1, { accountId: 'counter', kind: 'OpeningBalance', amount: 100_000, date: '2026-09-20' }),
      entry(2, { accountId: 'counter', kind: 'StudentPayment', amount: 5_000, date: '2026-09-25' }),
    ], { closedMonths: ['2026-09'] });
    const errors = refused(reverseMoneyEntry(closed, {
      targetEntryId: 'me-2', date: '2026-10-07', reason: 'Bounced later', createdBy: 'Admin',
    }));
    ok(errors.some((e) => e.includes('reopen')));
  });

  it('a reversal out of spent petty cash is blocked like any other cash-out (§6.2)', () => {
    const pettyIn = ctx([
      entry(1, { accountId: 'petty', kind: 'OpeningBalance', amount: 20_000, date: '2026-10-01' }),
      entry(2, { accountId: 'bank', kind: 'OpeningBalance', amount: 100_000, date: '2026-10-01' }),
    ]);
    const { entries: topUp } = accepted(postTransfer(pettyIn, {
      fromAccountId: 'bank', toAccountId: 'petty', amount: 10_000, date: '2026-10-02', createdBy: 'Accountant',
    }));
    const spent: MoneyEntry = entry(3, {
      accountId: 'petty', kind: 'BillPayment', direction: 'Out', amount: 30_000, date: '2026-10-03',
    });
    const errors = refused(reverseTransfer({ ...pettyIn, entries: [...pettyIn.entries, ...topUp, spent] }, {
      targetEntryId: topUp[1].id, date: '2026-10-04', reason: 'Top-up was a mistake', createdBy: 'Admin',
    }));
    ok(errors.some((e) => e.includes('Not enough cash in Petty cash')));
  });
});

describe('which corrections the book offers, and to whom (§7.2, §34, §6.5)', () => {
  const hand = entry(1, { accountId: 'bank', kind: 'BankCharge', direction: 'Out', amount: 1_500 });
  const opening = entry(2, { accountId: 'bank', kind: 'OpeningBalance', amount: 1_172_000 });
  const receipt = entry(3, { accountId: 'counter', kind: 'StudentPayment', amount: 5_000 });
  const billPay = entry(4, { accountId: 'bank', kind: 'BillPayment', direction: 'Out', amount: 62_000 });

  it('a hand or setup entry reverses alone; a transfer as a pair; a document entry not here (§7.2)', () => {
    equal(correctionRoute(hand.kind), 'generic');
    equal(correctionRoute(opening.kind), 'generic');
    equal(correctionRoute('TransferOut'), 'transfer');
    equal(correctionRoute(receipt.kind), 'none'); // voided from Payments
    equal(correctionRoute(billPay.kind), 'none'); // voided with its voucher
  });

  it('a row offers Reverse only while it is cleared and not already reversed (§34)', () => {
    equal(reversibleEntry(hand, [hand]), true);
    equal(reversibleEntry(receipt, [receipt]), false); // no route
    equal(reversibleEntry({ ...hand, cleared: false }, [hand]), false); // uncleared
    const reversed = { ...entry(9, { accountId: 'bank', kind: 'Reversal', direction: 'In', reverses: hand.id }) };
    equal(reversibleEntry(hand, [hand, reversed]), false); // already corrected
    equal(reversibleEntry(reversed, [hand, reversed]), false); // a reversal is not reversed
  });

  it('an Accountant is capped; an opening balance always wants an Admin; an Admin never does (§3, §6.5, §77)', () => {
    const L = DEFAULT_FINANCE_LIMITS;
    equal(correctionNeedsAdmin('Admin', 'OpeningBalance', 1, L), false);
    equal(correctionNeedsAdmin('Accountant', 'OpeningBalance', 1, L), true); // §6.5, any amount
    equal(correctionNeedsAdmin('Accountant', 'BankCharge', L.accountantOtherEntryLimit, L), false);
    equal(correctionNeedsAdmin('Accountant', 'BankCharge', L.accountantOtherEntryLimit + 1, L), true);
    equal(correctionNeedsAdmin('Counter', 'BankCharge', 999_999, L), false); // never reaches here
  });
});
