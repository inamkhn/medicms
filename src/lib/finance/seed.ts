// ============================================
// MediCMS Desktop — Finance core: the first-run October sample (§13, §78)
//
// §78.1: a real institute's records are entered at go-live. Until that happens
// the finance screens would show nothing but §14 empty tables, so the stores
// seed one consistent working sample — the October 2026 figures the document
// itself carries (§13: petty cash closes at 20,000 after a 30,000 top-up;
// §79.22: costs 385,000, paid 295,000, unpaid 90,000; §79.11: a 90,000 bill on
// credit). Every figure here is the doc's own, so a screen showing the sample is
// showing the number a reader can check.
//
// The seed is data, not rules: it goes through the same shapes the pure helpers
// produce (a voucher with its split, a money entry per payment, the void as a
// reversal pair), so a seeded voucher can be opened, printed and voided like a
// real one. `seed.test.ts` proves the set is internally consistent.
// ============================================

import type { MoneyEntry } from './types.ts';
import type { Bill, BillPayment } from './bills.ts';
import type { Vendor } from './vendors.ts';
import type { PaymentVoucher } from './vouchers.ts';

const PREPARED_BY = 'Admin Khalid';

/** §25: the payees the sample names, in the types the app offers. */
export const DEMO_VENDORS: Vendor[] = [
  {
    id: 'v-1', name: 'City Teaching Hospital', type: 'Hospital',
    phone: '+923459812233', address: 'Main Mingora, Swat',
    notes: 'Clinical postings for the paramedicine batches.',
    termsDays: 30, status: 'Active',
  },
  {
    id: 'v-2', name: 'Khan & Sons Properties', type: 'Landlord',
    phone: '+923339871200', address: 'Kabbal Arifpur, Swat',
    notes: 'Building rent. Due on the 10th of each month (§28).',
    termsDays: 15, status: 'Active',
  },
  {
    id: 'v-3', name: 'Swat Electric Supply Office', type: 'Utility',
    phone: '0946-712345', address: 'Mingora, Swat',
    notes: 'Electricity — the reading bill arrives on the 2nd.',
    termsDays: 20, status: 'Active',
  },
  {
    id: 'v-4', name: 'Al-Noor Stationers', type: 'Vendor',
    phone: '+923471234567', address: 'Main Bazaar, Mingora',
    termsDays: 30, status: 'Active',
  },
  {
    id: 'v-5', name: 'Zamzam General Store', type: 'Vendor',
    phone: '+923467654321', address: 'Main Bazaar, Mingora',
    notes: 'Cleaning, drinking water and guest hospitality.',
    termsDays: 30, status: 'Active',
  },
  {
    id: 'v-6', name: 'Old City Printers', type: 'Other',
    termsDays: 30, status: 'Inactive',
    notes: 'Stopped taking our orders. Kept because a vendor with bills is never deleted (§25).',
  },
];

/**
 * §26: the costs. Four of them are paid by §13's routes and one is the 90,000
 * bill on credit (§79.11) — recorded as a cost, no cash out, 90,000 payable.
 * `status` is stored as Unpaid because the screens derive the real one (§27).
 */
export const DEMO_BILLS: Bill[] = [
  {
    id: 'b-1', no: 'B-0001', vendorId: 'v-1', categoryId: 'cat-clinical-training',
    description: 'Clinical training — ward rotation, October batches',
    amount: 90_000, date: '2026-10-03', billDate: '2026-10-01', billNo: 'CTH-114',
    dueDate: '2026-10-10', program: 'Paramedics',
    attachments: ['cth-114-invoice.jpg'],
    note: 'Payable after the posting is confirmed (§26).',
    status: 'Unpaid', adjustments: [], createdBy: PREPARED_BY, createdAt: '2026-10-03T10:15:00',
  },
  {
    id: 'b-2', no: 'B-0002', vendorId: 'v-2', categoryId: 'cat-rent',
    description: 'Building rent — October 2026',
    amount: 150_000, date: '2026-10-01', billDate: '2026-10-01', billNo: 'KS-R-0092',
    dueDate: '2026-10-10',
    attachments: ['ks-rent-0092.pdf'],
    status: 'Unpaid', adjustments: [], createdBy: PREPARED_BY, createdAt: '2026-10-01T09:00:00',
  },
  {
    id: 'b-3', no: 'B-0003', vendorId: 'v-3', categoryId: 'cat-utilities-electric',
    description: 'Electricity — September reading',
    amount: 62_000, date: '2026-10-02', billDate: '2026-10-02', billNo: 'SESO-4471',
    dueDate: '2026-10-15',
    attachments: ['seso-4471.jpg'],
    status: 'Unpaid', adjustments: [], createdBy: PREPARED_BY, createdAt: '2026-10-02T11:30:00',
  },
  {
    id: 'b-4', no: 'B-0004', vendorId: 'v-4', categoryId: 'cat-books-stationery',
    description: 'Printing paper, registers and lab consumables',
    amount: 28_000, date: '2026-10-04', billDate: '2026-10-04', billNo: 'AN-8821',
    dueDate: '2026-11-03',
    attachments: [],
    reasonForNoImage: 'Bill handed to the store — a copy was not kept (§26).',
    status: 'Unpaid', adjustments: [], createdBy: PREPARED_BY, createdAt: '2026-10-04T15:40:00',
  },
  {
    id: 'b-5', no: 'B-0005', vendorId: 'v-5', categoryId: 'cat-other',
    description: 'Cleaning supplies, drinking water and guest hospitality',
    amount: 55_000, date: '2026-10-05', billDate: '2026-10-05', billNo: 'ZG-1204',
    dueDate: '2026-11-04',
    attachments: [],
    reasonForNoImage: 'A running account settled weekly — no bill kept (§26).',
    status: 'Unpaid', adjustments: [], createdBy: PREPARED_BY, createdAt: '2026-10-05T09:20:00',
  },
];

/**
 * §27/§29: the splits the live vouchers applied — 295,000 paid, and B-0001 left
 * at 90,000 unpaid. PV-0001's split is deliberately absent: it was voided, so
 * its allocation was withdrawn and its bill returned to unpaid (§34).
 */
export const DEMO_PAYMENTS: BillPayment[] = [
  { billId: 'b-2', amount: 150_000, voucherNo: 'PV-0002' },
  { billId: 'b-3', amount: 62_000, voucherNo: 'PV-0003' },
  { billId: 'b-4', amount: 28_000, voucherNo: 'PV-0004' },
  { billId: 'b-5', amount: 55_000, voucherNo: 'PV-0005' },
];

/**
 * §29: the voucher register. PV-0001 shows a void — struck through, its number
 * never reused (§34); the rest are the §13 money out by mode (§30).
 */
export const DEMO_VOUCHERS: PaymentVoucher[] = [
  {
    id: 'pv-1', no: 'PV-0001', vendorId: 'v-4', payee: 'Al-Noor Stationers',
    date: '2026-10-05', amount: 10_000, mode: 'Cash', accountId: 'acc-petty',
    reference: 'PV-0001',
    allocations: [{ billId: 'b-4', amount: 10_000, voucherNo: 'PV-0001' }],
    credit: 0, creditUsed: 0,
    preparedBy: PREPARED_BY, moneyEntryId: 'me-4',
    voided: true, voidReason: 'Wrong amount keyed in — re-entered as PV-0004 (§34).',
    createdAt: '2026-10-05T11:20:00',
  },
  {
    id: 'pv-2', no: 'PV-0002', vendorId: 'v-2', payee: 'Khan & Sons Properties',
    date: '2026-10-06', amount: 150_000, mode: 'Bank', accountId: 'acc-bank',
    reference: 'Transfer NTB-77120',
    allocations: [{ billId: 'b-2', amount: 150_000, voucherNo: 'PV-0002' }],
    credit: 0, creditUsed: 0,
    preparedBy: PREPARED_BY, moneyEntryId: 'me-6',
    createdAt: '2026-10-06T10:05:00',
  },
  {
    id: 'pv-3', no: 'PV-0003', vendorId: 'v-3', payee: 'Swat Electric Supply Office',
    date: '2026-10-08', amount: 62_000, mode: 'Bank', accountId: 'acc-bank',
    reference: 'Transfer NTB-77245',
    allocations: [{ billId: 'b-3', amount: 62_000, voucherNo: 'PV-0003' }],
    credit: 0, creditUsed: 0,
    preparedBy: PREPARED_BY, moneyEntryId: 'me-9',
    createdAt: '2026-10-08T09:35:00',
  },
  {
    id: 'pv-4', no: 'PV-0004', vendorId: 'v-4', payee: 'Al-Noor Stationers',
    date: '2026-10-08', amount: 28_000, mode: 'Cash', accountId: 'acc-petty',
    reference: 'PV-0004',
    allocations: [{ billId: 'b-4', amount: 28_000, voucherNo: 'PV-0004' }],
    credit: 0, creditUsed: 0,
    preparedBy: PREPARED_BY, moneyEntryId: 'me-10',
    createdAt: '2026-10-08T11:10:00',
  },
  {
    id: 'pv-5', no: 'PV-0005', vendorId: 'v-5', payee: 'Zamzam General Store',
    date: '2026-10-08', amount: 55_000, mode: 'Cash', accountId: 'acc-petty',
    reference: 'PV-0005',
    allocations: [{ billId: 'b-5', amount: 55_000, voucherNo: 'PV-0005' }],
    credit: 0, creditUsed: 0,
    preparedBy: PREPARED_BY, moneyEntryId: 'me-11',
    createdAt: '2026-10-08T11:25:00',
  },
];

/**
 * §7: the movement the sample vouchers and the §10 petty top-up posted, dated
 * inside October like the rest of the sample. `no` 4–11 follows the three
 * opening entries, so the next real posting still counts forward (§7.1).
 */
export const DEMO_MONEY_ENTRIES: MoneyEntry[] = [
  {
    id: 'me-4', no: 4, date: '2026-10-05', accountId: 'acc-petty', direction: 'Out',
    amount: 10_000, kind: 'BillPayment', payee: 'Al-Noor Stationers',
    reference: 'PV-0001', linkedDoc: 'PV-0001', actionId: 'a-4',
    createdBy: PREPARED_BY, cleared: true, reconciled: false, createdAt: '2026-10-05T11:20:00',
  },
  {
    // §34: the void of PV-0001 — the same account, the same amount, back in.
    id: 'me-5', no: 5, date: '2026-10-06', accountId: 'acc-petty', direction: 'In',
    amount: 10_000, kind: 'Reversal', payee: 'Al-Noor Stationers',
    reference: 'PV-0001', linkedDoc: 'PV-0001', actionId: 'a-5',
    reverses: 'me-4', reason: 'Voucher PV-0001 voided — wrong amount keyed in.',
    createdBy: PREPARED_BY, cleared: true, reconciled: false, createdAt: '2026-10-06T09:15:00',
  },
  {
    id: 'me-6', no: 6, date: '2026-10-06', accountId: 'acc-bank', direction: 'Out',
    amount: 150_000, kind: 'BillPayment', payee: 'Khan & Sons Properties',
    reference: 'Transfer NTB-77120', linkedDoc: 'PV-0002', actionId: 'a-6',
    createdBy: PREPARED_BY, cleared: true, reconciled: false, createdAt: '2026-10-06T10:05:00',
  },
  {
    // §9/§10: the two sides of the petty cash top-up, one action (§13's 30,000).
    id: 'me-7', no: 7, date: '2026-10-07', accountId: 'acc-bank', direction: 'Out',
    amount: 30_000, kind: 'TransferOut', payee: 'Petty cash float',
    note: 'Top-up for the week (§10).', linkedDoc: 'a-7', actionId: 'a-7',
    createdBy: PREPARED_BY, cleared: true, reconciled: false, createdAt: '2026-10-07T10:00:00',
  },
  {
    id: 'me-8', no: 8, date: '2026-10-07', accountId: 'acc-petty', direction: 'In',
    amount: 30_000, kind: 'TransferIn', payee: 'Petty cash float',
    note: 'Top-up for the week (§10).', linkedDoc: 'a-7', actionId: 'a-7',
    createdBy: PREPARED_BY, cleared: true, reconciled: false, createdAt: '2026-10-07T10:00:00',
  },
  {
    id: 'me-9', no: 9, date: '2026-10-08', accountId: 'acc-bank', direction: 'Out',
    amount: 62_000, kind: 'BillPayment', payee: 'Swat Electric Supply Office',
    reference: 'Transfer NTB-77245', linkedDoc: 'PV-0003', actionId: 'a-8',
    createdBy: PREPARED_BY, cleared: true, reconciled: false, createdAt: '2026-10-08T09:35:00',
  },
  {
    id: 'me-10', no: 10, date: '2026-10-08', accountId: 'acc-petty', direction: 'Out',
    amount: 28_000, kind: 'BillPayment', payee: 'Al-Noor Stationers',
    reference: 'PV-0004', linkedDoc: 'PV-0004', actionId: 'a-9',
    createdBy: PREPARED_BY, cleared: true, reconciled: false, createdAt: '2026-10-08T11:10:00',
  },
  {
    id: 'me-11', no: 11, date: '2026-10-08', accountId: 'acc-petty', direction: 'Out',
    amount: 55_000, kind: 'BillPayment', payee: 'Zamzam General Store',
    reference: 'PV-0005', linkedDoc: 'PV-0005', actionId: 'a-10',
    createdBy: PREPARED_BY, cleared: true, reconciled: false, createdAt: '2026-10-08T11:25:00',
  },
];

/** The sample is only for a book that still holds nothing but its openings (§78.1). */
export function isPristineMoneyBook(entries: readonly MoneyEntry[]): boolean {
  return entries.every((e) => e.kind === 'OpeningBalance');
}

/**
 * The books with the sample appended, ready for the stores: nothing is added to
 * a book that already carries real movement, and nothing is added twice.
 */
export function withDemoMoneyEntries(entries: readonly MoneyEntry[]): MoneyEntry[] {
  if (!isPristineMoneyBook(entries)) return [...entries];
  const known = new Set(entries.map((e) => e.id));
  return [...entries, ...DEMO_MONEY_ENTRIES.filter((e) => !known.has(e.id))];
}
