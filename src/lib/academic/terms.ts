// ============================================
// MediCMS Desktop — Academic core: term rules
// §5.2, §7, §8. The one shared source for term length, term labels and the
// program-field guards. Pure — no clock, no store. Run: npm run test
// ============================================

import type { TermSystem } from './types.ts';

/** §5.2 / §45 case 21: the only terms-per-year values the institute allows. */
export const TERMS_PER_YEAR_CHOICES = [1, 2, 3, 4, 6, 12] as const;

export function isValidTermsPerYear(n: number): boolean {
  return (TERMS_PER_YEAR_CHOICES as readonly number[]).includes(n);
}

/** §5.2 / §45 case 22: term length in months is 12 ÷ terms per year. Throws on a
 *  value that isValidTermsPerYear rejects, so a bad program cannot silently make
 *  fractional-length terms. */
export function termLengthMonthsOf(termsPerYear: number): number {
  if (!isValidTermsPerYear(termsPerYear)) {
    throw new Error(`Terms per year must be one of ${TERMS_PER_YEAR_CHOICES.join(', ')}.`);
  }
  return 12 / termsPerYear;
}

/** §7 rule 1 / §45 case 20: a program's number of terms cannot drop below the
 *  highest term any student is currently sitting in. */
export function numTermsBelowHighestStudentTerm(
  numTerms: number,
  studentTerms: readonly number[],
): boolean {
  const highest = studentTerms.length ? Math.max(...studentTerms) : 0;
  return numTerms < highest;
}

/** §8 / §45 case 29: one shared long label — "Semester 3", "Year 2", "Term 1". */
export function termLongLabel(system: TermSystem, n: number): string {
  return `${system} ${n}`;
}

/** §8 / §45 case 29: short label for tight tables — Semester→T, Year→Y, Term→T. */
export function termShortLabel(system: TermSystem, n: number): string {
  const prefix = system === 'Year' ? 'Y' : 'T';
  return `${prefix}${n}`;
}

export function termLabel(
  system: TermSystem,
  n: number,
  style: 'long' | 'short' = 'long',
): string {
  return style === 'short' ? termShortLabel(system, n) : termLongLabel(system, n);
}

/** §22: total months of a course = number of terms × term length. */
export function termTotalMonths(numTerms: number, termsPerYear: number): number {
  return numTerms * termLengthMonthsOf(termsPerYear);
}

/** §35.2 "Course length": the read-only months figure spoken as years and months. */
export function courseLengthLabel(numTerms: number, termsPerYear: number): string {
  const total = termTotalMonths(numTerms, termsPerYear);
  const years = Math.floor(total / 12);
  const months = total % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years > 1 ? 's' : ''}`);
  if (months) parts.push(`${months} month${months > 1 ? 's' : ''}`);
  return parts.length ? parts.join(' ') : '0 months';
}

/** §35.1 / §35.2: the "6 months" beside a program's terms-per-year. */
export function termLengthLabel(termsPerYear: number): string {
  const months = termLengthMonthsOf(termsPerYear);
  return `${months} month${months > 1 ? 's' : ''}`;
}

/** Legacy `CourseDef.system` → the new TermSystem, for the §6 seed. */
export function termSystemFromLegacy(
  system: 'semester' | 'annual' | 'months',
): TermSystem {
  if (system === 'annual') return 'Year';
  if (system === 'months') return 'Term';
  return 'Semester';
}
