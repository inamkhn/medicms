// ============================================
// MediCMS Desktop — Finance core: bills, payables and allocation (§26, §27)
// Every cost is a bill — paid straight away or left to pay later (§26). What is
// owed is always derived: a bill's unpaid is its amount less the payments
// allocated to it less any adjustment credit (§27), never a stored figure. A
// payment to a vendor is allocated to that vendor's bills oldest due first by
// default, and an overpayment becomes vendor credit (§27, §79.13, §79.14).
// Pure: no clock, no store — `today`, the timestamp and the limits come in from
// the caller. Money entries and payment vouchers are posted by the Pay out
// flow (§29); this module decides what a payment, once made, applies to.
// ============================================

import type { FinanceLimits } from './limits.ts';
import { monthKey } from './entries.ts';
import type { CostCategory } from './categories.ts';
import { findCategory, manualCostBlockReason } from './categories.ts';
import type { Vendor } from './vendors.ts';

/** §27 statuses. `Overdue` is a warning shown on top of Unpaid/Part paid, not a stored state. */
export type BillStatus = 'Unpaid' | 'Part paid' | 'Paid' | 'Cancelled';

/** A correction to what a bill owes — a vendor discount or a fixed amount (§27, §34). */
export interface BillAdjustment {
  amount: number;
  /** §27: an adjustment always carries a reason. */
  reason: string;
  createdBy: string;
  at: string;
}

/** One payment applied to one bill — the split a voucher carries (§27, §29). */
export interface BillPayment {
  billId: string;
  amount: number;
  /** §29/§34: the voucher that applied it, so a void can withdraw exactly its split. */
  voucherNo?: string;
}

/** §26 — one recorded cost. */
export interface Bill {
  /** `b-<n>` — stable, never reused. */
  id: string;
  /** `B-0238` — the printed number, never reused (§26). */
  no: string;
  /** A cost names a vendor, or free text for a small petty purchase (§26). */
  vendorId?: string;
  payeeText?: string;
  categoryId: string;
  description: string;
  /** Whole rupees, always positive (§7.1). */
  amount: number;
  /** The posting date — when the cost is recorded (§26). */
  date: string;
  /** As on the vendor's paper — informational (§26). */
  billDate?: string;
  billNo?: string;
  /** Defaults to bill date + the vendor's terms; a due past today marks Overdue (§26, §27). */
  dueDate?: string;
  /** Optional tag to compare a program's costs with its fees (§26). */
  program?: string;
  /** Up to 3 file names or refs; the image requirement is §26/§32. */
  attachments: string[];
  /** Given when a required image is absent (§26). */
  reasonForNoImage?: string;
  note?: string;
  status: BillStatus;
  cancelledReason?: string;
  adjustments: BillAdjustment[];
  createdBy: string;
  createdAt: string;
}

/** The §61 form a user fills before a bill exists. */
export interface RecordCostDraft {
  vendorId?: string;
  payeeText?: string;
  categoryId: string;
  description: string;
  amount: number;
  date: string;
  billDate?: string;
  billNo?: string;
  dueDate?: string;
  program?: string;
  attachments?: string[];
  reasonForNoImage?: string;
  note?: string;
  createdBy: string;
}

export interface RecordCostContext {
  categories: readonly CostCategory[];
  vendors: readonly Vendor[];
  bills: readonly Bill[];
  closedMonths?: readonly string[];
  /** Local `YYYY-MM-DD`; the pure core never reads a clock. */
  today: string;
  /** ISO timestamp for `createdAt`. */
  now: string;
  limits: FinanceLimits;
  /**
   * §26 back-dating: the newest days behind today an Accountant may post. Admin
   * posts any open day and passes `undefined`.
   */
  maxBackDateDays?: number;
}

export type RecordCostResult =
  | { ok: true; bill: Bill }
  | { ok: false; errors: string[] };

// -------------------------------------------
// Small local date helpers — the tested module stays free of `@/` imports.
// -------------------------------------------

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** `YYYY-MM-DD` moved by whole days, calendar-safe at UTC midday. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (`to − from`); negative when `to` is earlier. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td, 12) - Date.UTC(fy, fm - 1, fd, 12)) / 86_400_000,
  );
}

// -------------------------------------------
// Ids and numbers (§26: a bill number is never reused).
// -------------------------------------------

export function nextBillId(bills: readonly Bill[]): string {
  let max = 0;
  for (const b of bills) {
    const parsed = /^b-(\d+)$/.exec(b.id);
    if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
  }
  return `b-${max + 1}`;
}

/** The `B-` number, counted from the highest already issued and zero-padded. */
export function nextBillNo(bills: readonly Bill[]): string {
  let max = 0;
  for (const b of bills) {
    const parsed = /^B-(\d+)$/.exec(b.no);
    if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
  }
  return `B-${String(max + 1).padStart(4, '0')}`;
}

// -------------------------------------------
// The derived amounts — nothing here is stored (§27).
// -------------------------------------------

export function adjustmentTotal(bill: Bill): number {
  return bill.adjustments.reduce((sum, a) => sum + a.amount, 0);
}

/** What a payment round has applied to this bill (§27 "payments allocated"). */
export function paidFor(bill: Bill, payments: readonly BillPayment[]): number {
  return payments.filter((p) => p.billId === bill.id).reduce((sum, p) => sum + p.amount, 0);
}

/** A cancelled bill owes nothing; otherwise amount less its adjustment credit. */
function owedAmount(bill: Bill): number {
  if (bill.status === 'Cancelled') return 0;
  return Math.max(0, bill.amount - adjustmentTotal(bill));
}

/** §27 — unpaid = bill amount − payments allocated − credit from adjustments. */
export function unpaidFor(bill: Bill, payments: readonly BillPayment[]): number {
  return Math.max(0, owedAmount(bill) - paidFor(bill, payments));
}

/** §27 status as derived from the payments; `Cancelled` is the only stored one we honour. */
export function billStatus(bill: Bill, payments: readonly BillPayment[]): BillStatus {
  if (bill.status === 'Cancelled') return 'Cancelled';
  const owed = owedAmount(bill);
  const paid = paidFor(bill, payments);
  if (owed > 0 && paid >= owed) return 'Paid';
  if (paid > 0) return 'Part paid';
  return 'Unpaid';
}

/**
 * §27 — a warning on top of the status, not a status of its own: unpaid or
 * part paid, and its due date has passed.
 */
export function isOverdue(bill: Bill, payments: readonly BillPayment[], today: string): boolean {
  if (!bill.dueDate) return false;
  const status = billStatus(bill, payments);
  if (status === 'Paid' || status === 'Cancelled') return false;
  return today > bill.dueDate;
}

/** Days past the due date; `0` when not yet due or there is no due date. */
export function daysOverdue(bill: Bill, today: string): number {
  if (!bill.dueDate) return 0;
  return Math.max(0, daysBetween(bill.dueDate, today));
}

// -------------------------------------------
// Recording a cost (§26) — validation and building the bill.
// -------------------------------------------

function defaultDueDate(draft: RecordCostDraft, vendor: Vendor | undefined): string | undefined {
  if (draft.dueDate && isValidDate(draft.dueDate)) return draft.dueDate;
  const base = draft.billDate && isValidDate(draft.billDate) ? draft.billDate : draft.date;
  if (!isValidDate(base)) return undefined;
  const terms = vendor?.termsDays;
  if (terms === undefined) return undefined;
  return addDays(base, terms);
}

/** The §61 duplicate check: the same vendor and bill number, or vendor, amount and date. */
export interface DuplicateBillHit {
  billId: string;
  billNo: string;
  reason: string;
}

export function duplicateBillWarning(draft: RecordCostDraft, existing: readonly Bill[]): DuplicateBillHit | undefined {
  const billNo = draft.billNo?.trim().toLowerCase();
  const vendorId = draft.vendorId;
  if (!vendorId) return undefined;
  for (const b of existing) {
    if (b.status === 'Cancelled') continue;
    if (b.vendorId !== vendorId) continue;
    if (billNo && b.billNo?.trim().toLowerCase() === billNo) {
      return { billId: b.id, billNo: b.no, reason: 'the same vendor and bill number' };
    }
    if (b.amount === draft.amount && b.date === draft.date) {
      return { billId: b.id, billNo: b.no, reason: 'the same vendor, amount and date' };
    }
  }
  return undefined;
}

/**
 * Every §26 / §32 rule a hand-recorded cost must pass, as sentences. An empty
 * array means the bill may be created. This is the one place those rules are
 * phrased, so the form and the save can never disagree (§79.21 lives here).
 */
export function recordCostProblems(draft: RecordCostDraft, ctx: RecordCostContext): string[] {
  const problems: string[] = [];

  if (!Number.isInteger(draft.amount) || draft.amount <= 0) {
    problems.push('A cost is recorded in whole rupees, always positive (§26).');
  }
  if (!draft.description.trim()) problems.push('A cost needs a description (§26).');

  const hasVendor = !!draft.vendorId && ctx.vendors.some((v) => v.id === draft.vendorId);
  const hasText = !!draft.payeeText?.trim();
  if (!hasVendor && !hasText) {
    problems.push('A cost names a payee — a vendor, or free text for a petty purchase (§26).');
  }
  if (draft.vendorId && !ctx.vendors.some((v) => v.id === draft.vendorId)) {
    problems.push(`Vendor ${draft.vendorId} does not exist (§25).`);
  }

  // §24 / §79.21: a manual cost cannot go to a Staff (payroll) category, an
  // automatic one, or a disabled one.
  const category = findCategory(ctx.categories, draft.categoryId);
  if (!category) {
    problems.push('A cost needs a category (§26).');
  } else {
    const blocked = manualCostBlockReason(category);
    if (blocked) problems.push(blocked);
  }

  if (!isValidDate(draft.date)) {
    problems.push('The posting date is a local date (YYYY-MM-DD) (§26).');
  } else {
    if (draft.date > ctx.today) {
      problems.push(`A cost is not dated into the future: ${draft.date} is after ${ctx.today} (§26).`);
    }
    if (ctx.closedMonths?.includes(monthKey(draft.date))) {
      problems.push(`${monthKey(draft.date)} is a closed month. An Admin must reopen it before a cost is dated there (§26, §34).`);
    }
    if (ctx.maxBackDateDays !== undefined && draft.date < addDays(ctx.today, -ctx.maxBackDateDays)) {
      problems.push(`A cost older than ${ctx.maxBackDateDays} days needs an Admin (§26).`);
    }
  }

  // §26 / §32: a bill image is required above the limit, or a reason.
  const hasImage = (draft.attachments?.length ?? 0) > 0;
  if (draft.amount > ctx.limits.billImageRequiredAbove && !hasImage && !draft.reasonForNoImage?.trim()) {
    problems.push(`A cost above ${ctx.limits.billImageRequiredAbove} needs a bill image, or a reason (§26).`);
  }
  if ((draft.attachments?.length ?? 0) > 3) {
    problems.push('A cost carries up to 3 attachments (§26).');
  }
  for (const d of [draft.billDate, draft.dueDate]) {
    if (d !== undefined && d !== '' && !isValidDate(d)) problems.push('Bill and due dates are local dates (YYYY-MM-DD) (§26).');
  }

  return problems;
}

/**
 * §26: record a cost as a bill. It validates through `recordCostProblems`, then
 * builds the unpaid bill with its next number and a due date defaulted from the
 * vendor's terms. It posts no money — the payment voucher is made by Pay out
 * (§29); a "pay now" cost saves here and is paid from there.
 */
export function recordCost(draft: RecordCostDraft, ctx: RecordCostContext): RecordCostResult {
  const errors = recordCostProblems(draft, ctx);
  if (errors.length) return { ok: false, errors };

  const vendor = ctx.vendors.find((v) => v.id === draft.vendorId);
  const bill: Bill = {
    id: nextBillId(ctx.bills),
    no: nextBillNo(ctx.bills),
    vendorId: draft.vendorId,
    payeeText: draft.vendorId ? undefined : draft.payeeText?.trim(),
    categoryId: draft.categoryId,
    description: draft.description.trim(),
    amount: draft.amount,
    date: draft.date,
    billDate: draft.billDate || undefined,
    billNo: draft.billNo?.trim() || undefined,
    dueDate: defaultDueDate(draft, vendor),
    program: draft.program?.trim() || undefined,
    attachments: (draft.attachments ?? []).slice(0, 3),
    reasonForNoImage: draft.reasonForNoImage?.trim() || undefined,
    note: draft.note?.trim() || undefined,
    status: 'Unpaid',
    adjustments: [],
    createdBy: draft.createdBy,
    createdAt: ctx.now,
  };
  return { ok: true, bill };
}

/** §34 / §27: cancel an unpaid bill. A paid bill is corrected by voiding its vouchers first. */
export function cancelBill(
  bill: Bill,
  payments: readonly BillPayment[],
  reason: string,
): { ok: true; bill: Bill } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (bill.status === 'Cancelled') errors.push(`Bill ${bill.no} is already cancelled.`);
  if (paidFor(bill, payments) > 0) errors.push(`Bill ${bill.no} has payments — void its vouchers first (§34).`);
  if (!reason.trim()) errors.push('Cancelling a bill needs a reason (§34).');
  if (errors.length) return { ok: false, errors };
  return { ok: true, bill: { ...bill, status: 'Cancelled', cancelledReason: reason.trim() } };
}

/** §27 / §34: an adjustment to what an unpaid bill owes, always with a reason. */
export function adjustBill(
  bill: Bill,
  amount: number,
  reason: string,
  createdBy: string,
  at: string,
): { ok: true; bill: Bill } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (bill.status === 'Cancelled') errors.push(`Bill ${bill.no} is cancelled — it cannot be adjusted (§34).`);
  if (!Number.isInteger(amount) || amount === 0) errors.push('An adjustment is a whole number of rupees, up or down (§27).');
  if (!reason.trim()) errors.push('An adjustment needs a reason (§27).');
  if (errors.length) return { ok: false, errors };
  const adjustment: BillAdjustment = { amount, reason: reason.trim(), createdBy, at };
  return { ok: true, bill: { ...bill, adjustments: [...bill.adjustments, adjustment] } };
}

// -------------------------------------------
// Allocation — oldest due first, overpayment becomes credit (§27, §79.13/14).
// -------------------------------------------

export interface AllocateOptions {
  /** §27: when given, only these bills are paid, in this order ("Choose bills"). */
  billIds?: readonly string[];
}

export interface AllocationResult {
  /** The split of the payment across bills; empty when nothing was owed. */
  applied: BillPayment[];
  /** §27 / §79.14: what is left after the bills are covered — vendor credit. */
  credit: number;
}

function dueKey(bill: Bill): string {
  // Oldest due first; a bill with no due date sorts by its posting date, then number.
  return `${bill.dueDate ?? bill.date}|${bill.no}`;
}

/**
 * §27: spread a payment across a vendor's bills. By default the oldest due date
 * goes first; pass `billIds` to pay chosen bills in the given order. Any amount
 * left once the bills are covered is returned as vendor credit, which the Pay
 * out flow applies to the next bill (§63, §79.14).
 */
export function allocatePayment(
  bills: readonly Bill[],
  payments: readonly BillPayment[],
  amount: number,
  options: AllocateOptions = {},
): AllocationResult {
  const unpaidOf = new Map<string, number>();
  for (const b of bills) unpaidOf.set(b.id, unpaidFor(b, payments));

  let candidates: Bill[];
  if (options.billIds) {
    const wanted = new Set(options.billIds);
    const order = new Map(options.billIds.map((id, i) => [id, i]));
    candidates = bills
      .filter((b) => wanted.has(b.id) && (unpaidOf.get(b.id) ?? 0) > 0)
      .slice()
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  } else {
    candidates = bills
      .filter((b) => (unpaidOf.get(b.id) ?? 0) > 0)
      .slice()
      .sort((a, b) => (dueKey(a) === dueKey(b) ? 0 : dueKey(a) < dueKey(b) ? -1 : 1));
  }

  const applied: BillPayment[] = [];
  let remaining = amount;
  for (const bill of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, unpaidOf.get(bill.id) ?? 0);
    if (take > 0) {
      applied.push({ billId: bill.id, amount: take });
      remaining -= take;
    }
  }
  return { applied, credit: Math.max(0, remaining) };
}

// -------------------------------------------
// The vendor's payable and its ageing (§27).
// -------------------------------------------

/** §27 — a vendor's payable: the sum of their unpaid bills (plus any carried-in opening payable). */
export function vendorUnpaid(bills: readonly Bill[], payments: readonly BillPayment[], vendorId: string): number {
  return bills
    .filter((b) => b.vendorId === vendorId)
    .reduce((sum, b) => sum + unpaidFor(b, payments), 0);
}

export function vendorPayable(
  vendor: Vendor,
  bills: readonly Bill[],
  payments: readonly BillPayment[],
): number {
  return vendorUnpaid(bills, payments, vendor.id) + (vendor.openingPayable ?? 0);
}

export interface AgeingBuckets {
  notYetDue: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  over90: number;
}

/** §27 — a vendor's unpaid amounts, aged by how far past due each bill is. */
export function ageingBuckets(
  bills: readonly Bill[],
  payments: readonly BillPayment[],
  vendorId: string,
  today: string,
): AgeingBuckets {
  const buckets: AgeingBuckets = { notYetDue: 0, d1to30: 0, d31to60: 0, d61to90: 0, over90: 0 };
  for (const b of bills) {
    if (b.vendorId !== vendorId) continue;
    const owed = unpaidFor(b, payments);
    if (owed <= 0) continue;
    const days = b.dueDate ? daysBetween(b.dueDate, today) : 0;
    if (days <= 0) buckets.notYetDue += owed;
    else if (days <= 30) buckets.d1to30 += owed;
    else if (days <= 60) buckets.d31to60 += owed;
    else if (days <= 90) buckets.d61to90 += owed;
    else buckets.over90 += owed;
  }
  return buckets;
}

export interface CostTotals {
  /** Total costs recorded (non-cancelled bills' amounts). */
  recorded: number;
  /** Total paid against them. */
  paid: number;
  /** Still to pay. */
  payable: number;
}

/** §35.1 / §79.22 — the cost view's headline figures: recorded, paid, payable. */
export function costTotals(bills: readonly Bill[], payments: readonly BillPayment[]): CostTotals {
  let recorded = 0;
  let paid = 0;
  let payable = 0;
  for (const b of bills) {
    if (b.status === 'Cancelled') continue;
    recorded += b.amount;
    paid += paidFor(b, payments);
    payable += unpaidFor(b, payments);
  }
  return { recorded, paid, payable };
}
