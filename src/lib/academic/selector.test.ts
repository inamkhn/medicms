// ============================================
// MediCMS Desktop — Academic core: selector candidate tests (§38.3)
// Pins the offer/grey/hide rules the shared AcademicSelector must apply in every
// screen, before any React uses them (§45 "automated tests before the screens").
// Run: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import {
  selectorBatches,
  selectorCourses,
  selectorPrograms,
  selectorSessions,
  type SelectorContext,
} from './selector.ts';
import type {
  AcademicBatch, AcademicCourse, AcademicProgram, AcademicSession, TermRow,
} from './types.ts';
import type { FeeTemplate, Student } from '../../types';
import { workflowBatches, importBatch } from './workflowBatches.ts';
import { studentsInBatch } from './batchMembership.ts';

const TODAY = '2026-10-09';

const course: AcademicCourse = { id: 'c-bsn', name: 'BS Nursing', status: 'Active', order: 1, legacyValue: 'Nursing' };
const courseDisabled: AcademicCourse = { id: 'c-off', name: 'Retired', status: 'Disabled', order: 2 };

const program: AcademicProgram = {
  id: 'p-bsn', courseId: 'c-bsn', name: 'BSN', shortCode: 'BSN',
  termSystem: 'Semester', numTerms: 8, termsPerYear: 2, status: 'Active', order: 1, legacyValue: 'BSN',
};
const programDisabled: AcademicProgram = {
  id: 'p-off', courseId: 'c-bsn', name: 'OLD', shortCode: 'OLD',
  termSystem: 'Semester', numTerms: 4, termsPerYear: 2, status: 'Disabled', order: 2, legacyValue: 'OLD',
};

const sessionOpen: AcademicSession = { id: 's-2026', year: 2026, state: 'Open', isCurrent: true };
const sessionClosed: AcademicSession = { id: 's-2025', year: 2025, state: 'Closed', isCurrent: false };

const schedule3: TermRow[] = [
  { term: 1, starts: '2025-09-01', ends: '2026-02-28' },
  { term: 2, starts: '2026-03-01', ends: '2026-08-31' },
  { term: 3, starts: '2026-09-01', ends: '2027-02-28' },
];

function batch(over: Partial<AcademicBatch> & Pick<AcademicBatch, 'id' | 'name'>): AcademicBatch {
  return {
    programId: 'p-bsn', session: 2026, status: 'Running', admissions: 'Open',
    seats: null, term1Start: '2025-09-01', schedule: schedule3,
    createdBy: 'Admin', createdAt: 'x', ...over,
  };
}

const bOpen = batch({ id: 'b-open', name: 'Fall' });
const bClosed = batch({ id: 'b-closed', name: 'Spring', admissions: 'Closed' });
const bFull = batch({ id: 'b-full', name: 'Evening', seats: 1 });
const bNoTpl = batch({ id: 'b-night', name: 'Night' });
const bPlanned = batch({ id: 'b-plan', name: 'Plan', status: 'Planned' });
const bCompleted = batch({ id: 'b-done', name: 'Done', status: 'Completed', admissions: 'Closed' });
const bPromo = batch({ id: 'b-promo', name: 'Promo' });

const batches = [bOpen, bClosed, bFull, bNoTpl, bPlanned, bCompleted, bPromo];

// An Active template for the exact batch "Fall" only — everything else has none.
const templateFall = {
  id: 't1', name: 'BSN 2026', course: 'Nursing', program: 'BSN', session: 2026, batch: 'Fall',
  status: 'Active', version: 1, totalTerms: 8, termsPerYear: 2, admissionDueDays: 14, termDueDays: 15,
  components: [], createdAt: 'x', updatedAt: 'x',
} as unknown as FeeTemplate;
const templates = [templateFall];

// One student each in the full and promotion batches (matched by batch name).
const studentFull = { sno: 1, name: 'A', program: 'BSN', session: 2026, batch: 'Evening', semester: '1st', struckOff: false } as unknown as Student;
const studentBehind = { sno: 2, name: 'B', program: 'BSN', session: 2026, batch: 'Promo', semester: '2nd', struckOff: false } as unknown as Student;
const students = [studentFull, studentBehind];

describe('academic catalogue connections to student workflows', () => {
  const catalogue = { courses: [course], programs: [program], sessions: [sessionOpen, sessionClosed], batches };
  const placement = { course: 'Nursing', program: 'BSN' };

  it('admission reflects closed admissions, full seats, missing templates and completed batches', () => {
    const options = workflowBatches(catalogue, placement, 'admission', students, templates, TODAY);
    equal(options.find(o => o.batch.id === bOpen.id)?.disabled, false);
    equal(options.find(o => o.batch.id === bClosed.id)?.reason, 'Admissions closed');
    equal(options.find(o => o.batch.id === bFull.id)?.reason, 'Seats full');
    equal(options.find(o => o.batch.id === bNoTpl.id)?.reason, 'No fee template');
    equal(options.some(o => o.batch.id === bCompleted.id), false);
  });

  it('blocks new admission when the session or program is closed after selection', () => {
    equal(workflowBatches({ ...catalogue, sessions: [{ ...sessionOpen, state: 'Closed' }] }, placement, 'admission', students, templates, TODAY).length, 0);
    equal(workflowBatches({ ...catalogue, programs: [{ ...program, status: 'Disabled' }] }, placement, 'admission', students, templates, TODAY).length, 0);
  });

  it('promotion retains running cohorts in closed sessions and excludes planned/completed ones', () => {
    const old = { ...bOpen, id: 'old', session: 2025 };
    const options = workflowBatches({ ...catalogue, batches: [...batches, old] }, placement, 'promotion', students, templates, TODAY);
    ok(options.some(o => o.batch.id === 'old'));
    equal(options.some(o => o.batch.id === bPlanned.id || o.batch.id === bCompleted.id), false);
  });

  it('imports resolve same-name cohorts by session, including historical completed cohorts', () => {
    const old = { ...bOpen, id: 'old', session: 2025, status: 'Completed' as const };
    const data = { ...catalogue, batches: [...batches, old] };
    equal(importBatch(data, { ...placement, batch: ' fall ', session: 2025 })?.id, 'old');
    equal(importBatch(data, { ...placement, batch: 'Fall', session: 2026 })?.id, bOpen.id);
    equal(importBatch(data, { ...placement, batch: 'Fall', session: 2027 }), undefined);
  });

  it('bulk promotion membership cannot include the same batch name from another session', () => {
    const cohort = [
      { ...studentFull, sno: 10, batch: 'Fall', session: 2025 },
      { ...studentFull, sno: 11, batch: ' fall ', session: 2026 },
      { ...studentFull, sno: 12, batch: 'Fall', session: 2026, program: 'OLD' },
    ] as Student[];
    deepStrictEqual(studentsInBatch(bOpen, program, cohort).map(s => s.sno), [11]);
  });

  it('keeps unnamed cohorts selectable through their IDs', () => {
    const unnamed = { ...bOpen, id: 'unnamed', name: '' };
    const data = { ...catalogue, batches: [unnamed] };
    equal(workflowBatches(data, placement, 'promotion', students, templates, TODAY)[0].batch.id, 'unnamed');
    equal(importBatch(data, { ...placement, batch: '', session: 2026 })?.id, 'unnamed');
  });
});

function pickBatches(context: SelectorContext, extra?: { programId?: string; session?: number; includeCompleted?: boolean }) {
  return selectorBatches({
    context, batches, program, course, students, templates, today: TODAY,
    programId: extra?.programId ?? 'p-bsn',
    session: extra?.session ?? 2026,
    includeCompleted: extra?.includeCompleted,
  });
}

describe('programs offered per context (§38.3)', () => {
  it('Active only for admission', () => {
    deepStrictEqual(selectorPrograms('admission', [program, programDisabled]).map((p) => p.id), ['p-bsn']);
  });
  it('all for the directory', () => {
    equal(selectorPrograms('directory', [program, programDisabled]).length, 2);
  });
  it('the student\'s own when editing', () => {
    deepStrictEqual(selectorPrograms('editStudent', [program, programDisabled], { programId: 'p-off' }).map((p) => p.id), ['p-off']);
  });
});

describe('courses cascade (§38.1)', () => {
  it('only courses owning an offered Active program', () => {
    const offered = selectorPrograms('admission', [program, programDisabled]);
    deepStrictEqual(selectorCourses('admission', [course, courseDisabled], offered).map((c) => c.id), ['c-bsn']);
  });
  it('the directory shows every course', () => {
    equal(selectorCourses('directory', [course, courseDisabled], []).length, 2);
  });
});

describe('sessions offered per context (§38.3)', () => {
  it('open only for admission', () => {
    deepStrictEqual(selectorSessions('admission', [sessionOpen, sessionClosed]).map((s) => s.year), [2026]);
  });
  it('promotion and directory show all', () => {
    equal(selectorSessions('promotion', [sessionOpen, sessionClosed]).length, 2);
    equal(selectorSessions('directory', [sessionOpen, sessionClosed]).length, 2);
  });
});

describe('batches — admission greys near-misses with reasons (§38.3)', () => {
  const rows = pickBatches('admission');
  const byId = new Map(rows.map((r) => [r.batch.id, r]));

  it('completed and planned-but-unusable batches: Completed hidden, Planned shown', () => {
    ok(!byId.has('b-done'), 'Completed must not appear');
    ok(byId.has('b-plan'), 'Planned is a valid admission candidate');
  });

  it('a clean Running/Open batch with a template is selectable', () => {
    equal(byId.get('b-open')!.disabled, false);
    equal(byId.get('b-open')!.reason, undefined);
  });

  it('admissions closed greys with "Admissions closed"', () => {
    equal(byId.get('b-closed')!.disabled, true);
    equal(byId.get('b-closed')!.reason, 'Admissions closed');
  });

  it('a full batch greys with "Seats full"', () => {
    equal(byId.get('b-full')!.disabled, true);
    equal(byId.get('b-full')!.reason, 'Seats full');
  });

  it('no active template greys with "No fee template"', () => {
    equal(byId.get('b-night')!.disabled, true);
    equal(byId.get('b-night')!.reason, 'No fee template');
  });
});

describe('batches — directory hides completed unless asked (§38.3)', () => {
  it('completed hidden by default', () => {
    ok(!pickBatches('directory').some((r) => r.batch.id === 'b-done'));
  });
  it('completed shown when includeCompleted', () => {
    ok(pickBatches('directory', { includeCompleted: true }).some((r) => r.batch.id === 'b-done'));
  });
});

describe('batches — promotion shows only Running, with the due flag (§38.3, §18.3)', () => {
  const rows = pickBatches('promotion');
  const byId = new Map(rows.map((r) => [r.batch.id, r]));

  it('non-Running statuses are excluded', () => {
    ok(!byId.has('b-plan'), 'Planned not offered for promotion');
    ok(!byId.has('b-done'), 'Completed not offered for promotion');
  });
  it('a behind-schedule Running batch is flagged due', () => {
    equal(byId.get('b-promo')!.dueForPromotion, true);
  });
  it('promotion never greys an option', () => {
    ok(rows.every((r) => !r.disabled));
  });
});

describe('batches — fee template context offers Planned/Running, never greyed (§38.3)', () => {
  const rows = pickBatches('feeTemplate');
  it('excludes Completed, keeps Planned and Running, none disabled', () => {
    ok(!rows.some((r) => r.batch.id === 'b-done'));
    ok(rows.some((r) => r.batch.id === 'b-plan'));
    ok(rows.every((r) => !r.disabled));
  });
});
