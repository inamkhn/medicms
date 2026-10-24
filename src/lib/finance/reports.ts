// ============================================
// MediCMS Desktop — Finance core: the report queries (§52–§55)
// Every figure here is built from the books, never stored: the cash view from
// money entries, the cost view from bills, the payables and receivables ageing
// from the same helpers the screens already print. Two views of the same money
// (§52) are kept apart on purpose, and the bridge between them is the check
// that proves the month reconciles to itself.
// Pure: dates, entries and bills come in from the caller.
// ============================================

import type { MoneyAccount, MoneyEntry } from './types.ts';
import { isSystemAccount } from './entries.ts';
import type { Bill, BillPayment } from './bills.ts';
import { ageingBuckets, paidFor, unpaidFor } from './bills.ts';
import type { CostCategory } from './categories.ts';
import { findCategory } from './categories.ts';
import type { Vendor } from './vendors.ts';
import { computeEntryBalance } from '../ledger/balance.ts';
import { ageingByStudent, chargeStatesByStudent } from '../ledger/charges.ts';
import { entryResolver, reversedEntryIds, signedEffect } from '../ledger/entries.ts';
import type { LedgerEntry, PaymentMode } from '../ledger/types.ts';

// -------------------------------------------
// The cash view (§52, §55.1)
// -------------------------------------------

/** One line of the money-flow report: a route in, a purpose out. */
export interface FlowLine {
  key: string;
  label: string;
  amount: number;
  /** §70.2 drill-down: the entries behind the figure, so every number opens. */
  entries: MoneyEntry[];
}

export interface MoneyFlow {
  from: string;
  to: string;
  in: FlowLine[];
  out: FlowLine[];
  totalIn: number;
  totalOut: number;
  net: number;
  /** §55.1: shown on request, never added to the totals — "left out" by default. */
  transfersIn: number;
  transfersOut: number;
}

export interface MoneyFlowInput {
  entries: readonly MoneyEntry[];
  accounts: readonly MoneyAccount[];
  categories?: readonly CostCategory[];
  from: string;
  to: string;
}

const TRANSFER_KINDS = new Set<MoneyEntry['kind']>(['TransferIn', 'TransferOut']);

/** §17/§55.1: the route a student payment took, from the mode it stored. */
function feeRoute(entry: MoneyEntry, account: MoneyAccount | undefined): { key: string; label: string } {
  if (entry.mode === 'Cash') return { key: 'fees-cash', label: 'Student fees: cash' };
  if (entry.mode === 'Online') return { key: 'fees-online', label: 'Student fees: online' };
  if (entry.mode === 'Cheque') return { key: 'fees-cheque', label: 'Student fees: cheques in hand' };
  if (entry.mode === 'Bank') return { key: 'fees-bank', label: 'Student fees: bank' };
  if (entry.mode === 'Wallet') return { key: 'fees-wallet', label: 'Student fees: wallet' };
  // An older entry without a mode reads from the account that received it.
  if (account?.type === 'counterCash') return { key: 'fees-cash', label: 'Student fees: cash' };
  if (account?.type === 'wallet') return { key: 'fees-wallet', label: 'Student fees: wallet' };
  return { key: 'fees-bank', label: 'Student fees: bank' };
}

function outLineFor(entry: MoneyEntry, categories: readonly CostCategory[] | undefined): { key: string; label: string } {
  switch (entry.kind) {
    case 'PayrollPayment':
      return { key: 'payroll', label: 'Payroll' };
    case 'StaffAdvance':
      return { key: 'advances', label: 'Staff advances' };
    case 'RefundToStudent':
      return { key: 'refunds', label: 'Student refunds' };
    case 'BankCharge':
      return { key: 'bank-charges', label: 'Bank charges' };
    case 'OwnerWithdrawal':
      return { key: 'owner', label: 'Owner withdrawal (not a cost)' };
    case 'CashDifference':
      return { key: 'differences', label: 'Cash differences' };
    case 'ChequeClearedOut':
    case 'BillPayment': {
      // §55.1: money out by purpose — the category the bill carried (§26).
      const category = entry.category ? findCategory(categories ?? [], entry.category) : undefined;
      if (category) return { key: category.id, label: category.name };
      if (entry.category) return { key: entry.category, label: entry.category };
      return { key: 'bills', label: entry.kind === 'ChequeClearedOut' ? 'Issued cheques cleared' : 'Bills and expenses' };
    }
    case 'Reversal':
    case 'StudentPaymentReversal':
      return { key: 'reversals', label: 'Reversals' };
    default:
      return { key: entry.kind, label: entry.kind };
  }
}

function addLine(lines: FlowLine[], line: Omit<FlowLine, 'entries'>, entry: MoneyEntry): FlowLine[] {
  const existing = lines.find((candidate) => candidate.key === line.key);
  if (existing) {
    existing.amount += line.amount;
    existing.entries.push(entry);
  } else {
    lines.push({ ...line, entries: [entry] });
  }
  return lines;
}

/**
 * §54.1/§55.1 — money in and out for a period, from the cash view. Transfers are
 * counted apart and never in the totals ("Transfers of 630,000 are left out"),
 * and a system account holds no balance of the institute's, so it is skipped.
 */
export function moneyFlow(input: MoneyFlowInput): MoneyFlow {
  const accountById = new Map(input.accounts.map((a) => [a.id, a] as const));
  const flow: MoneyFlow = {
    from: input.from,
    to: input.to,
    in: [],
    out: [],
    totalIn: 0,
    totalOut: 0,
    net: 0,
    transfersIn: 0,
    transfersOut: 0,
  };

  for (const entry of input.entries) {
    if (!entry.cleared) continue;
    if (entry.date < input.from || entry.date > input.to) continue;
    if (entry.kind === 'OpeningBalance') continue;
    const account = accountById.get(entry.accountId);
    if (account && isSystemAccount(account)) continue;

    if (TRANSFER_KINDS.has(entry.kind)) {
      if (entry.kind === 'TransferIn') flow.transfersIn += entry.amount;
      else flow.transfersOut += entry.amount;
      continue;
    }

    if (entry.direction === 'In') {
      let line: { key: string; label: string };
      if (entry.kind === 'StudentPayment') line = feeRoute(entry, account);
      else if (entry.kind === 'ChequeClearedIn') line = { key: 'fees-cheque-cleared', label: 'Student fees: cheques cleared' };
      else if (entry.kind === 'OtherReceipt') line = { key: 'other-receipts', label: 'Other receipts (outside fees)' };
      else if (entry.kind === 'CashDifference') line = { key: 'differences', label: 'Cash differences' };
      else line = { key: 'reversals', label: 'Reversals' };
      addLine(flow.in, { ...line, amount: entry.amount }, entry);
      flow.totalIn += entry.amount;
    } else {
      addLine(flow.out, { ...outLineFor(entry, input.categories), amount: entry.amount }, entry);
      flow.totalOut += entry.amount;
    }
  }

  flow.in.sort((a, b) => b.amount - a.amount);
  flow.out.sort((a, b) => b.amount - a.amount);
  flow.net = flow.totalIn - flow.totalOut;
  return flow;
}

// -------------------------------------------
// The cost view (§52, §54.5)
// -------------------------------------------

export interface CostCategoryRow {
  categoryId: string;
  name: string;
  billed: number;
  paid: number;
  unpaid: number;
}

export interface CostByCategory {
  rows: CostCategoryRow[];
  totalBilled: number;
  totalPaid: number;
  totalUnpaid: number;
}

/** §54.5 — bills posted in the period, grouped by category (posting date, §81.1). */
export function costByCategory(input: {
  bills: readonly Bill[];
  payments: readonly BillPayment[];
  categories: readonly CostCategory[];
  from: string;
  to: string;
}): CostByCategory {
  const rows = new Map<string, CostCategoryRow>();
  for (const bill of input.bills) {
    if (bill.status === 'Cancelled') continue;
    if (bill.date < input.from || bill.date > input.to) continue;
    const category = findCategory(input.categories, bill.categoryId);
    const row = rows.get(bill.categoryId) ?? {
      categoryId: bill.categoryId,
      name: category?.name ?? bill.categoryId,
      billed: 0,
      paid: 0,
      unpaid: 0,
    };
    row.billed += bill.amount;
    row.paid += paidFor(bill, input.payments);
    row.unpaid += unpaidFor(bill, input.payments);
    rows.set(bill.categoryId, row);
  }
  const list = [...rows.values()].sort((a, b) => b.billed - a.billed);
  return {
    rows: list,
    totalBilled: list.reduce((sum, row) => sum + row.billed, 0),
    totalPaid: list.reduce((sum, row) => sum + row.paid, 0),
    totalUnpaid: list.reduce((sum, row) => sum + row.unpaid, 0),
  };
}

/** §52 — the bridge from the cost view to the cash view, as the doc prints it. */
export interface CostCashBridge {
  costs: number;
  lessUnpaid: number;
  plusPayroll: number;
  plusRefunds: number;
  moneyOut: number;
}

export function costCashBridge(input: {
  costs: number;
  unpaidBills: number;
  payrollPaid: number;
  refunds: number;
}): CostCashBridge {
  return {
    costs: input.costs,
    lessUnpaid: input.unpaidBills,
    plusPayroll: input.payrollPaid,
    plusRefunds: input.refunds,
    moneyOut: input.costs - input.unpaidBills + input.payrollPaid + input.refunds,
  };
}

// -------------------------------------------
// Payables (§27, §55.2)
// -------------------------------------------

export interface VendorPayableRow {
  vendorId: string;
  name: string;
  notYetDue: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  over90: number;
  total: number;
  /** Unpaid bills whose due date falls in the next 7 days (§53 "due this week"). */
  dueThisWeek: number;
}

export interface PayablesReport {
  rows: VendorPayableRow[];
  totals: Omit<VendorPayableRow, 'vendorId' | 'name'>;
  dueThisWeek: number;
  overdue: number;
  /** The next bill to fall due — the overview's "Next due" (§59.1). */
  nextDue?: { date: string; vendor: string; amount: number };
}

/** Whole days between two dates, calendar-safe (the core's own helper, §27). */
function gapDays(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/** §55.2 — what the institute owes, by vendor and by how late it is. */
export function payablesReport(input: {
  bills: readonly Bill[];
  payments: readonly BillPayment[];
  vendors: readonly Vendor[];
  today: string;
}): PayablesReport {
  const rows: VendorPayableRow[] = [];
  let nextDue: PayablesReport['nextDue'];

  for (const vendor of input.vendors) {
    const ageing = ageingBuckets(input.bills, input.payments, vendor.id, input.today);
    const total = ageing.notYetDue + ageing.d1to30 + ageing.d31to60 + ageing.d61to90 + ageing.over90;
    if (total === 0) continue;

    let dueThisWeek = 0;
    for (const bill of input.bills) {
      if (bill.vendorId !== vendor.id || !bill.dueDate) continue;
      const unpaid = unpaidFor(bill, input.payments);
      if (unpaid <= 0) continue;
      const inDays = gapDays(input.today, bill.dueDate);
      if (inDays < 0) continue;
      if (inDays <= 7) dueThisWeek += unpaid;
      if (!nextDue || bill.dueDate < nextDue.date) nextDue = { date: bill.dueDate, vendor: vendor.name, amount: unpaid };
    }

    rows.push({
      vendorId: vendor.id,
      name: vendor.name,
      notYetDue: ageing.notYetDue,
      d1to30: ageing.d1to30,
      d31to60: ageing.d31to60,
      d61to90: ageing.d61to90,
      over90: ageing.over90,
      total,
      dueThisWeek,
    });
  }

  rows.sort((a, b) => b.total - a.total);
  const totals = {
    notYetDue: rows.reduce((sum, row) => sum + row.notYetDue, 0),
    d1to30: rows.reduce((sum, row) => sum + row.d1to30, 0),
    d31to60: rows.reduce((sum, row) => sum + row.d31to60, 0),
    d61to90: rows.reduce((sum, row) => sum + row.d61to90, 0),
    over90: rows.reduce((sum, row) => sum + row.over90, 0),
    total: rows.reduce((sum, row) => sum + row.total, 0),
    dueThisWeek: rows.reduce((sum, row) => sum + row.dueThisWeek, 0),
  };
  return {
    rows,
    totals,
    dueThisWeek: totals.dueThisWeek,
    overdue: totals.d1to30 + totals.d31to60 + totals.d61to90 + totals.over90,
    nextDue,
  };
}

// -------------------------------------------
// Receivables and held money (§19, §55.3)
// -------------------------------------------

export interface ReceivableStudent {
  sno: number;
  name: string;
  struckOff?: boolean;
  completed?: boolean;
  onLeave?: boolean;
}

export interface ReceivablesReport {
  /** Positive balances of active students (§19). */
  outstanding: number;
  /** The past-due part of it (§19). */
  overdue: number;
  /** Positive balances of struck-off students (§19). */
  struckOffDues: number;
  /** §18 "Student credit" — the sum of negative balances, which is money held. */
  creditHeld: number;
  /** The five ageing bands across active students (§19). */
  ageing: { notYetDue: number; d1to30: number; d31to60: number; d61to90: number; over90: number };
  rows: { sno: number; name: string; balance: number; overdue: number; active: boolean }[];
}

/** §19/§55.3 — fees owed, from the same entry fold the ledger prints. */
export function receivablesReport(input: {
  students: readonly ReceivableStudent[];
  entries: readonly LedgerEntry[];
  today: string;
}): ReceivablesReport {
  const ageingBySno = ageingByStudent(input.entries, input.today);
  const rows: ReceivablesReport['rows'] = [];
  const ageing = { notYetDue: 0, d1to30: 0, d31to60: 0, d61to90: 0, over90: 0 };
  let outstanding = 0;
  let overdue = 0;
  let struckOffDues = 0;
  let creditHeld = 0;

  for (const student of input.students) {
    const own = input.entries.filter((entry) => entry.studentSno === student.sno);
    if (own.length === 0) continue;
    const active = !student.struckOff && !student.completed && !student.onLeave;
    const balance = computeEntryBalance(own).balance;
    const studentAgeing = ageingBySno.get(student.sno);
    const studentOverdue = studentAgeing?.overdue ?? 0;

    if (active) {
      if (balance > 0) outstanding += balance;
      overdue += studentOverdue;
      if (studentAgeing) {
        ageing.notYetDue += studentAgeing.buckets.notYetDue;
        ageing.d1to30 += studentAgeing.buckets.d1to30;
        ageing.d31to60 += studentAgeing.buckets.d31to60;
        ageing.d61to90 += studentAgeing.buckets.d61to90;
        ageing.over90 += studentAgeing.buckets.over90;
      }
      if (balance < 0) creditHeld += -balance;
    } else if (student.struckOff && balance > 0) {
      struckOffDues += balance;
    }

    rows.push({ sno: student.sno, name: student.name, balance, overdue: studentOverdue, active });
  }

  rows.sort((a, b) => b.overdue - a.overdue || b.balance - a.balance);
  return { outstanding, overdue, struckOffDues, creditHeld, ageing, rows };
}

// -------------------------------------------
// Fee collection (§17, §54.4)
// -------------------------------------------

export interface FeeCollectionReport {
  billed: number;
  concessions: number;
  collected: number;
  refunded: number;
  byMode: { mode: PaymentMode; amount: number }[];
  /** Positive balances across every student today — the outstanding figure (§19). */
  outstanding: number;
}

/** §54.4 — what was billed and collected in a period, by the route it was paid. */
export function feeCollection(entries: readonly LedgerEntry[], from: string, to: string): FeeCollectionReport {
  const resolve = entryResolver(entries);
  // §7.1: an entry a Reversal points at no longer counts — a reversed payment
  // was never collected, and a reversed charge was never billed.
  const reversed = reversedEntryIds(entries);
  const billedTypes = new Set<LedgerEntry['type']>(['FeeCharge', 'SpecialCharge', 'AdjustmentAdd']);
  let billed = 0;
  let concessions = 0;
  let collected = 0;
  let refunded = 0;
  const byMode = new Map<PaymentMode, number>();

  for (const entry of entries) {
    if (entry.date < from || entry.date > to) continue;
    if (reversed.has(entry.id)) continue;
    if (billedTypes.has(entry.type)) {
      billed += signedEffect(entry, resolve);
    } else if (entry.type === 'Concession') {
      concessions += entry.amount;
    } else if (entry.type === 'Payment') {
      collected += entry.amount;
      const mode: PaymentMode = entry.paymentMode ?? 'Cash';
      byMode.set(mode, (byMode.get(mode) ?? 0) + entry.amount);
    } else if (entry.type === 'Refund') {
      refunded += entry.amount;
    }
  }

  let outstanding = 0;
  for (const [sno] of chargeStatesByStudent(entries)) {
    const own = entries.filter((entry) => entry.studentSno === sno);
    const balance = computeEntryBalance(own).balance;
    if (balance > 0) outstanding += balance;
  }

  return {
    billed,
    concessions,
    collected,
    refunded,
    byMode: [...byMode].map(([mode, amount]) => ({ mode, amount })).sort((a, b) => b.amount - a.amount),
    outstanding,
  };
}

/** §54.12 — fees collected in a period, grouped by the student's program. */
export function collectedByProgram(
  entries: readonly LedgerEntry[],
  programOf: ReadonlyMap<number, string>,
  from: string,
  to: string,
): Map<string, number> {
  const reversed = reversedEntryIds(entries);
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== 'Payment') continue;
    if (entry.date < from || entry.date > to) continue;
    if (reversed.has(entry.id)) continue;
    const program = programOf.get(entry.studentSno);
    if (!program) continue;
    totals.set(program, (totals.get(program) ?? 0) + entry.amount);
  }
  return totals;
}

// -------------------------------------------
// Program summary (§54.12)
// -------------------------------------------

export interface ProgramSummaryRow {
  program: string;
  collected: number;
  costs: number;
  difference: number;
}

/** §54.12 — fees collected against the costs tagged to each program (§26). */
export function programSummary(input: {
  bills: readonly Bill[];
  collectedByProgram: ReadonlyMap<string, number>;
}): ProgramSummaryRow[] {
  const rows = new Map<string, ProgramSummaryRow>();
  for (const [program, collected] of input.collectedByProgram) {
    rows.set(program, { program, collected, costs: 0, difference: 0 });
  }
  for (const bill of input.bills) {
    if (bill.status === 'Cancelled' || !bill.program) continue;
    const row = rows.get(bill.program) ?? { program: bill.program, collected: 0, costs: 0, difference: 0 };
    row.costs += bill.amount;
    rows.set(bill.program, row);
  }
  const list = [...rows.values()].map((row) => ({ ...row, difference: row.collected - row.costs }));
  list.sort((a, b) => b.costs - a.costs || a.program.localeCompare(b.program));
  return list;
}
