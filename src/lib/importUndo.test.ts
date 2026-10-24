// ============================================
// MediCMS Desktop — Import undo tests (students doc §23.7)
// Undo is only offered while none of the imported students has had a payment,
// fee charge, edit or other activity after the import; each refusal is pinned
// here against the live register and ledger.
// Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { equal } from 'node:assert/strict';

import type { ImportBatchRecord, LedgerEntry, Student } from '@/types';
import { undoBlocker } from './importUndo.ts';

const AT = '2026-10-22T10:00:00.000Z';

function record(over: Partial<ImportBatchRecord> = {}): ImportBatchRecord {
  return {
    id: 'imp-1',
    at: AT,
    date: '2026-10-22',
    user: 'Admin',
    snos: [101, 102],
    entryIds: ['e-101-1', 'e-102-1'],
    ...over,
  };
}

function student(sno: number, over: Partial<Student> = {}): Student {
  return {
    sno,
    name: `Student ${sno}`,
    fatherName: 'Father',
    contact: null,
    address: null,
    cnic: null,
    regDate: '2026-09-01',
    course: 'Paramedics',
    program: 'Health',
    batch: 'Batch-A',
    session: 2026,
    semester: '1st',
    struckOff: false,
    isTestRecord: false,
    synced: true,
    ...over,
  };
}

function entry(id: string, sno: number, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id,
    studentSno: sno,
    entryNo: 1,
    date: '2026-09-01',
    type: 'OpeningBalanceDues',
    amount: 18_000,
    description: 'Opening balance carried in at import',
    createdBy: 'Admin',
    createdAt: '2026-10-22T10:00:01.000Z',
    balanceAfter: 0,
    ...over,
  };
}

describe('undoBlocker (§23.7)', () => {
  it('allows undo while the imported students have only their opening balance entries', () => {
    equal(
      undoBlocker(record(), [student(101), student(102)], [entry('e-101-1', 101), entry('e-102-1', 102)]),
      null,
    );
  });

  it('refuses when an import created no students', () => {
    equal(undoBlocker(record({ snos: [], entryIds: [] }), [], []), 'This import created no students — nothing to undo.');
  });

  it('refuses when a later ledger entry exists for an imported student', () => {
    const reason = undoBlocker(
      record(),
      [student(101), student(102)],
      [entry('e-101-1', 101), entry('e-101-2', 101, { entryNo: 2, type: 'Payment', amount: 5_000 })],
    );
    equal(reason, 'SNO 101 has ledger activity after the import — undo is not offered (§23.7).');
  });

  it('ignores ledger activity belonging to students the import did not create', () => {
    equal(
      undoBlocker(
        record(),
        [student(101), student(102), student(300)],
        [entry('e-101-1', 101), entry('e-102-1', 102), entry('e-300-1', 300, { type: 'Payment' })],
      ),
      null,
    );
  });

  it('refuses when an imported student was edited after the import', () => {
    const reason = undoBlocker(
      record(),
      [student(101, { updatedAt: '2026-10-23T09:00:00.000Z' }), student(102)],
      [entry('e-101-1', 101), entry('e-102-1', 102)],
    );
    equal(reason, 'SNO 101 was edited after the import — undo is not offered (§23.7).');
  });

  it('refuses when an imported student changed status after the import', () => {
    const reason = undoBlocker(
      record(),
      [student(101), student(102, { onLeave: true })],
      [entry('e-101-1', 101), entry('e-102-1', 102)],
    );
    equal(reason, 'SNO 102 changed status after the import — undo is not offered (§23.7).');
  });

  it('refuses when an imported student is no longer on the register', () => {
    equal(
      undoBlocker(record(), [student(101)], [entry('e-101-1', 101)]),
      'SNO 102 is no longer on the register — undo is not offered (§23.7).',
    );
  });
});
