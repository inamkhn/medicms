// ============================================
// MediCMS Desktop — Finance core: payment vouchers (§29–§32) tests
// §79.12 a voucher part-pays a bill, §79.14 an overpayment leaves vendor credit,
// §79.20 the approval limit (50,000 allowed / 60,000 needs an Admin), §79.3 the
// cash floor, the petty per-voucher cap (§77), cheque mode posting no money
// (§30/§31.2) and §34 voiding a voucher reverses its entry. No store, no clock.
// Run: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { MoneyAccount, MoneyEntry } from './types.ts';
import { DEFAULT_FINANCE_LIMITS } from './limits.ts';
import type { Vendor } from './vendors.ts';
import type { Bill, BillPayment } from './bills.ts';
import type { Chequebook } from './cheques.ts';
import {
  approvalRequired,
  createPaymentVoucher,
  nextVoucherNo,
  reversalApprovalRequired,
  splitCredit,
  standingVendorCredit,
  voidVoucher,
  type PayOutContext,
  type PayOutDraft,
  type PaymentVoucher,
} from './vouchers.ts';

const NOW = '2026-10-20T10:00:00';
const TODAY = '2026-10-20';

const COUNTER: MoneyAccount = { id: 'acc-counter', name: 'Counter cash', type: 'counterCash', status: 'Active' };
const PETTY: MoneyAccount = { id: 'acc-petty', name: 'Petty cash', type: 'pettyCash', status: 'Active' };
const BANK: MoneyAccount = { id: 'acc-bank', name: 'Meezan main', type: 'bank', status: 'Active' };

function opening(no: number, accountId: string, amount: number): MoneyEntry {
  return {
    id: `me-${no}`, no, date: '2026-10-01', accountId, direction: 'In', amount,
    kind: 'OpeningBalance', actionId: `a-${no}`, createdBy: 'Setup',
    cleared: true, reconciled: false, createdAt: '2026-10-01T08:00:00',
  };
}

const DEFAULT_ENTRIES: MoneyEntry[] = [
  opening(1, 'acc-counter', 200_000),
  opening(2, 'acc-petty', 20_000),
  opening(3, 'acc-bank', 500_000),
];

const CTH: Vendor = { id: 'v-1', name: 'City Teaching Hospital', type: 'Hospital', termsDays: 30, status: 'Active' };
const VENDORS = [CTH];

function bill(over: Partial<Bill> = {}): Bill {
  return {
    id: 'b-1', no: 'B-0001', vendorId: 'v-1', categoryId: 'cat-clinical-training',
    description: 'Clinical training', amount: 90_000, date: '2026-10-03', dueDate: '2026-10-30',
    attachments: [], adjustments: [], status: 'Unpaid', createdBy: 'Saba', createdAt: NOW, ...over,
  };
}

const BOOK: Chequebook = { id: 'ckb-1', bankAccountId: 'acc-bank', fromNo: '004850', toNo: '004899', status: 'Active' };

function ctx(over: Partial<PayOutContext> = {}): PayOutContext {
  return {
    accounts: [COUNTER, PETTY, BANK],
    entries: DEFAULT_ENTRIES,
    bills: [bill()],
    payments: [] as BillPayment[],
    vendors: VENDORS,
    vouchers: [] as PaymentVoucher[],
    chequebooks: [BOOK],
    cheques: [],
    closedMonths: [],
    role: 'Admin',
    today: TODAY,
    now: NOW,
    limits: DEFAULT_FINANCE_LIMITS,
    series: { entryNo: 10, actionNo: 10, voucherNo: 'PV-0001' },
    ...over,
  };
}

function draft(over: Partial<PayOutDraft> = {}): PayOutDraft {
  return {
    vendorId: 'v-1',
    amount: 30_000,
    date: TODAY,
    mode: 'Cash',
    accountId: 'acc-counter',
    preparedBy: 'Saba',
    ...over,
  };
}

describe('§29 a voucher pays a bill (§79.12)', () => {
  it('allocates oldest due first and posts one money-out entry', () => {
    const result = createPaymentVoucher(draft(), ctx());
    if (!result.ok) throw new Error('voucher should succeed');
    equal(result.voucher.no, 'PV-0001');
    equal(result.voucher.amount, 30_000);
    deepStrictEqual(result.voucher.allocations, [{ billId: 'b-1', amount: 30_000, voucherNo: 'PV-0001' }]);
    equal(result.voucher.credit, 0);
    const entry = result.moneyEntry;
    if (!entry) throw new Error('a cash voucher posts a money entry');
    equal(entry.kind, 'BillPayment');
    equal(entry.direction, 'Out');
    equal(entry.accountId, 'acc-counter');
    equal(entry.amount, 30_000);
    // The allocations are the same objects the screen appends to the bill payments.
    deepStrictEqual(result.payments, result.voucher.allocations);
  });

  it('leaves an overpayment as vendor credit and applies it to the next bill (§79.14)', () => {
    // Owes 20,000, pays 25,000 — 5,000 stays as credit and nothing is used yet.
    const small = [bill({ amount: 20_000 })];
    const over = createPaymentVoucher(draft({ amount: 25_000 }), ctx({ bills: small }));
    if (!over.ok) throw new Error('voucher should succeed');
    deepStrictEqual(over.voucher.allocations, [{ billId: 'b-1', amount: 20_000, voucherNo: 'PV-0001' }]);
    equal(over.voucher.credit, 5_000);
    equal(over.voucher.creditUsed, 0);
    equal(standingVendorCredit([over.voucher], 'v-1'), 5_000);

    // The next bill is 8,000 and only 3,000 is paid: the standing credit covers
    // 5,000 of it by itself (§27 "applied to the next bill automatically").
    const next = [bill({ id: 'b-2', no: 'B-0002', amount: 8_000 })];
    const register = [over.voucher];
    const follow = createPaymentVoucher(
      draft({ amount: 3_000 }),
      ctx({ bills: next, payments: [], vouchers: register, series: { entryNo: 11, actionNo: 11, voucherNo: 'PV-0002' } }),
    );
    if (!follow.ok) throw new Error('the credit payment should succeed');
    deepStrictEqual(follow.voucher.allocations, [{ billId: 'b-2', amount: 8_000, voucherNo: 'PV-0002' }]);
    equal(follow.voucher.creditUsed, 5_000);
    equal(follow.voucher.credit, 0);
    equal(follow.moneyEntry?.amount, 3_000);
    // The credit is now spent, and it comes back if that voucher is voided (§34).
    equal(standingVendorCredit([...register, follow.voucher], 'v-1'), 0);
    equal(standingVendorCredit([...register, { ...follow.voucher, voided: true }], 'v-1'), 5_000);
  });

  it('applies standing credit before the money and keeps every rupee accounted (§27)', () => {
    // Covering 10,000 with 4,000 credit pays 6,000 of money and uses all 4,000.
    deepStrictEqual(splitCredit(10_000, 4_000, 6_000), { creditUsed: 4_000, credit: 0 });
    // Covering 3,000 with 5,000 credit uses only 3,000 and pays no money.
    deepStrictEqual(splitCredit(3_000, 5_000, 0), { creditUsed: 3_000, credit: 0 });
    // Credit cannot make the money negative — a payment still leaves its credit.
    deepStrictEqual(splitCredit(8_000, 5_000, 5_000), { creditUsed: 5_000, credit: 2_000 });
  });

  it('warns (not blocks) on a large cash payment (§30)', () => {
    const result = createPaymentVoucher(draft({ amount: 30_000 }), ctx({ bills: [bill({ amount: 90_000 })] }));
    if (!result.ok) throw new Error('voucher should succeed');
    ok(result.warnings.some((w) => w.includes('consider a bank transfer')));
  });
});

describe('§32 approval limit (§79.20)', () => {
  it('lets an Accountant pay up to the limit without approval', () => {
    ok(!approvalRequired('Accountant', 50_000, DEFAULT_FINANCE_LIMITS));
    // A 50,000 bill paid by an Accountant goes straight through.
    const result = createPaymentVoucher(
      draft({ amount: 50_000 }),
      ctx({ role: 'Accountant', bills: [bill({ amount: 50_000 })] }),
    );
    ok(result.ok);
  });

  it('needs an Admin above the limit', () => {
    ok(approvalRequired('Accountant', 60_000, DEFAULT_FINANCE_LIMITS));
    const blocked = createPaymentVoucher(draft({ amount: 60_000 }), ctx({ role: 'Accountant' }));
    ok(!blocked.ok && blocked.errors.some((e) => e.includes('needs an Admin to approve')));
    // ...but the same payment with an approving Admin name posts.
    const approved = createPaymentVoucher(draft({ amount: 60_000, approvedBy: 'Inam' }), ctx({ role: 'Accountant' }));
    ok(approved.ok && approved.voucher.approvedBy === 'Inam');
    // An Admin never needs approval.
    ok(!approvalRequired('Admin', 60_000, DEFAULT_FINANCE_LIMITS));
  });

  it('needs an Admin to reverse above the reversal limit (§3, §77)', () => {
    const created = createPaymentVoucher(draft({ amount: 60_000, approvedBy: 'Inam' }), ctx({ role: 'Accountant' }));
    if (!created.ok) throw new Error('setup voucher failed');
    const entry = created.moneyEntry;
    if (!entry) throw new Error('a cash voucher posts a money entry');
    const postings = { accounts: [COUNTER, PETTY, BANK], entries: [...DEFAULT_ENTRIES, entry], closedMonths: [], now: NOW };
    ok(reversalApprovalRequired('Accountant', 60_000, DEFAULT_FINANCE_LIMITS));
    const blocked = voidVoucher(created.voucher, postings, [], { reason: 'wrong amount', date: TODAY, createdBy: 'Saba', role: 'Accountant', limits: DEFAULT_FINANCE_LIMITS });
    ok(!blocked.ok && blocked.errors.some((e) => e.includes('reversal limit')));
    const voided = voidVoucher(created.voucher, postings, [], { reason: 'wrong amount', date: TODAY, createdBy: 'Saba', role: 'Accountant', limits: DEFAULT_FINANCE_LIMITS, approvedBy: 'Inam' });
    ok(voided.ok);
  });
});

describe('§6.2 / §77 the hard blocks', () => {
  it('refuses to spend cash that is not there (§79.3)', () => {
    // A counter holding only 20,000 cannot pay a 25,000 bill.
    const thin: MoneyEntry[] = [opening(1, 'acc-counter', 20_000)];
    const result = createPaymentVoucher(draft({ amount: 25_000 }), ctx({ entries: thin, bills: [bill({ amount: 90_000 })] }));
    ok(!result.ok && result.errors.some((e) => e.includes('Not enough cash')));
  });

  it('caps a petty cash voucher at the per-voucher limit (§77)', () => {
    const result = createPaymentVoucher(draft({ amount: 6_000, accountId: 'acc-petty' }), ctx({ bills: [] }));
    ok(!result.ok && result.errors.some((e) => e.includes('petty cash voucher is limited')));
  });

  it('stamps the chosen category on a petty voucher\'s money-out entry (§66)', () => {
    const result = createPaymentVoucher(
      draft({ vendorId: undefined, payeeText: 'Stationery shop', category: 'Books and stationery', amount: 4_200, accountId: 'acc-petty' }),
      ctx({ bills: [] }),
    );
    if (!result.ok) throw new Error('a petty voucher within the limit should succeed');
    const entry = result.moneyEntry;
    if (!entry) throw new Error('a cash petty voucher posts a money entry');
    equal(entry.kind, 'BillPayment');
    equal(entry.accountId, 'acc-petty');
    equal(entry.category, 'Books and stationery');
    equal(entry.payee, 'Stationery shop');
  });

  it('blocks a payment dated into the future or a closed month (§34)', () => {
    const future = createPaymentVoucher(draft({ date: '2026-12-01' }), ctx());
    ok(!future.ok && future.errors.some((e) => e.includes('future')));
    const closed = createPaymentVoucher(draft({ date: '2026-09-15' }), ctx({ closedMonths: ['2026-09'] }));
    ok(!closed.ok && closed.errors.some((e) => e.includes('closed month')));
  });
});

describe('§30 / §31.2 a cheque voucher posts no money', () => {
  it('records the cheque and leaves the balance to clearing', () => {
    const result = createPaymentVoucher(
      draft({ mode: 'Cheque', amount: 30_000, chequebookId: 'ckb-1', chequeNo: '004850', chequeDate: TODAY }),
      ctx(),
    );
    if (!result.ok) throw new Error('cheque voucher should succeed');
    equal(result.moneyEntry, undefined);
    const cheque = result.cheque;
    if (!cheque) throw new Error('a cheque voucher records a cheque');
    equal(cheque.chequeNo, '004850');
    equal(cheque.linkedDoc, 'PV-0001');
    equal(result.voucher.chequeId, cheque.id);
  });
});

describe('§34 voiding a voucher', () => {
  it('reverses its money entry in the same account', () => {
    const created = createPaymentVoucher(draft({ amount: 30_000 }), ctx());
    if (!created.ok) throw new Error('setup voucher failed');
    const entry = created.moneyEntry as MoneyEntry;
    const voided = voidVoucher(
      created.voucher,
      { accounts: [COUNTER, PETTY, BANK], entries: [...DEFAULT_ENTRIES, entry], closedMonths: [], now: NOW },
      [],
      { reason: 'entered in error', date: TODAY, createdBy: 'Saba', role: 'Admin', limits: DEFAULT_FINANCE_LIMITS },
    );
    if (!voided.ok) throw new Error('void should succeed');
    const reversal = voided.reversal;
    if (!reversal) throw new Error('a void reverses the money entry');
    equal(reversal.direction, 'In');
    equal(reversal.reverses, entry.id);
    equal(reversal.amount, 30_000);
    deepStrictEqual(voided.paymentsToRemove, created.voucher.allocations);
  });

  it('refuses a second void and needs a reason', () => {
    const created = createPaymentVoucher(draft(), ctx());
    if (!created.ok) throw new Error('setup voucher failed');
    const entry = created.moneyEntry as MoneyEntry;
    const postings = { accounts: [COUNTER, PETTY, BANK], entries: [...DEFAULT_ENTRIES, entry], closedMonths: [], now: NOW };
    ok(!voidVoucher(created.voucher, postings, [], { reason: '', date: TODAY, createdBy: 'Saba', role: 'Admin', limits: DEFAULT_FINANCE_LIMITS }).ok);
    const voidedVoucher = { ...created.voucher, voided: true };
    ok(!voidVoucher(voidedVoucher, postings, [], { reason: 'again', date: TODAY, createdBy: 'Saba', role: 'Admin', limits: DEFAULT_FINANCE_LIMITS }).ok);
  });
});

describe('§29 voucher numbers never reused', () => {
  it('counts the next PV number off the register', () => {
    equal(nextVoucherNo([]), 'PV-0001');
    const vouchers = [{ no: 'PV-0001' }, { no: 'PV-0412' }] as never;
    equal(nextVoucherNo(vouchers), 'PV-0413');
  });
});
