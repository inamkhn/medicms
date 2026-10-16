// ============================================
// MediCMS Desktop - Fee engine: cancelling an admission (§27.3)
// The cancellation screen shows charges, concessions and payments, plus a suggested
// refund. Payments are treated as paying the non-refundable items first, so only
// what was paid towards refundable items comes back.
// ============================================

/** One charged line as the student actually owes it - net of concessions (§13.3). */
export interface RefundLine {
  name: string;
  net: number;
  /** Marked Refundable in the template, e.g. the security deposit (§5.2). */
  refundable: boolean;
}

export interface RefundInput {
  /** Total the student has paid so far. */
  paid: number;
  lines: readonly RefundLine[];
}

const sum = (lines: readonly RefundLine[]): number =>
  lines.reduce((total, line) => total + Math.max(0, line.net), 0);

/**
 * §27.3 - suggested refund = amount paid minus the non-refundable charges, never
 * below zero and never more than the refundable part. Any credit above that is
 * refunded as credit through the refund entry (§27.4), not here.
 */
export function suggestRefund({ paid, lines }: RefundInput): number {
  const refundableTotal = sum(lines.filter((line) => line.refundable));
  const nonRefundableTotal = sum(lines.filter((line) => !line.refundable));
  const towardsRefundable = Math.trunc(paid) - nonRefundableTotal;
  return Math.max(0, Math.min(towardsRefundable, refundableTotal));
}
