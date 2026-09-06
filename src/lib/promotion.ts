// ============================================
// MediCMS - Promotion helpers
// Locked admission fee: one-time heads only in Sem-1,
// recurring heads repeat on promotion.
// ============================================

import { getSubCourseDef } from '@/lib/constants';
import { MOCK_FEE_TEMPLATES } from '@/lib/mockData';
import type { ProgramCode, Semester, Student } from '@/types';

export interface FeeBreakup {
  admissionFee: number; tuitionFee: number; idCardFee: number;
  annualCharges: number; securityFee: number; enrollmentFee: number;
  diplomaFee: number; clinicalCharges: number;
}

export function splitFee(b: FeeBreakup): { full: number; recurring: number; oneTime: number } {
  const full =
    b.admissionFee + b.tuitionFee + b.idCardFee + b.annualCharges +
    b.securityFee + b.enrollmentFee + b.diplomaFee + b.clinicalCharges;
  const recurring = b.tuitionFee + b.annualCharges + b.clinicalCharges + b.diplomaFee;
  return { full, recurring, oneTime: full - recurring };
}

export function getNextTerm(program: ProgramCode, current: Semester): Semester | null {
  const { sub } = getSubCourseDef(program);
  const idx = sub.terms.indexOf(current);
  if (idx < 0 || idx >= sub.terms.length - 1) return null;
  return sub.terms[idx + 1];
}

/** Default promotion fee: locked recurring fee, else template recurring, else template total. */
export function getPromotionFee(student: Student): number {
  if (typeof student.baseFeeRecurring === 'number') return student.baseFeeRecurring;
  const tpl = MOCK_FEE_TEMPLATES.find(
    (t) => t.program === student.program && t.course === student.course && t.semester === student.semester
  );
  if (tpl) return splitFee(tpl).recurring || splitFee(tpl).full;
  return 0;
}

/** Full Sem-1 total for a breakup (used at admission review). */
export function getFullTotal(b: FeeBreakup): number {
  return splitFee(b).full;
}
