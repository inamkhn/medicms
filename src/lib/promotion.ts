// ============================================
// MediCMS Desktop - Promotion helpers
// A promotion bills the student's own locked plan figure when they have one, and
// falls back to the Active template's charge for the term after their current one
// (design doc §16). The eight-head breakup helpers that used to live here are gone:
// those numbers are now derived from components in lib/fee/templateCompat.
// ============================================

import { getSubCourseDef, termIndexOf } from '@/lib/constants';
// The 1-based term-number rule moved to constants.ts (alias-free, so node tests
// can share it); re-exported here for every existing importer of this module.
export { termIndexOf };
import { nextBilledTerm, templateTotalOf } from '@/lib/fee/templateCompat';
import { findActiveFor } from '@/lib/fee/templateRules';
import type { FeeTemplate, ProgramCode, Semester, Student } from '@/types';

/**
 * Term number (1-based) for a semester label — see constants.ts; this module
 * only keeps the promotion helpers that build on it.
 */
export function getNextTerm(program: ProgramCode, current: Semester): Semester | null {
  const { sub } = getSubCourseDef(program);
  const idx = sub.terms.indexOf(current);
  if (idx < 0 || idx >= sub.terms.length - 1) return null;
  return sub.terms[idx + 1];
}

/**
 * What the next term should cost this student. Their admission-locked recurring
 * figure wins — §16 "a student keeps the fees agreed in their own plan for the whole
 * course, even if the institute raises the template next session" — and only a
 * student with no locked figure is priced from the current Active template.
 */
export function getPromotionFee(student: Student, templates: readonly FeeTemplate[]): number {
  if (typeof student.baseFeeRecurring === 'number') return student.baseFeeRecurring;
  const template = findActiveFor(templates, student);
  if (!template) return 0;
  return templateTotalOf(template, nextBilledTerm(template, termIndexOf(student.semester)));
}
