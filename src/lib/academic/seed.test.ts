// ============================================
// MediCMS Desktop — Academic core: starting-data tests (§6)
// Asserts the seed reproduces today's catalogue exactly. Run: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import {
  buildAcademicSeed,
  programIdOfLegacy,
  shortCodeFor,
  termsPerYearFor,
  type SeedCourse,
} from './seed.ts';
import { termLengthMonthsOf } from './terms.ts';

// A compact mirror of §6 / constants.ts COURSES.
const SEED: SeedCourse[] = [
  {
    code: 'Paramedics', label: 'Paramedics', system: 'semester',
    subCourses: [
      { value: 'Health', label: 'Health', numTerms: 4 },
      { value: 'Radiology', label: 'Radiology', numTerms: 4 },
      { value: 'Pharmacy', label: 'Pharmacy Tech', numTerms: 4 },
    ],
  },
  { code: 'PharmacyB', label: 'Pharmacy B (Category B)', system: 'annual', subCourses: [{ value: 'PharmacyB', label: 'Pharmacy Cat-B', numTerms: 2 }] },
  { code: 'PNC', label: 'PNC', system: 'annual', subCourses: [{ value: 'LHV', label: 'LHV', numTerms: 2 }, { value: 'CMW', label: 'CMW', numTerms: 2 }] },
  { code: 'BSN', label: 'BS Nursing', system: 'semester', subCourses: [{ value: 'BSN', label: 'BS Nursing', numTerms: 8 }] },
  { code: 'DHMS', label: 'Homeopathic Council', system: 'annual', subCourses: [{ value: 'DHMS', label: 'DHMS', numTerms: 4 }] },
  {
    code: 'Ultrasound', label: 'Ultrasound Course', system: 'months',
    subCourses: [{ value: 'Ultrasound6M', label: 'Ultrasound 6 Months', numTerms: 1 }, { value: 'Ultrasound1Y', label: 'Ultrasound 1 Year', numTerms: 2 }],
  },
];

describe('buildAcademicSeed reproduces §6', () => {
  const { programs } = buildAcademicSeed(SEED, [2026], 2026);
  const byId = (id: string) => programs.find((p) => p.id === id)!;

  it('one program per sub-course', () => {
    equal(programs.length, 3 + 1 + 2 + 1 + 1 + 2);
  });
  it('Paramedics Health is Semester, 4 terms, 2 per year, 6-month terms', () => {
    const p = byId(programIdOfLegacy('Health'));
    deepStrictEqual(
      { code: p.shortCode, system: p.termSystem, numTerms: p.numTerms, perYear: p.termsPerYear, len: termLengthMonthsOf(p.termsPerYear) },
      { code: 'HLT', system: 'Semester', numTerms: 4, perYear: 2, len: 6 },
    );
  });
  it('PharmacyB is Year, 2 terms, 1 per year, 12-month terms', () => {
    const p = byId(programIdOfLegacy('PharmacyB'));
    deepStrictEqual({ code: p.shortCode, system: p.termSystem, perYear: p.termsPerYear, len: termLengthMonthsOf(p.termsPerYear) },
      { code: 'CATB', system: 'Year', perYear: 1, len: 12 });
  });
  it('BSN is Semester with 8 terms', () => {
    const p = byId(programIdOfLegacy('BSN'));
    deepStrictEqual({ code: p.shortCode, system: p.termSystem, numTerms: p.numTerms }, { code: 'BSN', system: 'Semester', numTerms: 8 });
  });
  it('Ultrasound programs are Term with 6-month terms (§47 #1 assumption)', () => {
    const us12 = byId(programIdOfLegacy('Ultrasound1Y'));
    const us6 = byId(programIdOfLegacy('Ultrasound6M'));
    deepStrictEqual({ c: us12.shortCode, s: us12.termSystem, n: us12.numTerms, py: us12.termsPerYear }, { c: 'US12', s: 'Term', n: 2, py: 2 });
    deepStrictEqual({ c: us6.shortCode, n: us6.numTerms }, { c: 'US6', n: 1 });
  });
  it('every seeded program id round-trips from its legacy value', () => {
    equal(byId('prog-lhv').legacyValue, 'LHV');
    equal(byId('prog-dhms').legacyValue, 'DHMS');
  });
});

describe('sessions seed', () => {
  it('prior years closed, current open and flagged, future open', () => {
    const { sessions } = buildAcademicSeed(SEED, [2025, 2026, 2027], 2026);
    const y2025 = sessions.find((s) => s.year === 2025)!;
    const y2026 = sessions.find((s) => s.year === 2026)!;
    const y2027 = sessions.find((s) => s.year === 2027)!;
    deepStrictEqual([y2025.state, y2026.state, y2027.state], ['Closed', 'Open', 'Open']);
    deepStrictEqual([y2025.isCurrent, y2026.isCurrent, y2027.isCurrent], [false, true, false]);
  });
});

describe('short code fallback', () => {
  it('derives from the label for an unknown program', () => {
    equal(shortCodeFor('NewThing', 'Radiology Tech'), 'RAD');
  });
  it('termsPerYear: Year→1, Semester/Term→2', () => {
    deepStrictEqual([termsPerYearFor('Year'), termsPerYearFor('Semester'), termsPerYearFor('Term')], [1, 2, 2]);
  });
});
