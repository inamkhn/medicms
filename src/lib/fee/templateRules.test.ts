// ============================================
// MediCMS Desktop - Fee engine: template rules tests (§6.3, §7)
// The rules the store enforces are plain functions in templateRules, so they can be
// tested without a store, a DOM or localStorage. Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, match, ok } from 'node:assert/strict';

import type { FeeComponent, FeeTemplate, ProgramCode, Student, TemplateStatus } from '@/types';
import {
  ALL_BATCHES, activationBlocker, blankTemplate, contentChanged, defaultTermsPerYear,
  duplicateTemplate, findActiveFor, nextVersionFor, placementKey, raiseAmounts,
  roundToNearest100, studentsUsing, templateIdFor, termsPerYearFor, idSlug,
} from './templateRules.ts';

// --- Fixtures ----------------------------------------------------------------

const tuition = (amount: number): FeeComponent => ({
  id: 'c-tuition', name: 'Tuition', amount, charged: 'EveryTerm', refundable: false,
});

/** A saved template, overridden per test so each case states only what it changes. */
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
    components: [tuition(15_000)],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const PLACEMENT = { course: 'Paramedics', program: 'Health', session: 2017, batch: '1st Batch' } as const;

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
    ...over,
  };
}

// --- Placement identity -------------------------------------------------------

describe('template id and placement key', () => {
  it('slug is lower-case alphanumeric only', () => {
    equal(idSlug('1st Batch'), '1stbatch');
    equal(idSlug('Health'), 'health');
  });

  it('one id scheme for every template, with "all" for the all-batches case', () => {
    equal(templateIdFor('Health', '1st Batch', 2017), 'tpl-health-1stbatch-2017');
    equal(templateIdFor('Health', ALL_BATCHES, 2017), 'tpl-health-all-2017');
    equal(templateIdFor('BSN', '17th Batch', 2026), 'tpl-bsn-17thbatch-2026');
  });

  it('the placement key covers all four fields (§5.1)', () => {
    equal(
      placementKey(PLACEMENT),
      'Paramedics|Health|2017|1st Batch',
    );
  });
});

// --- §7.1 / §7.3 - which template an admission uses ---------------------------

describe('findActiveFor (§7.1, §7.3)', () => {
  const batchSpecific = template();
  const allBatches = template({ id: 'tpl-health-all-2017', batch: ALL_BATCHES, name: 'Health 2017 all' });

  it('ignores Draft and Archived templates', () => {
    const statuses: TemplateStatus[] = ['Draft', 'Archived'];
    for (const status of statuses) {
      equal(findActiveFor([template({ status })], PLACEMENT), undefined, `${status} must not be offered`);
    }
  });

  it('a batch-specific template wins when both exist', () => {
    const found = findActiveFor([allBatches, batchSpecific], PLACEMENT);
    equal(found?.id, batchSpecific.id);
  });

  it('falls back to the all-batches template when no batch-specific one exists', () => {
    const found = findActiveFor([allBatches], { ...PLACEMENT, batch: '9th Batch' });
    equal(found?.id, allBatches.id);
  });

  it('does not cross a session boundary', () => {
    equal(findActiveFor([batchSpecific], { ...PLACEMENT, session: 2018 }), undefined);
  });

  it('an Archived batch-specific template does not hide the Active all-batches one', () => {
    const found = findActiveFor([allBatches, template({ status: 'Archived' })], PLACEMENT);
    equal(found?.id, allBatches.id);
  });
});

// --- §7.2 / §7.10 - activation ------------------------------------------------

describe('activationBlocker (§7.2, §7.10)', () => {
  it('refuses to activate without a terms-per-year value', () => {
    const blocker = activationBlocker(template({ termsPerYear: 0 }), []);
    ok(blocker, 'expected a reason');
    match(blocker, /terms per year/i);
  });

  it('refuses a second Active template for the same placement and names it', () => {
    const other = template({ id: 'tpl-health-1stbatch-2017-b', name: 'Health redo' });
    const blocker = activationBlocker(template({ id: 'mine', status: 'Draft' }), [other]);
    ok(blocker, 'expected a reason');
    match(blocker, /Health redo/);
  });

  it('allows it once the previous template is archived', () => {
    const other = template({ id: 'other', status: 'Archived' });
    equal(activationBlocker(template({ id: 'mine', status: 'Draft' }), [other]), null);
  });

  it('allows a Draft beside it, and an Active template of another batch', () => {
    equal(activationBlocker(template({ id: 'mine' }), [template({ id: 'draft', status: 'Draft' })]), null);
    equal(activationBlocker(template({ id: 'mine' }), [template({ id: 'other-batch', batch: '3rd Batch' })]), null);
  });

  it('an edit that keeps a template Active is still checked against the placement', () => {
    // §7.2 cannot be bypassed by saving with status already Active: the rule reads the
    // stored list, not a status transition.
    const clash = activationBlocker(template(), [template({ id: 'other' })]);
    ok(clash);
  });
});

// --- §7.9 - version on save ---------------------------------------------------

describe('nextVersionFor (§7.9)', () => {
  it('a first save is version 1', () => {
    equal(nextVersionFor(undefined, template({ version: 0 })), 1);
    equal(nextVersionFor(undefined, template()), 1);
  });

  it('editing a Draft leaves the version alone', () => {
    const stored = template({ status: 'Draft', version: 2 });
    equal(nextVersionFor(stored, { ...stored, components: [tuition(20_000)] }), 2);
  });

  it('changing the content of an Active template raises it by one', () => {
    const stored = template({ version: 3 });
    equal(nextVersionFor(stored, { ...stored, components: [tuition(16_000)] }), 4);
    equal(nextVersionFor(stored, { ...stored, name: 'Health 2017 final' }), 4, 'a header edit is a content change');
    equal(nextVersionFor(stored, { ...stored, notes: 'lab waived' }), 4);
    equal(nextVersionFor(stored, { ...stored, batch: '2nd Batch' }), 4);
  });

  it('a status-only change is not a content change', () => {
    const stored = template({ version: 3 });
    equal(nextVersionFor(stored, { ...stored, status: 'Archived' }), 3);
    ok(!contentChanged(stored, { ...stored, status: 'Archived' }));
  });

  it('saving an Active template unchanged does not bump it', () => {
    const stored = template({ version: 3 });
    equal(nextVersionFor(stored, { ...stored }), 3);
  });
});

// --- §6.3 - duplicate to a session --------------------------------------------

describe('duplicateTemplate (§6.3)', () => {
  const source = template({ components: [
    { id: 'c-tuition', name: 'Tuition', amount: 15_000, charged: 'EveryTerm', refundable: false },
    { id: 'c-admission', name: 'Admission fee', amount: 9_999, charged: 'AtAdmission', fromTerm: 1, refundable: false },
  ] });

  it('the copy is a Draft at version 1 under the target placement id', () => {
    const copy = duplicateTemplate(source, { session: 2026 }, '2026-01-01T00:00:00.000Z');
    equal(copy.status, 'Draft');
    equal(copy.version, 1);
    equal(copy.session, 2026);
    equal(copy.id, 'tpl-health-1stbatch-2026');
    equal(copy.name, 'Health — 2026');
    equal(copy.createdAt, '2026-01-01T00:00:00.000Z');
  });

  it('components are copied, not shared', () => {
    const copy = duplicateTemplate(source, { session: 2026 }, '2026-01-01T00:00:00.000Z');
    equal(copy.components.length, source.components.length);
    ok(copy.components[0] !== source.components[0], 'must be a new object');
    ok(copy.components !== source.components, 'must be a new array');
  });

  it('an optional raise is rounded to the nearest 100', () => {
    const copy = duplicateTemplate(source, { session: 2026, increasePercent: 8 }, '2026-01-01T00:00:00.000Z');
    equal(copy.components[0].amount, 16_200);
    equal(copy.components[1].amount, 10_800, '10799.12 rounds to a payable figure');
  });

  it('no raise leaves the amounts exactly as they were', () => {
    const copy = duplicateTemplate(source, { session: 2026, increasePercent: 0 }, '2026-01-01T00:00:00.000Z');
    deepStrictEqual(copy.components, source.components);
  });

  it('a batch can be retargeted too, and the id follows it', () => {
    const copy = duplicateTemplate(source, { session: 2026, batch: ALL_BATCHES }, '2026-01-01T00:00:00.000Z');
    equal(copy.id, 'tpl-health-all-2026');
    equal(copy.batch, ALL_BATCHES);
  });
});

describe('roundToNearest100 / raiseAmounts (§6.3)', () => {
  it('rounds half up to a payable figure', () => {
    equal(roundToNearest100(10_750), 10_800);
    equal(roundToNearest100(10_749), 10_700);
    equal(roundToNearest100(10_800), 10_800);
    equal(roundToNearest100(0), 0);
  });

  it('a zero or negative percent is a no-op copy', () => {
    const components = [tuition(15_000)];
    deepStrictEqual(raiseAmounts(components, 0), components);
    deepStrictEqual(raiseAmounts(components, -10), components);
    ok(raiseAmounts(components, 0)[0] !== components[0]);
  });
});

// --- §5.4 - terms per year ----------------------------------------------------

describe('termsPerYearFor (§5.4)', () => {
  it('derives from the course system when Settings has said nothing', () => {
    equal(termsPerYearFor('Health'), 2, 'Paramedics is a semester course');
    equal(termsPerYearFor('BSN'), 2);
    equal(termsPerYearFor('LHV'), 1, 'PNC is annual');
    equal(termsPerYearFor('PharmacyB'), 1);
    equal(termsPerYearFor('Ultrasound1Y'), 1, 'a one-year course on a monthly system bills once a year');
    equal(termsPerYearFor('Ultrasound6M'), 1);
  });

  it('a Settings override wins, and 0 or absent falls back to the derived value', () => {
    equal(termsPerYearFor('Health', { Health: 4 }), 4);
    equal(termsPerYearFor('Health', { Health: 0 }), 2);
    equal(termsPerYearFor('Health', { BSN: 1 }), 2, 'another program must not leak');
  });

  it('the derived helper agrees with the resolver', () => {
    equal(defaultTermsPerYear('Paramedics'), termsPerYearFor('Health'));
    equal(defaultTermsPerYear('PNC'), termsPerYearFor('LHV' as ProgramCode));
  });
});

// --- §6.1 - a new Draft -------------------------------------------------------

describe('blankTemplate (§6.1)', () => {
  const base = {
    course: 'BSN' as const,
    program: 'BSN' as const,
    session: 2026,
    batch: ALL_BATCHES,
    name: 'BSN 2026',
    now: '2026-01-01T00:00:00.000Z',
  };

  it('starts as an unpriced Draft at version 1', () => {
    const blank = blankTemplate(base);
    equal(blank.status, 'Draft');
    equal(blank.version, 1);
    deepStrictEqual(blank.components, []);
    equal(blank.notes, undefined);
    equal(blank.createdAt, base.now);
  });

  it('takes the term count from the program, not from the operator', () => {
    equal(blankTemplate(base).totalTerms, 8);
    equal(blankTemplate({ ...base, program: 'Health', course: 'Paramedics' }).totalTerms, 4);
  });

  it('carries the §5.1 due-day defaults and the resolved terms-per-year', () => {
    const blank = blankTemplate(base);
    equal(blank.admissionDueDays, 14);
    equal(blank.termDueDays, 15);
    equal(blank.termsPerYear, 2);
    equal(blankTemplate({ ...base, termsPerYear: 1 }).termsPerYear, 1);
  });

  it('the id says which placement it covers', () => {
    equal(blankTemplate(base).id, 'tpl-bsn-all-2026');
    equal(blankTemplate({ ...base, batch: '17th Batch' }).id, 'tpl-bsn-17thbatch-2026');
  });
});

// --- §7.5 / §7.6 - who is on this template ------------------------------------

describe('studentsUsing (§7.5, §7.6)', () => {
  const roster = [
    student(),
    student({ sno: 2, batch: '1st Batch' }),
    student({ sno: 3, batch: '2nd Batch' }),
    student({ sno: 4, session: 2018 }),
    student({ sno: 5, program: 'Surgical' }),
  ];

  it('a batch-specific template counts only its own batch', () => {
    equal(studentsUsing(template(), roster), 2);
  });

  it('an all-batches template counts every batch of that course, program and session', () => {
    equal(studentsUsing(template({ batch: ALL_BATCHES }), roster), 3);
  });

  it('an unused template reports zero, which is why it can be archived without a warning', () => {
    equal(studentsUsing(template({ session: 1999 }), roster), 0);
  });
});
