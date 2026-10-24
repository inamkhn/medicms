// ============================================
// Tests for the cancellation plan (§27.3) - the cases the design doc's table gives,
// plus the refund override an Admin is allowed to make.
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';
import { cancellationReversals, type CancellationCharge } from './cancellation.ts';

/** Ayesha's Term 1 charge: 53,000 net after concessions; 10,000 of it is the security. */
const ayesha = (paid: number): CancellationCharge => ({
  chargeId: 'e-1-1',
  label: 'Term 1',
  unpaid: 53_000 - paid,
  paid,
  refundableNet: 10_000,
  nonRefundableNet: 43_000,
});

describe('cancelling an admission (§27.3)', () => {
  it('reverses the unpaid remainder when nothing was paid towards refundable items', () => {
    // §28 case 17: paid 30,000 of 53,000 - refund 0, and "23,000 unpaid is reversed".
    deepStrictEqual(cancellationReversals([ayesha(30_000)], 0), [
      { chargeId: 'e-1-1', label: 'Term 1', amount: 23_000 },
    ]);
  });

  it('reverses the refunded security deposit when the fee was paid in full', () => {
    // Paid 53,000, non-refundable 43,000 -> refund 10,000, taken off the same charge
    // so the books close at zero.
    deepStrictEqual(cancellationReversals([ayesha(53_000)], 10_000), [
      { chargeId: 'e-1-1', label: 'Term 1', amount: 10_000 },
    ]);
  });

  it('carries an Admin override above the refundable part onto paid money', () => {
    // An Admin may raise the refund past the refundable 10,000; the extra still has
    // to come off the charge or the ledger would not balance.
    deepStrictEqual(cancellationReversals([ayesha(53_000)], 15_000), [
      { chargeId: 'e-1-1', label: 'Term 1', amount: 15_000 },
    ]);
  });

  it('lays the refund across charges in order, oldest first', () => {
    const charges: CancellationCharge[] = [
      { chargeId: 'e-1-1', label: 'Term 1', unpaid: 4_000, paid: 6_000, refundableNet: 1_000, nonRefundableNet: 9_000 },
      { chargeId: 'e-1-2', label: 'Term 2', unpaid: 5_000, paid: 33_000, refundableNet: 0, nonRefundableNet: 38_000 },
    ];
    // 12,000 refund: 1,000 of Term 1's refundable money, the rest off paid money
    // oldest first (5,000 still in Term 1, 6,000 in Term 2), so each charge is
    // reversed by its unpaid remainder plus the refund it carries.
    deepStrictEqual(cancellationReversals(charges, 12_000), [
      { chargeId: 'e-1-1', label: 'Term 1', amount: 10_000 },
      { chargeId: 'e-1-2', label: 'Term 2', amount: 11_000 },
    ]);
  });

  it('posts nothing when there is neither a due nor a refund', () => {
    deepStrictEqual(
      cancellationReversals(
        [{ chargeId: 'e-1-1', label: 'Term 1', unpaid: 0, paid: 43_000, refundableNet: 0, nonRefundableNet: 43_000 }],
        0,
      ),
      [],
    );
  });

  it('never invents money the books cannot fund', () => {
    // A refund larger than anything paid is left unassigned, not turned into credit.
    const rows = cancellationReversals([ayesha(2_000)], 10_000);
    equal(rows.reduce((sum, row) => sum + row.amount, 0), 53_000 - 2_000 + 2_000);
    // unpaid 51,000 + funded 2,000 - the 8,000 the books do not hold is not posted.
    deepStrictEqual(rows, [{ chargeId: 'e-1-1', label: 'Term 1', amount: 53_000 }]);
  });
});
