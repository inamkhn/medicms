// ============================================
// MediCMS Desktop v4.0 — Dashboard metrics (Feature 2)
// Every figure the dashboard prints is derived here, in one place, from the raw
// store slices. The component must not do arithmetic: keeping the definitions
// together is what lets §14's "the dashboard number equals the page it links to"
// hold, and it keeps the render layer declarative.
// ============================================

import type {
  StudentWithBalance, LedgerEntry, BankTransaction, Expense,
} from '@/types';
import type { ReceiptBook } from '@/stores/receiptBookStore';
import type { Batch, FeeTemplate } from '@/types';
import type { Budget } from '@/stores/budgetStore';
import { isToday, isThisMonth } from '@/lib/dates';
import { SEMESTER_OPTIONS } from '@/lib/constants';
import { getPaymentMode, isNonCash } from '@/lib/ledger';
import { computeBankBalance, unlinkedWithdrawals } from '@/lib/bank';
import { findActiveFor } from '@/lib/fee/templateRules';

/** Below this many receipts left, a book is flagged (§17). */
export const LOW_BOOK_THRESHOLD = 20;

export interface AttentionItem {
  id: string;
  /** Count shown inline; the item renders only when count > 0 (§20). */
  count: number;
  label: string;
  href: string;
  /** Verb on the fix button, e.g. "Review" / "Open" / "View" (§13). */
  action: string;
}

export interface DashboardMetrics {
  // Students column
  activeCount: number;
  struckOffCount: number;
  totalCount: number;
  // Fees column
  outstandingDues: number;   // Σ positive balance, active students only
  creditHeld: number;        // Σ |negative balance|, active students only
  collectedThisMonth: number;
  // Today row
  collectedToday: number;
  receiptsToday: number;
  cashToday: number;
  bankToday: number;         // Bank + Online + Cheque
  // Money column (roles without bank/expense access get nulls → hidden)
  bankBalance: number | null;
  expensesThisMonth: number | null;
  budgetUsedPct: number | null;   // null when no budget is set for the month
  // Lists
  topDefaulters: StudentWithBalance[];
  todayReceipts: { receiptNo: string; name: string; amount: number; mode: string }[];
  // Needs attention (§17)
  attention: AttentionItem[];
}

export interface MetricsInput {
  // Both flags come from the ONE shared permission rule set (Feature 1 §3), not
  // from a role-name comparison in here — a dashboard that invents its own rule
  // drifts from the route guard that enforces it.
  /** §18 Counter operator: today's figures cover only the receipts they issued. */
  seesOwnOnly: boolean;
  /** §18 No bank balance, expenses or budget for a counter operator. */
  seesMoney: boolean;
  /** Logged-in user's display name; matches LedgerEntry.createdBy. */
  userName: string;
  students: StudentWithBalance[];      // already test-record filtered
  ledger: LedgerEntry[];
  bank: BankTransaction[];
  expenses: Expense[];
  budgets: Budget[];
  books: ReceiptBook[];
  batches: Batch[];
  /** The template list; a batch counts as covered only when an Active template matches it (§7.1, §7.3). */
  templates: readonly FeeTemplate[];
}

export function computeDashboardMetrics(input: MetricsInput): DashboardMetrics {
  const {
    seesOwnOnly, seesMoney, userName, students, ledger, bank, expenses, budgets,
    books, batches, templates,
  } = input;

  const isActive = (s: StudentWithBalance) => !s.struckOff;
  const activeStudents = students.filter(isActive);

  const activeCount = activeStudents.length;
  const struckOffCount = students.length - activeCount;
  const totalCount = students.length;

  const outstandingDues = activeStudents
    .filter((s) => s.computedBalance > 0)
    .reduce((sum, s) => sum + s.computedBalance, 0);
  const creditHeld = activeStudents
    .filter((s) => s.computedBalance < 0)
    .reduce((sum, s) => sum + Math.abs(s.computedBalance), 0);

  // Payments only; concessions are not "collected" (§14). One amount per entry (§6),
  // so nothing here adds columns together the way the old row did.
  const payments = ledger.filter((entry) => entry.type === 'Payment');
  const collectedOf = (list: readonly LedgerEntry[]) => list.reduce((sum, entry) => sum + entry.amount, 0);
  const collectedThisMonth = collectedOf(payments.filter((entry) => isThisMonth(entry.date)));

  // Role scoping for the Today row: a Counter sees only their own receipts (§18).
  const todayAll = payments.filter((entry) => isToday(entry.date));
  const todayPayments = seesOwnOnly ? todayAll.filter((entry) => entry.createdBy === userName) : todayAll;

  const collectedToday = collectedOf(todayPayments);
  const cashToday = collectedOf(todayPayments.filter((entry) => !isNonCash(entry)));
  const bankToday = collectedToday - cashToday;

  const nameBySno = new Map(students.map((s) => [s.sno, s.name] as const));
  const todayReceipts = todayPayments.map((entry) => ({
    receiptNo: entry.reference ?? `Entry #${entry.entryNo}`,
    name: nameBySno.get(entry.studentSno) ?? `SNO:${entry.studentSno}`,
    amount: entry.amount,
    mode: getPaymentMode(entry),
  }));

  // Money column is gated: a Counter sees no bank balance, expenses or budgets (§18).
  const bankBalance = seesMoney ? computeBankBalance(bank) : null;
  const expensesThisMonth = seesMoney
    ? expenses.filter((e) => isThisMonth(e.date)).reduce((sum, e) => sum + e.amount, 0)
    : null;
  const monthlyBudget = seesMoney
    ? budgets.filter((b) => isThisMonth(`${b.month}-01`)).reduce((sum, b) => sum + b.amount, 0)
    : 0;
  const budgetUsedPct =
    seesMoney && monthlyBudget > 0 && expensesThisMonth !== null
      ? Math.round((expensesThisMonth / monthlyBudget) * 100)
      : null;

  const topDefaulters = activeStudents
    .filter((s) => s.computedBalance > 0)
    .sort((a, b) => b.computedBalance - a.computedBalance)
    .slice(0, 5);

  // ---- Needs attention (§17): each has a count and links to the page that fixes it ----
  const attention: AttentionItem[] = [];

  const untagged = unlinkedWithdrawals(bank).length;
  if (untagged > 0) {
    attention.push({
      id: 'untagged',
      count: untagged,
      label: untagged === 1 ? 'bank withdrawal not linked to an expense' : 'bank withdrawals not linked to an expense',
      href: '/expenses/tag-from-bank',
      action: 'Review',
    });
  }

  for (const b of books.filter((x) => x.isActive)) {
    const left = Math.max(0, b.end - b.current + 1);
    if (left < LOW_BOOK_THRESHOLD) {
      attention.push({
        id: `book-${b.id}`,
        count: left,
        label: left === 0 ? `${b.bookNo} is used up` : `${b.bookNo} has ${left} receipt${left === 1 ? '' : 's'} left`,
        href: '/settings',
        action: left === 0 ? 'Add book' : 'Open',
      });
    }
  }

  // Active students with no fee charge for their current term (§5: an entry carries a
  // term, not a session, so this is the pair the ledger can actually be asked about).
  const chargedKeys = new Set(
    ledger
      .filter((entry) => entry.type === 'FeeCharge' && typeof entry.term === 'number')
      .map((entry) => `${entry.studentSno}|${entry.term}`),
  );
  const noCharge = activeStudents.filter((s) => {
    const term = SEMESTER_OPTIONS.indexOf(s.semester) + 1;
    return !chargedKeys.has(`${s.sno}|${term}`);
  }).length;
  if (noCharge > 0) {
    attention.push({
      id: 'no-charge',
      count: noCharge,
      label: noCharge === 1 ? 'student has no fee charge for their current term' : 'students have no fee charge for their current term',
      href: '/ledger/bulk-demand',
      action: 'View',
    });
  }

  const struckOffDues = students.filter((s) => s.struckOff && s.computedBalance > 0).length;
  if (struckOffDues > 0) {
    attention.push({
      id: 'struck-dues',
      count: struckOffDues,
      label: struckOffDues === 1 ? 'struck-off student still has dues' : 'struck-off students still have dues',
      href: '/students?status=struck_off',
      action: 'View',
    });
  }

  // One rule for "does this batch have a fee plan": the same placement lookup an
  // admission uses, so an all-batches template covers its program's batches too.
  const missingTemplate = batches.filter((b) => {
    if (!b.isActive) return false;
    const hasStudents = students.some((s) => s.program === b.program && s.batch === b.name);
    if (!hasStudents) return false;
    return !findActiveFor(templates, { course: b.course, program: b.program, session: b.session, batch: b.name });
  }).length;
  if (missingTemplate > 0) {
    attention.push({
      id: 'missing-template',
      count: missingTemplate,
      label: missingTemplate === 1 ? 'open batch has no fee template' : 'open batches have no fee template',
      href: '/fee-templates',
      action: 'View',
    });
  }

  return {
    activeCount, struckOffCount, totalCount,
    outstandingDues, creditHeld, collectedThisMonth,
    collectedToday, receiptsToday: todayPayments.length, cashToday, bankToday,
    bankBalance, expensesThisMonth, budgetUsedPct,
    topDefaulters, todayReceipts, attention,
  };
}
