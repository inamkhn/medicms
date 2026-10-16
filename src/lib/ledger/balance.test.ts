// ============================================
// MediCMS Desktop — Ledger balance tests (§66 cases 1, 4; §4, §6, §7.3, §8)
// The balance is always derived from the entries: these run on the sample ledgers
// printed in §8 and on the pure functions in src/lib/ledger.
// Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { LedgerEntry, LedgerEntryType } from './types.ts';
import { entryId } from './entries.ts';
import {
  chronological,
  computeEntryBalance,
  liveBalanceOf,
  runningBalances,
  withStoredBalances,
} from './balance.ts';
import { entryProblems } from './entries.ts';

const SNO = 1;
const TODAY = '2026-10-09';

function entry(no: number, over: Partial<LedgerEntry> = {}): LedgerEntry {
  const type: LedgerEntryType = over.type ?? 'FeeCharge';
  return {
    id: entryId(SNO, no),
    studentSno: SNO,
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

/** §8.1 — Ayesha Khan, after admission. */
const AYESHA: LedgerEntry[] = [
  entry(1, {
    description: 'Term 1 fee charge',
    amount: 77_000,
    term: 1,
    dueDate: '2026-10-23',
  }),
  entry(2, {
    type: 'Concession',
    description: 'Sibling: admission fee waived',
    amount: 15_000,
    reason: 'Sibling already enrolled in BS Nursing',
    linkedEntryId: entryId(SNO, 1),
  }),
  entry(3, {
    type: 'Concession',
    description: 'Merit: 20 percent of tuition',
    amount: 9_000,
    reason: 'Merit scholarship, 20 percent of tuition',
    linkedEntryId: entryId(SNO, 1),
  }),
  entry(4, {
    type: 'Payment',
    description: 'Payment R-1042, cash',
    amount: 30_000,
    reference: 'R-1042',
    paymentMode: 'Cash',
  }),
];

describe('derived balance (§66 case 1)', () => {
  it("adds Ayesha's four entries to 23,000", () => {
    equal(computeEntryBalance(AYESHA).balance, 23_000);
    equal(liveBalanceOf(SNO, AYESHA), 23_000);
  });

  it('separates the increases from the reductions', () => {
    const summary = computeEntryBalance(AYESHA);
    equal(summary.increases, 77_000);
    equal(summary.reduces, 54_000);
  });

  it('reports the gross rupees of every type, for a statement\'s own columns', () => {
    const { byType } = computeEntryBalance(AYESHA);
    equal(byType.FeeCharge, 77_000);
    equal(byType.Concession, 24_000);
    equal(byType.Payment, 30_000);
    equal(byType.WriteOff, 0);
    // Every one of the eleven types is present, so a report never reads undefined.
    equal(Object.keys(byType).length, 11);
  });

  it('ignores the stored balanceAfter completely (§4, §7.3)', () => {
    const liedAbout = AYESHA.map((row) => entry(row.entryNo, { ...row, balanceAfter: 999_999 }));
    equal(computeEntryBalance(liedAbout).balance, 23_000);
    equal(runningBalances(liedAbout).at(-1)?.running, 23_000);
  });

  it('keeps one student\'s entries out of another student\'s balance (§5)', () => {
    const other = entry(1, { studentSno: 2, type: 'Payment', amount: 5000 });
    equal(liveBalanceOf(2, [...AYESHA, other]), -5_000);
    equal(liveBalanceOf(SNO, [...AYESHA, other]), 23_000);
  });

  it('counts nothing for a student with no entries', () => {
    equal(liveBalanceOf(999, AYESHA), 0);
    equal(computeEntryBalance([]).balance, 0);
  });
});

// --- §66 case 4 and the credit side ------------------------------------------

describe('credit, refund and opening balance', () => {
  it('goes negative when a payment overpays (§66 case 4)', () => {
    const owes = [entry(1, { amount: 20_000, dueDate: '2026-10-23', term: 1 })];
    const paid = [...owes, entry(2, { type: 'Payment', amount: 25_000 })];

    equal(computeEntryBalance(owes).balance, 20_000);
    equal(liveBalanceOf(SNO, paid), -5_000);
  });

  it('increases dues when money is handed back (§6: a refund reduces credit)', () => {
    const ledger = [
      entry(1, { amount: 20_000, dueDate: '2026-10-23', term: 1 }),
      entry(2, { type: 'Payment', amount: 25_000 }),
      entry(3, { type: 'Refund', amount: 4_000, reason: 'Security deposit returned' }),
    ];

    equal(liveBalanceOf(SNO, ledger), -1_000);
  });

  it('carries a migrated student in on either side', () => {
    equal(liveBalanceOf(SNO, [entry(1, { type: 'OpeningBalanceDues', amount: 5_000 })]), 5_000);
    equal(liveBalanceOf(SNO, [entry(1, { type: 'OpeningBalanceCredit', amount: 5_000 })]), -5_000);
  });

  it('reverses a payment back into dues (§66 case 6)', () => {
    const voided = [
      ...AYESHA,
      entry(5, {
        type: 'Reversal',
        amount: 30_000,
        linkedEntryId: entryId(SNO, 4),
        reason: 'Receipt R-1042 cancelled, wrong student',
      }),
    ];

    equal(liveBalanceOf(SNO, voided), 53_000);
  });

  it('voids and replaces in the same ledger (§66 case 7)', () => {
    const replaced = [
      ...AYESHA,
      entry(5, {
        type: 'Reversal',
        amount: 30_000,
        linkedEntryId: entryId(SNO, 4),
        reason: 'Receipt R-1042 cancelled, wrong amount',
      }),
      entry(6, {
        type: 'Payment',
        amount: 35_000,
        reference: 'R-1044',
        paymentMode: 'Cash',
        description: 'Payment R-1044, cash',
      }),
    ];

    equal(liveBalanceOf(SNO, replaced), 18_000);
  });

  it('reduces a charge when the charge itself is reversed (§66 case 8)', () => {
    const withFine = [
      entry(1, { amount: 20_000, dueDate: '2026-10-23', term: 1 }),
      entry(2, {
        type: 'SpecialCharge',
        amount: 5_000,
        description: 'Late payment fine',
        dueDate: TODAY,
      }),
    ];
    const reversed = [
      ...withFine,
      entry(3, {
        type: 'Reversal',
        amount: 5_000,
        linkedEntryId: entryId(SNO, 2),
        reason: 'Fine cancelled, waiver was already applied',
      }),
    ];

    equal(liveBalanceOf(SNO, withFine), 25_000);
    equal(liveBalanceOf(SNO, reversed), 20_000);
  });

  it('pays a charge back out of the till when a paid charge is reversed (§66 case 9)', () => {
    const ledger = [
      entry(1, { amount: 10_000, dueDate: '2026-10-23', term: 1 }),
      entry(2, { type: 'Payment', amount: 10_000 }),
      entry(3, {
        type: 'Reversal',
        amount: 10_000,
        linkedEntryId: entryId(SNO, 1),
        reason: 'Charge posted to the wrong term',
      }),
    ];

    equal(liveBalanceOf(SNO, ledger), -10_000);
  });
});

// --- §8: the printed order and the running column -----------------------------

describe('ledger order and the running balance (§8)', () => {
  it('sorts by date, then by the entry number within the day', () => {
    const shuffled = [
      entry(3, { date: '2026-01-01', type: 'Payment', amount: 1_000 }),
      entry(2, { date: TODAY, amount: 2_000 }),
      entry(1, { date: TODAY, amount: 1_000 }),
      entry(4, { date: '2025-12-31', amount: 4_000 }),
    ];

    deepStrictEqual(
      chronological(shuffled).map((row) => row.entryNo),
      [4, 3, 1, 2],
    );
  });

  it("prints Ayesha's running column exactly as §8 does", () => {
    const rows = runningBalances(AYESHA);

    deepStrictEqual(
      rows.map((row) => [row.entry.entryNo, row.signed, row.running]),
      [
        [1, 77_000, 77_000],
        [2, -15_000, 62_000],
        [3, -9_000, 53_000],
        [4, -30_000, 23_000],
      ],
    );
  });

  it('ends the running column at the same figure the summary reports', () => {
    const rows = runningBalances(AYESHA);
    const last = rows.at(-1);
    ok(last);
    equal(last.running, computeEntryBalance(AYESHA).balance);
    equal(last.running, liveBalanceOf(SNO, AYESHA));
  });

  it('prints a reversed payment as a credit in the order it happened', () => {
    const voided = [
      ...AYESHA,
      entry(5, {
        type: 'Reversal',
        amount: 30_000,
        linkedEntryId: entryId(SNO, 4),
        reason: 'Receipt R-1042 cancelled, wrong student',
      }),
    ];
    const rows = runningBalances(voided);
    const reversalRow = rows.find((row) => row.entry.type === 'Reversal');
    ok(reversalRow);
    // The reversal of a payment increases dues, so it prints as a positive movement.
    equal(reversalRow.signed, 30_000);
    equal(rows.at(-1)?.running, 53_000);
  });

  it('leaves the stored balanceAfter out of the printed column, entry by entry', () => {
    const tampered = AYESHA.map((row) => entry(row.entryNo, { ...row, balanceAfter: row.amount }));
    const printed = runningBalances(tampered).map((row) => row.running);

    deepStrictEqual(printed, [77_000, 62_000, 53_000, 23_000]);
  });
});

// §7.3 — a stored copy is allowed "for speed", and the ledger check re-verifies it.
// Posting stamps the copy from the same fold the check recomputes, so a fresh entry
// cannot arrive already disagreeing with its own balance.
describe('withStoredBalances — the stored copy of a newly posted batch', () => {
  it('stamps each posted entry with the running balance after it', () => {
    const posted = withStoredBalances([], [
      entry(1, { amount: 40_000, term: 2, dueDate: '2026-11-05' }),
      entry(2, { type: 'Payment', amount: 15_000, reference: 'R-1' }),
      entry(3, { type: 'Concession', amount: 5_000, reason: 'Sibling concession on term 2 fees', linkedEntryId: entryId(SNO, 1) }),
    ]);

    deepStrictEqual(posted.map((e) => e.balanceAfter), [40_000, 25_000, 20_000]);
  });

  it('continues from the balance already in the ledger rather than from zero', () => {
    const posted = withStoredBalances(AYESHA, [
      entry(5, { type: 'Payment', amount: 20_000, reference: 'R-2' }),
    ]);

    // Ayesha's four entries leave 23,000 (§8.1); 20,000 paid against it is 3,000.
    equal(computeEntryBalance(AYESHA).balance, 23_000);
    deepStrictEqual(posted.map((e) => e.balanceAfter), [3_000]);
  });

  it('keeps each student on their own running balance', () => {
    const other = entry(1, { studentSno: 2, id: entryId(2, 1), amount: 7_000, term: 1, dueDate: '2026-11-05' });
    const posted = withStoredBalances([other], [
      entry(6, { type: 'Payment', amount: 3_000, reference: 'R-3' }),
      entry(1, { studentSno: 2, id: entryId(2, 2), type: 'Payment', amount: 2_000, reference: 'R-4' }),
    ]);

    // Student 1 starts empty, so a payment alone leaves credit; student 2 runs on
    // their own 7,000 charge.
    deepStrictEqual(posted.map((e) => [e.studentSno, e.balanceAfter]), [[1, -3_000], [2, 5_000]]);
  });

  it('never rewrites the entries already in the ledger', () => {
    const stale = AYESHA.map((row) => entry(row.entryNo, { ...row, balanceAfter: 999 }));
    const posted = withStoredBalances(stale, [entry(5, { type: 'Payment', amount: 1_000, reference: 'R-5' })]);

    deepStrictEqual(posted.map((e) => e.balanceAfter), [22_000]);
    // The wrong history stays wrong on purpose — the ledger check names it (§7.1).
    deepStrictEqual(stale.map((e) => e.balanceAfter), [999, 999, 999, 999]);
  });

  it('leaves a posted batch that the check agrees with', () => {
    const posted = withStoredBalances([], [
      entry(1, { amount: 47_000, term: 2, dueDate: '2026-11-05' }),
      entry(2, { type: 'Payment', amount: 30_000, reference: 'R-6', paymentMode: 'Bank' }),
    ]);
    const problems = posted.flatMap((e) => entryProblems(e, { today: TODAY, all: posted }));

    deepStrictEqual(problems, []);
    deepStrictEqual(
      runningBalances(posted).map((row) => row.entry.balanceAfter),
      runningBalances(posted).map((row) => row.running),
    );
  });
});
