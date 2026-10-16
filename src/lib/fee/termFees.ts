// ============================================
// MediCMS Desktop - Fee engine: term-by-term template fees (§5.3, §5.4, §8)
// One template covers every term of the program; the amount for each term is
// worked out from the components rather than stored per term.
// ============================================

import type { FeeComponent, TermFee, TermFeeLine } from './types.ts';

export interface TermFeesInput {
  /** Number of terms in the program (4, 8, ...). */
  totalTerms: number;
  /** §5.4 - terms that make one academic year for this program. */
  termsPerYear: number;
  /**
   * The term the student starts in (default 1). §21: a transfer-in charges the
   * "admission only" items in that first term and leaves earlier terms unbilled.
   */
  startingTerm?: number;
}

export interface TermFeesResult {
  /** Billed terms only, ascending, from `startingTerm` to `totalTerms`. */
  terms: TermFee[];
  /** Convenience view of `terms` as plain totals, in the same order. */
  termTotals: number[];
  courseTotal: number;
  /** §8 - the refundable part, reported separately from the course total. */
  refundableTotal: number;
  /** The first billed term, which is what admission posts as the opening charge. */
  firstTermTotal: number;
}

/** True when `term` opens an academic year (§5.4 rule). */
export function isYearStart(term: number, termsPerYear: number): boolean {
  const tpy = Math.max(1, Math.trunc(termsPerYear));
  return (term - 1) % tpy === 0;
}

/**
 * §5.4 starting values: semester programs run two terms a year, annual and
 * month-length programs one. An explicit Settings value always wins.
 */
export function deriveTermsPerYear(system: 'semester' | 'annual' | 'months'): number {
  return system === 'semester' ? 2 : 1;
}

/**
 * Does this component fall due in `term`? `fromTerm`/`toTerm` narrow any option
 * (§5.3), so "Every term, from term 3" is one component rather than a per-term table.
 */
export function appliesToTerm(
  component: FeeComponent,
  term: number,
  startingTerm: number,
  totalTerms: number,
  termsPerYear: number,
): boolean {
  if (component.fromTerm !== undefined && term < component.fromTerm) return false;
  if (component.toTerm !== undefined && term > component.toTerm) return false;

  switch (component.charged) {
    case 'AtAdmission': {
      // "Charged once, in the first term" - the first term this student is billed
      // for, pushed to `fromTerm` when the template says the charge only starts
      // later. Without the push, a one-time fee set to fromTerm 3 would never bill.
      const opening = Math.max(startingTerm, component.fromTerm ?? startingTerm);
      return term === opening;
    }
    case 'EveryTerm':
      return true;
    case 'EveryNewYear':
      // Term 1 and every term that opens a year, plus the joining term when the
      // student starts part-way through a year (§5.4).
      return isYearStart(term, termsPerYear) || (term === startingTerm && !isYearStart(startingTerm, termsPerYear));
    case 'OnPromotion':
      // "Every term except the first" - so no promotion fee in the joining term.
      return term !== startingTerm;
    case 'LastTermOnly': {
      // The last term this component bills: the program's final term, or the one
      // `toTerm` narrows it to - a diploma fee due in semester 4 of a
      // four-semester course is not due again after it.
      const final = Math.min(totalTerms, component.toTerm ?? totalTerms);
      return term === final && final >= startingTerm;
    }
    default:
      return false;
  }
}

/** Work out the fee for every term of a template (§6.2 preview, §8 samples). */
export function computeTemplateTermFees(components: readonly FeeComponent[], input: TermFeesInput): TermFeesResult {
  const totalTerms = Math.trunc(input.totalTerms);
  const startingTerm = Math.max(1, Math.trunc(input.startingTerm ?? 1));
  const termsPerYear = Math.max(1, Math.trunc(input.termsPerYear));

  const terms: TermFee[] = [];
  if (totalTerms >= startingTerm) {
    for (let term = startingTerm; term <= totalTerms; term += 1) {
      const lines: TermFeeLine[] = [];
      for (const c of components) {
        if (c.amount <= 0) continue;
        if (!appliesToTerm(c, term, startingTerm, totalTerms, termsPerYear)) continue;
        lines.push({ componentId: c.id, name: c.name, amount: c.amount, refundable: c.refundable });
      }
      const total = lines.reduce((sum, l) => sum + l.amount, 0);
      const refundable = lines.filter((l) => l.refundable).reduce((sum, l) => sum + l.amount, 0);
      terms.push({ term, lines, total, refundable });
    }
  }

  return {
    terms,
    termTotals: terms.map((t) => t.total),
    courseTotal: terms.reduce((sum, t) => sum + t.total, 0),
    refundableTotal: terms.reduce((sum, t) => sum + t.refundable, 0),
    firstTermTotal: terms.length > 0 ? terms[0].total : 0,
  };
}
