// ============================================
// MediCMS Desktop - Fee engine: legacy-head projection tests (§5, §6.2)
// The migration thesis in one line: nothing stores the eight heads any more, they are
// derived from a v2 template through the same term calculation the editor previews.
// These tests hold that projection to the numbers the old table produced, so the
// screens that still speak in heads cannot silently start billing something else.
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { FeeComponent, FeeTemplate, LegacyFeeTemplateRow } from '@/types';
import {
  HEAD_KEYS, emptyHeads, legacyPlanFor, legacyRowToHeads, nextBilledTerm,
  sumHeads, templateCourseTotal, templateRefundableTotal, templateTotalOf, termHeadsOf,
} from './templateCompat.ts';
import { convertLegacyRows } from './templateSeed.ts';

// --- Migration input ---------------------------------------------------------
// The seven legacy rows, copied rather than imported: `mockData` pulls in modules the
// plain `node --test` resolver cannot load, and a migration fixture belongs in the
// test that asserts the migration anyway. Verbatim from MOCK_FEE_TEMPLATES.
const LEGACY_ROWS: LegacyFeeTemplateRow[] = [
  {
    id: 'tpl-health-1-2017', program: 'Health', course: 'Paramedics', semester: '1st',
    batch: '1st Batch', session: 2017, admissionFee: 15000, tuitionFee: 15000, idCardFee: 200,
    annualCharges: 0, securityFee: 0, enrollmentFee: 5000, diplomaFee: 0, clinicalCharges: 0,
  },
  {
    id: 'tpl-health-3-2017', program: 'Health', course: 'Paramedics', semester: '3rd',
    batch: '1st Batch', session: 2018, admissionFee: 0, tuitionFee: 15000, idCardFee: 0,
    annualCharges: 1000, securityFee: 0, enrollmentFee: 0, diplomaFee: 0, clinicalCharges: 11000,
  },
  {
    id: 'tpl-anaesthesia-1-2019', program: 'Anaesthesia', course: 'Paramedics', semester: '1st',
    batch: '3rd Batch', session: 2019, admissionFee: 20000, tuitionFee: 20000, idCardFee: 0,
    annualCharges: 0, securityFee: 0, enrollmentFee: 5000, diplomaFee: 0, clinicalCharges: 0,
  },
  {
    id: 'tpl-bsn-1-2026', program: 'BSN', course: 'BSN', semester: '1st',
    batch: '17th Batch', session: 2026, admissionFee: 30000, tuitionFee: 40000, idCardFee: 300,
    annualCharges: 0, securityFee: 5000, enrollmentFee: 0, diplomaFee: 0, clinicalCharges: 0,
  },
  {
    id: 'tpl-lhv-1-2026', program: 'LHV', course: 'PNC', semester: '1st',
    batch: '17th Batch', session: 2026, admissionFee: 10000, tuitionFee: 15000, idCardFee: 200,
    annualCharges: 0, securityFee: 0, enrollmentFee: 5000, diplomaFee: 0, clinicalCharges: 0,
  },
  {
    id: 'tpl-ultrasound1y-1-2026', program: 'Ultrasound1Y', course: 'Ultrasound', semester: '1st',
    batch: '17th Batch', session: 2026, admissionFee: 12000, tuitionFee: 25000, idCardFee: 200,
    annualCharges: 0, securityFee: 0, enrollmentFee: 0, diplomaFee: 0, clinicalCharges: 0,
  },
  {
    id: 'tpl-pharmacyb-1-2026', program: 'PharmacyB', course: 'PharmacyB', semester: '1st',
    batch: '17th Batch', session: 2026, admissionFee: 15000, tuitionFee: 20000, idCardFee: 200,
    annualCharges: 0, securityFee: 0, enrollmentFee: 5000, diplomaFee: 0, clinicalCharges: 0,
  },
];

const SEMESTER_TO_TERM: Record<string, number> = {
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6, '7th': 7, '8th': 8,
};

/** The converted templates, keyed the way the seed keys them. */
function convertedTemplates(): FeeTemplate[] {
  return convertLegacyRows(LEGACY_ROWS, { now: '2026-01-01T00:00:00.000Z' });
}

function templateFor(row: LegacyFeeTemplateRow, templates: readonly FeeTemplate[]): FeeTemplate {
  const found = templates.find((t) => t.program === row.program && t.batch === row.batch);
  ok(found, `no template was seeded for ${row.program} / ${row.batch}`);
  return found;
}

// --- The round-trip invariant ------------------------------------------------

describe('termHeadsOf projects a converted template back to the legacy row (§5)', () => {
  const templates = convertedTemplates();

  it('every row reproduces exactly the heads it was written from', () => {
    for (const row of LEGACY_ROWS) {
      const template = templateFor(row, templates);
      const term = SEMESTER_TO_TERM[row.semester];
      deepStrictEqual(
        termHeadsOf(template, term),
        legacyRowToHeads(row),
        `${row.program} ${row.semester} must read back as the old row`,
      );
    }
  });

  it('no head key is left out of the projection', () => {
    const heads = termHeadsOf(templateFor(LEGACY_ROWS[0], templates), 1);
    for (const key of HEAD_KEYS) ok(key in heads, `${key} must exist on the projected heads`);
    ok('otherFees' in heads, 'unknown components need somewhere to go');
  });

  it('Health keeps the odd case odd: year and clinical charges only in term 3', () => {
    const health = templateFor(LEGACY_ROWS[0], templates);
    deepStrictEqual(termHeadsOf(health, 1), legacyRowToHeads(LEGACY_ROWS[0]));
    deepStrictEqual(termHeadsOf(health, 3), legacyRowToHeads(LEGACY_ROWS[1]));
    // Tuition runs every term; the one-time heads do not leak into a later term.
    equal(termHeadsOf(health, 2).admissionFee, 0);
    equal(termHeadsOf(health, 4).clinicalCharges, 0);
    equal(termHeadsOf(health, 2).tuitionFee, 15_000);
  });

  it('an unbilled term reads as no heads at all', () => {
    const health = templateFor(LEGACY_ROWS[0], templates);
    deepStrictEqual(termHeadsOf(health, 9), emptyHeads());
    equal(templateTotalOf(health, 9), 0);
  });

  it('the projected heads always add up to what the engine charges for that term', () => {
    for (const template of templates) {
      for (let term = 1; term <= template.totalTerms; term += 1) {
        equal(
          sumHeads(termHeadsOf(template, term)),
          templateTotalOf(template, term),
          `${template.program} term ${term}: money cannot appear or vanish in the projection`,
        );
      }
    }
  });
});

// --- A table the timing options do not describe neatly -----------------------

/**
 * The invariant above only proves the conversion for the semesters the institute's
 * own rows happen to use. This table is deliberately awkward - annual charges in a
 * semester that does not open a year, an admission fee charged in semester 3, a
 * diploma fee due before the last semester - because each of those would fall
 * between the timing options and stop being billed at all.
 */
describe('an awkward legacy table survives the round trip', () => {
  const awkward: LegacyFeeTemplateRow[] = [
    {
      id: 'tpl-awkward-2', program: 'Health', course: 'Paramedics', semester: '2nd',
      batch: '1st Batch', session: 2026, admissionFee: 0, tuitionFee: 0, idCardFee: 0,
      annualCharges: 1_000, securityFee: 0, enrollmentFee: 0, diplomaFee: 4_000, clinicalCharges: 0,
    },
    {
      id: 'tpl-awkward-3', program: 'Health', course: 'Paramedics', semester: '3rd',
      batch: '1st Batch', session: 2026, admissionFee: 15_000, tuitionFee: 0, idCardFee: 0,
      annualCharges: 0, securityFee: 0, enrollmentFee: 0, diplomaFee: 0, clinicalCharges: 0,
    },
  ];
  const template = convertLegacyRows(awkward, { now: '2026-01-01T00:00:00.000Z' })[0];

  it('every row reads back exactly as it was written', () => {
    deepStrictEqual(termHeadsOf(template, 2), legacyRowToHeads(awkward[0]));
    deepStrictEqual(termHeadsOf(template, 3), legacyRowToHeads(awkward[1]));
  });

  it('and the whole table adds up to the course total', () => {
    const projected = [1, 2, 3, 4].reduce((sum, term) => sum + sumHeads(termHeadsOf(template, term)), 0);
    equal(projected, templateCourseTotal(template));
    equal(projected, 20_000);
  });
});

// --- Money -------------------------------------------------------------------

describe('course totals come from the engine, not from head arithmetic', () => {
  const health = templateFor(LEGACY_ROWS[0], convertedTemplates());

  it('Health bills 35,200 / 15,000 / 27,000 / 15,000', () => {
    equal(templateTotalOf(health, 1), 35_200);
    equal(templateTotalOf(health, 2), 15_000);
    equal(templateTotalOf(health, 3), 27_000);
    equal(templateTotalOf(health, 4), 15_000);
    equal(templateCourseTotal(health), 92_200);
  });

  it('a refundable component is reported apart from the course total (§8.1)', () => {
    const withDeposit: FeeTemplate = {
      ...health,
      id: 'tpl-health-refundable',
      components: [
        ...health.components,
        { id: 'c-deposit', name: 'Security deposit', amount: 5_000, charged: 'AtAdmission', fromTerm: 1, refundable: true },
      ],
    };
    equal(templateCourseTotal(withDeposit), 92_200 + 5_000);
    equal(templateRefundableTotal(withDeposit), 5_000);
    equal(templateRefundableTotal(health), 0, 'nothing in the seed is refundable');
  });
});

// --- The three figures a student record still carries ------------------------

describe('legacyPlanFor keeps admission writing the same three fields', () => {
  const health = templateFor(LEGACY_ROWS[0], convertedTemplates());

  it('the opening charge is the first billed term, head by head', () => {
    const plan = legacyPlanFor(health);
    equal(plan.baseFeeTotal, 35_200);
    deepStrictEqual(plan.baseFeeBreakup, legacyRowToHeads(LEGACY_ROWS[0]));
    equal(sumHeads(plan.baseFeeBreakup), plan.baseFeeTotal);
  });

  it('the recurring figure is the engine total of the next billed term', () => {
    const plan = legacyPlanFor(health);
    equal(nextBilledTerm(health, 1), 2);
    equal(plan.baseFeeRecurring, templateTotalOf(health, 2));
    equal(plan.baseFeeRecurring, 15_000);
  });

  it('a student joining part-way through prices from their own term', () => {
    const plan = legacyPlanFor(health, 3);
    equal(plan.baseFeeTotal, 27_000, 'annual and clinical charges are due in term 3');
    equal(plan.baseFeeRecurring, templateTotalOf(health, 4));
    deepStrictEqual(plan.baseFeeBreakup, termHeadsOf(health, 3));
  });

  it('a final-term student has no later term, so recurring repeats the opening charge', () => {
    const plan = legacyPlanFor(health, health.totalTerms);
    equal(nextBilledTerm(health, health.totalTerms), health.totalTerms);
    equal(plan.baseFeeRecurring, plan.baseFeeTotal);
  });

  it('a template with a single billed term does not report a zero recurring fee', () => {
    const oneOff: FeeTemplate = {
      ...health,
      id: 'tpl-one-term',
      totalTerms: 1,
      components: [{ id: 'c-admission', name: 'Admission fee', amount: 9_000, charged: 'AtAdmission', fromTerm: 1, refundable: false }],
    };
    const plan = legacyPlanFor(oneOff, 1);
    equal(plan.baseFeeTotal, 9_000);
    equal(plan.baseFeeRecurring, 9_000);
  });
});

// --- Components the old table never had --------------------------------------

describe('a component outside the legacy eight lands in otherFees', () => {
  function handbuilt(components: FeeComponent[]): FeeTemplate {
    return {
      id: 'tpl-handbuilt', name: 'Hand built', course: 'Paramedics', program: 'Health',
      session: 2026, batch: '1st Batch', status: 'Active', version: 1, totalTerms: 4,
      termsPerYear: 2, admissionDueDays: 14, termDueDays: 15, components,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  it('keeps the money instead of dropping it', () => {
    const template = handbuilt([
      { id: 'c-tuition', name: 'Tuition', amount: 12_000, charged: 'EveryTerm', refundable: false },
      { id: 'c-lab', name: 'Lab Examination', amount: 4_500, charged: 'EveryTerm', refundable: false },
    ]);
    const heads = termHeadsOf(template, 1);
    equal(heads.tuitionFee, 12_000);
    equal(heads.otherFees, 4_500);
    equal(sumHeads(heads), templateTotalOf(template, 1));
  });

  it('several unknown components share one otherFees figure', () => {
    const template = handbuilt([
      { id: 'c-a', name: 'Library Fine', amount: 500, charged: 'EveryTerm', refundable: false },
      { id: 'c-b', name: 'Equipment Damage', amount: 800, charged: 'EveryTerm', refundable: false },
    ]);
    equal(termHeadsOf(template, 1).otherFees, 1_300);
  });

  it('matches a legacy head by name however it is cased or padded', () => {
    const template = handbuilt([
      { id: 'c-t', name: '  Tuition ', amount: 1000, charged: 'EveryTerm', refundable: false },
      { id: 'c-i', name: 'id card', amount: 200, charged: 'AtAdmission', fromTerm: 1, refundable: false },
    ]);
    const heads = termHeadsOf(template, 1);
    equal(heads.tuitionFee, 1_000);
    equal(heads.idCardFee, 200);
    equal(heads.otherFees, 0, 'a known name must not be counted as other');
  });

  it('two components on the same head accumulate into it', () => {
    const template = handbuilt([
      { id: 'c-a', name: 'Annual charges', amount: 1_000, charged: 'EveryNewYear', fromTerm: 1, refundable: false },
      { id: 'c-b', name: 'Annual charges', amount: 250, charged: 'EveryNewYear', fromTerm: 1, refundable: false },
    ]);
    equal(termHeadsOf(template, 1).annualCharges, 1_250);
  });
});
