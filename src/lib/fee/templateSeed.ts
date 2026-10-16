// ============================================
// MediCMS Desktop - Fee engine: legacy eight-head rows → v2 component templates
// FEE_TEMPLATES_AND_ADMISSION_DESIGN.md §5, §32 step 2 ("Store templates
// permanently"). This is the one-time migration the old per-semester table needs:
// each (program, batch) group of rows becomes a single template covering the whole
// program, with the heads expressed as components and their timing (§5.3).
//
// `../constants` is imported by relative path on purpose — the term list and the
// course system are plain data, and a relative specifier keeps this file runnable
// under `node --test` (an alias here would not resolve at runtime).
// ============================================

import type { CourseCode, FeeComponent, FeeTemplate, LegacyFeeTemplateRow, ProgramCode, TemplateStatus } from '@/types';
import { getCourseDef, getSubCourseDef, SEMESTER_OPTIONS } from '../constants.ts';
import { deriveTermsPerYear, isYearStart } from './termFees.ts';
import { HEAD_KEYS, HEAD_NAMES, type HeadKey } from './templateCompat.ts';
import { templateIdFor } from './templateRules.ts';

/** Heads that are charged once, in the first billed term (§5.3 "Admission only"). */
const ONE_TIME_HEADS: readonly HeadKey[] = ['admissionFee', 'enrollmentFee', 'idCardFee', 'securityFee'];

function termOf(row: LegacyFeeTemplateRow): number {
  const index = SEMESTER_OPTIONS.indexOf(row.semester);
  return index < 0 ? 1 : index + 1;
}

/** Terms in which this head carries money, and the amount at its earliest term. */
interface HeadAppearance {
  terms: number[];
  amount: number;
}

function appearanceFor(rows: readonly LegacyFeeTemplateRow[], key: HeadKey): HeadAppearance | null {
  const withAmount = rows
    .map((row) => ({ term: termOf(row), amount: row[key] }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => a.term - b.term);
  if (withAmount.length === 0) return null;
  return {
    terms: withAmount.map((entry) => entry.term),
    amount: withAmount[0].amount,
  };
}

/**
 * §5.2/§5.3 - the head decides the timing option, the rows decide the term window.
 * A timing option is only kept when it actually lands on the semesters the old table
 * named: "every new year" bills on year-start terms, so an annual charge that the
 * legacy rows put in some other semester becomes a stated charge for that semester
 * instead of falling between the year starts and never being billed.
 */
function componentFor(
  id: string,
  key: HeadKey,
  appearance: HeadAppearance,
  scope: { totalTerms: number; termsPerYear: number },
): FeeComponent {
  const { terms, amount } = appearance;
  const first = terms[0];
  const last = terms[terms.length - 1];
  const { totalTerms, termsPerYear } = scope;
  const base = { id, name: HEAD_NAMES[key], amount, refundable: false };

  if (key === 'tuitionFee') {
    return { ...base, charged: 'EveryTerm', fromTerm: first };
  }
  if (key === 'annualCharges') {
    return isYearStart(first, termsPerYear)
      ? { ...base, charged: 'EveryNewYear', fromTerm: first }
      : { ...base, charged: 'EveryTerm', fromTerm: first, toTerm: Math.min(last, totalTerms) };
  }
  if (key === 'clinicalCharges') {
    // The legacy table meant "clinical postings start in this semester", and a head
    // present in only one term narrows to that term - which is how Sem-3-only reads.
    return { ...base, charged: 'EveryTerm', fromTerm: first, toTerm: Math.min(last, totalTerms) };
  }
  if (key === 'diplomaFee') {
    return { ...base, charged: 'LastTermOnly', toTerm: last };
  }
  if (ONE_TIME_HEADS.includes(key)) {
    return { ...base, charged: 'AtAdmission', fromTerm: first };
  }
  return { ...base, charged: 'EveryTerm' };
}

function buildComponents(
  rows: readonly LegacyFeeTemplateRow[],
  templateId: string,
  scope: { totalTerms: number; termsPerYear: number },
): FeeComponent[] {
  const components: FeeComponent[] = [];
  for (const key of HEAD_KEYS) {
    const appearance = appearanceFor(rows, key);
    if (!appearance) continue;
    components.push(componentFor(`${templateId}-${key}`, key, appearance, scope));
  }
  return components;
}

export interface SeedOptions {
  /** ISO timestamp for createdAt/updatedAt; passed in so the conversion is reproducible. */
  now: string;
  /** §5.1 due-date defaults (14 days after admission, 15 after posting). */
  admissionDueDays?: number;
  termDueDays?: number;
  status?: TemplateStatus;
}

/**
 * One v2 template per (program, batch). Session drift in the old table — Health
 * 1st Batch appears as 2017 and 2018 — collapses to the earliest session, because
 * a template belongs to one placement (§7.2) and billing the same batch under two
 * sessions would create two Active templates for it.
 */
export function convertLegacyRows(
  rows: readonly LegacyFeeTemplateRow[],
  options: SeedOptions,
): FeeTemplate[] {
  const groups = new Map<string, LegacyFeeTemplateRow[]>();
  for (const row of rows) {
    const key = `${row.program}|${row.batch}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const templates: FeeTemplate[] = [];
  for (const [key, group] of groups) {
    const [program, batch] = key.split('|');
    const sorted = [...group].sort((a, b) => termOf(a) - termOf(b));
    const course: CourseCode = getCourseOfProgramSafe(program as ProgramCode);
    const totalTerms = getSubCourseDef(program as ProgramCode).sub.terms.length;
    const termsPerYear = deriveTermsPerYear(getCourseDef(course).system);
    const session = sorted.reduce((earliest, row) => Math.min(earliest, row.session), sorted[0].session);
    const templateId = templateIdFor(program, batch, session);

    templates.push({
      id: templateId,
      name: `${program} — ${session}`,
      course,
      program: program as ProgramCode,
      session,
      batch,
      status: options.status ?? 'Active',
      version: 1,
      totalTerms,
      termsPerYear,
      admissionDueDays: options.admissionDueDays ?? 14,
      termDueDays: options.termDueDays ?? 15,
      components: buildComponents(sorted, templateId, { totalTerms, termsPerYear }),
      createdAt: options.now,
      updatedAt: options.now,
    });
  }

  return templates.sort((a, b) => a.program.localeCompare(b.program) || a.batch.localeCompare(b.batch));
}

/** `getSubCourseDef` already resolves the parent course; kept local so a bad program fails loudly. */
function getCourseOfProgramSafe(program: ProgramCode): CourseCode {
  return getSubCourseDef(program).course.code;
}
