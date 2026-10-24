import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  admissionDueDateOf,
  DEFAULT_ADMISSION_DUE_DAYS,
  DEFAULT_TERM_DUE_DAYS,
  feeChargeEntry,
  termDueDateOf,
} from './draft.ts';
import type { FeeTemplate } from '@/types';

/** Only the two due-rule fields matter to the date helpers. */
const rule = (admissionDueDays: number, termDueDays: number): FeeTemplate =>
  ({ admissionDueDays, termDueDays }) as FeeTemplate;

test('§5.1: a term charge falls back to 15 days when there is no template', () => {
  assert.equal(DEFAULT_TERM_DUE_DAYS, 15);
  assert.equal(termDueDateOf(null, '2026-10-09'), '2026-10-24');
});

test('§5.1: a term charge reads the template\'s own term due rule', () => {
  assert.equal(termDueDateOf(rule(7, 30), '2026-10-09'), '2026-11-08');
});

test('§24.1: an admission charge falls back to 14 days, not the term rule', () => {
  assert.equal(DEFAULT_ADMISSION_DUE_DAYS, 14);
  assert.equal(admissionDueDateOf(null, '2026-10-09'), '2026-10-23');
});

test('§24.1: an admission charge reads the template\'s admission due rule', () => {
  assert.equal(admissionDueDateOf(rule(10, 30), '2026-10-09'), '2026-10-19');
});

test('§14: a screen-supplied due date wins over the template rule', () => {
  const entry = feeChargeEntry({
    studentSno: 1042,
    entryNo: 1,
    term: 1,
    amount: 77_000,
    template: null,
    date: '2026-10-09',
    dueDate: '2026-10-23',
    createdBy: 'Admin',
    description: 'Admission fee',
  });
  assert.equal(entry.dueDate, '2026-10-23');
  assert.equal(entry.type, 'FeeCharge');
});

test('without a supplied due date the term rule still applies', () => {
  const entry = feeChargeEntry({
    studentSno: 1042,
    entryNo: 1,
    term: 2,
    amount: 47_000,
    template: null,
    date: '2026-10-09',
    createdBy: 'Admin',
    description: 'Term 2 fee',
  });
  assert.equal(entry.dueDate, '2026-10-24');
});
