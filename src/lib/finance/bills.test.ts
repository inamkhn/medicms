// ============================================
// MediCMS Desktop — Finance core: bills, payables, allocation (§26, §27) tests
// §79.11 bill on credit, §79.12 part payment, §79.13 allocation oldest due
// first, §79.14 vendor credit, §79.19 duplicate bill warning, §79.21 staff
// category blocked, §79.22 the §35.1 October sample. No store, no clock.
// Run: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import { DEFAULT_FINANCE_LIMITS } from './limits.ts';
import { DEFAULT_COST_CATEGORIES } from './categories.ts';
import type { Vendor } from './vendors.ts';
import {
  allocatePayment,
  ageingBuckets,
  billStatus,
  cancelBill,
  costTotals,
  duplicateBillWarning,
  isOverdue,
  recordCost,
  unpaidFor,
  vendorPayable,
  type Bill,
  type BillPayment,
  type RecordCostContext,
  type RecordCostDraft,
} from './bills.ts';

const NOW = '2026-10-09T10:00:00';
const TODAY = '2026-10-09';

const CTH: Vendor = { id: 'v-1', name: 'City Teaching Hospital', type: 'Hospital', termsDays: 30, status: 'Active' };
const ASLAM: Vendor = { id: 'v-2', name: 'Aslam Properties', type: 'Landlord', termsDays: 5, status: 'Active' };
const VENDORS = [CTH, ASLAM];

function ctx(over: Partial<RecordCostContext> = {}): RecordCostContext {
  return {
    categories: DEFAULT_COST_CATEGORIES,
    vendors: VENDORS,
    bills: [],
    closedMonths: [],
    today: TODAY,
    now: NOW,
    limits: DEFAULT_FINANCE_LIMITS,
    ...over,
  };
}

function draft(over: Partial<RecordCostDraft> = {}): RecordCostDraft {
  return {
    vendorId: 'v-1',
    categoryId: 'cat-clinical-training',
    description: 'Clinical training, September batch',
    amount: 90_000,
    date: '2026-10-03',
    billDate: '2026-10-03',
    billNo: 'CTH-2210',
    attachments: ['bill-cth-2210.pdf'],
    createdBy: 'Saba',
    ...over,
  };
}

/** A finished bill, built directly so allocation tests read clearly. */
function bill(over: Partial<Bill> = {}): Bill {
  return {
    id: 'b-1', no: 'B-0001', vendorId: 'v-1', categoryId: 'cat-clinical-training',
    description: 'Cost', amount: 10_000, date: '2026-10-01', attachments: [], adjustments: [],
    status: 'Unpaid', createdBy: 'Saba', createdAt: NOW, ...over,
  };
}

describe('§26 record a cost (§79.11)', () => {
  it('creates an unpaid bill with a due date from the vendor terms', () => {
    const result = recordCost(draft(), ctx());
    if (!result.ok) throw new Error('record should succeed');
    const b = result.bill;
    equal(b.status, 'Unpaid');
    equal(b.no, 'B-0001');
    // Bill date 3 Oct + 30 days terms = 2 Nov (§26).
    equal(b.dueDate, '2026-11-02');
    // §79.11: cost 90,000, cash out 0, payable 90,000.
    const totals = costTotals([b], []);
    equal(totals.recorded, 90_000);
    equal(totals.paid, 0);
    equal(totals.payable, 90_000);
  });

  it('refuses a future date, a closed month, a missing payee and a missing image above the limit', () => {
    const future = recordCost(draft({ date: '2026-11-01' }), ctx());
    ok(!future.ok && future.errors.some((e) => e.includes('future')));

    const closed = recordCost(draft({ date: '2026-09-15' }), ctx({ closedMonths: ['2026-09'] }));
    ok(!closed.ok && closed.errors.some((e) => e.includes('closed month')));

    const noPayee = recordCost(draft({ vendorId: undefined, payeeText: '' }), ctx());
    ok(!noPayee.ok && noPayee.errors.some((e) => e.includes('payee')));

    // A cost above 5,000 with no image and no reason is blocked (§26).
    const noImage = recordCost(draft({ amount: 90_000, attachments: [] }), ctx());
    ok(!noImage.ok && noImage.errors.some((e) => e.includes('bill image')));
    // ...but a reason lets it through.
    const withReason = recordCost(draft({ amount: 90_000, attachments: [], reasonForNoImage: 'Paper bill to follow' }), ctx());
    ok(withReason.ok);
  });

  it('blocks a manual cost on a Staff category (§79.21)', () => {
    const result = recordCost(draft({ categoryId: 'cat-sal-teaching' }), ctx());
    if (result.ok) throw new Error('expected refusal');
    ok(result.errors.some((e) => e.includes('Salaries are paid through payroll')));
  });

  it('holds an Accountant to the back-dating limit (§26)', () => {
    const tooOld = recordCost(draft({ date: '2026-09-01' }), ctx({ maxBackDateDays: 7 }));
    ok(!tooOld.ok && tooOld.errors.some((e) => e.includes('needs an Admin')));
    // Admin (no limit) may post any open day.
    const anyDay = recordCost(draft({ date: '2026-09-01' }), ctx());
    ok(anyDay.ok);
  });
});

describe('§27 payments and allocation', () => {
  it('part pays a bill (§79.12)', () => {
    const b = bill({ amount: 90_000, dueDate: '2026-10-30' });
    const payments: BillPayment[] = [{ billId: b.id, amount: 30_000 }];
    equal(unpaidFor(b, payments), 60_000);
    equal(billStatus(b, payments), 'Part paid');
  });

  it('allocates oldest due first (§79.13)', () => {
    const older = bill({ id: 'b-1', no: 'B-0001', amount: 40_000, dueDate: '2026-10-05' });
    const newer = bill({ id: 'b-2', no: 'B-0002', amount: 60_000, dueDate: '2026-10-20' });
    const result = allocatePayment([newer, older], [], 50_000);
    // First (older) fully paid; the newer bill takes the rest.
    equal(result.applied.length, 2);
    deepStrictEqual(result.applied[0], { billId: 'b-1', amount: 40_000 });
    deepStrictEqual(result.applied[1], { billId: 'b-2', amount: 10_000 });
    equal(result.credit, 0);
    equal(unpaidFor(newer, result.applied), 50_000); // §79.13 "Second unpaid 50,000"
    equal(billStatus(older, result.applied), 'Paid');
  });

  it('pays chosen bills in the given order (§27 Choose bills)', () => {
    const older = bill({ id: 'b-1', amount: 40_000, dueDate: '2026-10-05' });
    const newer = bill({ id: 'b-2', amount: 60_000, dueDate: '2026-10-20' });
    const result = allocatePayment([older, newer], [], 50_000, { billIds: ['b-2', 'b-1'] });
    equal(result.applied[0].billId, 'b-2');
    equal(result.applied[0].amount, 50_000);
  });

  it('turns an overpayment into vendor credit (§79.14)', () => {
    const b = bill({ amount: 20_000 });
    const result = allocatePayment([b], [], 25_000);
    deepStrictEqual(result.applied[0], { billId: b.id, amount: 20_000 });
    equal(result.credit, 5_000);
    equal(billStatus(b, result.applied), 'Paid');
  });

  it('applies an existing payment before allocating more', () => {
    const b = bill({ amount: 90_000 });
    const prior: BillPayment[] = [{ billId: b.id, amount: 30_000 }];
    const result = allocatePayment([b], prior, 100_000);
    deepStrictEqual(result.applied[0], { billId: b.id, amount: 60_000 }); // only the unpaid 60,000 remains
    equal(result.credit, 40_000);
  });
});

describe('§27 payable, ageing and status', () => {
  it('sums a vendor payable including the opening balance', () => {
    const b = bill({ amount: 90_000, vendorId: 'v-1' });
    const vendor: Vendor = { ...CTH, openingPayable: 10_000 };
    equal(vendorPayable(vendor, [b], []), 100_000);
  });

  it('ages unpaid bills into buckets (§27)', () => {
    const notDue = bill({ id: 'b-1', amount: 10_000, dueDate: '2026-11-01' });
    const mid = bill({ id: 'b-2', amount: 20_000, dueDate: '2026-09-20' }); // ~19 days over
    const old = bill({ id: 'b-3', amount: 30_000, dueDate: '2026-06-01' }); // >90 days over
    const buckets = ageingBuckets([notDue, mid, old], [], 'v-1', TODAY);
    equal(buckets.notYetDue, 10_000);
    equal(buckets.d1to30, 20_000);
    equal(buckets.over90, 30_000);
  });

  it('marks a bill overdue as a warning on top of its status (§27)', () => {
    const b = bill({ amount: 50_000, dueDate: '2026-10-01' });
    equal(isOverdue(b, [], TODAY), true);
    equal(billStatus(b, []), 'Unpaid');
    const paidBill = bill({ amount: 50_000, dueDate: '2026-10-01' });
    equal(isOverdue(paidBill, [{ billId: paidBill.id, amount: 50_000 }], TODAY), false);
  });
});

describe('§32 duplicate bill warning (§79.19)', () => {
  it('fires on the same vendor and bill number', () => {
    const existing = [bill({ amount: 90_000, date: '2026-10-03', billNo: 'CTH-2210' })];
    const hit = duplicateBillWarning(draft({ billNo: 'cth-2210' }), existing);
    ok(hit && hit.reason.includes('bill number'));
  });

  it('fires on the same vendor, amount and date', () => {
    const existing = [bill({ amount: 90_000, date: '2026-10-03', billNo: 'OTHER' })];
    const hit = duplicateBillWarning(draft({ billNo: 'NEW-1', amount: 90_000, date: '2026-10-03' }), existing);
    ok(hit && hit.reason.includes('amount and date'));
  });

  it('says nothing when there is no match', () => {
    const existing = [bill({ amount: 12_000, date: '2026-10-04', billNo: 'DIFFERENT' })];
    equal(duplicateBillWarning(draft(), existing), undefined);
  });
});

describe('§34 cancelling a bill', () => {
  it('refuses a paid bill and needs a reason', () => {
    const b = bill({ amount: 20_000 });
    const noReason = cancelBill(b, [], '');
    ok(!noReason.ok);
    const paid = cancelBill(b, [{ billId: b.id, amount: 20_000 }], 'mistake');
    ok(!paid.ok && paid.errors.some((e) => e.includes('void its vouchers')));
    const okResult = cancelBill(b, [], 'entered in error');
    ok(okResult.ok && okResult.bill.status === 'Cancelled');
  });
});

describe('§35.1 the October sample (§79.22)', () => {
  it('gives costs 385,000, paid 295,000 and payable 90,000', () => {
    const rent = bill({ id: 'b-1', no: 'B-0231', vendorId: 'v-2', amount: 150_000, categoryId: 'cat-rent' });
    const electricity = bill({ id: 'b-2', no: 'B-0236', vendorId: 'v-1', amount: 62_000, categoryId: 'cat-utilities-electric' });
    const clinical = bill({ id: 'b-3', no: 'B-0238', vendorId: 'v-1', amount: 90_000, dueDate: '2026-10-30' });
    const stationery = bill({ id: 'b-4', no: 'B-0239', payeeText: 'Petty cash purchases', amount: 28_000, categoryId: 'cat-books-stationery' });
    const other = bill({ id: 'b-5', no: 'B-0240', payeeText: 'Petty cash purchases', amount: 55_000, categoryId: 'cat-other' });
    const bills = [rent, electricity, clinical, stationery, other];
    const payments: BillPayment[] = [
      { billId: 'b-1', amount: 150_000 },
      { billId: 'b-2', amount: 62_000 },
      { billId: 'b-4', amount: 28_000 },
      { billId: 'b-5', amount: 55_000 },
    ];
    const totals = costTotals(bills, payments);
    equal(totals.recorded, 385_000);
    equal(totals.paid, 295_000);
    equal(totals.payable, 90_000);
    equal(billStatus(clinical, payments), 'Unpaid');
  });
});
