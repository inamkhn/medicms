// ============================================
// MediCMS Desktop — Legacy row migration tests (§7.10, §66 case 18)
// "Any ledger line stored as a negative discount becomes a Special charge of the
// same amount. All other lines keep their type." (§7.10)
// Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import {
  REASON_MIN_LENGTH,
  entryProblems,
  entryResolver,
  signedEffect,
} from './entries.ts';
import { runningBalances } from './balance.ts';
import { legacyBalanceEffect, migrateLegacyRows, type LegacyLedgerRow } from './migrate.ts';
import type { LedgerEntry } from './types.ts';

function row(over: Partial<LegacyLedgerRow>): LegacyLedgerRow {
  return {
    id: 'tx-1',
    studentSno: 76,
    txnNo: 1,
    date: '2017-01-15',
    type: 'Demand',
    semester: '1st',
    session: 2017,
    fees: 0,
    discount: 0,
    payment: 0,
    receiptNo: null,
    receivedBy: null,
    narration: '',
    createdAt: '2017-01-15T10:00:00',
    createdBy: 'Admin',
    ...over,
  };
}

/** Every signed effect of the entries the rows became. */
function migratedTotal(entries: readonly LedgerEntry[]): number {
  const resolve = entryResolver(entries);
  return entries.reduce((sum, entry) => sum + signedEffect(entry, resolve), 0);
}

/** The old formula's answer for the same rows. */
function legacyTotal(rows: readonly LegacyLedgerRow[]): number {
  return rows.reduce((sum, r) => sum + legacyBalanceEffect(r), 0);
}

describe('§7.10: the negative discount becomes a charge', () => {
  it('turns a -500 discount into a Special charge of +500 (§66 case 18)', () => {
    const entries = migrateLegacyRows([
      row({ type: 'Pay', fees: 0, discount: -500, payment: 0, narration: 'Cheque bounce fine' }),
    ]);

    equal(entries.length, 1);
    const charge = entries[0];
    ok(charge);
    equal(charge.type, 'SpecialCharge');
    equal(charge.amount, 500);
    // The sign lives in the type now, never in the number (§6).
    equal(charge.amount > 0, true);
    equal(signedEffect(charge, entryResolver(entries)), 500);
    equal(charge.dueDate, charge.date);
  });

  it('no entry it produces ever carries a negative amount', () => {
    const rows = [
      row({ type: 'Demand', fees: 33_700 }),
      row({ txnNo: 2, type: 'Pay', discount: 14_500, payment: 12_700, receiptNo: '#101' }),
      row({ txnNo: 3, type: 'Fine', discount: -1_000 }),
      row({ txnNo: 4, type: 'Refund', payment: 5_000 }),
    ];

    for (const entry of migrateLegacyRows(rows)) {
      ok(entry.amount > 0, `${entry.type} amount must be positive`);
      ok(Number.isInteger(entry.amount), 'whole rupees (§7.2)');
    }
  });
});

describe('§6: the old types keep their meaning', () => {
  it('reads a Demand as a fee charge with its term and a due date', () => {
    const entries = migrateLegacyRows([row({ type: 'Demand', fees: 33_700, semester: '1st' })]);
    const charge = entries[0];
    ok(charge);

    equal(entries.length, 1);
    equal(charge.type, 'FeeCharge');
    equal(charge.term, 1);
    equal(charge.amount, 33_700);
    equal(charge.dueDate, '2017-01-15');
    equal(charge.description, 'Term 1 fee charge');
  });

  it('reads the old charge types as special charges (§6)', () => {
    const cases: [LegacyLedgerRow['type'], string][] = [
      ['Exam', 'Exam fee charge'],
      ['CT', 'Clinical training charge'],
      ['Annual', 'Annual charges'],
      ['Fine', 'Fine'],
    ];

    for (const [type, description] of cases) {
      const entries = migrateLegacyRows([row({ type, fees: 5_000, narration: '' })]);
      equal(entries.length, 1, type);
      equal(entries[0]?.type, 'SpecialCharge', type);
      equal(entries[0]?.description, description, type);
    }
  });

  it('keeps an Adj row an adjustment, in whichever direction it moved', () => {
    const added = migrateLegacyRows([row({ type: 'Adj', fees: 2_000, narration: 'Bill was too low' })]);
    equal(added[0]?.type, 'AdjustmentAdd');
    equal(added[0]?.reason, 'Bill was too low');

    const reduced = migrateLegacyRows([row({ type: 'Adj', discount: 2_000, narration: 'Billed twice' })]);
    const reduce = reduced[0];
    ok(reduce);
    equal(reduce.type, 'AdjustmentReduce');
    equal(signedEffect(reduce, entryResolver(reduced)), -2_000);
  });

  it('keeps a Disc row a concession and a Refund row a refund', () => {
    const disc = migrateLegacyRows([row({ type: 'Disc', discount: 9_000, narration: 'Merit 20 percent of tuition' })]);
    equal(disc[0]?.type, 'Concession');
    equal(disc[0]?.reason, 'Merit 20 percent of tuition');

    const refund = migrateLegacyRows([row({ type: 'Refund', payment: 10_000, receiptNo: '#7' })]);
    equal(refund[0]?.type, 'Refund');
    equal(refund[0]?.reference, '#7');
  });

  it('gives a payment its receipt number and its mode (§14)', () => {
    const explicit = migrateLegacyRows([
      row({ type: 'Pay', payment: 8_500, receiptNo: '#855', paymentMode: 'Bank' }),
    ]);
    equal(explicit[0]?.type, 'Payment');
    equal(explicit[0]?.reference, '#855');
    equal(explicit[0]?.paymentMode, 'Bank');

    // The historical rows only wrote the mode into the narration.
    const inferred = migrateLegacyRows([
      row({ type: 'Pay', payment: 8_500, receiptNo: '#856', narration: 'Paid by cheque 1188' }),
    ]);
    equal(inferred[0]?.paymentMode, 'Cheque');
  });

  it('leaves a payment and a refund with no term, since they settle money', () => {
    const entries = migrateLegacyRows([
      row({ type: 'Pay', payment: 1_000, semester: '3rd' }),
      row({ txnNo: 2, type: 'Refund', payment: 1_000, semester: '3rd' }),
    ]);

    deepStrictEqual(entries.map((entry) => entry.term), [null, null]);
  });

  it('maps an unknown semester label to no term rather than a wrong one', () => {
    const entries = migrateLegacyRows([row({ type: 'Demand', fees: 1_000, semester: 'Evening' })]);
    equal(entries[0]?.term, null);
    equal(entries[0]?.description, 'Fee charge');
  });
});

// --- one row, several entries --------------------------------------------------

describe('a row that held three things at once splits into three entries', () => {
  const rows = [
    row({ type: 'Demand', fees: 33_700 }),
    row({ id: 'tx-2', txnNo: 2, type: 'Pay', discount: 14_500, payment: 12_700, receiptNo: '#101' }),
  ];
  const entries = migrateLegacyRows(rows);

  it('in charge, reduction, payment order (§8)', () => {
    deepStrictEqual(
      entries.map((entry) => [entry.entryNo, entry.type, entry.amount]),
      [
        [1, 'FeeCharge', 33_700],
        [2, 'Concession', 14_500],
        [3, 'Payment', 12_700],
      ],
    );
  });

  it('conserves the money the old formula produced', () => {
    equal(migratedTotal(entries), legacyTotal(rows));
    equal(migratedTotal(entries), 33_700 - 14_500 - 12_700);
  });

  it('links the concession to the charge it reduced (§5)', () => {
    equal(entries[1]?.linkedEntryId, entries[0]?.id);
    equal(entries[2]?.linkedEntryId, null);
  });

  it('shares one action number per old row, so a split stays traceable (§5)', () => {
    equal(entries[0]?.actionNo, 'migrated-tx-1');
    // The concession and the payment came off one row, so they carry one action.
    equal(entries[1]?.actionNo, 'migrated-tx-2');
    equal(entries[2]?.actionNo, 'migrated-tx-2');
  });

  it('ends on the balance the student was shown before the move', () => {
    equal(entries.at(-1)?.balanceAfter, 6_500);
  });

  it('carries the old author through, in the order the row offers it', () => {
    const noAuthor = migrateLegacyRows([row({ fees: 1_000, createdBy: '', receivedBy: 'Admin Khalid' })]);
    equal(noAuthor[0]?.createdBy, 'Admin Khalid');

    const nobody = migrateLegacyRows([row({ fees: 1_000, createdBy: '', receivedBy: null })]);
    equal(nobody[0]?.createdBy, 'Migrated');
  });

  it('makes a thin narration into a reason the ledger check can accept (§5)', () => {
    const thin = migrateLegacyRows([row({ type: 'Disc', discount: 500, narration: 'Waiver' })]);
    const reason = thin[0]?.reason ?? '';

    ok(reason.startsWith('Waiver — '), reason);
    ok(reason.length >= REASON_MIN_LENGTH, 'a migrated reason must never fail §5');
  });

  it('still describes an entry that arrived with nothing written on it (§5)', () => {
    const blank = migrateLegacyRows([row({ type: 'Exam', fees: 2_000, narration: '' })]);
    const charge = blank[0];
    ok(charge);

    ok(charge.description.length > 0);
    // A charge needs no reason (§5) — only the reducing and correcting types do.
    equal(charge.reason, null);
  });
});

// --- numbering, order and the stored balance -----------------------------------

describe('entry numbers and the rebuilt balance (§5, §7.3)', () => {
  const rows = [
    // Deliberately out of order: the migration must not trust the array's order.
    row({ id: 'tx-c', txnNo: 3, date: '2018-03-20', type: 'Pay', payment: 14_100, semester: '3rd' }),
    row({ id: 'tx-a', txnNo: 1, date: '2017-01-15', type: 'Demand', fees: 33_700, semester: '1st' }),
    row({ id: 'tx-b', txnNo: 2, date: '2017-01-20', type: 'Pay', discount: 14_500, payment: 12_700, semester: '1st' }),
  ];
  const entries = migrateLegacyRows(rows);

  it('numbers one to n per student in date, then old transaction number order', () => {
    deepStrictEqual(
      entries.map((entry) => [entry.entryNo, entry.date, entry.type, entry.amount]),
      [
        [1, '2017-01-15', 'FeeCharge', 33_700],
        [2, '2017-01-20', 'Concession', 14_500],
        [3, '2017-01-20', 'Payment', 12_700],
        [4, '2018-03-20', 'Payment', 14_100],
      ],
    );
  });

  it('gives each entry a unique id built from its own number (§5)', () => {
    deepStrictEqual(entries.map((entry) => entry.id), ['e-76-1', 'e-76-2', 'e-76-3', 'e-76-4']);
    equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  });

  it('rebuilds balanceAfter so the stored copy matches the derived one (§7.3)', () => {
    for (const r of runningBalances(entries)) {
      equal(r.entry.balanceAfter, r.running, `entry ${r.entry.entryNo}`);
    }
    equal(entries.at(-1)?.balanceAfter, migratedTotal(entries));
  });

  it('restarts the numbering for each student and never mixes their money', () => {
    const two = migrateLegacyRows([
      row({ studentSno: 76, fees: 1_000 }),
      row({ id: 'tx-2', studentSno: 98, txnNo: 4, fees: 5_000 }),
    ]);

    deepStrictEqual(two.map((entry) => [entry.studentSno, entry.entryNo]), [
      [76, 1],
      [98, 1],
    ]);
    deepStrictEqual(two.map((entry) => entry.id), ['e-76-1', 'e-98-1']);
  });

  it('writes no entry at all for a row that held no money (§6)', () => {
    deepStrictEqual(migrateLegacyRows([row({ fees: 0, discount: 0, payment: 0 })]), []);
  });

  it('produces no problems at all, so migrated data satisfies the §5 rules', () => {
    for (const entry of entries) {
      deepStrictEqual(
        entryProblems(entry, { today: '2026-10-09', all: entries }),
        [],
        `entry ${entry.entryNo} (${entry.type})`,
      );
    }
  });
});

describe('the one deliberate change of sign (§6, refund)', () => {
  it('moves a refund the way the typed model says, not the way the old row did', () => {
    const refundRow = row({ type: 'Refund', payment: 10_000 });
    const entries = migrateLegacyRows([refundRow]);

    // The old formula counted anything in the payment column as money that reduced
    // dues; §6 says a refund hands money back and therefore increases them.
    equal(legacyBalanceEffect(refundRow), -10_000);
    equal(migratedTotal(entries), 10_000);
  });

  it('conserves money for every row that was not a refund', () => {
    const rows = [
      row({ type: 'Demand', fees: 33_700 }),
      row({ id: 'tx-2', txnNo: 2, type: 'Pay', discount: 14_500, payment: 12_700 }),
      row({ id: 'tx-3', txnNo: 3, type: 'Fine', discount: -1_500 }),
      row({ id: 'tx-4', txnNo: 4, type: 'Adj', fees: 2_000 }),
      row({ id: 'tx-5', txnNo: 5, type: 'Disc', discount: 3_000 }),
    ];

    equal(migratedTotal(migrateLegacyRows(rows)), legacyTotal(rows));
  });
});
