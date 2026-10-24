// ============================================
// MediCMS Desktop — Allocation preview tests (§15, §19, §21)
// The §19 sample walk-through: Bilal pays 25,000 against Term 2 (17,000) and
// Term 3 (61,000) and the preview must show 17,000 → 0 and 61,000 → 53,000.
// Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import type { PostedCharge } from '../fee/types.ts';
import { previewAllocation } from './preview.ts';

function charge(id: string, term: number, amount: number, dueDate: string, allocated = 0): PostedCharge {
  return { id, term, label: `Term ${term} fee`, amount, dueDate, allocated };
}

const BILAL: PostedCharge[] = [
  charge('t2', 2, 17_000, '2026-05-15'),
  charge('t3', 3, 61_000, '2026-09-15'),
];

describe('allocation preview (§15 oldest first)', () => {
  it('matches the §19 walk-through', () => {
    const preview = previewAllocation(BILAL, 25_000);
    deepStrictEqual(
      preview.rows.map((row) => [row.chargeId, row.unpaidBefore, row.allocated, row.unpaidAfter]),
      [
        ['t2', 17_000, 17_000, 0],
        ['t3', 61_000, 8_000, 53_000],
      ],
    );
    equal(preview.allocated, 25_000);
    equal(preview.credit, 0);
    equal(preview.dues, 78_000);
  });

  it('reports the credit when the amount is above everything owed', () => {
    const preview = previewAllocation(BILAL, 80_000);
    equal(preview.allocated, 78_000);
    equal(preview.credit, 2_000);
    equal(preview.rows.length, 2);
  });

  it('shows no rows and all credit when there are no dues', () => {
    const preview = previewAllocation([], 5_000);
    deepStrictEqual(preview.rows, []);
    equal(preview.allocated, 0);
    equal(preview.credit, 5_000);
    equal(preview.dues, 0);
  });

  it('pays one named charge instead of sweeping (§25.1)', () => {
    const preview = previewAllocation(BILAL, 5_000, { chargeId: 't3' });
    deepStrictEqual(
      preview.rows.map((row) => [row.chargeId, row.allocated, row.unpaidAfter]),
      [['t3', 5_000, 56_000]],
    );
  });

  it('starts from what is already paid on a charge', () => {
    const charges = [charge('t2', 2, 17_000, '2026-05-15', 10_000), charge('t3', 3, 61_000, '2026-09-15')];
    const preview = previewAllocation(charges, 10_000);
    deepStrictEqual(
      preview.rows.map((row) => [row.chargeId, row.unpaidBefore, row.allocated, row.unpaidAfter]),
      [
        ['t2', 7_000, 7_000, 0],
        ['t3', 61_000, 3_000, 58_000],
      ],
    );
    equal(preview.dues, 68_000);
    equal(preview.unpaidByCharge.t3, 58_000);
  });

  it('ignores a negative or decimal amount without throwing', () => {
    equal(previewAllocation(BILAL, -100).credit, 0);
    equal(previewAllocation(BILAL, 2_500.9).total, 2_500);
  });
});
