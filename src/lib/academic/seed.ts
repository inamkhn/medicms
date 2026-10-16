// ============================================
// MediCMS Desktop — Academic core: starting data (§6)
// Turns today's frozen COURSES / SESSION_OPTIONS into the editable course, program
// and session records, with no typing needed on first run (§48 step 1). Pure: the
// inputs are plain structural shapes, so the store feeds it `@/lib/constants` data
// while this module stays free of aliases, stores and the clock. Run: npm run test
// ============================================

import { termSystemFromLegacy } from './terms.ts';
import type { AcademicCourse, AcademicProgram, AcademicSession, TermSystem } from './types.ts';

/** A minimal view of `CourseDef` — the store maps its real constants into this. */
export interface SeedSubCourse {
  value: string;
  label: string;
  numTerms: number;
}
export interface SeedCourse {
  code: string;
  label: string;
  system: 'semester' | 'annual' | 'months';
  subCourses: SeedSubCourse[];
}

/**
 * §6 short codes, keyed by the legacy program value. Anything absent falls back to
 * the first three letters of the label, upper-cased — so a hand-added program still
 * gets a usable code.
 */
export const PROGRAM_SHORT_CODES: Record<string, string> = {
  Health: 'HLT', Surgical: 'SUR', Pharmacy: 'PHT', Radiology: 'RAD',
  Pathology: 'PAT', Cardiology: 'CAR', Anaesthesia: 'ANS', Dental: 'DEN',
  Dialysis: 'DIA', PharmacyB: 'CATB', LHV: 'LHV', CMW: 'CMW', CNA: 'CNA',
  BSN: 'BSN', DHMS: 'DHMS', Ultrasound6M: 'US6', Ultrasound1Y: 'US12',
};

export function shortCodeFor(value: string, label: string): string {
  const known = PROGRAM_SHORT_CODES[value];
  if (known) return known;
  const letters = label.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  return letters || value.slice(0, 3).toUpperCase();
}

export function courseIdOfLegacy(legacy: string): string {
  return `course-${legacy.toLowerCase()}`;
}
export function programIdOfLegacy(legacy: string): string {
  return `prog-${legacy.toLowerCase()}`;
}

/**
 * §6 / §5.2: terms per year is not stored on the old constants, but every seeded row
 * follows one rule — annual programs run 1 term a year (12-month terms), semester and
 * month programs run 2 a year (6-month terms). This reproduces §6 exactly.
 */
export function termsPerYearFor(system: TermSystem): number {
  return system === 'Year' ? 1 : 2;
}

export interface AcademicSeed {
  courses: AcademicCourse[];
  programs: AcademicProgram[];
  sessions: AcademicSession[];
}

export function buildAcademicSeed(
  courses: readonly SeedCourse[],
  sessionYears: readonly number[],
  currentYear: number,
): AcademicSeed {
  const outCourses: AcademicCourse[] = [];
  const outPrograms: AcademicProgram[] = [];
  courses.forEach((course, ci) => {
    const system = termSystemFromLegacy(course.system);
    outCourses.push({
      id: courseIdOfLegacy(course.code),
      name: course.label,
      status: 'Active',
      order: ci,
      legacyValue: course.code,
    });
    course.subCourses.forEach((sub, si) => {
      outPrograms.push({
        id: programIdOfLegacy(sub.value),
        courseId: courseIdOfLegacy(course.code),
        name: sub.label,
        shortCode: shortCodeFor(sub.value, sub.label),
        termSystem: system,
        numTerms: sub.numTerms,
        termsPerYear: termsPerYearFor(system),
        status: 'Active',
        order: ci * 100 + si,
        legacyValue: sub.value,
      });
    });
  });

  const sessions: AcademicSession[] = sessionYears.map((year) => ({
    id: `session-${year}`,
    year,
    // Prior sessions are closed; the current one and any future one are open (§12).
    state: year < currentYear ? 'Closed' : 'Open',
    isCurrent: year === currentYear,
  }));

  return { courses: outCourses, programs: outPrograms, sessions };
}
