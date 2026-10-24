// ============================================
// MediCMS Desktop — Finance core: recurring bills (§28)
// A reminder opens a few days before the day of the month, the bill it opens is
// pre-filled, and a month already recorded from the template is never repeated.
// Pure: today comes in from the caller. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import {
  draftFromTemplate,
  expectedDate,
  nextRecurringId,
  recurringDue,
  recurringNotice,
  recurringProblems,
  type RecurringBill,
} from './recurring.ts';

const CREATED = '2026-09-01T09:00:00';

function template(over: Partial<RecurringBill> = {}): RecurringBill {
  return {
    id: 'rb-1',
    vendorId: 'v-1',
    categoryId: 'cat-rent',
    description: 'Monthly rent',
    amount: 100_000,
    dayOfMonth: 5,
    active: true,
    createdBy: 'Admin',
    createdAt: CREATED,
    ...over,
  };
}

describe('recurring bills (§28)', () => {
  it('opens the reminder three days before the day of the month', () => {
    const due = recurringDue([template({ lastUsedMonth: '2026-09' })], { today: '2026-10-03' });
    equal(due.length, 1);
    equal(due[0].month, '2026-10');
    equal(due[0].dueDate, '2026-10-05');
    equal(due[0].reminderDate, '2026-10-02');
    equal(due[0].amount, 100_000);
    equal(due[0].late, false);
  });

  it('stays quiet until the reminder day and after the bill is entered', () => {
    deepStrictEqual(recurringDue([template()], { today: '2026-10-01', months: ['2026-10'] }), []);
    deepStrictEqual(recurringDue([template({ lastUsedMonth: '2026-10' })], { today: '2026-10-03', months: ['2026-10'] }), []);
    deepStrictEqual(recurringDue([template({ active: false })], { today: '2026-10-03' }), []);
  });

  it('still reminds on the first days of the month for a reminder that opened last month', () => {
    const due = recurringDue([template({ dayOfMonth: 1, lastUsedMonth: '2026-09' })], { today: '2026-10-02' });
    equal(due.length, 1);
    equal(due[0].month, '2026-10');
    equal(due[0].dueDate, '2026-10-01');
    equal(due[0].late, true);
  });

  it('clamps the day to the last day of a shorter month', () => {
    equal(expectedDate('2026-02', 31), '2026-02-28');
    equal(expectedDate('2026-04', 31), '2026-04-30');
    equal(expectedDate('2026-01', 31), '2026-01-31');
  });

  it('pre-fills the bill form, with the amount blank for "enter each time"', () => {
    const fixed = draftFromTemplate(template(), '2026-10-05', 'Admin');
    equal(fixed.amount, 100_000);
    equal(fixed.categoryId, 'cat-rent');
    equal(fixed.description, 'Monthly rent');
    equal(fixed.vendorId, 'v-1');

    const typed = draftFromTemplate(template({ amount: undefined }), '2026-10-05', 'Admin');
    equal(typed.amount, 0);
    equal(typed.categoryId, 'cat-rent');
  });

  it('orders the notice and the ids', () => {
    equal(nextRecurringId([template(), template({ id: 'rb-7' })]), 'rb-8');
    equal(recurringNotice(0), 'No recurring bills to enter.');
    equal(recurringNotice(1), '1 recurring bill is due to be entered');
    equal(recurringNotice(2), '2 recurring bills are due to be entered');
  });

  it('says what a template is missing', () => {
    deepStrictEqual(recurringProblems(template()), []);
    const broken = recurringProblems({ categoryId: '', description: '  ', dayOfMonth: 0, amount: -1 });
    equal(broken.length, 5);
    ok(broken[0].includes('vendor or a payee'));
  });
});
