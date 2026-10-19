// ============================================
// MediCMS Desktop — Staff & Payroll: identifier tests (§4, §14, §19, §55, §64)
// Numbers are minted, monotonic within their series and never reused. Pure, no
// DOM, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, throws } from 'node:assert/strict';

import {
  nextAdvanceNo,
  nextBatchNo,
  nextRunNumber,
  nextStaffNo,
  serviceMonthOf,
} from './types.ts';

describe('staff and advance numbers never repeat (§4, §14)', () => {
  it('starts each series at the padded one', () => {
    equal(nextStaffNo([]), 'ST-0001');
    equal(nextAdvanceNo([]), 'ADV-0001');
  });

  it('counts up from the highest already issued, not the count', () => {
    // A deleted-then-marked-Left record leaves its number behind — never reused.
    equal(nextStaffNo([{ staffNo: 'ST-0042' }, { staffNo: 'ST-0003' }]), 'ST-0043');
    equal(nextAdvanceNo([{ advanceNo: 'ADV-0009' }, { advanceNo: 'ADV-0041' }]), 'ADV-0042');
  });

  it('ignores anything that is not a clean number of its own series', () => {
    equal(nextStaffNo([{ staffNo: 'ST-abc' }, { staffNo: 'ST-0007' }]), 'ST-0008');
  });
});

describe('payroll run numbers (§19)', () => {
  it('gives the first run of a month the standard 01', () => {
    equal(nextRunNumber('2026-10', []), 'PAY-2026-10-01');
  });

  it('numbers a supplemental after the standard already in that month', () => {
    const monthRuns = [{ runNumber: 'PAY-2026-10-01' }];
    equal(nextRunNumber('2026-10', monthRuns), 'PAY-2026-10-02');
  });

  it('is scoped to its own service month', () => {
    // October is taken up to 02; November still starts clean at 01.
    const existing = [{ runNumber: 'PAY-2026-10-01' }, { runNumber: 'PAY-2026-10-02' }];
    equal(nextRunNumber('2026-11', existing), 'PAY-2026-11-01');
    equal(nextRunNumber('2026-10', existing), 'PAY-2026-10-03');
  });

  it('refuses a month that is not YYYY-MM', () => {
    throws(() => nextRunNumber('2026-10-01', []), /service month is YYYY-MM/);
  });
});

describe('payout batch numbers (§55)', () => {
  it('starts a month at 001 and continues in that month only', () => {
    equal(nextBatchNo('2026-10', []), 'PB-202610-001');
    const oct = [{ batchNo: 'PB-202610-001' }, { batchNo: 'PB-202610-002' }];
    equal(nextBatchNo('2026-10', oct), 'PB-202610-003');
    equal(nextBatchNo('2026-11', oct), 'PB-202611-001');
  });
});

describe('§60 Settings prefixes feed the minters without restarting old sequences', () => {
  it('mints under a custom prefix, keeping the highest trailing number', () => {
    equal(nextStaffNo([{ staffNo: 'ST-0042' }], 'EMP-'), 'EMP-0043');
    // A stored prefix without its dash still mints with exactly one.
    equal(nextAdvanceNo([{ advanceNo: 'ADV-0009' }], 'SV'), 'SV-0010');
  });

  it('falls back to the design default when the stored prefix is blank', () => {
    equal(nextStaffNo([], '  '), 'ST-0001');
    equal(nextRunNumber('2026-10', [], ''), 'PAY-2026-10-01');
    equal(nextBatchNo('2026-10', [], '   '), 'PB-202610-001');
  });

  it('scopes the run and batch series to their own prefix and month', () => {
    equal(nextRunNumber('2026-10', [{ runNumber: 'PAY-2026-10-02' }], 'PR-'), 'PR-2026-10-01');
    equal(nextBatchNo('2026-10', [{ batchNo: 'PB-202610-004' }], 'BATCH'), 'BATCH-202610-001');
    equal(nextRunNumber('2026-10', [{ runNumber: 'PAY-2026-10-02' }], 'PAY-'), 'PAY-2026-10-03');
  });
});

describe('the service month a dated record falls in (§19)', () => {
  it('takes YYYY-MM from a full date', () => {
    equal(serviceMonthOf('2026-10-06'), '2026-10');
  });

  it('refuses a date that is not YYYY-MM-DD', () => {
    throws(() => serviceMonthOf('2026-10'), /payroll date must be YYYY-MM-DD/);
  });
});
