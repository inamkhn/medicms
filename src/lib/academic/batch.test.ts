// ============================================
// MediCMS Desktop — Academic core: batch naming / status / seats tests
// §16-§19, §45 cases 1-3 + the seat/status halves of 11 & 18. Run: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import {
  batchDisplayName,
  deriveRunningStatus,
  isBatchFull,
  isDuplicateBatchName,
  seatCountProblem,
  seatsPercent,
} from './batch.ts';

const TODAY = '2026-10-09';

describe('display name (§45 cases 1-2)', () => {
  it('code + name + session when named', () => {
    equal(batchDisplayName('BSN', 'Fall', 2026), 'BSN Fall 2026');
  });
  it('code + session when the name is empty', () => {
    equal(batchDisplayName('LHV', '', 2025), 'LHV 2025');
    equal(batchDisplayName('LHV', '   ', 2025), 'LHV 2025');
  });
});

describe('name uniqueness (§45 case 3)', () => {
  const existing = [
    { id: 'b1', programId: 'bsn', session: 2026, name: 'Fall' },
    { id: 'b2', programId: 'lhv', session: 2026, name: 'Fall' },
  ];
  it('blocks a second, case-insensitive "fall" for the same program + session', () => {
    ok(isDuplicateBatchName(existing, { programId: 'bsn', session: 2026, name: 'fall' }));
  });
  it('allows the same name for another program or session', () => {
    equal(isDuplicateBatchName(existing, { programId: 'rad', session: 2026, name: 'Fall' }), false);
    equal(isDuplicateBatchName(existing, { programId: 'bsn', session: 2027, name: 'Fall' }), false);
  });
  it('ignores the batch being edited itself (rename keeps its own id)', () => {
    equal(
      isDuplicateBatchName(existing, { id: 'b1', programId: 'bsn', session: 2026, name: 'Autumn' }),
      false,
    );
  });
});

describe('running status (§45 case 11)', () => {
  it('is Planned while Term 1 is unset or in the future', () => {
    equal(deriveRunningStatus(null, TODAY), 'Planned');
    equal(deriveRunningStatus('2027-01-01', TODAY), 'Planned');
  });
  it('is Running once the Term 1 start has arrived', () => {
    equal(deriveRunningStatus('2026-09-01', TODAY), 'Running');
  });
});

describe('seats (§45 case 18)', () => {
  it('rejects fewer seats than already admitted', () => {
    equal(seatCountProblem(40, 50), 'Seats cannot be fewer than the 50 students already admitted.');
  });
  it('accepts null (unset) or a count at or above the admitted total', () => {
    equal(seatCountProblem(null, 50), null);
    equal(seatCountProblem(50, 50), null);
    equal(seatCountProblem(60, 50), null);
  });
  it('rejects a fractional seat count', () => {
    equal(seatCountProblem(12.5, 0), 'Seats must be a whole number.');
  });
  it('full and meter percentage', () => {
    deepStrictEqual(
      { full50: isBatchFull(50, 50), fullOpen: isBatchFull(null, 50), pct: seatsPercent(50, 41) },
      { full50: true, fullOpen: false, pct: 82 },
    );
  });
});
