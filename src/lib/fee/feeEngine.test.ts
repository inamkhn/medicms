// ============================================
// MediCMS Desktop - Fee engine test cases (design doc §28)
// All seventeen cases come from the samples in FEE_TEMPLATES_AND_ADMISSION_DESIGN.md
// and run on the pure functions in src/lib/fee, with no store, component or clock.
// Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { ConcessionRecord, FeeComponent, PostedCharge, TemplateLine, TermScope } from './types.ts';
import type { TermFeesResult } from './termFees.ts';
import { computeTemplateTermFees, deriveTermsPerYear } from './termFees.ts';
import { applyConcessions } from './concessions.ts';
import { allocatePayment, applyCreditToCharge, releaseAllocation, unpaidOf } from './allocation.ts';
import { computeAgeing, daysBetween } from './ageing.ts';
import type { NewTermFee } from './adjustments.ts';
import { planChangeAdjustments } from './adjustments.ts';
import type { RefundLine } from './refund.ts';
import { suggestRefund } from './refund.ts';

// --- Fixtures (§8.1, §8.2, §24.5) ----------------------------------------------

/** Sample A: BS Nursing (BSN), Session 2026, 8 semesters. */
const SAMPLE_A: FeeComponent[] = [
  { id: 'admission', name: 'Admission fee', amount: 15_000, charged: 'AtAdmission', refundable: false },
  { id: 'idcard', name: 'ID card', amount: 1_000, charged: 'AtAdmission', refundable: false },
  { id: 'security', name: 'Security deposit', amount: 10_000, charged: 'AtAdmission', refundable: true },
  { id: 'tuition', name: 'Tuition', amount: 45_000, charged: 'EveryTerm', refundable: false },
  { id: 'clinical', name: 'Clinical training', amount: 8_000, charged: 'EveryTerm', fromTerm: 3, refundable: false },
  { id: 'annual', name: 'Annual charges', amount: 6_000, charged: 'EveryNewYear', refundable: false },
  { id: 'promotion', name: 'Promotion fee', amount: 2_000, charged: 'OnPromotion', refundable: false },
  { id: 'degree', name: 'Degree fee', amount: 12_000, charged: 'LastTermOnly', refundable: false },
];

/** Sample B: Paramedics, Radiology, Session 2026, 4 semesters. */
const SAMPLE_B: FeeComponent[] = [
  { id: 'admission', name: 'Admission fee', amount: 10_000, charged: 'AtAdmission', refundable: false },
  { id: 'idcard', name: 'ID card', amount: 500, charged: 'AtAdmission', refundable: false },
  { id: 'tuition', name: 'Tuition', amount: 25_000, charged: 'EveryTerm', refundable: false },
  { id: 'lab', name: 'Lab fee', amount: 3_000, charged: 'EveryTerm', refundable: false },
  { id: 'promotion', name: 'Promotion fee', amount: 1_000, charged: 'OnPromotion', refundable: false },
  { id: 'diploma', name: 'Diploma fee', amount: 5_000, charged: 'LastTermOnly', refundable: false },
];

const SEMESTER = deriveTermsPerYear('semester');
const bsn = computeTemplateTermFees(SAMPLE_A, { totalTerms: 8, termsPerYear: SEMESTER });

/** Bilal Ahmed, §24.5: Term 2 partly paid, Term 3 untouched. */
const BILAL_CHARGES: PostedCharge[] = [
  { id: 'bilal-t2', term: 2, label: 'Term 2 fee', amount: 47_000, dueDate: '2026-01-15', allocated: 30_000 },
  { id: 'bilal-t3', term: 3, label: 'Term 3 fee', amount: 61_000, dueDate: '2026-07-20', allocated: 0 },
];

const termOnly = (term: number): TermScope => ({ mode: 'termOnly', term });
const allTerms: TermScope = { mode: 'remainingTerms', fromTerm: 1 };

/** Ayesha Khan, §17: admission fee waived in Term 1, 20 percent off tuition forever. */
const SIBLING_WAIVER: ConcessionRecord = {
  id: 'concession-sibling',
  target: { kind: 'component', componentId: 'admission' },
  kind: 'waive',
  value: 0,
  scope: termOnly(1),
  reasonCategory: 'Sibling',
  note: 'Sibling already enrolled',
};
const MERIT_TUITION: ConcessionRecord = {
  id: 'concession-merit',
  target: { kind: 'component', componentId: 'tuition' },
  kind: 'percent',
  value: 20,
  scope: allTerms,
  reasonCategory: 'Merit',
  note: 'Merit scholarship 20 percent on tuition',
  approvedBy: 'Admin',
};
const AYESHA: ConcessionRecord[] = [SIBLING_WAIVER, MERIT_TUITION];

/** Fail loudly rather than let a missing fixture row read as a calculation bug. */
function mustFind<T>(item: T | undefined, what: string): T {
  if (item === undefined) throw new Error(`missing fixture: ${what}`);
  return item;
}

/** The template lines of one computed term, ready for the concession calculator. */
function templateLines(fees: TermFeesResult, term: number): TemplateLine[] {
  return mustFind(fees.terms.find((t) => t.term === term), `term ${term}`).lines.map((l) => ({
    componentId: l.componentId,
    name: l.name,
    amount: l.amount,
  }));
}

describe('§28 fee engine test cases', () => {
  it('case 1 - BSN term totals, course total and refundable part', () => {
    deepStrictEqual(
      bsn.termTotals,
      [77_000, 47_000, 61_000, 55_000, 61_000, 55_000, 61_000, 67_000],
    );
    equal(bsn.courseTotal, 484_000);
    equal(bsn.refundableTotal, 10_000);
  });

  it('case 2 - Radiology term totals', () => {
    const radiology = computeTemplateTermFees(SAMPLE_B, { totalTerms: 4, termsPerYear: SEMESTER });
    deepStrictEqual(radiology.termTotals, [38_500, 29_000, 29_000, 34_000]);
    equal(radiology.courseTotal, 130_500);
  });

  it('case 3 - Ayesha, Term 1 net fee', () => {
    const result = applyConcessions(templateLines(bsn, 1), AYESHA, 1);
    equal(result.templateTotal, 77_000);
    equal(result.totalConcession, 24_000);
    equal(result.netTotal, 53_000);
    equal(result.warnings.length, 0);
  });

  it('case 4 - Ayesha, Term 2 (merit continues, sibling waiver does not)', () => {
    const result = applyConcessions(templateLines(bsn, 2), AYESHA, 2);
    equal(result.templateTotal, 47_000);
    equal(result.totalConcession, 9_000);
    equal(result.netTotal, 38_000);
  });

  it('case 5 - percent rounding rounds halves up', () => {
    const lines: TemplateLine[] = [{ componentId: 'exam', name: 'Exam fee', amount: 3_333 }];
    const fifteenPercent: ConcessionRecord = {
      id: 'concession-rounding',
      target: { kind: 'component', componentId: 'exam' },
      kind: 'percent',
      value: 15,
      scope: termOnly(1),
      reasonCategory: 'Merit',
      note: 'rounding check',
    };
    const result = applyConcessions(lines, [fifteenPercent], 1);
    equal(result.netTotal, 2_833);
    deepStrictEqual(result.applied, [{ concessionId: 'concession-rounding', amount: 500 }]);
  });

  it('case 6 - a concession cannot push a component below zero', () => {
    const overLarge: ConcessionRecord = {
      id: 'concession-too-big',
      target: { kind: 'component', componentId: 'admission' },
      kind: 'fixed',
      value: 20_000,
      scope: termOnly(1),
      reasonCategory: 'Management decision',
      note: 'asked for 20,000 off a 15,000 component',
    };
    const result = applyConcessions(templateLines(bsn, 1), [overLarge], 1);
    const admission = mustFind(
      result.lines.find((l) => l.componentId === 'admission'),
      'admission fee line',
    );
    equal(admission.concession, 15_000);
    equal(admission.net, 0);
    equal(result.warnings.length, 1);
    equal(result.netTotal, 77_000 - 15_000);
  });

  it('case 7 - whole-plan percent comes after the component concession', () => {
    const planPercent: ConcessionRecord = {
      id: 'concession-plan-percent',
      target: { kind: 'plan' },
      kind: 'percent',
      value: 10,
      scope: termOnly(1),
      reasonCategory: 'Need-based',
      note: '10 percent off the plan',
      approvedBy: 'Admin',
    };
    const result = applyConcessions(templateLines(bsn, 1), [SIBLING_WAIVER, planPercent], 1);
    equal(result.componentConcession, 15_000);
    equal(result.planConcession, 6_200);
    equal(result.netTotal, 55_800);
  });

  it('case 8 - joining at Term 2 (annual included, no promotion fee, clinical not yet)', () => {
    const joinT2 = computeTemplateTermFees(SAMPLE_A, { totalTerms: 8, termsPerYear: SEMESTER, startingTerm: 2 });
    equal(joinT2.firstTermTotal, 77_000);
    const openingTerm = mustFind(joinT2.terms.find((t) => t.term === 2), 'joined Term 2');
    deepStrictEqual(
      openingTerm.lines.map((l) => l.name),
      ['Admission fee', 'ID card', 'Security deposit', 'Tuition', 'Annual charges'],
    );
    equal(joinT2.terms.length, 7);
  });

  it('case 9 - joining at Term 3', () => {
    const joinT3 = computeTemplateTermFees(SAMPLE_A, { totalTerms: 8, termsPerYear: SEMESTER, startingTerm: 3 });
    equal(joinT3.firstTermTotal, 85_000);
  });

  it('case 10 - one term per year charges "Every new year" every term', () => {
    equal(deriveTermsPerYear('annual'), 1);
    equal(deriveTermsPerYear('months'), 1);
    equal(SEMESTER, 2);
    // PNC: two annual terms, so every term opens a new year.
    const pnc = computeTemplateTermFees(
      [
        { id: 'tuition', name: 'Tuition', amount: 12_000, charged: 'EveryTerm', refundable: false },
        { id: 'annual', name: 'Annual charges', amount: 3_000, charged: 'EveryNewYear', refundable: false },
      ],
      { totalTerms: 2, termsPerYear: deriveTermsPerYear('annual') },
    );
    deepStrictEqual(pnc.termTotals, [15_000, 15_000]);
    ok(pnc.terms.every((t) => t.lines.some((l) => l.componentId === 'annual')));
  });

  it('case 11 - allocation, oldest unpaid charge first', () => {
    const result = allocatePayment(BILAL_CHARGES, 25_000);
    deepStrictEqual(result.allocations, [
      { chargeId: 'bilal-t2', amount: 17_000 },
      { chargeId: 'bilal-t3', amount: 8_000 },
    ]);
    equal(result.applied, 25_000);
    equal(result.credit, 0);
    equal(result.unpaidByCharge['bilal-t3'], 53_000);

    // §25.2 - choosing "Term 3" instead leaves Term 2 untouched.
    const chosen = allocatePayment(BILAL_CHARGES, 25_000, { chargeId: 'bilal-t3' });
    deepStrictEqual(chosen.allocations, [{ chargeId: 'bilal-t3', amount: 25_000 }]);
    equal(chosen.unpaidByCharge['bilal-t3'], 36_000);
    equal(chosen.unpaidByCharge['bilal-t2'], 17_000);
  });

  it('case 12 - ageing on 9 October 2026', () => {
    const today = '2026-10-09';
    equal(daysBetween('2026-01-15', today), 267);
    equal(daysBetween('2026-07-20', today), 81);

    const ageing = computeAgeing(BILAL_CHARGES, today);
    equal(ageing.overdueTotal, 78_000);
    equal(ageing.buckets.d61to90, 61_000);
    equal(ageing.buckets.over90, 17_000);
    equal(ageing.buckets.d1to30, 0);
    equal(ageing.buckets.d31to60, 0);
    equal(ageing.buckets.notYetDue, 0);
    equal(ageing.oldestDays, 267);
  });

  it('case 13 - overpayment stays as credit and pays the next charge', () => {
    const owed: PostedCharge[] = [
      { id: 'due-t1', term: 1, label: 'Term 1 fee', amount: 20_000, dueDate: '2026-09-01', allocated: 0 },
    ];
    const result = allocatePayment(owed, 25_000);
    equal(result.applied, 20_000);
    equal(result.credit, 5_000);
    equal(result.unpaidByCharge['due-t1'], 0);

    const nextCharge: PostedCharge = { id: 'due-t2', term: 2, label: 'Term 2 fee', amount: 47_000, dueDate: '2026-11-15' };
    const rolled = applyCreditToCharge(result.credit, nextCharge);
    equal(rolled.applied, 5_000);
    equal(rolled.remainingCredit, 0);
    equal(unpaidOf(rolled.charge), 42_000);
  });

  it('case 14 - plan change from Term 2, not yet charged', () => {
    const { newFees, posted } = ayeshaPlanChange();
    const result = planChangeAdjustments(posted, newFees, 2, 'Need-based concession');
    deepStrictEqual(result.adjustments, []);
    deepStrictEqual(result.upcoming, [
      { term: 2, total: 33_000 },
      { term: 3, total: 47_000 },
    ]);
  });

  it('case 15 - plan change from Term 2, already charged', () => {
    const { newFees } = ayeshaPlanChange();
    const posted: PostedCharge[] = [
      { id: 'ayesha-t1', term: 1, label: 'Term 1 fee', amount: 53_000, dueDate: '2026-10-23', allocated: 30_000 },
      { id: 'ayesha-t2', term: 2, label: 'Term 2 fee', amount: 38_000, dueDate: '2026-11-15', allocated: 0 },
    ];
    const result = planChangeAdjustments(posted, newFees, 2, 'Need-based concession');
    deepStrictEqual(result.adjustments, [
      {
        chargeId: 'ayesha-t2',
        term: 2,
        amount: -5_000,
        reason: 'Need-based concession',
        unpaidAfter: 33_000,
        creditAfter: 0,
      },
    ]);
    deepStrictEqual(result.upcoming, [{ term: 3, total: 47_000 }]);
  });

  it('case 16 - voiding receipt R-1042 releases its allocation', () => {
    const charges: PostedCharge[] = [
      { id: 'ayesha-t1', term: 1, label: 'Term 1 fee', amount: 53_000, dueDate: '2026-10-23', allocated: 30_000 },
    ];
    const receipt = [{ chargeId: 'ayesha-t1', amount: 30_000 }];
    const restored: PostedCharge[] = releaseAllocation(charges, receipt);
    equal(restored[0].allocated, 0);
    equal(unpaidOf(restored[0]), 53_000);
  });

  it('case 17 - suggested refund on a cancelled admission', () => {
    const refundableIds = new Set(SAMPLE_A.filter((c) => c.refundable).map((c) => c.id));
    const lines: RefundLine[] = applyConcessions(templateLines(bsn, 1), AYESHA, 1)
      .lines.map((l) => ({ name: l.name, net: l.net, refundable: refundableIds.has(l.componentId) }));
    const nonRefundable = lines.filter((l) => !l.refundable).reduce((sum, l) => sum + l.net, 0);
    equal(nonRefundable, 43_000);

    equal(suggestRefund({ paid: 53_000, lines }), 10_000);
    // §27.3 - Ayesha paid 30,000 of a 53,000 charge; the unpaid part is reversed, not refunded.
    equal(suggestRefund({ paid: 30_000, lines }), 0);
  });
});

/**
 * §5.3 says fromTerm/toTerm can narrow any timing option, and the template editor
 * offers exactly these pairs: "at admission" with a from term, "last term only" with
 * a to term. A narrowing that leaves the component billing nowhere is the worst kind
 * of silent failure in a fee system, so each one is asserted on the term totals.
 */
describe('narrowing a timing option to a term range (§5.3)', () => {
  const tuition = (amount: number): FeeComponent => ({
    id: 'tuition', name: 'Tuition', amount, charged: 'EveryTerm', refundable: false,
  });

  it('a one-time charge set to start in term 3 bills in term 3, once', () => {
    const fees = computeTemplateTermFees(
      [tuition(15_000), { id: 'enrol', name: 'Enrollment fee', amount: 5_000, charged: 'AtAdmission', fromTerm: 3, refundable: false }],
      { totalTerms: 4, termsPerYear: SEMESTER },
    );
    deepStrictEqual(fees.termTotals, [15_000, 15_000, 20_000, 15_000]);
    equal(fees.courseTotal, 65_000);
  });

  it('a student who joins later is still charged it once, in their own opening term', () => {
    const fees = computeTemplateTermFees(
      [{ id: 'enrol', name: 'Enrollment fee', amount: 5_000, charged: 'AtAdmission', fromTerm: 3, refundable: false }],
      { totalTerms: 8, termsPerYear: SEMESTER, startingTerm: 5 },
    );
    // Only billed terms come back, and they start where the student starts (§21).
    deepStrictEqual(fees.terms.map((t) => t.term), [5, 6, 7, 8]);
    deepStrictEqual(fees.termTotals, [5_000, 0, 0, 0]);
    equal(fees.firstTermTotal, 5_000);
  });

  it('a final-term charge narrowed to term 2 bills there and not again after it', () => {
    const fees = computeTemplateTermFees(
      [tuition(15_000), { id: 'diploma', name: 'Diploma fee', amount: 4_000, charged: 'LastTermOnly', toTerm: 2, refundable: false }],
      { totalTerms: 4, termsPerYear: SEMESTER },
    );
    deepStrictEqual(fees.termTotals, [15_000, 19_000, 15_000, 15_000]);
  });

  it('an unnarrowed "last term only" still falls on the program\'s final term', () => {
    const fees = computeTemplateTermFees(
      [{ id: 'degree', name: 'Degree fee', amount: 12_000, charged: 'LastTermOnly', refundable: false }],
      { totalTerms: 4, termsPerYear: SEMESTER },
    );
    deepStrictEqual(fees.termTotals, [0, 0, 0, 12_000]);
  });

  it('a range no term can satisfy charges nothing, which is why the editor rejects it', () => {
    const fees = computeTemplateTermFees(
      [{ id: 'odd', name: 'Tuition', amount: 1_000, charged: 'EveryTerm', fromTerm: 3, toTerm: 2, refundable: false }],
      { totalTerms: 4, termsPerYear: SEMESTER },
    );
    equal(fees.courseTotal, 0);
  });
});

/**
 * Ayesha's need-based 5,000 per term from Term 2 (§26.3), worked out through the
 * concession calculator so the plan-change cases use real engine output.
 */
function ayeshaPlanChange(): { newFees: NewTermFee[]; posted: PostedCharge[] } {
  const needBased: ConcessionRecord = {
    id: 'concession-need',
    target: { kind: 'plan' },
    kind: 'fixed',
    value: 5_000,
    scope: { mode: 'remainingTerms', fromTerm: 2 },
    reasonCategory: 'Need-based',
    note: 'Need-based concession 5,000 per term',
    approvedBy: 'Admin',
  };
  const plan = [...AYESHA, needBased];
  const newFees: NewTermFee[] = [
    { term: 2, total: applyConcessions(templateLines(bsn, 2), plan, 2).netTotal },
    { term: 3, total: applyConcessions(templateLines(bsn, 3), plan, 3).netTotal },
  ];
  const posted: PostedCharge[] = [
    { id: 'ayesha-t1', term: 1, label: 'Term 1 fee', amount: 53_000, dueDate: '2026-10-23', allocated: 30_000 },
  ];
  return { newFees, posted };
}
