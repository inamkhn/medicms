// ============================================
// MediCMS Desktop — Fee charge, unpaid and ageing tests (§6 line 133, §24, §25)
// §66 cases 2, 3, 4, 5 and 16, plus the §8.2 sample ledger, run through the
// charge state the ledger, the profile and the statement all read.
// Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { LedgerEntry, LedgerEntryType } from './types.ts';
import { entryId } from './entries.ts';
import { liveBalanceOf } from './balance.ts';
import {
  ageingOf,
  allocationLabels,
  chargeStateOf,
  chargeStatesByStudent,
  overdueTotal,
  unpaidByCharge,
  type ChargeState,
} from './charges.ts';

const SNO = 1;

function entry(no: number, over: Partial<LedgerEntry> = {}): LedgerEntry {
  const type: LedgerEntryType = over.type ?? 'FeeCharge';
  return {
    id: entryId(SNO, no),
    studentSno: SNO,
    entryNo: no,
    date: '2026-10-09',
    type,
    amount: 1000,
    description: `${type} ${no}`,
    createdBy: 'Tester',
    createdAt: '2026-10-09T09:00:00',
    balanceAfter: 0,
    ...over,
  };
}

const charge = (no: number, term: number, amount: number, date: string, dueDate: string) =>
  entry(no, { term, amount, date, dueDate, description: `Term ${term} fee charge` });

const payment = (no: number, amount: number, date: string, reference: string) =>
  entry(no, {
    type: 'Payment',
    amount,
    date,
    reference,
    paymentMode: 'Cash',
    description: `Payment ${reference}, cash`,
  });

/** §8.2 — Bilal Ahmed, with allocation. */
const BILAL: LedgerEntry[] = [
  charge(1, 2, 47_000, '2025-12-31', '2026-01-15'),
  charge(2, 3, 61_000, '2026-07-05', '2026-07-20'),
  payment(3, 30_000, '2026-08-12', 'R-0388'),
  payment(4, 25_000, '2026-10-09', 'R-1043'),
];

/** The §10 acceptance line, checked on every fixture in this file. */
function assertIdentity(entries: LedgerEntry[], state: ChargeState): void {
  equal(
    state.unpaidTotal + state.unplacedDues - state.credit,
    liveBalanceOf(SNO, entries),
    'the charge list must account for the whole balance',
  );
}

describe('unpaid per fee charge (§66 case 2, oldest first)', () => {
  const state = chargeStateOf(BILAL);

  it('pays the oldest charge down before the newer one', () => {
    deepStrictEqual(
      state.charges.map((c) => [c.label, c.unpaid]),
      [
        ['Term 2', 0],
        ['Term 3', 53_000],
      ],
    );
    equal(state.unpaidTotal, 53_000);
    assertIdentity(BILAL, state);
  });

  it('spends each payment at its own moment, as §8.2 prints it', () => {
    deepStrictEqual(allocationLabels(BILAL[2], state), [{ label: 'Term 2', amount: 30_000 }]);
    deepStrictEqual(allocationLabels(BILAL[3], state), [
      { label: 'Term 2', amount: 17_000 },
      { label: 'Term 3', amount: 8_000 },
    ]);
  });

  it('marks the allocation as derived, since no entry stored it', () => {
    equal(state.allocationsDerived, true);
  });

  it('keys the unpaid list by entry id, for "Unpaid fee charges" (§9.1)', () => {
    deepStrictEqual(unpaidByCharge(state), { 'e-1-1': 0, 'e-1-2': 53_000 });
  });
});

describe('specific charge (§66 case 3)', () => {
  const directed: LedgerEntry[] = [
    charge(1, 2, 47_000, '2025-12-31', '2026-01-15'),
    charge(2, 3, 61_000, '2026-07-05', '2026-07-20'),
    entry(3, {
      type: 'Payment',
      amount: 30_000,
      date: '2026-08-12',
      reference: 'R-0388',
      allocations: [{ chargeId: entryId(SNO, 1), amount: 30_000 }],
    }),
    entry(4, {
      type: 'Payment',
      amount: 25_000,
      date: '2026-10-09',
      reference: 'R-1044',
      allocations: [{ chargeId: entryId(SNO, 2), amount: 25_000 }],
    }),
  ];
  const state = chargeStateOf(directed);

  it('honours the allocation the payment carries instead of sweeping', () => {
    deepStrictEqual(
      state.charges.map((c) => [c.label, c.unpaid]),
      [
        ['Term 2', 17_000],
        ['Term 3', 36_000],
      ],
    );
    equal(state.allocationsDerived, false);
    assertIdentity(directed, state);
  });

  it('treats a partial allocation as the whole story of that payment', () => {
    const short: LedgerEntry[] = [
      charge(1, 2, 47_000, '2025-12-31', '2026-01-15'),
      entry(2, {
        type: 'Payment',
        amount: 20_000,
        allocations: [{ chargeId: entryId(SNO, 1), amount: 5_000 }],
      }),
    ];
    const stateOfShort = chargeStateOf(short);

    // The other 15,000 was never placed on anything, so it is credit in hand.
    equal(stateOfShort.credit, 15_000);
    equal(stateOfShort.charges[0]?.unpaid, 42_000);
    deepStrictEqual(allocationLabels(short[1], stateOfShort), [
      { label: 'Term 2', amount: 5_000 },
      { label: 'Credit held', amount: 15_000 },
    ]);
    assertIdentity(short, stateOfShort);
  });
});

describe('over-payment and credit (§66 cases 4 and 5)', () => {
  const overpaid: LedgerEntry[] = [
    charge(1, 1, 20_000, '2026-10-01', '2026-10-23'),
    payment(2, 25_000, '2026-10-02', 'R-1042'),
  ];

  it('holds the extra as credit and leaves nothing unpaid (case 4)', () => {
    const state = chargeStateOf(overpaid);

    equal(liveBalanceOf(SNO, overpaid), -5_000);
    equal(state.unpaidTotal, 0);
    equal(state.credit, 5_000);
    equal(state.unplacedDues, 0);
    deepStrictEqual(allocationLabels(overpaid[1], state), [
      { label: 'Term 1', amount: 20_000 },
      { label: 'Credit held', amount: 5_000 },
    ]);
    assertIdentity(overpaid, state);
  });

  it('applies the credit to the next fee charge as it is posted (case 5)', () => {
    const withNewCharge: LedgerEntry[] = [
      ...overpaid,
      charge(3, 2, 47_000, '2026-10-05', '2026-11-15'),
    ];
    const state = chargeStateOf(withNewCharge);

    equal(state.charges[1]?.unpaid, 42_000);
    equal(state.unpaidTotal, 42_000);
    equal(state.credit, 0);
    equal(liveBalanceOf(SNO, withNewCharge), 42_000);
    assertIdentity(withNewCharge, state);
  });

  it('applies opening credit the same way (§6)', () => {
    const ledger: LedgerEntry[] = [
      entry(1, { type: 'OpeningBalanceCredit', amount: 5_000, date: '2026-01-01' }),
      charge(2, 1, 47_000, '2026-10-05', '2026-11-15'),
    ];
    const state = chargeStateOf(ledger);

    equal(state.charges[0]?.unpaid, 42_000);
    equal(state.credit, 0);
    assertIdentity(ledger, state);
  });

  it('a refund takes credit out of the student\'s hand (§66 case 4 continued)', () => {
    const refunded: LedgerEntry[] = [
      ...overpaid,
      entry(3, {
        type: 'Refund',
        amount: 3_000,
        date: '2026-10-03',
        reason: 'Security deposit returned on leaving',
      }),
    ];
    const state = chargeStateOf(refunded);

    equal(state.credit, 2_000);
    equal(liveBalanceOf(SNO, refunded), -2_000);
    assertIdentity(refunded, state);
  });

  it('reports a refund larger than the credit as dues, not as a lost number', () => {
    const tooBig: LedgerEntry[] = [
      ...overpaid,
      entry(3, {
        type: 'Refund',
        amount: 9_000,
        date: '2026-10-03',
        reason: 'Refund issued beyond the credit in hand',
      }),
    ];
    const state = chargeStateOf(tooBig);

    equal(state.credit, 0);
    equal(state.unplacedDues, 4_000);
    assertIdentity(tooBig, state);
  });
});

describe('§6 line 133: everything that moves one fee charge', () => {
  const one: LedgerEntry[] = [
    charge(1, 1, 50_000, '2026-01-01', '2026-01-20'),
    entry(2, {
      type: 'Concession',
      amount: 5_000,
      date: '2026-01-02',
      reason: 'Sibling admission fee waived',
      linkedEntryId: entryId(SNO, 1),
    }),
    entry(3, {
      type: 'AdjustmentReduce',
      amount: 2_000,
      date: '2026-01-03',
      reason: 'Library fee billed twice, removed',
      linkedEntryId: entryId(SNO, 1),
    }),
    entry(4, {
      type: 'AdjustmentAdd',
      amount: 1_000,
      date: '2026-01-04',
      reason: 'Lab fee was billed too low on Term 1',
      linkedEntryId: entryId(SNO, 1),
    }),
    entry(5, {
      type: 'WriteOff',
      amount: 3_000,
      date: '2026-01-05',
      reason: 'Written off on the Admin\'s instruction',
      linkedEntryId: entryId(SNO, 1),
    }),
    payment(6, 20_000, '2026-02-01', 'R-1042'),
  ];
  const state = chargeStateOf(one);
  const feeCharge = state.charges[0];

  it('charge − concessions − write-offs − reduce + add − payments', () => {
    ok(feeCharge);
    equal(feeCharge.billed, 50_000);
    equal(feeCharge.added, 1_000);
    equal(feeCharge.reduced, 10_000);
    equal(feeCharge.paid, 20_000);
    equal(feeCharge.unpaid, 21_000);
    equal(state.unpaidTotal, 21_000);
    assertIdentity(one, state);
  });

  it('agrees with the derived balance to the rupee', () => {
    equal(state.unpaidTotal, liveBalanceOf(SNO, one));
  });

  it('carries a concession that names no charge as credit (§5 linked entry)', () => {
    const unlinked: LedgerEntry[] = [
      charge(1, 1, 20_000, '2026-01-01', '2026-01-20'),
      entry(2, {
        type: 'Concession',
        amount: 2_000,
        date: '2026-01-02',
        reason: 'Legacy waiver with no charge recorded',
      }),
    ];
    const stateOfUnlinked = chargeStateOf(unlinked);

    equal(stateOfUnlinked.charges[0]?.unpaid, 20_000);
    equal(stateOfUnlinked.credit, 2_000);
    assertIdentity(unlinked, stateOfUnlinked);
  });

  it('stands an unattached Adjustment (add) up as a charge of its own', () => {
    const standalone: LedgerEntry[] = [
      entry(1, {
        type: 'AdjustmentAdd',
        amount: 4_000,
        dueDate: '2026-11-01',
        reason: 'Corrected the amount billed at admission',
      }),
    ];
    const stateOfStandalone = chargeStateOf(standalone);

    equal(stateOfStandalone.charges.length, 1);
    equal(stateOfStandalone.charges[0]?.unpaid, 4_000);
    assertIdentity(standalone, stateOfStandalone);
  });
});

describe('reversals against the charge list (§45)', () => {
  it('takes a cancelled charge off the unpaid list (§66 case 8)', () => {
    const ledger: LedgerEntry[] = [
      charge(1, 1, 20_000, '2026-01-01', '2026-01-20'),
      entry(2, {
        type: 'SpecialCharge',
        amount: 5_000,
        description: 'Late payment fine',
        dueDate: '2026-02-01',
        date: '2026-01-30',
      }),
      entry(3, {
        type: 'Reversal',
        amount: 5_000,
        date: '2026-02-02',
        reason: 'Fine cancelled, waiver had already been applied',
        linkedEntryId: entryId(SNO, 2),
      }),
    ];
    const state = chargeStateOf(ledger);

    equal(state.charges[1]?.cancelled, 5_000);
    equal(state.charges[1]?.unpaid, 0);
    equal(state.unpaidTotal, 20_000);
    assertIdentity(ledger, state);
  });

  it('releases a payment whose receipt was voided (§66 case 6)', () => {
    const ledger: LedgerEntry[] = [
      charge(1, 1, 77_000, '2026-10-09', '2026-10-23'),
      payment(2, 30_000, '2026-10-09', 'R-1042'),
      entry(3, {
        type: 'Reversal',
        amount: 30_000,
        date: '2026-10-09',
        reason: 'Receipt R-1042 voided, wrong student',
        linkedEntryId: entryId(SNO, 2),
      }),
    ];
    const state = chargeStateOf(ledger);

    equal(state.unpaidTotal, 77_000);
    deepStrictEqual(state.allocations.get(entryId(SNO, 2)), []);
    // The money is back in the till, so the row claims nothing: not an allocation,
    // and not credit held either.
    deepStrictEqual(allocationLabels(ledger[1], state), []);
    ok(state.reversed.has(entryId(SNO, 2)));
    assertIdentity(ledger, state);
  });

  it('hands a paid charge\'s money back as credit (§66 case 9)', () => {
    const ledger: LedgerEntry[] = [
      charge(1, 1, 10_000, '2026-01-01', '2026-01-20'),
      payment(2, 10_000, '2026-01-05', 'R-1042'),
      entry(3, {
        type: 'Reversal',
        amount: 10_000,
        date: '2026-01-06',
        reason: 'Charge posted to the wrong term',
        linkedEntryId: entryId(SNO, 1),
      }),
    ];
    const state = chargeStateOf(ledger);

    equal(state.charges[0]?.unpaid, 0);
    equal(state.credit, 10_000);
    equal(liveBalanceOf(SNO, ledger), -10_000);
    assertIdentity(ledger, state);
  });
});

describe('concession entered with the payment (§66 case 16)', () => {
  const ledger: LedgerEntry[] = [
    charge(1, 1, 23_000, '2026-10-09', '2026-10-23'),
    entry(2, {
      type: 'Concession',
      amount: 2_000,
      date: '2026-10-09',
      reason: 'Counter waiver approved by Admin',
      linkedEntryId: entryId(SNO, 1),
    }),
    payment(3, 21_000, '2026-10-09', 'R-1042'),
  ];

  it('leaves a zero balance with the concession linked to the charge', () => {
    const state = chargeStateOf(ledger);

    equal(liveBalanceOf(SNO, ledger), 0);
    equal(state.unpaidTotal, 0);
    equal(state.credit, 0);
    equal(state.charges[0]?.reduced, 2_000);
    assertIdentity(ledger, state);
  });
});

describe('ageing and overdue (§24)', () => {
  const state = chargeStateOf(BILAL);

  it('puts Bilal\'s Term 3 in the 61 to 90 day bucket on 9 Oct 2026', () => {
    const ageing = ageingOf(state, '2026-10-09');

    equal(ageing.overdueTotal, 53_000);
    equal(ageing.buckets.d61to90, 53_000);
    equal(ageing.buckets.notYetDue, 0);
    equal(ageing.oldestDays, 81);
    assertIdentity(BILAL, state);
  });

  it('counts nothing as overdue before its due date, and nothing already paid', () => {
    const fresh: LedgerEntry[] = [
      charge(1, 1, 20_000, '2026-10-01', '2026-10-23'),
      charge(2, 2, 5_000, '2026-10-01', '2026-10-20'),
      payment(3, 5_000, '2026-10-02', 'R-1042'),
    ];
    const stateOfFresh = chargeStateOf(fresh);
    const ageing = ageingOf(stateOfFresh, '2026-10-09');

    equal(overdueTotal(stateOfFresh, '2026-10-09'), 0);
    equal(ageing.buckets.notYetDue, 20_000);
    assertIdentity(fresh, stateOfFresh);
  });

  it('files an opening balance with no due date as due when it was posted', () => {
    const migrated: LedgerEntry[] = [
      entry(1, { type: 'OpeningBalanceDues', amount: 12_000, date: '2017-01-15' }),
    ];
    const stateOfMigrated = chargeStateOf(migrated);

    equal(stateOfMigrated.charges[0]?.dueDate, '2017-01-15');
    equal(overdueTotal(stateOfMigrated, '2026-10-09'), 12_000);
    equal(ageingOf(stateOfMigrated, '2026-10-09').buckets.over90, 12_000);
    assertIdentity(migrated, stateOfMigrated);
  });
});

describe('one student\'s money never touches another\'s (§5)', () => {
  const otherStudentCharge = entry(1, { term: 1, amount: 30_000, date: '2026-01-01', dueDate: '2026-01-20' });
  const mixed: LedgerEntry[] = [
    charge(1, 1, 20_000, '2026-01-01', '2026-01-20'),
    payment(2, 20_000, '2026-01-05', 'R-1042'),
    // Same entry number, different student: ids carry the SNO for exactly this
    // reason (§5).
    { ...otherStudentCharge, studentSno: 2, id: 'e-2-1' },
  ];
  const states = chargeStatesByStudent(mixed);

  it('keeps the lists apart', () => {
    equal(states.get(SNO)?.unpaidTotal, 0);
    equal(states.get(2)?.unpaidTotal, 30_000);
    equal(states.get(2)?.charges.length, 1);
  });

  it('still explains each student\'s own balance', () => {
    for (const [sno, state] of states) {
      equal(
        state.unpaidTotal + state.unplacedDues - state.credit,
        liveBalanceOf(sno, mixed),
        `student ${sno}`,
      );
    }
  });
});
