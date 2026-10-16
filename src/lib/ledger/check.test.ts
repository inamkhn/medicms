// ============================================
// MediCMS Desktop — Ledger check tests (§7.3, §66 case 20)
// "The ledger check tool recalculates every student and lists any difference."
// §10: "reports zero differences on correct data and names any student that
// differs." Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { LedgerEntry, LedgerEntryType } from './types.ts';
import { entryId } from './entries.ts';
import { liveBalanceOf } from './balance.ts';
import { runLedgerCheck } from './check.ts';
import { legacyBalanceEffect, migrateLegacyRows, type LegacyLedgerRow } from './migrate.ts';

const TODAY = '2026-10-09';
const STUDENTS = [{ sno: 1, name: 'Ayesha Khan' }, { sno: 2, name: 'Bilal Ahmed' }];

function entry(no: number, over: Partial<LedgerEntry> = {}): LedgerEntry {
  const type: LedgerEntryType = over.type ?? 'FeeCharge';
  return {
    id: entryId(over.studentSno ?? 1, no),
    studentSno: 1,
    entryNo: no,
    date: TODAY,
    type,
    amount: 1000,
    description: `${type} ${no}`,
    createdBy: 'Tester',
    createdAt: `${TODAY}T09:00:00`,
    balanceAfter: 0,
    ...over,
  };
}

/** A correct two-student ledger, with `balanceAfter` rebuilt as §7.3 asks. */
function correctLedger(): LedgerEntry[] {
  const ayesha = [
    entry(1, { amount: 77_000, term: 1, dueDate: '2026-10-23', description: 'Term 1 fee charge' }),
    entry(2, {
      type: 'Payment',
      amount: 30_000,
      reference: 'R-1042',
      paymentMode: 'Cash',
      description: 'Payment R-1042, cash',
    }),
  ];
  const bilal = [
    entry(1, {
      studentSno: 2,
      amount: 47_000,
      term: 2,
      date: '2025-12-31',
      dueDate: '2026-01-15',
      description: 'Term 2 fee charge',
    }),
    entry(2, {
      studentSno: 2,
      type: 'Concession',
      amount: 5_000,
      date: '2026-01-02',
      reason: 'Merit scholarship on Term 2 tuition',
      linkedEntryId: entryId(2, 1),
    }),
  ];

  // Rebuild the stored copy the way the migration and the app's save do.
  const withBalances = (list: LedgerEntry[]) => {
    let running = 0;
    return list.map((row) => {
      running += liveBalanceOf(row.studentSno, [row]);
      return entry(row.entryNo, { ...row, balanceAfter: running });
    });
  };
  return [...withBalances(ayesha), ...withBalances(bilal)];
}

describe('the ledger check on correct data (§66 case 20)', () => {
  const entries = correctLedger();
  const result = runLedgerCheck(STUDENTS, entries, { today: TODAY });

  it('reports zero differences and calls nothing a problem', () => {
    deepStrictEqual(result.differences, []);
    deepStrictEqual(result.problems, []);
    equal(result.ok, true);
  });

  it('looks at every student, and says how many', () => {
    equal(result.checked, 2);
    equal(result.balanceByStudent.get(1), 47_000);
    equal(result.balanceByStudent.get(2), 42_000);
  });

  it('agrees with the balance every screen reads', () => {
    for (const student of STUDENTS) {
      equal(result.balanceByStudent.get(student.sno), liveBalanceOf(student.sno, entries));
    }
  });

  it('says nothing about a student who has no entries yet', () => {
    const quiet = runLedgerCheck([{ sno: 7, name: 'Waiting Student' }], [], { today: TODAY });

    equal(quiet.checked, 1);
    equal(quiet.ok, true);
    equal(quiet.balanceByStudent.get(7), 0);
  });

  it('counts an entry whose student is missing from the list', () => {
    const orphan = [
      entry(1, { studentSno: 999, amount: 4_000, dueDate: TODAY, balanceAfter: 4_000 }),
    ];
    const result = runLedgerCheck([], orphan, { today: TODAY });

    equal(result.checked, 1);
    equal(result.ok, true);
    equal(result.balanceByStudent.get(999), 4_000);
  });
});

describe('the ledger check on a wrong stored balance (§7.3)', () => {
  const entries = correctLedger();

  it('names the student, the figure and the entry where they parted', () => {
    const tampered = entries.map((row) =>
      row.studentSno === 1 && row.entryNo === 2 ? { ...row, balanceAfter: 24_000 } : row,
    );
    const result = runLedgerCheck(STUDENTS, tampered, { today: TODAY });

    equal(result.differences.length, 1);
    const difference = result.differences[0];
    ok(difference);
    equal(difference.studentSno, 1);
    equal(difference.name, 'Ayesha Khan');
    equal(difference.atEntryNo, 2);
    equal(difference.recomputed, 47_000);
    equal(difference.stored, 24_000);
    equal(difference.delta, -23_000);
    equal(result.ok, false);
  });

  it('points at the first entry that diverged, not the last', () => {
    const tampered = entries.map((row) =>
      row.studentSno === 1 && row.entryNo === 1 ? { ...row, balanceAfter: 70_000 } : row,
    );
    const difference = runLedgerCheck(STUDENTS, tampered, { today: TODAY }).differences[0];

    ok(difference);
    equal(difference.atEntryNo, 1);
    equal(difference.stored, 70_000);
    equal(difference.recomputed, 77_000);
    equal(difference.delta, -7_000);
    // The later entries were stored correctly, so only this one is named — but the
    // Admin is also told what the student really owes.
    equal(difference.closingBalance, 47_000);
  });

  it('reports one row per student, not one per entry', () => {
    const both = entries.map((row) => ({ ...row, balanceAfter: 0 }));
    const result = runLedgerCheck(STUDENTS, both, { today: TODAY });

    equal(result.differences.length, 2);
    deepStrictEqual(result.differences.map((d) => d.studentSno).sort(), [1, 2]);
  });
});

describe('the ledger check on broken entries (§5, §6, §7)', () => {
  function problemsOf(entries: LedgerEntry[]): string[] {
    return runLedgerCheck(STUDENTS, entries, { today: TODAY }).problems.map((p) => p.message);
  }

  it('catches a charge with no due date and a payment with no description', () => {
    const bad = [
      entry(1, { amount: 5_000 }),
      entry(2, { type: 'Payment', amount: 1_000, description: '  ' }),
    ];

    ok(problemsOf(bad).some((message) => message.includes('requires a due date')));
    ok(problemsOf(bad).some((message) => message.includes('Description is required')));
  });

  it('catches a negative amount and a future-dated payment (§7.2, §7.4)', () => {
    const bad = [
      entry(1, { amount: -500, dueDate: TODAY }),
      entry(2, { type: 'Payment', amount: 1_000, date: '2026-12-01' }),
    ];

    ok(problemsOf(bad).some((message) => message.includes('greater than zero')));
    ok(problemsOf(bad).some((message) => message.includes('future-dated')));
  });

  it('catches a concession with no reason of its own (§5)', () => {
    const bad = [entry(1, { type: 'Concession', amount: 1_000, reason: '' })];

    ok(problemsOf(bad).some((message) => message.includes('requires a reason')));
  });

  it('catches a link to an entry that is not there', () => {
    const bad = [
      entry(1, {
        type: 'Concession',
        amount: 1_000,
        reason: 'Waiver approved by the Admin today',
        linkedEntryId: entryId(1, 42),
      }),
    ];

    ok(problemsOf(bad).some((message) => message.includes('does not exist')));
  });

  it('catches a link into another student\'s ledger (§5)', () => {
    const bad = [
      entry(1, { studentSno: 1, amount: 10_000, dueDate: TODAY }),
      entry(2, {
        studentSno: 2,
        type: 'Concession',
        amount: 1_000,
        reason: 'Waiver approved by the Admin today',
        linkedEntryId: entryId(1, 1),
      }),
    ];
    const result = runLedgerCheck(STUDENTS, bad, { today: TODAY });

    ok(result.problems.some((p) => p.message.includes('belongs to student 1')));
    equal(result.problems[0]?.studentSno, 2);
  });

  it('catches two entries sharing one number, which also means one id (§5)', () => {
    const bad = [
      entry(1, { amount: 5_000, dueDate: TODAY }),
      entry(1, { amount: 2_000, dueDate: TODAY, type: 'SpecialCharge' }),
    ];
    const result = runLedgerCheck(STUDENTS, bad, { today: TODAY });

    ok(result.problems.some((p) => p.message.includes('numbers only go forward')));
    equal(result.ok, false);
  });

  it('catches an id that does not match the number it carries', () => {
    const bad = [entry(3, { id: 'e-1-9', amount: 5_000, dueDate: TODAY })];

    ok(problemsOf(bad).some((message) => message.includes('Entry id must be e-1-3')));
  });

  it('catches itemised lines that disagree with the entry (§5)', () => {
    const bad = [
      entry(1, {
        amount: 5_000,
        dueDate: TODAY,
        term: 1,
        lines: [{ name: 'Tuition', amount: 4_000 }],
      }),
    ];

    ok(problemsOf(bad).some((message) => message.includes('add up to 4000')));
  });

  it('reports a student that is both different and problematic', () => {
    const bad = [entry(1, { amount: 1_000 }), entry(2, { amount: 2_000, dueDate: TODAY })];
    const result = runLedgerCheck(STUDENTS, bad, { today: TODAY });

    equal(result.differences.length, 1);
    equal(result.problems.length, 1);
    equal(result.ok, false);
  });
});

// --- the move and the check together ------------------------------------------

describe('migrated data passes the check without being edited (§7.10)', () => {
  const rows: LegacyLedgerRow[] = [
    {
      id: 'tx-76-1',
      studentSno: 76,
      txnNo: 1,
      date: '2017-01-15',
      type: 'Demand',
      semester: '1st',
      session: 2017,
      fees: 33_700,
      discount: 0,
      payment: 0,
      receiptNo: null,
      receivedBy: null,
      narration: 'This is Registration Time Balance',
      createdAt: '2017-01-15T10:00:00',
      createdBy: 'Admin',
    },
    {
      id: 'tx-76-2',
      studentSno: 76,
      txnNo: 2,
      date: '2017-01-20',
      type: 'Pay',
      semester: '1st',
      session: 2017,
      fees: 0,
      discount: 14_500,
      payment: 12_700,
      receiptNo: '#101',
      receivedBy: 'Admin Khalid',
      narration: '',
      createdAt: '2017-01-20T14:30:00',
      createdBy: 'Admin Khalid',
    },
    {
      id: 'tx-76-3',
      studentSno: 76,
      txnNo: 3,
      date: '2017-03-15',
      type: 'Fine',
      semester: '3rd',
      session: 2018,
      fees: 0,
      discount: -1_500,
      payment: 0,
      receiptNo: null,
      receivedBy: null,
      narration: 'Late payment fine',
      createdAt: '2017-03-15T09:00:00',
      createdBy: 'Admin Khalid',
    },
  ];
  const entries = migrateLegacyRows(rows);
  const result = runLedgerCheck([{ sno: 76, name: 'Sana Ali' }], entries, { today: TODAY });

  it('finds nothing for the Admin to chase, since an entry cannot be edited (§7.1)', () => {
    deepStrictEqual(result.problems, []);
    deepStrictEqual(result.differences, []);
    equal(result.ok, true);
  });

  it('lands on the balance the old three columns produced', () => {
    const expected = rows.reduce((sum, r) => sum + legacyBalanceEffect(r), 0);

    equal(result.balanceByStudent.get(76), expected);
    // The -1,500 discount was a charge, so it adds: §7.10 moves it, it does not
    // change what it was worth.
    equal(expected, 33_700 - 14_500 - 12_700 + 1_500);
  });

  it('turns the -1,500 discount into a charge that is now overdue (§66 case 18)', () => {
    const fine = entries.find((e) => e.type === 'SpecialCharge');
    ok(fine);
    equal(fine.amount, 1_500);
    equal(fine.dueDate, '2017-03-15');
    ok(result.ok);
  });
});
