// ============================================
// MediCMS Desktop — Payments: allocation preview (§15, §19 step 3)
//
// §15 "Show the preview, and allocate oldest first." §51.2 prints the preview as
// one row per charge — unpaid before, what this payment puts on it, unpaid after —
// plus the credit that could not be placed. The rows come from the same
// `allocatePayment` the save uses, so "the allocation preview matches what is
// saved" (§21) is a property of the code, not of care.
// ============================================

import { allocatePayment } from '../fee/allocation.ts';
import type { PostedCharge } from '../fee/types.ts';

/** One charge line of §51.2: what it owed, what this payment took, what is left. */
export interface AllocationRow {
  chargeId: string;
  label: string;
  dueDate: string;
  unpaidBefore: number;
  allocated: number;
  unpaidAfter: number;
}

export interface AllocationPreview {
  /** One row per charge the payment touched, oldest first (§15). */
  rows: AllocationRow[];
  /** Rupees placed on a charge; `total - allocated` is the credit. */
  total: number;
  allocated: number;
  /** §17 "This leaves 5,000 as credit." */
  credit: number;
  /** Everything owed before this payment — the §17 over-payment line. */
  dues: number;
  /** Unpaid per charge after the payment, for the charges the screen lists. */
  unpaidByCharge: Record<string, number>;
}

/**
 * Lay out `amount` across `charges` without changing anything. Pass `{ chargeId }`
 * to preview paying one specific charge instead of the oldest-first sweep (§15).
 */
export function previewAllocation(
  charges: readonly PostedCharge[],
  amount: number,
  options?: { chargeId?: string },
): AllocationPreview {
  const result = allocatePayment(charges, amount, options);
  const byId = new Map(charges.map((charge) => [charge.id, charge]));

  const rows: AllocationRow[] = [];
  for (const allocation of result.allocations) {
    const charge = byId.get(allocation.chargeId);
    if (!charge) continue;
    const unpaidBefore = Math.max(0, charge.amount - (charge.allocated ?? 0));
    rows.push({
      chargeId: charge.id,
      label: charge.label,
      dueDate: charge.dueDate,
      unpaidBefore,
      allocated: allocation.amount,
      unpaidAfter: Math.max(0, unpaidBefore - allocation.amount),
    });
  }

  return {
    rows,
    total: Math.max(0, Math.trunc(amount)),
    allocated: result.applied,
    credit: result.credit,
    dues: charges.reduce(
      (sum, charge) => sum + Math.max(0, charge.amount - (charge.allocated ?? 0)),
      0,
    ),
    unpaidByCharge: result.unpaidByCharge,
  };
}
