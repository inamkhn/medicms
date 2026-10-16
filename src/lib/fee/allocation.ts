// ============================================
// MediCMS Desktop - Fee engine: payment allocation (§25)
// "A payment must say which fee charge it pays" - without that the profile cannot
// show how much of each term is paid, and ageing cannot be computed.
// ============================================

import type { Allocation, PostedCharge } from './types.ts';

/** What is still owing on a charge after the payments allocated to it (§25.1). */
export function unpaidOf(charge: PostedCharge): number {
  return Math.max(0, charge.amount - (charge.allocated ?? 0));
}

export interface AllocateResult {
  /** One row per charge the payment touched, in the order it paid them. */
  allocations: Allocation[];
  applied: number;
  /** §25.1 - a payment larger than everything owed leaves the extra as credit. */
  credit: number;
  /** Copies of the charges with `allocated` updated, original order preserved. */
  charges: PostedCharge[];
  unpaidByCharge: Record<string, number>;
}

/** Oldest first: due date, then term, then id - the §25.1 default. */
function byOldest(a: PostedCharge, b: PostedCharge): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.term !== b.term) return a.term - b.term;
  return a.id < b.id ? -1 : 1;
}

/**
 * Spend `amount` on the given charges. Pass `{ chargeId }` to pay one specific fee
 * charge instead of the default oldest-first sweep (§25.1).
 */
export function allocatePayment(
  charges: readonly PostedCharge[],
  amount: number,
  options?: { chargeId?: string },
): AllocateResult {
  const payment = Math.max(0, Math.trunc(amount));
  const allocated = new Map<string, number>(charges.map((c) => [c.id, c.allocated ?? 0]));
  const allocations: Allocation[] = [];

  const targets = options?.chargeId
    ? charges.filter((c) => c.id === options.chargeId).sort(byOldest)
    : [...charges].sort(byOldest);

  let left = payment;
  for (const charge of targets) {
    if (left <= 0) break;
    const current = allocated.get(charge.id) ?? 0;
    const owing = Math.max(0, charge.amount - current);
    if (owing === 0) continue;
    const used = Math.min(owing, left);
    allocated.set(charge.id, current + used);
    allocations.push({ chargeId: charge.id, amount: used });
    left -= used;
  }

  const applied = payment - left;

  return {
    allocations,
    applied,
    credit: left,
    charges: charges.map((c) => ({ ...c, allocated: allocated.get(c.id) ?? 0 })),
    unpaidByCharge: Object.fromEntries(
      charges.map((c) => [c.id, Math.max(0, c.amount - (allocated.get(c.id) ?? 0))]),
    ),
  };
}

/**
 * §25.1 - when the next fee charge is posted, any credit is applied to it
 * automatically and the movement is audited by the caller.
 */
export function applyCreditToCharge(
  credit: number,
  charge: PostedCharge,
): { applied: number; remainingCredit: number; charge: PostedCharge } {
  const available = Math.max(0, Math.trunc(credit));
  const applied = Math.min(available, unpaidOf(charge));
  return {
    applied,
    remainingCredit: available - applied,
    charge: { ...charge, allocated: (charge.allocated ?? 0) + applied },
  };
}

/**
 * §27.1 - voiding a receipt releases its allocation, so the fee charge shows unpaid
 * again. The reversal entry itself belongs to the ledger layer.
 */
export function releaseAllocation(
  charges: readonly PostedCharge[],
  allocations: readonly Allocation[],
): PostedCharge[] {
  const released = new Map<string, number>();
  for (const a of allocations) {
    released.set(a.chargeId, (released.get(a.chargeId) ?? 0) + a.amount);
  }
  return charges.map((c) => {
    const back = released.get(c.id);
    if (!back) return { ...c };
    return { ...c, allocated: Math.max(0, (c.allocated ?? 0) - back) };
  });
}
