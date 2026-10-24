// ============================================
// MediCMS Desktop — Finance core: the report queries (§52–§55)
// §79-style checks: the cash view splits fees by the route they took, the cost
// view and the cash view bridge to one another (§52), payables age the way the
// vendor page prints them (§55.2), receivables read the ledger's own balance
// (§19), and the deadline counts a program's cost against its fees (§54.12).
// Pure queries — no store, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { MoneyAccount, MoneyEntry } from './types.ts';
import type { Bill, BillPayment } from './bills.ts';
import type { CostCategory } from './categories.ts';
import type { Vendor } from './vendors.ts';
import type { LedgerEntry, LedgerEntryType } from '../ledger/types.ts';
import {
  collectedByProgram,
  costByCategory,
  costCashBridge,
  feeCollection,
  moneyFlow,
  payablesReport,
  programSummary,
  receivablesReport,
} from './reports.ts';

const NOW = '2026-10-31T18:00:00';
const TODAY = '2026-10-23';

function account(id: string, name: string, type: MoneyAccount['type']): MoneyAccount {
  return { id, name, type, status: 'Active' };
}

const COUNTER = account('acc-counter', 'Counter cash', 'counterCash');
const BANK = account('acc-bank', 'Meezan, main', 'bank');
const CHEQUES = account('acc-cheques', 'Cheques in hand', 'chequesInHand');
const ISSUED = account('acc-issued', 'Issued cheques', 'issuedCheques');
const ACCOUNTS = [COUNTER, BANK, CHEQUES, ISSUED];

function entry(no: number, over: Partial<MoneyEntry>): MoneyEntry {
  return {
    id: `me-${no}`,
    no,
    date: '2026-10-05',
    accountId: 'acc-bank',
    direction: 'In',
    amount: 0,
    kind: 'StudentPayment',
    actionId: `a-${no}`,
    createdBy: 'Tester',
    cleared: true,
    reconciled: false,
    createdAt: NOW,
    ...over,
  };
}

const CATEGORIES: CostCategory[] = [
  { id: 'cat-rent', group: 'premises', name: 'Rent' },
  { id: 'cat-utilities-electric', group: 'premises', name: 'Utilities: Electricity' },
];

const OCTOBER: MoneyEntry[] = [
  entry(1, { accountId: 'acc-counter', amount: 500_000, mode: 'Cash' }),
  entry(2, { amount: 800_000, mode: 'Online' }),
  entry(3, { amount: 120_000, mode: 'Bank' }),
  entry(4, { direction: 'Out', amount: 400_000, kind: 'BillPayment', category: 'cat-rent', payee: 'Rashid Traders' }),
  entry(5, { direction: 'Out', amount: 300_000, kind: 'BillPayment', category: 'cat-utilities-electric', payee: 'Electric Co' }),
  entry(6, { direction: 'Out', amount: 600_000, kind: 'PayrollPayment' }),
  entry(7, { direction: 'Out', amount: 87_000, kind: 'RefundToStudent' }),
  entry(8, { direction: 'Out', amount: 100_000, kind: 'BankCharge' }),
  entry(9, { direction: 'Out', amount: 100_000, kind: 'TransferOut' }),
  entry(10, { accountId: 'acc-counter', amount: 100_000, kind: 'TransferIn' }),
  entry(11, { date: '2026-10-01', amount: 1_000_000, kind: 'OpeningBalance' }),
  // A cheque sitting in a system account is not the institute's money yet (§5).
  entry(12, { accountId: 'acc-cheques', amount: 50_000, mode: 'Cheque' }),
  // An uncleared entry is outside the cash view until it clears (§6.1).
  entry(13, { amount: 90_000, cleared: false, mode: 'Cash' }),
  // Outside the period.
  entry(14, { date: '2026-09-30', amount: 70_000, mode: 'Cash' }),
];

describe('the cash view (§55.1)', () => {
  it('splits fees by route and money out by the purpose it was paid for', () => {
    const flow = moneyFlow({ entries: OCTOBER, accounts: ACCOUNTS, categories: CATEGORIES, from: '2026-10-01', to: '2026-10-31' });
    equal(flow.totalIn, 1_420_000);
    equal(flow.totalOut, 1_487_000);
    equal(flow.net, -67_000);
    deepStrictEqual(
      flow.in.map((line) => [line.label, line.amount]),
      [
        ['Student fees: online', 800_000],
        ['Student fees: cash', 500_000],
        ['Student fees: bank', 120_000],
      ],
    );
    deepStrictEqual(
      flow.out.map((line) => [line.label, line.amount]),
      [
        ['Payroll', 600_000],
        ['Rent', 400_000],
        ['Utilities: Electricity', 300_000],
        ['Bank charges', 100_000],
        ['Student refunds', 87_000],
      ],
    );
  });

  it('counts transfers apart and never in the totals (§55.1)', () => {
    const flow = moneyFlow({ entries: OCTOBER, accounts: ACCOUNTS, from: '2026-10-01', to: '2026-10-31' });
    equal(flow.transfersIn, 100_000);
    equal(flow.transfersOut, 100_000);
    equal(flow.totalIn, 1_420_000);
    equal(flow.net, -67_000);
  });
});

describe('the two views bridge (§52)', () => {
  it('cost less unpaid, plus payroll and refunds, is money out', () => {
    const bridge = costCashBridge({ costs: 700_000, unpaidBills: 200_000, payrollPaid: 600_000, refunds: 87_000 });
    deepStrictEqual(bridge, {
      costs: 700_000,
      lessUnpaid: 200_000,
      plusPayroll: 600_000,
      plusRefunds: 87_000,
      moneyOut: 1_187_000,
    });
  });

  it('groups the cost view by category with paid and unpaid split', () => {
    const bills: Bill[] = [
      bill('b-1', 'v-1', 'cat-rent', 60_000, '2026-10-10'),
      bill('b-2', 'v-1', 'cat-utilities-electric', 30_000, '2026-10-27'),
    ];
    const payments: BillPayment[] = [{ billId: 'b-1', amount: 10_000 }];
    const cost = costByCategory({ bills, payments, categories: CATEGORIES, from: '2026-10-01', to: '2026-10-31' });
    equal(cost.totalBilled, 90_000);
    equal(cost.totalPaid, 10_000);
    equal(cost.totalUnpaid, 80_000);
    equal(cost.rows[0].name, 'Rent');
    equal(cost.rows[0].unpaid, 50_000);
  });
});

function bill(id: string, vendorId: string, categoryId: string, amount: number, dueDate: string, over: Partial<Bill> = {}): Bill {
  return {
    id,
    no: id.toUpperCase(),
    vendorId,
    categoryId,
    description: `${categoryId} bill`,
    amount,
    date: '2026-10-01',
    dueDate,
    attachments: [],
    status: 'Unpaid',
    adjustments: [],
    createdBy: 'Tester',
    createdAt: NOW,
    ...over,
  };
}

const VENDORS: Vendor[] = [
  { id: 'v-1', name: 'Rashid Traders', type: 'Vendor', termsDays: 15, status: 'Active' },
  { id: 'v-2', name: 'Electric Co', type: 'Utility', termsDays: 7, status: 'Active' },
];

describe('payables (§55.2)', () => {
  it('ages what is owed by vendor and names the next bill to fall due', () => {
    const bills: Bill[] = [
      bill('b-1', 'v-1', 'cat-rent', 60_000, '2026-10-10'),
      bill('b-2', 'v-1', 'cat-utilities-electric', 30_000, '2026-10-27'),
      bill('b-3', 'v-2', 'cat-utilities-electric', 50_000, '2026-07-01'),
    ];
    const payments: BillPayment[] = [{ billId: 'b-1', amount: 10_000 }];
    const report = payablesReport({ bills, payments, vendors: VENDORS, today: TODAY });

    equal(report.totals.total, 130_000);
    equal(report.overdue, 100_000);
    equal(report.dueThisWeek, 30_000);
    equal(report.rows[0].name, 'Rashid Traders');
    equal(report.rows[0].d1to30, 50_000);
    equal(report.rows[0].notYetDue, 30_000);
    deepStrictEqual(report.nextDue, { date: '2026-10-27', vendor: 'Rashid Traders', amount: 30_000 });
  });
});

// -------------------------------------------
// Ledger fixtures for the fee side (§19, §54.4)
// -------------------------------------------

function ledger(sno: number, no: number, type: LedgerEntryType, amount: number, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: `e-${sno}-${no}`,
    studentSno: sno,
    entryNo: no,
    date: '2026-10-05',
    type,
    amount,
    description: `${type} ${no}`,
    createdBy: 'Tester',
    createdAt: NOW,
    balanceAfter: 0,
    ...over,
  };
}

const LEDGER: LedgerEntry[] = [
  ledger(1, 1, 'FeeCharge', 100_000, { dueDate: '2026-10-01' }),
  ledger(1, 2, 'Payment', 40_000, { paymentMode: 'Cash' }),
  ledger(2, 1, 'FeeCharge', 50_000, { dueDate: '2026-10-10' }),
  ledger(3, 1, 'Payment', 20_000, { paymentMode: 'Online' }),
];

describe('receivables and held money (§19, §18)', () => {
  it('splits outstanding, overdue, struck-off dues and credit held', () => {
    const report = receivablesReport({
      students: [
        { sno: 1, name: 'Ayesha Khan' },
        { sno: 2, name: 'Bilal Ahmed', struckOff: true },
        { sno: 3, name: 'Chaudhry Sana' },
      ],
      entries: LEDGER,
      today: TODAY,
    });
    equal(report.outstanding, 60_000);
    equal(report.overdue, 60_000);
    equal(report.struckOffDues, 50_000);
    equal(report.creditHeld, 20_000);
    equal(report.ageing.d1to30, 60_000);
    equal(report.rows.length, 3);
    equal(report.rows[0].sno, 1);
  });
});

describe('fee collection (§54.4)', () => {
  it('reads billed, collected by route, refunded and outstanding', () => {
    const entries: LedgerEntry[] = [
      ledger(1, 1, 'FeeCharge', 100_000, { dueDate: '2026-10-01' }),
      ledger(1, 2, 'Concession', 10_000, { reason: 'Sibling discount' }),
      ledger(1, 3, 'Payment', 60_000, { paymentMode: 'Cash' }),
      ledger(1, 4, 'Payment', 25_000, { paymentMode: 'Bank' }),
      ledger(1, 5, 'Refund', 5_000, { reason: 'Lab fee refunded' }),
      ledger(1, 6, 'Payment', 9_000, { date: '2026-09-30', paymentMode: 'Cash' }),
    ];
    const report = feeCollection(entries, '2026-10-01', '2026-10-31');
    equal(report.billed, 100_000);
    equal(report.concessions, 10_000);
    equal(report.collected, 85_000);
    equal(report.refunded, 5_000);
    deepStrictEqual(
      report.byMode.map((row) => [row.mode, row.amount]),
      [
        ['Cash', 60_000],
        ['Bank', 25_000],
      ],
    );
    // Outstanding is today's balance across every entry, not only the period's:
    // the September payment still reduces what is owed (§19).
    equal(report.outstanding, 1_000);
  });

  it('leaves a reversed payment out of what was collected (§7.1)', () => {
    const entries: LedgerEntry[] = [
      ledger(1, 1, 'FeeCharge', 100_000, { dueDate: '2026-10-01' }),
      ledger(1, 2, 'Payment', 60_000, { paymentMode: 'Cash' }),
      ledger(1, 3, 'Payment', 25_000, { paymentMode: 'Cheque' }),
      // §7.1: a bounce is a Reversal pointing back at the payment it undoes.
      ledger(1, 4, 'Reversal', 25_000, { linkedEntryId: 'e-1-3', reason: 'Cheque bounced' }),
    ];
    const report = feeCollection(entries, '2026-10-01', '2026-10-31');
    equal(report.collected, 60_000);
    deepStrictEqual(report.byMode.map((row) => [row.mode, row.amount]), [['Cash', 60_000]]);
  });
});

describe('program summary (§54.12)', () => {
  it('groups what each program collected, leaving reversed payments out', () => {
    const entries: LedgerEntry[] = [
      ledger(1, 1, 'Payment', 80_000, { paymentMode: 'Cash' }),
      ledger(2, 1, 'Payment', 40_000, { paymentMode: 'Bank' }),
      ledger(3, 1, 'Payment', 15_000, { paymentMode: 'Bank' }),
      ledger(1, 2, 'Payment', 20_000, { paymentMode: 'Cash' }),
      ledger(1, 3, 'Reversal', 20_000, { linkedEntryId: 'e-1-2', reason: 'Entered twice' }),
      // Outside the period, and a student with no program tag.
      ledger(2, 2, 'Payment', 90_000, { date: '2026-09-30', paymentMode: 'Bank' }),
      ledger(9, 1, 'Payment', 70_000, { paymentMode: 'Cash' }),
    ];
    const programOf = new Map<number, string>([[1, 'BSc Nursing'], [2, 'FSc Pre-Medical'], [3, 'BSc Nursing']]);
    const totals = collectedByProgram(entries, programOf, '2026-10-01', '2026-10-31');
    deepStrictEqual([...totals], [
      ['BSc Nursing', 95_000],
      ['FSc Pre-Medical', 40_000],
    ]);
  });

  it("puts a program's costs against the fees collected for it", () => {
    const bills: Bill[] = [
      bill('b-1', 'v-1', 'cat-rent', 300_000, '2026-10-10', { program: 'BSc Nursing' }),
      bill('b-2', 'v-2', 'cat-utilities-electric', 100_000, '2026-10-12', { program: 'BSc Nursing' }),
      bill('b-3', 'v-1', 'cat-rent', 80_000, '2026-10-14', { program: 'FSc Pre-Medical' }),
      bill('b-4', 'v-1', 'cat-rent', 40_000, '2026-10-15', { status: 'Cancelled', program: 'BSc Nursing' }),
    ];
    const collected = collectedByProgram(
      [
        ledger(1, 1, 'Payment', 250_000, { paymentMode: 'Cash' }),
        ledger(3, 1, 'Payment', 100_000, { paymentMode: 'Bank' }),
      ],
      new Map<number, string>([[1, 'BSc Nursing'], [3, 'BSc Nursing']]),
      '2026-10-01',
      '2026-10-31',
    );
    const rows = programSummary({ bills, collectedByProgram: collected });
    equal(rows.length, 2);
    equal(rows[0].program, 'BSc Nursing');
    equal(rows[0].costs, 400_000);
    equal(rows[0].collected, 350_000);
    equal(rows[0].difference, -50_000);
    equal(rows[1].program, 'FSc Pre-Medical');
    equal(rows[1].difference, -80_000);
    ok(rows[1].collected === 0);
  });
});
