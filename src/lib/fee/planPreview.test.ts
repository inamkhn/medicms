// ============================================
// MediCMS Desktop - Plan preview tests (§13.7, §13.4)
// Uses the §17 fixtures: Ayesha Khan, admission fee waived in Term 1 and 20
// percent off tuition forever. Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { ConcessionRecord, FeeComponent, TermScope } from './types.ts';
import { computeTemplateTermFees, deriveTermsPerYear } from './termFees.ts';
import { concessionValueLabel, planPreview, planSignature, scopeLabel } from './planPreview.ts';

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

const bsn = computeTemplateTermFees(SAMPLE_A, { totalTerms: 8, termsPerYear: deriveTermsPerYear('semester') });

const termOnly = (term: number): TermScope => ({ mode: 'termOnly', term });
const allTerms: TermScope = { mode: 'remainingTerms', fromTerm: 1 };

/** §17 - Ayesha: admission fee waived in Term 1, 20 percent off tuition forever. */
const AYESHA: ConcessionRecord[] = [
  {
    id: 'concession-sibling',
    target: { kind: 'component', componentId: 'admission' },
    kind: 'waive',
    value: 0,
    scope: termOnly(1),
    reasonCategory: 'Sibling',
    note: 'Sibling already enrolled',
  },
  {
    id: 'concession-merit',
    target: { kind: 'component', componentId: 'tuition' },
    kind: 'percent',
    value: 20,
    scope: allTerms,
    reasonCategory: 'Merit',
    note: 'Merit scholarship 20 percent on tuition',
  },
];

describe('§13.7 plan preview', () => {
  it('opening term applies both records and matches the acceptance sample', () => {
    const plan = planPreview(bsn.terms, AYESHA, 1);
    equal(plan.opening.term, 1);
    equal(plan.opening.template, 77_000);
    equal(plan.opening.concession, 24_000);
    equal(plan.opening.net, 53_000);
  });

  it('later terms keep only the records whose scope reaches them', () => {
    const plan = planPreview(bsn.terms, AYESHA, 1);
    deepStrictEqual(plan.terms[1], { term: 2, template: 47_000, concession: 9_000, net: 38_000 });
    deepStrictEqual(plan.terms[2], { term: 3, template: 61_000, concession: 9_000, net: 52_000 });
  });

  it('joining at a later term never replays a term-only record', () => {
    const plan = planPreview(bsn.terms, AYESHA, 3);
    equal(plan.opening.term, 3);
    equal(plan.opening.template, 61_000);
    equal(plan.opening.concession, 9_000);
    equal(plan.opening.net, 52_000);
    equal(plan.terms.length, 6);
  });

  it('reports what each record actually removed, for the ledger entries', () => {
    const plan = planPreview(bsn.terms, AYESHA, 1);
    deepStrictEqual(plan.opening.applied, [
      { concessionId: 'concession-sibling', amount: 15_000 },
      { concessionId: 'concession-merit', amount: 9_000 },
    ]);
    equal(plan.opening.lines.find((l) => l.componentId === 'tuition')?.net, 36_000);
  });

  it('a plan-level waiver zeroes every term without negative figures', () => {
    const fullWaiver: ConcessionRecord[] = [
      { id: 'full', target: { kind: 'plan' }, kind: 'waive', value: 0, scope: allTerms, reasonCategory: 'Management decision', note: 'Full scholarship' },
    ];
    const plan = planPreview(bsn.terms, fullWaiver, 1);
    equal(plan.opening.net, 0);
    equal(plan.terms[7].net, 0);
    equal(plan.opening.warnings.length, 0);
  });

  it('no template rows gives an empty preview instead of throwing', () => {
    const plan = planPreview([], AYESHA, 1);
    deepStrictEqual(plan.terms, []);
    equal(plan.opening.net, 0);
    equal(plan.opening.template, 0);
  });
});

describe('§13.4 scope wording', () => {
  it('names each of the three scopes', () => {
    equal(scopeLabel(termOnly(3)), 'Term 3 only');
    equal(scopeLabel({ mode: 'remainingTerms', fromTerm: 2 }), 'All terms from 2');
    equal(scopeLabel({ mode: 'specificTerms', from: 2, to: 4 }), 'Terms 2-4');
  });

  it('describes each reduction kind with the injected formatter', () => {
    const money = (n: number) => `PKR ${n}`;
    const base = { target: { kind: 'plan' as const }, scope: allTerms, reasonCategory: 'Merit', note: '', value: 0 };
    equal(concessionValueLabel({ ...base, id: 'a', kind: 'waive' }, money), 'Waived');
    equal(concessionValueLabel({ ...base, id: 'b', kind: 'percent', value: 20 }, money), '20% off');
    equal(concessionValueLabel({ ...base, id: 'c', kind: 'fixed', value: 5_000 }, money), 'PKR 5000 off');
    equal(concessionValueLabel({ ...base, id: 'd', kind: 'setAmount', value: 30_000 }, money), 'Set to PKR 30000');
  });

  it('§26.1 - a plan signature ignores record ids but catches any real change', () => {
    const [sibling, merit] = AYESHA;
    const reIded = [{ ...sibling, id: 'fresh-1' }, { ...merit, id: 'fresh-2', note: ' Merit scholarship 20 percent on tuition ' }];
    equal(planSignature(reIded), planSignature(AYESHA));
    const changedValue = [{ ...sibling, id: 'fresh-1' }, { ...merit, id: 'fresh-2', value: 25 }];
    ok(planSignature(changedValue) !== planSignature(AYESHA));
    ok(planSignature([]) !== planSignature(AYESHA));
    equal(planSignature([]), planSignature([]));
  });
});
