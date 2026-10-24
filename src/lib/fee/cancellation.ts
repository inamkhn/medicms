// ============================================
// MediCMS Desktop - Fee engine: cancelling an admission (§27.3)
// The cancellation screen shows charges, concessions and payments, plus a suggested
// refund (`refund.ts`). This module turns those figures into what the ledger has to
// do: "unpaid charges are reversed", and what was paid towards refundable items
// comes back, so the student's books close level when they leave.
// ============================================

/** One billed charge as the cancellation screen sees it, net of concessions (§13.3). */
export interface CancellationCharge {
  chargeId: string;
  label: string;
  /** Still unpaid on the charge — reversed so the dues leave with the student. */
  unpaid: number;
  /** What payments put on the charge — reversed only as far as it is refunded. */
  paid: number;
  /** The refundable part of this charge, net (e.g. the security deposit, §5.2). */
  refundableNet: number;
  /** The part the student keeps paying — refunds are the money above this (§27.3). */
  nonRefundableNet: number;
}

/** One Reversal the cancellation posts, against the charge it cancels (§27.2). */
export interface CancellationReversal {
  chargeId: string;
  label: string;
  amount: number;
}

/**
 * §27.3: the ledger plan for a cancelled admission.
 *
 * Per charge the reversal is the **unpaid remainder** plus the **refund** attributed
 * to it — paid money only comes off once it is actually being returned. The refund
 * is laid first against refundable-paid capacity, oldest charge first; an Admin's
 * override above that continues against any paid money, so
 * `charges − payments − reversals + refund` closes at zero either way. A refund the
 * books cannot fund is left unassigned (the caller has already capped it at what
 * was paid), never invented.
 */
export function cancellationReversals(
  charges: readonly CancellationCharge[],
  refundAmount: number,
): CancellationReversal[] {
  let refundLeft = Math.max(0, Math.trunc(refundAmount));
  const extra = new Map<string, number>();

  // Pass 1: money that reached the refundable part of a charge.
  for (const charge of charges) {
    if (refundLeft <= 0) break;
    const capacity = Math.max(
      0,
      Math.min(Math.trunc(charge.refundableNet), Math.trunc(charge.paid) - Math.trunc(charge.nonRefundableNet)),
    );
    const used = Math.min(capacity, refundLeft);
    if (used > 0) {
      extra.set(charge.chargeId, used);
      refundLeft -= used;
    }
  }
  // Pass 2: an override beyond the refundable part comes off paid money anywhere.
  for (const charge of charges) {
    if (refundLeft <= 0) break;
    const already = extra.get(charge.chargeId) ?? 0;
    const capacity = Math.max(0, Math.trunc(charge.paid) - already);
    const used = Math.min(capacity, refundLeft);
    if (used > 0) {
      extra.set(charge.chargeId, already + used);
      refundLeft -= used;
    }
  }

  const rows: CancellationReversal[] = [];
  for (const charge of charges) {
    const amount = Math.max(0, Math.trunc(charge.unpaid)) + (extra.get(charge.chargeId) ?? 0);
    if (amount > 0) rows.push({ chargeId: charge.chargeId, label: charge.label, amount });
  }
  return rows;
}
