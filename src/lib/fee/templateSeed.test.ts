// ============================================
// MediCMS Desktop - Fee engine: legacy row → v2 template conversion tests (§5.3, §7.2)
// The conversion runs once, on first launch, and its output is what an institute bills
// from then on. These tests hold it to the shape rules: one template per placement, a
// component per non-zero head, the term window the rows named, and the program's own
// term count - never something invented.
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { FeeTemplate, LegacyFeeTemplateRow, ProgramCode, Semester } from '@/types';
import { getCourseOfProgram, getSubCourseDef } from '../constants.ts';
import { computeTemplateTermFees } from './termFees.ts';
import { convertLegacyRows } from './templateSeed.ts';

const NOW = '2026-01-01T00:00:00.000Z';

/** A legacy row with every head at zero, so each test states only the heads it means. */
function row({
  program, semester, ...rest
}: Partial<LegacyFeeTemplateRow> & { program: ProgramCode; semester: Semester }): LegacyFeeTemplateRow {
  return {
    id: `row-${program}-${rest.batch ?? '1st Batch'}-${semester}`,
    program,
    course: getCourseOfProgram(program),
    semester,
    batch: '1st Batch',
    session: 2026,
    admissionFee: 0, tuitionFee: 0, idCardFee: 0, annualCharges: 0,
    securityFee: 0, enrollmentFee: 0, diplomaFee: 0, clinicalCharges: 0,
    ...rest,
  };
}

function convert(rows: readonly LegacyFeeTemplateRow[]): FeeTemplate[] {
  return convertLegacyRows(rows, { now: NOW });
}

function one(rows: readonly LegacyFeeTemplateRow[]): FeeTemplate {
  const templates = convert(rows);
  equal(templates.length, 1, 'expected exactly one template');
  return templates[0];
}

/** The billed total per term, straight from the engine the template feeds. */
function termTotals(template: FeeTemplate): number[] {
  return computeTemplateTermFees(template.components, {
    totalTerms: template.totalTerms,
    termsPerYear: template.termsPerYear,
  }).termTotals;
}

function componentOf(template: FeeTemplate, name: string) {
  const found = template.components.find((c) => c.name === name);
  ok(found, `no component named "${name}"`);
  return found;
}

// --- One template per placement (§7.2) --------------------------------------

describe('grouping (§7.2)', () => {
  const healthPair = [
    row({ program: 'Health', semester: '1st', admissionFee: 15_000, tuitionFee: 15_000 }),
    row({ program: 'Health', semester: '3rd', tuitionFee: 15_000, annualCharges: 1_000 }),
  ];

  it('seven rows over six placements become six templates', () => {
    const templates = convert([
      ...healthPair,
      row({ program: 'Anaesthesia', batch: '3rd Batch', semester: '1st', tuitionFee: 20_000 }),
      row({ program: 'BSN', batch: '17th Batch', semester: '1st', tuitionFee: 40_000 }),
      row({ program: 'LHV', batch: '17th Batch', semester: '1st', tuitionFee: 15_000 }),
      row({ program: 'Ultrasound1Y', batch: '17th Batch', semester: '1st', tuitionFee: 25_000 }),
      row({ program: 'PharmacyB', batch: '17th Batch', semester: '1st', tuitionFee: 20_000 }),
    ]);
    equal(templates.length, 6);
    equal(new Set(templates.map((t) => t.id)).size, 6, 'no two templates may share an id');
  });

  it('the earliest session wins when a batch drifts across sessions', () => {
    const template = one([
      row({ program: 'Health', semester: '1st', session: 2017, tuitionFee: 15_000 }),
      row({ program: 'Health', semester: '3rd', session: 2018, tuitionFee: 15_000 }),
    ]);
    equal(template.session, 2017);
    equal(template.id, 'tpl-health-1stbatch-2017');
  });

  it('two batches of one program stay two templates', () => {
    const templates = convert([
      row({ program: 'Health', batch: '1st Batch', semester: '1st', tuitionFee: 15_000 }),
      row({ program: 'Health', batch: '2nd Batch', semester: '1st', tuitionFee: 16_000 }),
    ]);
    equal(templates.length, 2);
    deepStrictEqual(templates.map((t) => t.batch), ['1st Batch', '2nd Batch']);
  });

  it('the output order does not depend on the row order', () => {
    const forwards = convert(healthPair);
    const backwards = convert([...healthPair].reverse());
    deepStrictEqual(forwards, backwards, 'a first-run seed has to be reproducible');
  });

  it('an empty table seeds nothing rather than something plausible', () => {
    deepStrictEqual(convert([]), []);
  });
});

// --- Heads become components (§5.3) -----------------------------------------

describe('head to component mapping (§5.3)', () => {
  it('tuition runs every term from the first semester it was charged in', () => {
    const template = one([
      row({ program: 'Health', semester: '1st', tuitionFee: 15_000 }),
      row({ program: 'Health', semester: '3rd', tuitionFee: 20_000 }),
    ]);
    deepStrictEqual(componentOf(template, 'Tuition'), {
      id: `${template.id}-tuitionFee`, name: 'Tuition', amount: 15_000,
      charged: 'EveryTerm', fromTerm: 1, refundable: false,
    });
  });

  it('a one-time head is pinned to the semester the row named, and still bills there', () => {
    const template = one([
      row({ program: 'Health', semester: '1st', tuitionFee: 15_000 }),
      row({ program: 'Health', semester: '3rd', enrollmentFee: 5_000 }),
    ]);
    deepStrictEqual(componentOf(template, 'Enrollment fee'), {
      id: `${template.id}-enrollmentFee`, name: 'Enrollment fee', amount: 5_000,
      charged: 'AtAdmission', fromTerm: 3, refundable: false,
    });
    deepStrictEqual(termTotals(template), [15_000, 15_000, 20_000, 15_000]);
  });

  it('annual charges keep the every-new-year option when the semester opens a year', () => {
    const template = one([row({ program: 'Health', semester: '3rd', annualCharges: 1_000 })]);
    const annual = componentOf(template, 'Annual charges');
    equal(annual.charged, 'EveryNewYear');
    equal(annual.fromTerm, 3, 'year starts are terms 1 and 3, so term 3 is a real year opening');
    deepStrictEqual(termTotals(template), [0, 0, 1_000, 0]);
  });

  it('and become a plain term charge when it does not, so the money is never dropped', () => {
    const template = one([row({ program: 'Health', semester: '2nd', annualCharges: 1_000 })]);
    const annual = componentOf(template, 'Annual charges');
    equal(annual.charged, 'EveryTerm');
    equal(annual.fromTerm, 2);
    equal(annual.toTerm, 2);
    deepStrictEqual(termTotals(template), [0, 1_000, 0, 0], 'EveryNewYear would have skipped term 2 entirely');
  });

  it('clinical charges span the semesters they appeared in', () => {
    const template = one([
      row({ program: 'Health', semester: '2nd', clinicalCharges: 8_000 }),
      row({ program: 'Health', semester: '4th', clinicalCharges: 8_000 }),
    ]);
    const clinical = componentOf(template, 'Clinical training');
    equal(clinical.charged, 'EveryTerm');
    equal(clinical.fromTerm, 2);
    equal(clinical.toTerm, 4);
    deepStrictEqual(termTotals(template), [0, 8_000, 8_000, 8_000]);
  });

  it('a diploma fee is charged in the last semester it appeared in', () => {
    const template = one([
      row({ program: 'Health', semester: '1st', tuitionFee: 15_000 }),
      row({ program: 'Health', semester: '4th', diplomaFee: 4_000 }),
    ]);
    deepStrictEqual(componentOf(template, 'Diploma fee'), {
      id: `${template.id}-diplomaFee`, name: 'Diploma fee', amount: 4_000,
      charged: 'LastTermOnly', toTerm: 4, refundable: false,
    });
    deepStrictEqual(termTotals(template), [15_000, 15_000, 15_000, 19_000]);
  });

  it('a diploma fee due before the final semester still lands on that semester', () => {
    const template = one([row({ program: 'Health', semester: '2nd', diplomaFee: 4_000 })]);
    equal(componentOf(template, 'Diploma fee').toTerm, 2);
    deepStrictEqual(termTotals(template), [0, 4_000, 0, 0]);
  });

  it('component ids are unique and hang off the template id', () => {
    const template = one([
      row({ program: 'Health', semester: '1st', admissionFee: 15_000, tuitionFee: 15_000, idCardFee: 200 }),
    ]);
    const ids = template.components.map((c) => c.id);
    equal(new Set(ids).size, ids.length);
    ok(ids.every((id) => id.startsWith(`${template.id}-`)));
  });
});

// --- Shape rules -------------------------------------------------------------

describe('conversion shape', () => {
  it('a zero-valued head produces no component', () => {
    const template = one([
      row({ program: 'BSN', semester: '1st', admissionFee: 30_000, tuitionFee: 40_000, idCardFee: 300, securityFee: 5_000 }),
    ]);
    deepStrictEqual(template.components.map((c) => c.name).sort(), ['Admission fee', 'ID card', 'Security deposit', 'Tuition']);
    ok(template.components.every((c) => c.amount > 0), 'no component may carry zero');
  });

  it('totalTerms and termsPerYear come from the program, not from the rows', () => {
    const expectations: Record<string, [number, number]> = {
      Health: [getSubCourseDef('Health').sub.terms.length, 2],
      BSN: [8, 2],
      LHV: [2, 1],
      PharmacyB: [2, 1],
      Ultrasound1Y: [2, 1],
      DHMS: [4, 1],
    };
    for (const [program, [totalTerms, termsPerYear]] of Object.entries(expectations)) {
      const template = one([
        row({ program: program as ProgramCode, semester: '1st', tuitionFee: 10_000 }),
      ]);
      equal(template.totalTerms, totalTerms, `${program} term count`);
      equal(template.termsPerYear, termsPerYear, `${program} terms per year`);
    }
  });

  it('a row in a late semester does not lengthen the program', () => {
    const template = one([row({ program: 'Health', semester: '4th', tuitionFee: 15_000 })]);
    equal(template.totalTerms, 4);
  });

  it('the course is the program parent, whatever the row claimed', () => {
    const template = one([
      row({ program: 'Health', course: 'BSN', semester: '1st', tuitionFee: 15_000 }),
    ]);
    equal(template.course, 'Paramedics');
  });

  it('a converted template is an Active version 1 with a readable name', () => {
    const template = one([row({ program: 'Health', session: 2017, semester: '1st', tuitionFee: 15_000 })]);
    equal(template.status, 'Active');
    equal(template.version, 1);
    equal(template.name, 'Health — 2017');
    equal(template.program, 'Health');
    equal(template.batch, '1st Batch');
    equal(template.notes, undefined, 'the old table had nothing to say about a row');
    equal(template.createdAt, NOW);
    equal(template.updatedAt, NOW);
  });

  it('the due-day and status options are carried through', () => {
    const templates = convertLegacyRows(
      [row({ program: 'Health', semester: '1st', tuitionFee: 15_000 })],
      { now: NOW, status: 'Draft', admissionDueDays: 7, termDueDays: 20 },
    );
    equal(templates[0].status, 'Draft', 'a seed can be staged as Draft for review');
    equal(templates[0].admissionDueDays, 7);
    equal(templates[0].termDueDays, 20);
  });

  it('the §5.1 defaults are used when the caller says nothing', () => {
    const template = one([row({ program: 'Health', semester: '1st', tuitionFee: 15_000 })]);
    equal(template.admissionDueDays, 14);
    equal(template.termDueDays, 15);
  });

  it('nothing is marked refundable, because the old table had no such column', () => {
    const template = one([
      row({ program: 'BSN', semester: '1st', admissionFee: 30_000, securityFee: 5_000, tuitionFee: 40_000 }),
    ]);
    ok(template.components.every((c) => c.refundable === false));
  });
});
