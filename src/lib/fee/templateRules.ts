// ============================================
// MediCMS Desktop - Fee engine: template rules (§6.3, §7)
// The rules the template store enforces live here as plain functions: the store
// calls them, and the tests can exercise them without a store, a DOM or storage.
// Money and matching behaviour stay in one direction only - screens and stores read
// these, they never re-implement them.
// ============================================

import type { CourseCode, FeeComponent, FeeTemplate, ProgramCode, Student } from '@/types';
import { getCourseDef, getCourseOfProgram, getSubCourseDef } from '../constants.ts';
import { roundHalfUp } from './concessions.ts';
import { deriveTermsPerYear } from './termFees.ts';

export interface TemplatePlacement {
  course: CourseCode;
  program: ProgramCode;
  session: number;
  batch: string;
}

/** '' in `batch` means "all batches" (§5.1). */
export const ALL_BATCHES = '';

/** Lower-case, alphanumeric only - the shape a stored id has to keep to. */
export function idSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * One id scheme for every template, so a duplicate cannot slip in beside the
 * template it was copied from: same placement means same id, and the store refuses it.
 */
export function templateIdFor(program: string, batch: string, session: number): string {
  return `tpl-${idSlug(program)}-${idSlug(batch) || 'all'}-${session}`;
}

/** The placement an Active template is unique within (§7.2). */
export function placementKey(placement: TemplatePlacement): string {
  return `${placement.course}|${placement.program}|${placement.session}|${placement.batch}`;
}

function samePlacement(a: TemplatePlacement, b: TemplatePlacement): boolean {
  return placementKey(a) === placementKey(b);
}

/**
 * The template an admission should use for a placement (§7.1, §7.3): Active only,
 * batch-specific wins, and an all-batches template is used when no batch-specific
 * one exists. Returns undefined so the caller can offer "build fees manually".
 */
export function findActiveFor(
  templates: readonly FeeTemplate[],
  placement: TemplatePlacement,
): FeeTemplate | undefined {
  const active = templates.filter((t) => t.status === 'Active');
  const exact = active.find((t) => samePlacement(t, placement));
  if (exact) return exact;
  return active.find(
    (t) => t.course === placement.course
      && t.program === placement.program
      && t.session === placement.session
      && t.batch === ALL_BATCHES,
  );
}

/**
 * Why this template cannot be activated, or null when it can. Two rules: one Active
 * template per placement (§7.2) and a terms-per-year value must exist (§7.10).
 */
export function activationBlocker(
  template: FeeTemplate,
  templates: readonly FeeTemplate[],
): string | null {
  if (!(template.termsPerYear > 0)) {
    return `Set terms per year for ${template.program} before activating this template`;
  }
  const clash = templates.find(
    (t) => t.id !== template.id && t.status === 'Active' && samePlacement(t, template),
  );
  if (clash) {
    return `An Active template already exists for this placement - "${clash.name}" (v${clash.version}). Archive it first.`;
  }
  return null;
}

/**
 * Everything a save is allowed to change, as one comparable string. `version`,
 * `status`, `createdAt` and `updatedAt` are excluded: archiving or activating is not
 * a content change, so it must not raise the version (§7.9).
 */
export function templateSignature(template: FeeTemplate): string {
  return JSON.stringify({
    name: template.name,
    course: template.course,
    program: template.program,
    session: template.session,
    batch: template.batch,
    notes: template.notes ?? '',
    totalTerms: template.totalTerms,
    termsPerYear: template.termsPerYear,
    admissionDueDays: template.admissionDueDays,
    termDueDays: template.termDueDays,
    components: template.components.map((c) => [
      c.id, c.name, c.amount, c.charged, c.fromTerm ?? null, c.toTerm ?? null, c.refundable,
    ]),
  });
}

export function contentChanged(existing: FeeTemplate, incoming: FeeTemplate): boolean {
  return templateSignature(existing) !== templateSignature(incoming);
}

/**
 * The version a save should carry (§7.9): editing a Draft leaves it alone, changing
 * the content of an Active template raises it by one. Admission records which
 * template and version a plan came from (§15.2), so the number has to be stable.
 */
export function nextVersionFor(existing: FeeTemplate | undefined, incoming: FeeTemplate): number {
  if (!existing) return Math.max(1, Math.trunc(incoming.version) || 1);
  if (existing.status === 'Active' && contentChanged(existing, incoming)) return existing.version + 1;
  return existing.version;
}

/** §6.3 - rounding to the nearest 100, so a raise produces fees people can pay. */
export function roundToNearest100(value: number): number {
  return roundHalfUp(value / 100) * 100;
}

/** Raise every component by a percent; 0 or less leaves the amounts as they are. */
export function raiseAmounts(components: readonly FeeComponent[], percent: number): FeeComponent[] {
  if (!(percent > 0)) return components.map((c) => ({ ...c }));
  return components.map((c) => ({
    ...c,
    amount: roundToNearest100(c.amount * (1 + percent / 100)),
  }));
}

export interface DuplicateTarget {
  session: number;
  batch?: string;
  name?: string;
  /** Optional across-the-board raise, §6.3. */
  increasePercent?: number;
}

/**
 * §5.4 starting value for a program, before any Settings override. Semester programs
 * bill two terms a year, annual and month-length programs one.
 */
export function defaultTermsPerYear(course: CourseCode): number {
  return deriveTermsPerYear(getCourseDef(course).system);
}

/**
 * §5.4 - the value a program actually bills "every new year" against: the Settings
 * override when the institute set one, otherwise the value derived from the course
 * system. One function so a template, its activation rule and the editor preview can
 * never disagree about how many terms make a year.
 *
 * A stored override of 0 is not an answer: it would bill every term as a year start.
 * Anything that is not a positive number falls back to the derived value.
 */
export function termsPerYearFor(
  program: ProgramCode,
  overrides: Partial<Record<ProgramCode, number>> = {},
): number {
  const override = overrides[program];
  if (override !== undefined && override > 0) return override;
  return defaultTermsPerYear(getCourseOfProgram(program));
}

export interface NewTemplateInput {
  course: CourseCode;
  program: ProgramCode;
  session: number;
  batch: string;
  name: string;
  /** '' = all batches, so callers pass ALL_BATCHES rather than guessing. */
  termsPerYear?: number;
  notes?: string;
  now: string;
}

/**
 * A blank Draft for "New Template" (§6.1). The term count and terms-per-year come
 * from the program's own definition (§5.1, §5.4) so an operator cannot start a
 * template on a shape the engine would not bill correctly.
 */
export function blankTemplate(input: NewTemplateInput): FeeTemplate {
  const termsPerYear = input.termsPerYear ?? defaultTermsPerYear(input.course);
  return {
    id: templateIdFor(input.program, input.batch, input.session),
    name: input.name,
    course: input.course,
    program: input.program,
    session: input.session,
    batch: input.batch,
    status: 'Draft',
    version: 1,
    notes: input.notes,
    totalTerms: getSubCourseDef(input.program).sub.terms.length,
    termsPerYear,
    admissionDueDays: 14,
    termDueDays: 15,
    components: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/**
 * How many students a template is feeding (§7.5, §7.6 - "Used by N students", and the
 * reason a template in use cannot be deleted). A plan does not yet store the template
 * it came from - that is the admission slice - so the match is on placement: a
 * batch-specific template counts its own batch, an all-batches template counts every
 * batch of that course, program and session.
 */
export function studentsUsing(template: FeeTemplate, students: readonly Student[]): number {
  return students.filter(
    (s) => s.course === template.course
      && s.program === template.program
      && s.session === template.session
      && (template.batch === ALL_BATCHES || s.batch === template.batch),
  ).length;
}

/**
 * Copy a template into a new session (§6.3). The copy is always a Draft, so it can
 * be reviewed before it is used, and it always starts at version 1.
 */
export function duplicateTemplate(
  source: FeeTemplate,
  target: DuplicateTarget,
  now: string,
): FeeTemplate {
  const batch = target.batch ?? source.batch;
  return {
    ...source,
    id: templateIdFor(source.program, batch, target.session),
    name: target.name ?? `${source.program} — ${target.session}`,
    session: target.session,
    batch,
    status: 'Draft',
    version: 1,
    components: raiseAmounts(source.components, target.increasePercent ?? 0),
    createdAt: now,
    updatedAt: now,
  };
}
