// ============================================
// MediCMS Desktop — Ledger entry model tests (§6, §66)
// The §6 direction table, the §5 / §7 posting rules and the §7.6 / §7.7 status
// gates, run on the pure functions in src/lib/ledger with no store, component or
// clock. Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { LedgerEntry, LedgerEntryType } from './types.ts';
import {
  ENTRY_LABELS,
  REASON_MIN_LENGTH,
  entryDirection,
  entryId,
  entryIncreasesDues,
  entryProblems,
  entryResolver,
  isMoneyMovement,
  linesTotal,
  nextEntryNo,
  postingBlocker,
  reversedEntryIds,
  signedEffect,
  typeDirection,
} from './entries.ts';

const SNO = 1;
const TODAY = '2026-10-09';

/** An entry with every §5 field filled in the boring way, plus what the test wants. */
function entry(no: number, over: Partial<LedgerEntry> = {}): LedgerEntry {
  const type = over.type ?? 'FeeCharge';
  return {
    id: entryId(SNO, no),
    studentSno: SNO,
    entryNo: no,
    date: TODAY,
    type,
    amount: 1000,
    description: over.description ?? `${ENTRY_LABELS[type]} ${no}`,
    createdBy: 'Tester',
    createdAt: `${TODAY}T09:00:00`,
    balanceAfter: 0,
    ...over,
  };
}

const ALL_TYPES: readonly LedgerEntryType[] = [
  'OpeningBalanceDues',
  'OpeningBalanceCredit',
  'FeeCharge',
  'SpecialCharge',
  'AdjustmentAdd',
  'Concession',
  'Payment',
  'AdjustmentReduce',
  'WriteOff',
  'Refund',
  'Reversal',
];

// --- §6: the direction table ---------------------------------------------------

describe('entry direction (§6)', () => {
  it('increases dues for the five types the table says increase', () => {
    const increasing: LedgerEntryType[] = [
      'OpeningBalanceDues',
      'FeeCharge',
      'SpecialCharge',
      'AdjustmentAdd',
      'Refund',
    ];
    for (const type of increasing) equal(typeDirection(type), 1, `${type} should increase`);
  });

  it('reduces dues for the five types the table says reduce', () => {
    const reducing: LedgerEntryType[] = [
      'OpeningBalanceCredit',
      'Concession',
      'Payment',
      'AdjustmentReduce',
      'WriteOff',
    ];
    for (const type of reducing) equal(typeDirection(type), -1, `${type} should reduce`);
  });

  it('covers all eleven types, so the table cannot silently lose one', () => {
    equal(ALL_TYPES.length, 11);
    equal(new Set(ALL_TYPES).size, 11);
    deepStrictEqual(
      ALL_TYPES.map((type) => ENTRY_LABELS[type]),
      [
        'Opening balance (dues)',
        'Opening balance (credit)',
        'Fee charge',
        'Special charge',
        'Adjustment (add)',
        'Concession',
        'Payment',
        'Adjustment (reduce)',
        'Write-off',
        'Refund',
        'Reversal',
      ],
    );
    // `Reversal` has no direction of its own (§6) — the reversal tests below check it.
    equal(typeDirection('Reversal'), -1);
  });

  it('derives a reversal from the entry it reverses, never from its own type', () => {
    const charge = entry(1, { type: 'FeeCharge', amount: 5000 });
    const payment = entry(2, { type: 'Payment', amount: 3000 });
    const all = [charge, payment];
    const resolve = entryResolver(all);

    equal(entryDirection(entry(3, { type: 'Reversal', linkedEntryId: charge.id }), resolve), -1);
    equal(entryDirection(entry(4, { type: 'Reversal', linkedEntryId: payment.id }), resolve), 1);
  });

  it('lands back where it started through a reversal of a reversal', () => {
    const payment = entry(1, { type: 'Payment', amount: 3000 });
    const reversed = entry(2, { type: 'Reversal', linkedEntryId: payment.id });
    const reReversed = entry(3, { type: 'Reversal', linkedEntryId: reversed.id });
    const resolve = entryResolver([payment, reversed, reReversed]);

    equal(entryDirection(reversed, resolve), 1);
    equal(entryDirection(reReversed, resolve), -1);
  });

  it('survives a reversal cycle instead of hanging the ledger', () => {
    const a = entry(1, { type: 'Reversal', linkedEntryId: entryId(SNO, 2) });
    const b = entry(2, { type: 'Reversal', linkedEntryId: entryId(SNO, 1) });
    const resolve = entryResolver([a, b]);

    // Walking A → B → A forever would hang the list; the bound stops with a direction.
    ok(entryDirection(a, resolve) === 1 || entryDirection(a, resolve) === -1);
  });

  it('treats an unlinked reversal as increasing, and reports it as invalid', () => {
    const loose = entry(1, { type: 'Reversal' });
    const resolve = entryResolver([loose]);

    equal(entryDirection(loose, resolve), 1);
    ok(entryProblems(loose, { today: TODAY, all: [loose] })
      .some((problem) => problem.includes('must name the entry it reverses')));
  });

  it('produces signed rupees from the amount alone (§6)', () => {
    const resolve = entryResolver([entry(1, { type: 'Payment', amount: 25000 })]);
    const payment = entry(1, { type: 'Payment', amount: 25000 });

    equal(signedEffect(payment, resolve), -25000);
    equal(entryIncreasesDues(payment, resolve), false);
    equal(linesTotal([{ name: 'Tuition', amount: 45000 }, { name: 'Lab', amount: 3000 }]), 48000);
  });

  it('names the money movements for the day book (§9.2)', () => {
    deepStrictEqual(ALL_TYPES.filter(isMoneyMovement), ['Payment', 'Refund']);
  });
});

// --- §54: the words the ledger prints -----------------------------------------

describe('entry labels (§54)', () => {
  it('uses the design document\'s wording, not code identifiers', () => {
    equal(ENTRY_LABELS.OpeningBalanceDues, 'Opening balance (dues)');
    equal(ENTRY_LABELS.OpeningBalanceCredit, 'Opening balance (credit)');
    equal(ENTRY_LABELS.FeeCharge, 'Fee charge');
    equal(ENTRY_LABELS.SpecialCharge, 'Special charge');
    equal(ENTRY_LABELS.AdjustmentAdd, 'Adjustment (add)');
    equal(ENTRY_LABELS.Concession, 'Concession');
    equal(ENTRY_LABELS.Payment, 'Payment');
    equal(ENTRY_LABELS.AdjustmentReduce, 'Adjustment (reduce)');
    equal(ENTRY_LABELS.WriteOff, 'Write-off');
    equal(ENTRY_LABELS.Refund, 'Refund');
    equal(ENTRY_LABELS.Reversal, 'Reversal');
  });
});

// --- §5 / §7: what may be posted ----------------------------------------------

describe('entry rules (§5, §7)', () => {
  it('accepts one complete entry of every type', () => {
    const charge = entry(1, { type: 'FeeCharge', term: 1, dueDate: '2026-10-23' });
    const complete: Record<LedgerEntryType, Partial<LedgerEntry>> = {
      OpeningBalanceDues: {},
      OpeningBalanceCredit: {},
      FeeCharge: {
        term: 1,
        dueDate: '2026-10-23',
        lines: [
          { name: 'Tuition', amount: 600 },
          { name: 'Clinical training', amount: 400 },
        ],
      },
      SpecialCharge: { dueDate: '2026-10-23' },
      AdjustmentAdd: { dueDate: '2026-10-23', reason: 'Term 1 tuition was billed too low', linkedEntryId: charge.id },
      Concession: { reason: 'Sibling already enrolled, admission waived', linkedEntryId: charge.id },
      Payment: { reference: 'R-1042', paymentMode: 'Cash' },
      AdjustmentReduce: { reason: 'Lab fee was billed twice, removed', linkedEntryId: charge.id },
      WriteOff: { reason: 'Dues written off after the student left' },
      Refund: { reason: 'Security deposit returned on leaving', reference: 'R-1042' },
      Reversal: { reason: 'Payment recorded against the wrong receipt', linkedEntryId: entryId(SNO, 8) },
    };
    const list = [charge, ...ALL_TYPES.map((type, index) => entry(index + 2, { type, ...complete[type] }))];

    for (const candidate of list) {
      deepStrictEqual(entryProblems(candidate, { today: TODAY, all: list }), [], candidate.type);
    }
  });

  it('rejects a negative, fractional or zero amount (§6, §7.2)', () => {
    for (const amount of [-500, 1000.5, 0]) {
      const problems = entryProblems(entry(1, { amount }), { today: TODAY });
      ok(
        problems.some((problem) => problem.includes('Amount')),
        `${amount} should be refused`,
      );
    }
  });

  it('demands a reason from the five types §5 lists', () => {
    const needsReason: LedgerEntryType[] = [
      'Concession',
      'AdjustmentAdd',
      'AdjustmentReduce',
      'WriteOff',
      'Refund',
    ];
    for (const type of needsReason) {
      const missing = entryProblems(entry(1, { type, dueDate: TODAY }), { today: TODAY });
      ok(missing.some((problem) => problem.includes('requires a reason')), type);

      const tooShort = entryProblems(
        entry(1, { type, dueDate: TODAY, reason: 'Waiver' }),
        { today: TODAY },
      );
      ok(tooShort.some((problem) => problem.includes('more characters')), type);

      const enough = entryProblems(
        entry(1, { type, dueDate: TODAY, reason: 'x'.repeat(REASON_MIN_LENGTH) }),
        { today: TODAY },
      );
      deepStrictEqual(enough, [], type);
    }

    // A reversal is the sixth (§45), and it must also say what it reverses.
    const reversal = entryProblems(entry(1, { type: 'Reversal' }), { today: TODAY });
    ok(reversal.some((problem) => problem.includes('requires a reason')));
  });

  it('demands a due date from the three charge types (§5)', () => {
    for (const type of ['FeeCharge', 'SpecialCharge', 'AdjustmentAdd'] as LedgerEntryType[]) {
      const problems = entryProblems(entry(1, { type, reason: 'x'.repeat(12) }), { today: TODAY });
      ok(problems.some((problem) => problem.includes('requires a due date')), type);
    }
    for (const type of ['Payment', 'Concession', 'WriteOff'] as LedgerEntryType[]) {
      const problems = entryProblems(entry(1, { type, reason: 'x'.repeat(12) }), { today: TODAY });
      equal(problems.length, 0, `${type} needs no due date`);
    }
  });

  it('refuses a future-dated payment but not a charge with a later due date (§7.4)', () => {
    const late = entryProblems(entry(1, { type: 'Payment', date: '2026-10-10' }), { today: TODAY });
    ok(late.some((problem) => problem.includes('future-dated')));

    const charge = entryProblems(
      entry(1, { type: 'FeeCharge', dueDate: '2026-12-31', term: 1 }),
      { today: TODAY },
    );
    deepStrictEqual(charge, []);
  });

  it('catches a link that points at nothing, and only when the list is given', () => {
    const dangling = entry(2, {
      type: 'Concession',
      reason: 'Merit waiver on tuition',
      linkedEntryId: entryId(SNO, 99),
    });

    ok(entryProblems(dangling, { today: TODAY, all: [dangling] })
      .some((problem) => problem.includes('does not exist')));
    // One entry being validated before it is posted has no history to check against.
    deepStrictEqual(entryProblems(dangling, { today: TODAY }), []);
  });

  it('requires the id to be the number it claims (§5)', () => {
    const wrongId = entryProblems(entry(3, { id: 'e-1-7' }), { today: TODAY });
    ok(wrongId.some((problem) => problem.includes('Entry id must be e-1-3')));

    const zeroNumber = entryProblems(entry(0, { entryNo: 0 }), { today: TODAY });
    ok(zeroNumber.some((problem) => problem.includes('Entry number')));
  });

  it('refuses a date that is not a local calendar date (§5)', () => {
    const utcSplit = entryProblems(entry(1, { date: '2026-10-09T05:00:00Z' }), { today: TODAY });
    ok(utcSplit.some((problem) => problem.includes('local calendar date')));
  });

  it('insists the itemised lines add up to the entry (§5)', () => {
    const short = entryProblems(
      entry(1, { dueDate: TODAY, lines: [{ name: 'Tuition', amount: 400 }] }),
      { today: TODAY },
    );
    ok(short.some((problem) => problem.includes('add up to 400')));

    const badLine = entryProblems(
      entry(1, {
        dueDate: TODAY,
        lines: [
          { name: 'Tuition', amount: 900 },
          { name: 'Fraction', amount: 100.5 },
        ],
      }),
      { today: TODAY },
    );
    ok(badLine.some((problem) => problem.includes('whole number of rupees')));
  });

  it('refuses an entry with no description and no owner (§5)', () => {
    ok(entryProblems(entry(1, { description: '  ', dueDate: TODAY }), { today: TODAY })
      .some((problem) => problem.includes('Description is required')));
    ok(entryProblems(entry(1, { studentSno: 0, dueDate: TODAY }), { today: TODAY })
      .some((problem) => problem.includes('belong to a student')));
  });
});

// --- §7.6 / §7.7: who may be posted against ----------------------------------

describe('posting gates (§7.6, §7.7)', () => {
  const active = { struckOff: false, completed: false };
  const struck = { struckOff: true, completed: false };
  const finished = { struckOff: false, completed: true };

  it('lets an active student be posted against freely', () => {
    for (const type of ALL_TYPES) equal(postingBlocker(type, active), null, type);
  });

  it('blocks new charges for a struck-off student but not payments or write-offs (§7.6)', () => {
    ok(postingBlocker('FeeCharge', struck));
    ok(postingBlocker('SpecialCharge', struck));
    equal(postingBlocker('Payment', struck), null);
    equal(postingBlocker('Refund', struck), null);
    equal(postingBlocker('AdjustmentReduce', struck), null);
    equal(postingBlocker('WriteOff', struck), null);
    equal(postingBlocker('Concession', struck), null);
  });

  it('blocks promotion fees for a completed student but allows a certificate fee (§7.7)', () => {
    ok(postingBlocker('FeeCharge', finished));
    equal(postingBlocker('SpecialCharge', finished), null);
    equal(postingBlocker('Payment', finished), null);
  });

  it('blocks fee charges for an on-leave student but allows payments (§26.5)', () => {
    const away = { struckOff: false, completed: false, onLeave: true };
    ok(postingBlocker('FeeCharge', away));
    equal(postingBlocker('SpecialCharge', away), null);
    equal(postingBlocker('Payment', away), null);
    equal(postingBlocker('Refund', away), null);
  });
});

// --- §5: entry numbers only go forward ----------------------------------------

describe('entry numbering (§5)', () => {
  it('builds a deterministic id from the student and the number', () => {
    equal(entryId(76, 3), 'e-76-3');
    equal(entryId(SNO, 1), 'e-1-1');
  });

  it('offers one above the highest number ever used, not the highest still present', () => {
    equal(nextEntryNo([], SNO), 1);
    equal(nextEntryNo([entry(1), entry(2), entry(5)], SNO), 6);
    // Another student's numbers do not move this one's (§5).
    equal(nextEntryNo([entry(1), entry(2), entry(5)], 77), 1);
  });

  it('collects the entries a reversal cancels (§45)', () => {
    const payment = entry(1, { type: 'Payment' });
    const reversal = entry(2, { type: 'Reversal', linkedEntryId: payment.id });

    deepStrictEqual([...reversedEntryIds([payment, reversal])], [payment.id]);
    deepStrictEqual([...reversedEntryIds([payment])], []);
  });
});
