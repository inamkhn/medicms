// ============================================
// MediCMS Desktop — Finance core: held-money tests (§18, §53)
// The held-money figure is printed on the overview, in the month-end report and
// in its own report (§55.3), so these tests pin the three ways it could quietly
// go wrong: a student who has left still being counted, a reversed payment still
// being held, and a deposit that is not refundable being held at all.
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import type { FeeComponent, FeeTemplate, LedgerEntry, Student } from '@/types';
import { heldForOthers, isActiveStudent, paidByStudent, securityDepositsHeld } from './held.ts';

// --- Fixtures ----------------------------------------------------------------

const tuition: FeeComponent = {
  id: 'c-tuition', name: 'Tuition', amount: 20_000, charged: 'EveryTerm', refundable: false,
};

const deposit: FeeComponent = {
  id: 'c-deposit', name: 'Security deposit', amount: 5_000, charged: 'AtAdmission', refundable: true,
};

function template(over: Partial<FeeTemplate> = {}): FeeTemplate {
  return {
    id: 'tpl-health-1stbatch-2017',
    name: 'Health — 2017',
    course: 'Paramedics',
    program: 'Health',
    session: 2017,
    batch: '1st Batch',
    status: 'Active',
    version: 1,
    totalTerms: 4,
    termsPerYear: 2,
    admissionDueDays: 14,
    termDueDays: 15,
    components: [tuition, deposit],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function student(over: Partial<Student> = {}): Student {
  return {
    sno: 1,
    name: 'A',
    fatherName: 'B',
    contact: null,
    address: null,
    cnic: null,
    regDate: '2017-01-01',
    course: 'Paramedics',
    program: 'Health',
    batch: '1st Batch',
    session: 2017,
    semester: '1st',
    struckOff: false,
    isTestRecord: false,
    synced: false,
    feeTemplateId: 'tpl-health-1stbatch-2017',
    ...over,
  };
}

let nextEntryNo = 1;

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  const entryNo = nextEntryNo++;
  return {
    id: `e-1-${entryNo}`,
    studentSno: 1,
    entryNo,
    date: '2026-10-01',
    type: 'Payment',
    amount: 25_000,
    description: 'Term 1 fee',
    createdBy: 'Admin',
    createdAt: '2026-10-01T09:00:00.000Z',
    ...over,
  };
}

// --- One student's refundable part -------------------------------------------

describe('securityDepositsHeld (§18)', () => {
  it('holds the deposit once the payments reach past the non-refundable part', () => {
    const held = securityDepositsHeld({
      students: [student()],
      templates: [template()],
      ledgerEntries: [entry()],
    });
    equal(held, 5_000);
  });

  it('holds nothing while the payments are still short of the tuition', () => {
    const held = securityDepositsHeld({
      students: [student()],
      templates: [template()],
      ledgerEntries: [entry({ amount: 10_000 })],
    });
    equal(held, 0);
  });

  it('holds nothing on a plan with no refundable component', () => {
    const held = securityDepositsHeld({
      students: [student()],
      templates: [template({ components: [tuition] })],
      ledgerEntries: [entry({ amount: 40_000 })],
    });
    equal(held, 0);
  });

  it('a student who has left holds nothing, however much they paid', () => {
    for (const over of [{ struckOff: true }, { completed: true }, { onLeave: true }]) {
      const held = securityDepositsHeld({
        students: [student(over)],
        templates: [template()],
        ledgerEntries: [entry()],
      });
      equal(held, 0);
      equal(isActiveStudent(student(over)), false);
    }
  });

  it('a student with no template is skipped rather than guessed', () => {
    const held = securityDepositsHeld({
      students: [student({ feeTemplateId: undefined })],
      templates: [template()],
      ledgerEntries: [entry()],
    });
    equal(held, 0);
  });

  it('a concession on the tuition frees the deposit sooner, as the cancel screen prices it', () => {
    const held = securityDepositsHeld({
      students: [student({
        planConcessions: [{
          id: 'con-1',
          target: { kind: 'component', componentId: 'c-tuition' },
          kind: 'fixed',
          value: 10_000,
          scope: { mode: 'termOnly', term: 1 },
          reasonCategory: 'Need based',
          note: 'Hardship',
        }],
      })],
      templates: [template()],
      ledgerEntries: [entry({ amount: 15_000 })],
    });
    // 15,000 pays the 10,000 tuition that is left in full and covers the deposit.
    equal(held, 5_000);
  });
});

// --- The payments behind it --------------------------------------------------

describe('paidByStudent (§7.1)', () => {
  it('adds the payments and leaves the reversals out', () => {
    const paid = paidByStudent([
      entry({ amount: 10_000 }),
      entry({ amount: 5_000 }),
    ]);
    deepStrictEqual(paid.get(1), 15_000);
  });

  it('a reversed payment counts as nothing, because the reversal names it', () => {
    const payment = entry({ id: 'e-1-1', entryNo: 1, amount: 10_000 });
    const paid = paidByStudent([
      payment,
      entry({ id: 'e-1-2', entryNo: 2, type: 'Reversal', amount: 10_000, linkedEntryId: 'e-1-1' }),
    ]);
    equal(paid.get(1), undefined);
  });

  it('a charge is not a payment', () => {
    const paid = paidByStudent([entry({ type: 'FeeCharge', amount: 25_000 })]);
    equal(paid.get(1), undefined);
  });
});

// --- The whole figure --------------------------------------------------------

describe('heldForOthers (§53)', () => {
  it('adds credit, deposits and cheques in hand', () => {
    equal(heldForOthers({ creditHeld: 64_000, depositsHeld: 1_850_000, chequesInHand: 38_000 }), 1_952_000);
  });
});
