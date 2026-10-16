// ============================================
// MediCMS Desktop - Fee engine: changing a plan after admission (§26)
// §26.2 - the charge already posted is never rewritten or deleted. Terms not yet
// billed simply take the new figure; billed terms get a visible adjustment entry
// that the operator confirms.
// ============================================

import type { PostedCharge } from './types.ts';

/** One term's corrected fee, as produced by the concession calculator (§13). */
export interface NewTermFee {
  term: number;
  /** Net of the student's concessions. */
  total: number;
}

export interface PlanChangeAdjustment {
  chargeId: string;
  term: number;
  /** Negative when the corrected fee is lower than the charge already posted. */
  amount: number;
  reason: string;
  /** What stays unpaid on that charge once the adjustment is confirmed. */
  unpaidAfter: number;
  /** §26.2 - a paid term that becomes overpaid turns the difference into credit. */
  creditAfter: number;
}

export interface UpcomingTermFee {
  term: number;
  total: number;
}

export interface PlanChangeResult {
  /** Visible entries to post against charges that are already out. */
  adjustments: PlanChangeAdjustment[];
  /** Terms that have not been billed yet - they will use the new figure. */
  upcoming: UpcomingTermFee[];
}

/**
 * Work out the effect of a plan change from `effectiveFromTerm`, so the review
 * table (§26.1 step 3) can show each term before and after before anything is saved.
 */
export function planChangeAdjustments(
  postedCharges: readonly PostedCharge[],
  newTermFees: readonly NewTermFee[],
  effectiveFromTerm: number,
  reason: string,
): PlanChangeResult {
  const adjustments: PlanChangeAdjustment[] = [];
  const upcoming: UpcomingTermFee[] = [];
  const fromTerm = Math.trunc(effectiveFromTerm);

  for (const fee of newTermFees) {
    if (fee.term < fromTerm) continue;
    const charge = postedCharges.find((c) => c.term === fee.term);
    if (!charge) {
      upcoming.push({ term: fee.term, total: fee.total });
      continue;
    }

    const amount = fee.total - charge.amount;
    if (amount === 0) continue;

    const corrected = Math.max(0, charge.amount + amount);
    const paid = charge.allocated ?? 0;
    adjustments.push({
      chargeId: charge.id,
      term: fee.term,
      amount,
      reason,
      unpaidAfter: Math.max(0, corrected - paid),
      creditAfter: Math.max(0, paid - corrected),
    });
  }

  return { adjustments, upcoming };
}
