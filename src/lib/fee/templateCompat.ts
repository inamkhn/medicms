// ============================================
// MediCMS Desktop - Fee engine: v2 template → legacy eight-head projection
// FEE_TEMPLATES_AND_ADMISSION_DESIGN.md §5, §6.2, §7.
//
// The stored model is now component-based (one template covers the whole program),
// but a number of screens and the locked `Student.baseFee*` fields still speak the
// old eight-head language. Rather than keep two fee models in sync, this module
// *derives* the old view from the new one, through the same term calculation the
// editor preview uses. So the engine stays the only place money is worked out.
//
// Only type imports reach @/types, so nothing here pulls in a store, a component or
// the clock at runtime — the engine's dependency rules (§32 step 1) still hold.
// ============================================

import type { FeeTemplate, LegacyFeeHeads, LegacyFeeTemplateRow } from '@/types';
import { computeTemplateTermFees, type TermFeesResult } from './termFees.ts';

/** The head keys, in the order the legacy screens have always shown them. */
export const HEAD_KEYS = [
  'admissionFee', 'tuitionFee', 'idCardFee', 'annualCharges',
  'securityFee', 'enrollmentFee', 'diplomaFee', 'clinicalCharges',
] as const;

export type HeadKey = (typeof HEAD_KEYS)[number];

/**
 * The canonical component name for each legacy head (§5.2 suggestion list). The
 * seed converter writes these names and this map reads them back, so a converted
 * template and its projection cannot disagree.
 */
export const HEAD_NAMES: Record<HeadKey, string> = {
  admissionFee: 'Admission fee',
  tuitionFee: 'Tuition',
  idCardFee: 'ID card',
  annualCharges: 'Annual charges',
  securityFee: 'Security deposit',
  enrollmentFee: 'Enrollment fee',
  diplomaFee: 'Diploma fee',
  clinicalCharges: 'Clinical training',
};

/** Component name → head key, normalised so "  tuition " still matches. */
const NAME_TO_HEAD = new Map<string, HeadKey>(
  HEAD_KEYS.map((key) => [HEAD_NAMES[key].toLowerCase(), key]),
);

/** The label each head has always been shown under, for screens that list heads. */
export const HEAD_LABELS: Record<HeadKey, string> = {
  admissionFee: 'Admission Fee',
  tuitionFee: 'Tuition Fee',
  idCardFee: 'ID Card Fee',
  annualCharges: 'Annual Charges',
  securityFee: 'Security Fee',
  enrollmentFee: 'Enrollment Fee',
  diplomaFee: 'Diploma Fee',
  clinicalCharges: 'Clinical Charges',
};

/** Money on components that are not one of the legacy eight. */
export const OTHER_FEES_LABEL = 'Other Fees';

export function emptyHeads(): LegacyFeeHeads {
  return {
    admissionFee: 0, tuitionFee: 0, idCardFee: 0, annualCharges: 0,
    securityFee: 0, enrollmentFee: 0, diplomaFee: 0, clinicalCharges: 0, otherFees: 0,
  };
}

/** A legacy row read as heads: the old table had no "other" column, so it is 0. */
export function legacyRowToHeads(row: LegacyFeeTemplateRow): LegacyFeeHeads {
  const heads = emptyHeads();
  for (const key of HEAD_KEYS) heads[key] = row[key];
  return heads;
}

/** Sum of the nine heads, `otherFees` included so nothing silently drops. */
export function sumHeads(heads: LegacyFeeHeads): number {
  return HEAD_KEYS.reduce((total, key) => total + heads[key], 0) + heads.otherFees;
}

// computeTemplateTermFees is pure and deterministic, so one result per template
// object can be reused across the ~10 call sites that ask for the same numbers.
const termFeesCache = new WeakMap<FeeTemplate, TermFeesResult>();

export function termFeesOf(template: FeeTemplate): TermFeesResult {
  const cached = termFeesCache.get(template);
  if (cached) return cached;
  const result = computeTemplateTermFees(template.components, {
    totalTerms: template.totalTerms,
    termsPerYear: template.termsPerYear,
  });
  termFeesCache.set(template, result);
  return result;
}

/**
 * The eight heads as they would appear on one term's charge. A component whose
 * name is not one of the legacy eight is collected in `otherFees` rather than
 * dropped, which is how a hand-built template keeps billing what it says.
 */
export function termHeadsOf(template: FeeTemplate, term: number): LegacyFeeHeads {
  const heads = emptyHeads();
  const billed = termFeesOf(template).terms.find((t) => t.term === term);
  if (!billed) return heads;
  for (const line of billed.lines) {
    const key = NAME_TO_HEAD.get(line.name.trim().toLowerCase());
    if (key) heads[key] += line.amount;
    else heads.otherFees += line.amount;
  }
  return heads;
}

/** What one term costs, straight from the engine. */
export function templateTotalOf(template: FeeTemplate, term: number): number {
  return termFeesOf(template).terms.find((t) => t.term === term)?.total ?? 0;
}

/** Everything the program costs from term 1 to the end (§8 course total). */
export function templateCourseTotal(template: FeeTemplate): number {
  return termFeesOf(template).courseTotal;
}

/** The refundable part, reported separately (§5.2, §8.1). */
export function templateRefundableTotal(template: FeeTemplate): number {
  return termFeesOf(template).refundableTotal;
}

/**
 * The next term that actually carries a charge after `afterTerm` — the term a
 * promotion would bill. Falls back to the final term, since a student already in
 * their last term has no later charge to price a promotion from.
 */
export function nextBilledTerm(template: FeeTemplate, afterTerm: number): number {
  const terms = termFeesOf(template).terms;
  const following = terms.find((t) => t.term > afterTerm);
  if (following) return following.term;
  const last = terms[terms.length - 1];
  return last ? last.term : afterTerm + 1;
}

export interface LegacyPlan {
  baseFeeTotal: number;
  baseFeeRecurring: number;
  baseFeeBreakup: LegacyFeeHeads;
}

/**
 * The three locked figures a student record still carries, derived from a v2
 * template so admission and import write the same shape with the correct numbers.
 * The meaning of each field is unchanged from the eight-head table: `baseFeeTotal`
 * is the opening term's charge (what admission posts first), `baseFeeRecurring` is
 * the next term's charge - the promotion default - and the breakup is the opening
 * term head by head. The whole-course figure is a separate question and lives in
 * `templateCourseTotal`, shown in the template list and editor.
 */
export function legacyPlanFor(template: FeeTemplate, startTerm = 1): LegacyPlan {
  const opening = templateTotalOf(template, startTerm);
  const recurring = templateTotalOf(template, nextBilledTerm(template, startTerm));
  return {
    baseFeeTotal: opening,
    baseFeeRecurring: recurring || opening,
    baseFeeBreakup: termHeadsOf(template, startTerm),
  };
}
