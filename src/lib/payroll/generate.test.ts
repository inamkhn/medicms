// ============================================
// MediCMS Desktop — Staff & Payroll: generation helper tests (§11, §19–§20).
// Pure, no DOM, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, deepEqual } from 'node:assert/strict';

import type { Advance, PayStructure, Staff, WorkInput } from './types.ts';
import { buildEarnedItems, generateRunDraft, nextRunId, recoveryRequestForMonth } from './generate.ts';

function structure(over: Partial<PayStructure>): PayStructure {
  return {
    id: 'ps-0001',
    staffId: 'st-1',
    type: 'Fixed monthly',
    revision: 1,
    effectiveFrom: '2026-01-01',
    createdBy: 'Admin',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const fullStaff: Pick<Staff, 'staffType' | 'joiningDate' | 'leavingDate'> = {
  staffType: 'Teaching',
  joiningDate: '2025-01-01',
};

function input(over: Partial<WorkInput>): WorkInput {
  return {
    id: 'wi-0001',
    staffId: 'st-1',
    serviceMonth: '2026-10',
    type: 'Session',
    state: 'Verified',
    createdBy: 'Admin',
    createdAt: '2026-10-01T00:00:00Z',
    ...over,
  };
}

describe('buildEarnedItems — fixed monthly base (§10.2)', () => {
  it('pays the full base for a whole month of service and adds allowance defaults', () => {
    const items = buildEarnedItems({
      lineId: 'L',
      month: '2026-10',
      structure: structure({
        monthlyBase: 60000,
        allowanceDefaults: [{ label: 'House rent', amount: 10000 }, { label: 'Prorated cell', amount: 3000, followsBaseProration: true }],
      }),
      staff: fullStaff,
      workInputs: [],
    });
    equal(items.find((i) => i.component === 'Base')?.amount, 60000);
    equal(items.find((i) => i.reason === 'House rent')?.amount, 10000);
    equal(items.find((i) => i.reason === 'Prorated cell')?.amount, 3000);
    equal(items.filter((i) => i.component === 'Allowance').length, 2);
  });

  it('prorates the base to eligible calendar days (§65 t7)', () => {
    const items = buildEarnedItems({
      lineId: 'L',
      month: '2026-10',
      structure: structure({ monthlyBase: 30000, effectiveFrom: '2026-10-16' }),
      staff: fullStaff,
      workInputs: [],
    });
    // Oct has 31 days; 16–31 is 16 eligible days → 30000 × 16 / 31 = 15484 (halves up).
    equal(items.find((i) => i.component === 'Base')?.amount, 15484);
  });
});

describe('buildEarnedItems — work inputs are honoured only when Verified (§11 step 6)', () => {
  it('counts a verified session but ignores a draft one', () => {
    const items = buildEarnedItems({
      lineId: 'L',
      month: '2026-10',
      structure: structure({ type: 'Per session', monthlyBase: undefined, ratePerSession: 2000 }),
      staff: { ...fullStaff, staffType: 'Visiting faculty' },
      workInputs: [input({ id: 'w1', type: 'Session', units: 10 }), input({ id: 'w2', type: 'Session', units: 5, state: 'Draft' })],
    });
    const session = items.find((i) => i.component === 'Session');
    equal(session?.amount, 20000);
    equal(items.length, 1);
  });

  it('a fixed honorarium is paid by the structure; a per-unit one by the verified input', () => {
    const fixed = buildEarnedItems({
      lineId: 'L',
      month: '2026-10',
      structure: structure({ type: 'Honorarium', monthlyBase: undefined, honorariumFixed: 15000 }),
      staff: { ...fullStaff, staffType: 'Clinical instructor/doctor' },
      workInputs: [input({ type: 'Honorarium', units: 3 })],
    });
    equal(fixed.find((i) => i.component === 'Honorarium')?.amount, 15000);
    equal(fixed.length, 1);

    const perUnit = buildEarnedItems({
      lineId: 'L',
      month: '2026-10',
      structure: structure({ type: 'Honorarium', monthlyBase: undefined, ratePerSession: 5000 }),
      staff: { ...fullStaff, staffType: 'Clinical instructor/doctor' },
      workInputs: [input({ type: 'Honorarium', units: 3 })],
    });
    equal(perUnit.find((i) => i.component === 'Honorarium')?.amount, 15000);
  });
});

describe('buildEarnedItems — reductions need an entered amount, not an inference (§9)', () => {
  it('an unpaid-leave input with an amount becomes a Reduction; a dated-only one becomes nothing', () => {
    const withAmount = buildEarnedItems({
      lineId: 'L',
      month: '2026-10',
      structure: structure({ monthlyBase: 30000 }),
      staff: fullStaff,
      workInputs: [input({ type: 'Unpaid leave', amount: 1000, reason: '2 days absent' })],
    });
    equal(withAmount.find((i) => i.component === 'Reduction')?.amount, 1000);

    const datedOnly = buildEarnedItems({
      lineId: 'L',
      month: '2026-10',
      structure: structure({ monthlyBase: 30000 }),
      staff: fullStaff,
      workInputs: [input({ type: 'Unpaid leave', amount: undefined, fromDate: '2026-10-05', toDate: '2026-10-06' })],
    });
    equal(datedOnly.find((i) => i.component === 'Reduction'), undefined);
  });

  it('paid leave carries no money', () => {
    const items = buildEarnedItems({
      lineId: 'L',
      month: '2026-10',
      structure: structure({ monthlyBase: 30000 }),
      staff: fullStaff,
      workInputs: [input({ type: 'Paid leave', amount: 500 })],
    });
    equal(items.filter((i) => i.component === 'Reduction').length, 0);
    equal(items.filter((i) => i.component === 'Allowance').length, 0);
  });
});

describe('buildEarnedItems — cost category and ids', () => {
  it('falls back to the staff-type default category and derives stable item ids', () => {
    const items = buildEarnedItems({
      lineId: 'pr-0001~st-1',
      month: '2026-10',
      structure: structure({ monthlyBase: 1000 }),
      staff: { ...fullStaff, staffType: 'Support' },
      workInputs: [],
    });
    equal(items[0]?.costCategory, 'Salaries: Support');
    equal(items[0]?.id, 'pr-0001~st-1~Base~0');
  });

  it('honours an explicit structure cost category over the default', () => {
    const items = buildEarnedItems({
      lineId: 'L',
      month: '2026-10',
      structure: structure({ monthlyBase: 1000, costCategory: 'Salaries: Teaching' }),
      staff: { ...fullStaff, staffType: 'Support' },
      workInputs: [],
    });
    equal(items[0]?.costCategory, 'Salaries: Teaching');
  });
});

describe('recoveryRequestForMonth — policy drives the ask, capped later (§10.5)', () => {
  function adv(over: Partial<Advance>): Advance {
    return {
      id: 'ad-1',
      advanceNo: 'ADV-0001',
      staffId: 'st-1',
      requestedAmount: 50000,
      reason: 'medical',
      status: 'Active',
      recoveryPolicy: 'Fixed per month',
      fixedRecoveryAmount: 10000,
      startRecoveryMonth: '2026-09',
      createdBy: 'Admin',
      createdAt: '2026-09-01T00:00:00Z',
      ...over,
    };
  }

  it('fixed policy asks its fixed amount, bounded by the balance', () => {
    equal(recoveryRequestForMonth(adv({}), 50000, '2026-10'), 10000);
    equal(recoveryRequestForMonth(adv({}), 4000, '2026-10'), 4000);
  });
  it('remaining-in-full asks the whole balance; manual asks nothing', () => {
    equal(recoveryRequestForMonth(adv({ recoveryPolicy: 'Remaining in full', fixedRecoveryAmount: undefined }), 32000, '2026-10'), 32000);
    equal(recoveryRequestForMonth(adv({ recoveryPolicy: 'Manual per run', fixedRecoveryAmount: undefined }), 32000, '2026-10'), 0);
  });
  it('nothing before the start month and nothing at zero balance', () => {
    equal(recoveryRequestForMonth(adv({ startRecoveryMonth: '2026-11' }), 50000, '2026-10'), 0);
    equal(recoveryRequestForMonth(adv({}), 0, '2026-10'), 0);
  });
});

describe('nextRunId mints a monotonic pr-#### (§19)', () => {
  it('starts at 0001 and counts from the highest issued', () => {
    equal(nextRunId([]), 'pr-0001');
    deepEqual(nextRunId([{ id: 'pr-0003' }, { id: 'pr-0012' }]), 'pr-0013');
    equal(nextRunId([{ id: 'not-a-series' }]), 'pr-0001');
  });
});

function staff(over: Partial<Staff>): Staff {
  return {
    id: 'st-1',
    staffNo: 'ST-0001',
    fullName: 'Sara Ahmed',
    staffType: 'Teaching',
    designation: 'Lecturer',
    programIds: [],
    joiningDate: '2025-01-01',
    employmentStatus: 'Active',
    employmentMode: 'Regular',
    createdBy: 'Admin',
    createdAt: '2025-01-01T00:00:00Z',
    ...over,
  };
}

describe('generateRunDraft — assemble a whole Draft run (§11, §19)', () => {
  it('builds one frozen line per eligible staff and leaves totals undefined', () => {
    const { bundle, missingStructure } = generateRunDraft({
      runId: 'pr-0001',
      runNumber: 'PAY-2026-10-01',
      month: '2026-10',
      kind: 'Standard',
      staff: [staff({})],
      structures: [structure({ staffId: 'st-1', monthlyBase: 60000, allowanceDefaults: [{ label: 'House', amount: 2000 }] })],
      workInputs: [],
      advances: [],
      advanceEvents: [],
      actor: 'Admin',
      now: '2026-11-01T00:00:00Z',
    });
    equal(missingStructure.length, 0);
    equal(bundle.lines.length, 1);
    equal(bundle.run.calculationState, 'Draft');
    equal(bundle.run.totals, undefined);
    equal(bundle.lines[0]?.gross, 62000);
    equal(bundle.lines[0]?.net, 62000);
    equal(bundle.recoveries.length, 0);
  });

  it('reports staff who span the month with no structure and plans an advance recovery', () => {
    const advance: Advance = {
      id: 'adv-1', advanceNo: 'ADV-0001', staffId: 'st-2', requestedAmount: 30000, approvedAmount: 30000,
      reason: 'medical', status: 'Active', recoveryPolicy: 'Fixed per month', fixedRecoveryAmount: 10000,
      startRecoveryMonth: '2026-09', paymentDate: '2026-09-05', createdBy: 'Admin', createdAt: '2026-09-01T00:00:00Z',
    };
    const event = { id: 'ae-1', advanceId: 'adv-1', kind: 'Disbursed' as const, amount: 30000, date: '2026-09-05' };
    const { bundle, missingStructure } = generateRunDraft({
      runId: 'pr-0002',
      runNumber: 'PAY-2026-10-01',
      month: '2026-10',
      kind: 'Standard',
      staff: [staff({ id: 'st-2', staffNo: 'ST-0002' }), staff({ id: 'st-9', staffNo: 'ST-0009', fullName: 'No Structure' })],
      structures: [structure({ id: 'ps-2', staffId: 'st-2', monthlyBase: 50000 })],
      workInputs: [],
      advances: [advance],
      advanceEvents: [event],
      actor: 'Admin',
      now: '2026-11-01T00:00:00Z',
    });
    deepEqual(missingStructure, ['st-9']);
    const line = bundle.lines.find((l) => l.staffId === 'st-2');
    equal(line?.gross, 50000);
    equal(line?.recoveries, 10000);
    equal(line?.net, 40000);
    equal(bundle.recoveries.length, 1);
    equal(bundle.recoveries[0]?.advanceId, 'adv-1');
  });
});
