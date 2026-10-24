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
import type { Batch, FeeTemplate } from '@/types';
import type { BudgetLine } from '@/lib/finance';
import { lowStockMessage } from './receipts/index.ts';
import { isToday, isThisMonth } from './dates.ts';
import { SEMESTER_OPTIONS } from './constants.ts';
import { ageingByStudent, getPaymentMode, isNonCash } from './ledger/index.ts';
import { computeBankBalance, unlinkedWithdrawals } from './bank.ts';
import { findActiveFor } from './fee/templateRules.ts';

/** Below this many receipts left, a book is flagged (§17, §24). */
export const LOW_BOOK_THRESHOLD = 20;

/**
 * A receipt book as the dashboard needs it. `left` comes from the register
 * (`@/lib/receipts`), so the dashboard cannot count numbers its own way.
 */
export interface ReceiptStock {
  id: string;
  name: string;
  left: number;
}

export interface AttentionItem {
  id: string;
  /** Count shown inline; the item renders only when count > 0 (§20). */
  count: number;
  label: string;
  href: string;
  /** Verb on the fix button, e.g. "Review" / "Open" / "View" (§13). */
  action: string;
}

/** One row of the defaulter list (§13): ranked by overdue rupees, with its age. */
export interface DefaulterRow {
  sno: number;
  name: string;
  batch: string;
  semester: StudentWithBalance['semester'];
  /** Total balance, for context. */
  balance: number;
  /** Overdue part of the balance — the ranking figure. */
  overdue: number;
  /** Days since the oldest unpaid past-due charge's due date. */
  daysOverdue: number;
}

export interface DashboardMetrics {
  // Students column
  activeCount: number;
  struckOffCount: number;
  totalCount: number;
  // Fees column
  outstandingDues: number;   // Σ positive balance, active students only
  overdueDues: number;       // §14: Σ of the past-due part of those dues
  creditHeld: number;        // Σ |negative balance|, active students only
  struckOffDues: number;     // §14: Σ positive balance, struck-off students
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
  topDefaulters: DefaulterRow[];
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
  /** The day overdue is measured against; supplied by the caller like the ageing core (§24). */
  today: string;
  students: StudentWithBalance[];      // already test-record filtered
  ledger: LedgerEntry[];
  bank: BankTransaction[];
  expenses: Expense[];
  budgets: BudgetLine[];
  books: ReceiptStock[];
  batches: Batch[];
  /** The template list; a batch counts as covered only when an Active template matches it (§7.1, §7.3). */
  templates: readonly FeeTemplate[];
}

export function computeDashboardMetrics(input: MetricsInput): DashboardMetrics {
  const {
    seesOwnOnly, seesMoney, userName, today, students, ledger, bank, expenses, budgets,
    books, batches, templates,
  } = input;

  // §26.5: struck-off, completed and on-leave students all sit outside the
  // active counts; their ledgers stay and are still payable.
  const isActive = (s: StudentWithBalance) => !s.struckOff && !s.completed && !s.onLeave;
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

  // §14: overdue is the past-due part of the dues, from the same ageing pass the
  // directory and the ledger print — the tile and the Overdue tab cannot disagree.
  const ageing = ageingByStudent(ledger, today);
  const overdueOf = (sno: number) => ageing.get(sno)?.overdue ?? 0;
  const overdueDues = activeStudents.reduce((sum, s) => sum + overdueOf(s.sno), 0);

  // §14: struck-off students can still owe money; it is reported, not hidden.
  const struckOffDues = students
    .filter((s) => s.struckOff && s.computedBalance > 0)
    .reduce((sum, s) => sum + s.computedBalance, 0);

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
    ? budgets.filter((b) => b.month === today.slice(0, 7)).reduce((sum, b) => sum + b.amount, 0)
    : 0;
  const budgetUsedPct =
    seesMoney && monthlyBudget > 0 && expensesThisMonth !== null
      ? Math.round((expensesThisMonth / monthlyBudget) * 100)
      : null;

  // §13: the list ranks by overdue rupees — not total balance — and carries the
  // days overdue of the oldest unpaid charge. Ties break on the larger balance.
  const topDefaulters: DefaulterRow[] = activeStudents
    .map((s) => ({ s, overdue: overdueOf(s.sno), daysOverdue: ageing.get(s.sno)?.oldestDays ?? 0 }))
    .filter((row) => row.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue || b.s.computedBalance - a.s.computedBalance)
    .slice(0, 5)
    .map(({ s, overdue, daysOverdue }) => ({
      sno: s.sno,
      name: s.name,
      batch: s.batch,
      semester: s.semester,
      balance: s.computedBalance,
      overdue,
      daysOverdue,
    }));

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

  for (const book of books) {
    if (book.left >= LOW_BOOK_THRESHOLD) continue;
    attention.push({
      id: `book-${book.id}`,
      count: book.left,
      label: lowStockMessage(book.name, book.left, LOW_BOOK_THRESHOLD) ?? `${book.name} is used up`,
      href: '/settings/receipt-books',
      action: book.left === 0 ? 'Add book' : 'Open',
    });
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

  const struckOffDuesCount = students.filter((s) => s.struckOff && s.computedBalance > 0).length;
  if (struckOffDuesCount > 0) {
    attention.push({
      id: 'struck-dues',
      count: struckOffDuesCount,
      label: struckOffDuesCount === 1 ? 'struck-off student still has dues' : 'struck-off students still have dues',
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
    outstandingDues, overdueDues, struckOffDues, creditHeld, collectedThisMonth,
    collectedToday, receiptsToday: todayPayments.length, cashToday, bankToday,
    bankBalance, expensesThisMonth, budgetUsedPct,
    topDefaulters, todayReceipts, attention,
  };
}
