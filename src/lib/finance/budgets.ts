// ============================================
// MediCMS Desktop — Finance core: budgets (§47, §68)
// A budget is an amount for one category, for one month. What is used comes from
// the **cost view** — bills posted in that month — with the unpaid part counted
// as committed, so a budget cannot be "saved" by delaying a bill (§46). Alerts
// at 80 and 100 percent never block spending (§47). The Staff group is an
// Admin's alone; everyone else sees it as one hidden row (§47, §68).
// Pure: bills, payments and the month come in; nothing is stored here.
// ============================================

import { paidFor, unpaidFor, type Bill, type BillPayment } from './bills.ts';
import { COST_GROUP_LABELS, type CostCategory, type CostGroupId } from './categories.ts';

/** One cell of the budget grid (§47). `month` is `YYYY-MM`. */
export interface BudgetLine {
  categoryId: string;
  month: string;
  amount: number;
}

/** §47/§68: information at 80 percent, warning at 100 — never a block. */
export type BudgetLevel = 'ok' | 'notice' | 'warning';

export interface BudgetUsage {
  /** Rounded percent; 0 when no budget is set, so a bar has nothing to fill. */
  pct: number;
  level: BudgetLevel;
}

/** §47: the alerts are a setting (§77 "Budget alerts 80 percent and 100 percent"). */
export function budgetUsage(used: number, budget: number, noticePct = 80, warningPct = 100): BudgetUsage {
  if (budget <= 0) return { pct: 0, level: 'ok' };
  const pct = Math.round((used / budget) * 100);
  if (pct >= warningPct) return { pct, level: 'warning' };
  if (pct >= noticePct) return { pct, level: 'notice' };
  return { pct, level: 'ok' };
}

/** One category of the grid: the budget, and the cost view against it. */
export interface BudgetRow {
  categoryId: string;
  name: string;
  group: CostGroupId;
  budget: number;
  /** Bills posted this month, already paid (§47 "Actual … Paid"). */
  paid: number;
  /** Bills posted this month, still owed — the committed part (§47). */
  unpaid: number;
  /** paid + unpaid — what the budget is measured against. */
  used: number;
  pct: number;
  level: BudgetLevel;
}

export interface BudgetGroupTotal {
  group: CostGroupId;
  label: string;
  budget: number;
  paid: number;
  unpaid: number;
  used: number;
}

export interface BudgetReport {
  month: string;
  rows: BudgetRow[];
  groups: BudgetGroupTotal[];
  total: BudgetGroupTotal;
  /** §47: non-Admin users are told a hidden row exists, without its figures. */
  hiddenStaffRows: number;
}

/**
 * §47/§68 — the month grid. `showStaff` is false for everyone but an Admin: the
 * Staff rows are dropped and the totals exclude them, so no figure leaks the
 * group's budget. A category with neither a budget nor a cost is left out, so a
 * fresh month opens on the categories that matter.
 */
export function budgetReport(input: {
  categories: readonly CostCategory[];
  lines: readonly BudgetLine[];
  bills: readonly Bill[];
  payments: readonly BillPayment[];
  month: string;
  showStaff: boolean;
  noticePct?: number;
  warningPct?: number;
}): BudgetReport {
  const { categories, lines, bills, payments, month, showStaff } = input;
  const noticePct = input.noticePct ?? 80;
  const warningPct = input.warningPct ?? 100;

  const posted = bills.filter((bill) => bill.status !== 'Cancelled' && bill.date.slice(0, 7) === month);
  const budgetByCategory = new Map(
    lines.filter((line) => line.month === month).map((line) => [line.categoryId, line.amount] as const),
  );

  const rows: BudgetRow[] = [];
  let hiddenStaffRows = 0;
  for (const category of categories) {
    const budget = budgetByCategory.get(category.id) ?? 0;
    const own = posted.filter((bill) => bill.categoryId === category.id);
    const paid = own.reduce((sum, bill) => sum + paidFor(bill, payments), 0);
    const unpaid = own.reduce((sum, bill) => sum + unpaidFor(bill, payments), 0);
    const used = paid + unpaid;
    if (budget === 0 && used === 0) continue;
    if (category.group === 'staff' && !showStaff) {
      hiddenStaffRows += 1;
      continue;
    }
    const usage = budgetUsage(used, budget, noticePct, warningPct);
    rows.push({
      categoryId: category.id,
      name: category.name,
      group: category.group,
      budget,
      paid,
      unpaid,
      used,
      pct: usage.pct,
      level: usage.level,
    });
  }

  const groupOrder: CostGroupId[] = [
    'staff', 'premises', 'academic', 'equipment', 'marketing', 'student', 'operations', 'differences', 'other',
  ];
  const groups: BudgetGroupTotal[] = [];
  for (const group of groupOrder) {
    const own = rows.filter((row) => row.group === group);
    if (own.length === 0) continue;
    groups.push({
      group,
      label: COST_GROUP_LABELS[group],
      budget: own.reduce((sum, row) => sum + row.budget, 0),
      paid: own.reduce((sum, row) => sum + row.paid, 0),
      unpaid: own.reduce((sum, row) => sum + row.unpaid, 0),
      used: own.reduce((sum, row) => sum + row.used, 0),
    });
  }

  const total: BudgetGroupTotal = {
    group: 'other',
    label: 'Total',
    budget: groups.reduce((sum, group) => sum + group.budget, 0),
    paid: groups.reduce((sum, group) => sum + group.paid, 0),
    unpaid: groups.reduce((sum, group) => sum + group.unpaid, 0),
    used: groups.reduce((sum, group) => sum + group.used, 0),
  };

  return { month, rows, groups, total, hiddenStaffRows };
}

/** The budget set for one category and month; 0 when none (§47). */
export function budgetOf(lines: readonly BudgetLine[], categoryId: string, month: string): number {
  return lines.find((line) => line.categoryId === categoryId && line.month === month)?.amount ?? 0;
}

/**
 * §47 — write one cell. Zero removes the line rather than storing a zero, so the
 * grid keeps only the amounts the institute actually set.
 */
export function setBudgetLine(
  lines: readonly BudgetLine[],
  categoryId: string,
  month: string,
  amount: number,
): BudgetLine[] {
  const value = Math.max(0, Math.trunc(amount));
  const without = lines.filter((line) => !(line.categoryId === categoryId && line.month === month));
  if (value === 0) return without;
  return [...without, { categoryId, month, amount: value }].sort((a, b) =>
    a.month === b.month ? a.categoryId.localeCompare(b.categoryId) : a.month < b.month ? -1 : 1,
  );
}

/** §47 "copy the previous month" — every line of `fromMonth` repeated on `toMonth`. */
export function copyBudgets(lines: readonly BudgetLine[], fromMonth: string, toMonth: string): BudgetLine[] {
  let next = lines.filter((line) => line.month !== toMonth);
  for (const line of lines.filter((l) => l.month === fromMonth)) {
    next = setBudgetLine(next, line.categoryId, toMonth, line.amount);
  }
  return next;
}

/** §47 "spread a yearly amount evenly" — twelve equal months of one category. */
export function spreadYearly(categoryId: string, year: number, amount: number): BudgetLine[] {
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  const each = Math.max(0, Math.trunc(amount / 12));
  if (each === 0) return [];
  return months.map((month) => ({ categoryId, month, amount: each }));
}

/** §47: month keys around a given one, for "previous month" and "same month last year". */
export function previousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
}

export function sameMonthLastYear(month: string): string {
  return `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
}
