// ============================================
// MediCMS Desktop — Finance core: recurring bills (§28)
// A template for a regular cost — rent, electricity, the internet bill. The app
// never posts a bill by itself: a few days before the day of the month it shows
// a reminder, and the user opens a bill already filled in, checks the amount,
// attaches the bill image and saves it (§28, §53 "Needs attention").
// Pure: the clock and the recorded bills come in from the caller.
// ============================================

import type { RecordCostDraft } from './bills.ts';
import { previousMonth } from './budgets.ts';

/** §28 — the template. `amount` is absent when the bill is "enter each time". */
export interface RecurringBill {
  /** `rb-<n>` — stable and never reused. */
  id: string;
  vendorId?: string;
  /** A free-text payee for a regular cost that names no vendor. */
  payeeText?: string;
  categoryId: string;
  /** What the reminder says, e.g. "Monthly rent". */
  description: string;
  /** The fixed amount, or `undefined` for "enter each time" (§28). */
  amount?: number;
  /** The day of the month the bill is expected; 31 clamps to the month's last day. */
  dayOfMonth: number;
  /** §28 "a few days before" — the default lead time the settings carry. */
  remindDaysBefore?: number;
  active: boolean;
  createdBy: string;
  createdAt: string;
  /** `YYYY-MM` of the last month a bill was recorded from this template. */
  lastUsedMonth?: string;
}

export const DEFAULT_REMIND_DAYS_BEFORE = 3;

export function nextRecurringId(templates: readonly RecurringBill[]): string {
  let max = 0;
  for (const template of templates) {
    const parsed = /^rb-(\d+)$/.exec(template.id);
    if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
  }
  return `rb-${max + 1}`;
}

/** Whole days in a month, calendar-safe. */
function daysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

/** §28 — the date the bill is expected: the day, clamped to the month's last day. */
export function expectedDate(month: string, dayOfMonth: number): string {
  const day = Math.min(Math.max(1, Math.trunc(dayOfMonth)), daysInMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days, 12));
  return shifted.toISOString().slice(0, 10);
}

/** One template whose reminder is open — the strip, the list and the notice all read it. */
export interface RecurringDue {
  template: RecurringBill;
  /** The month the bill belongs to (`YYYY-MM`). */
  month: string;
  /** When the bill is expected. */
  dueDate: string;
  /** The day the reminder opens (due date less the lead time). */
  reminderDate: string;
  /** The fixed amount, or `undefined` when the user types it. */
  amount?: number;
  /** True when the expected date has passed and the bill is still not recorded. */
  late: boolean;
}

/**
 * §28 — the templates whose reminder is open and whose bill for that month has
 * not been recorded yet. The previous month is checked too, so a reminder that
 * opened at the end of last month still shows on the first days of this one.
 */
export function recurringDue(
  templates: readonly RecurringBill[],
  input: { today: string; months?: readonly string[] },
): RecurringDue[] {
  const current = input.today.slice(0, 7);
  const months = input.months ?? [previousMonth(current), current];
  const due: RecurringDue[] = [];

  for (const template of templates) {
    if (!template.active) continue;
    const lead = template.remindDaysBefore ?? DEFAULT_REMIND_DAYS_BEFORE;
    // A template cannot remind for a month before it existed.
    const startMonth = template.createdAt.slice(0, 7);
    for (const month of months) {
      if (month < startMonth) continue;
      if (template.lastUsedMonth === month) continue;
      const dueDate = expectedDate(month, template.dayOfMonth);
      const reminderDate = shiftDays(dueDate, -lead);
      if (input.today < reminderDate) continue;
      due.push({
        template,
        month,
        dueDate,
        reminderDate,
        amount: template.amount,
        late: input.today > dueDate,
      });
      break;
    }
  }

  due.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.template.description.localeCompare(b.template.description));
  return due;
}

/** §28/§59.1 — the sentence the overview strip and Needs attention print. */
export function recurringNotice(count: number): string {
  if (count <= 0) return 'No recurring bills to enter.';
  return count === 1 ? '1 recurring bill is due to be entered' : `${count} recurring bills are due to be entered`;
}

/**
 * §28 — the bill form, pre-filled from the template. The fixed amount is carried
 * when there is one; otherwise the operator types the amount before saving.
 */
export function draftFromTemplate(template: RecurringBill, date: string, createdBy: string): RecordCostDraft {
  return {
    vendorId: template.vendorId,
    payeeText: template.payeeText,
    categoryId: template.categoryId,
    description: template.description,
    amount: template.amount ?? 0,
    date,
    dueDate: date,
    createdBy,
  };
}

/** §28 — what a template needs before it can remind anyone. */
export function recurringProblems(template: {
  vendorId?: string;
  payeeText?: string;
  categoryId: string;
  description: string;
  amount?: number;
  dayOfMonth: number;
}): string[] {
  const problems: string[] = [];
  if (!template.vendorId && !template.payeeText?.trim()) {
    problems.push('A recurring bill names a vendor or a payee (§28).');
  }
  if (!template.categoryId) problems.push('A recurring bill carries a cost category (§28).');
  if (!template.description.trim()) problems.push('A recurring bill needs a description the reminder can show (§28).');
  if (!Number.isInteger(template.dayOfMonth) || template.dayOfMonth < 1 || template.dayOfMonth > 31) {
    problems.push('The day of the month is between 1 and 31 (§28).');
  }
  if (template.amount !== undefined && template.amount < 0) {
    problems.push('The fixed amount cannot be negative (§28).');
  }
  return problems;
}
