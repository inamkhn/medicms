// ============================================
// MediCMS Desktop — Finance core: the first-run October sample (§13, §78) tests
// The seed is demo content, but it is content the screens show as figures, so it
// has to hold together: the §79.22 totals (costs 385,000, paid 295,000, unpaid
// 90,000), the §13 petty closing of 20,000, one money entry per live voucher so
// a void can reverse it (§34), and nothing that §6/§7 would refuse.
// Run: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, ok } from 'node:assert/strict';

import type { MoneyAccount, MoneyEntry } from './types.ts';
import { accountBalance, moneyEntryProblems } from './entries.ts';
import { DEFAULT_COST_CATEGORIES, findCategory } from './categories.ts';
import { billStatus, costTotals, isOverdue, paidFor, unpaidFor, vendorPayable } from './bills.ts';
import { standingVendorCredit } from './vouchers.ts';
import { DEMO_BILLS, DEMO_MONEY_ENTRIES, DEMO_PAYMENTS, DEMO_VENDORS, DEMO_VOUCHERS, isPristineMoneyBook, withDemoMoneyEntries } from './seed.ts';

const ACCOUNTS: MoneyAccount[] = [
  { id: 'acc-counter', name: 'Counter cash', type: 'counterCash', status: 'Active' },
  { id: 'acc-petty', name: 'Petty cash', type: 'pettyCash', status: 'Active' },
  { id: 'acc-bank', name: 'Meezan main', type: 'bank', status: 'Active' },
];

/** §13's opening positions, 1 October 2026. */
const OPENINGS: MoneyEntry[] = [
  { id: 'me-1', no: 1, date: '2026-10-01', accountId: 'acc-bank', direction: 'In', amount: 1_172_000, kind: 'OpeningBalance', actionId: 'a-1', createdBy: 'Setup', cleared: true, reconciled: false, createdAt: '2026-10-01T08:00:00' },
  { id: 'me-2', no: 2, date: '2026-10-01', accountId: 'acc-counter', direction: 'In', amount: 352_000, kind: 'OpeningBalance', actionId: 'a-2', createdBy: 'Setup', cleared: true, reconciled: false, createdAt: '2026-10-01T08:00:00' },
  { id: 'me-3', no: 3, date: '2026-10-01', accountId: 'acc-petty', direction: 'In', amount: 73_000, kind: 'OpeningBalance', actionId: 'a-3', createdBy: 'Setup', cleared: true, reconciled: false, createdAt: '2026-10-01T08:00:00' },
];

const BOOK = [...OPENINGS, ...DEMO_MONEY_ENTRIES];

describe('§79.22 / §79.11 the sample costs', () => {
  it('reads costs 385,000, paid 295,000, unpaid 90,000', () => {
    const totals = costTotals(DEMO_BILLS, DEMO_PAYMENTS);
    equal(totals.recorded, 385_000);
    equal(totals.paid, 295_000);
    equal(totals.payable, 90_000);
  });

  it('leaves the 90,000 bill on credit — no cash out, 90,000 payable, overdue (§79.11)', () => {
    const credit = DEMO_BILLS.find((b) => b.id === 'b-1');
    if (!credit) throw new Error('the sample carries a 90,000 bill on credit');
    equal(billStatus(credit, DEMO_PAYMENTS), 'Unpaid');
    equal(unpaidFor(credit, DEMO_PAYMENTS), 90_000);
    equal(isOverdue(credit, DEMO_PAYMENTS, '2026-10-14'), true);
    equal(isOverdue(credit, DEMO_PAYMENTS, '2026-10-09'), false);
    const hospital = DEMO_VENDORS.find((v) => v.id === 'v-1');
    if (!hospital) throw new Error('the sample names its hospital');
    equal(vendorPayable(hospital, DEMO_BILLS, DEMO_PAYMENTS), 90_000);
  });

  it('shows the paid bills as Paid and never pays a bill twice', () => {
    for (const bill of DEMO_BILLS.filter((b) => b.id !== 'b-1')) {
      equal(billStatus(bill, DEMO_PAYMENTS), 'Paid');
      equal(paidFor(bill, DEMO_PAYMENTS), bill.amount);
    }
    // Only the live vouchers' splits are in the payments list — PV-0001 was voided.
    for (const payment of DEMO_PAYMENTS) {
      ok(payment.voucherNo !== 'PV-0001');
    }
    equal(standingVendorCredit(DEMO_VOUCHERS, 'v-4'), 0);
  });

  it('names only vendors and categories that exist (§24, §25)', () => {
    for (const bill of DEMO_BILLS) {
      if (bill.vendorId) ok(DEMO_VENDORS.some((v) => v.id === bill.vendorId), `bill ${bill.no} names ${bill.vendorId}`);
      ok(findCategory(DEFAULT_COST_CATEGORIES, bill.categoryId), `bill ${bill.no} needs a real category`);
    }
  });
});

describe('§13 the money the sample moved', () => {
  it('brings petty cash to its 20,000 closing after the top-up', () => {
    equal(accountBalance(BOOK, 'acc-petty'), 20_000);
    equal(accountBalance(BOOK, 'acc-bank'), 930_000);
    equal(accountBalance(BOOK, 'acc-counter'), 352_000);
    // Nothing spends cash the account does not hold (§6.2).
    for (const account of ACCOUNTS) ok(accountBalance(BOOK, account.id) >= 0);
  });

  it('posts one money entry per live voucher, and reverses the void (§34)', () => {
    for (const voucher of DEMO_VOUCHERS) {
      if (voucher.mode === 'Cheque') continue;
      const entry = DEMO_MONEY_ENTRIES.find((e) => e.id === voucher.moneyEntryId);
      if (!entry) throw new Error(`${voucher.no} must carry its money entry`);
      equal(entry.amount, voucher.amount);
      equal(entry.accountId, voucher.accountId);
      equal(entry.linkedDoc, voucher.no);
      // The split the voucher applied adds up to what left, plus any credit (§27).
      const applied = voucher.allocations.reduce((sum, a) => sum + a.amount, 0);
      equal(applied - (voucher.creditUsed ?? 0) + voucher.credit, voucher.amount);
    }
    const voided = DEMO_VOUCHERS.find((v) => v.voided);
    if (!voided) throw new Error('the sample shows a voided voucher');
    const reversal = DEMO_MONEY_ENTRIES.find((e) => e.reverses === voided.moneyEntryId);
    if (!reversal) throw new Error('a void carries a reversal of its entry (§34)');
    equal(reversal.kind, 'Reversal');
    equal(reversal.direction, 'In');
    equal(reversal.accountId, voided.accountId);
    ok(reversal.reason?.trim());
  });

  it('holds entries §6 and §7 would accept, and no number is reused', () => {
    for (const entry of DEMO_MONEY_ENTRIES) {
      const problems = moneyEntryProblems(entry, { accounts: ACCOUNTS, entries: BOOK });
      ok(!problems.length, `${entry.id}: ${problems.join(' ')}`);
    }
    const nos = DEMO_MONEY_ENTRIES.map((e) => e.no);
    equal(new Set(nos).size, nos.length);
    const ids = DEMO_MONEY_ENTRIES.map((e) => e.id);
    equal(new Set(ids).size, ids.length);
    equal(new Set(DEMO_VOUCHERS.map((v) => v.no)).size, DEMO_VOUCHERS.length);
    equal(new Set(DEMO_BILLS.map((b) => b.no)).size, DEMO_BILLS.length);
    equal(new Set(DEMO_VENDORS.map((v) => v.name.toLowerCase())).size, DEMO_VENDORS.length);
    // The sample leaves the number series ready to go on forward (§7.1).
    equal(Math.max(...BOOK.map((e) => e.no)), 11);
  });
});

describe('§78.1 the seed only lands on a pristine book', () => {
  it('adds the movement once and never to a book with real entries', () => {
    ok(isPristineMoneyBook(OPENINGS));
    equal(withDemoMoneyEntries(OPENINGS).length, BOOK.length);
    // Appending twice does not duplicate (§7.1 numbers go forward only once).
    equal(withDemoMoneyEntries(withDemoMoneyEntries(OPENINGS)).length, BOOK.length);
    const used = [...OPENINGS, ...DEMO_MONEY_ENTRIES.slice(0, 1)];
    ok(!isPristineMoneyBook(used));
    equal(withDemoMoneyEntries(used).length, used.length);
  });
});
