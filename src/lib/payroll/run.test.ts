// ============================================
// MediCMS Desktop — Staff & Payroll: payroll run tests (§19–§22, §65)
// Eligibility, line build, the approve/reversal posting contract, concurrency
// and the month-close check. A run decides what is owed and moves no money —
// nothing here produces a MoneyEntry. Pure, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, notEqual } from 'node:assert/strict';

import {
  approvePayrollRun,
  buildPayrollLine,
  computeRunTotals,
  defaultSalaryCategory,
  monthClosePayrollStatus,
  resolveEligibility,
  reversePayrollRun,
  serviceMonthBounds,
} from './run.ts';
import type { ApprovalContext, DraftBundle } from './run.ts';
import type { PayrollLine, PayrollLineItem, PayrollRun, PayStructure, Staff } from './types.ts';

function item(component: PayrollLineItem['component'], amount: number): PayrollLineItem {
  return { id: `it-${component}-${amount}`, component, amount, costCategory: 'Salaries: Teaching' };
}

function fixedStructure(over: Partial<PayStructure> = {}): PayStructure {
  return {
    id: 'ps-1', staffId: 'st-1', type: 'Fixed monthly', monthlyBase: 60000, revision: 1,
    effectiveFrom: '2026-01-01', createdBy: 'a', createdAt: 't', ...over,
  } as PayStructure;
}

function makeLine(over: Partial<PayrollLine>): PayrollLine {
  return {
    id: 'l-1', runId: 'r-1', staffId: 'st-1',
    snapshot: { structureId: 'ps-1', revision: 1, type: 'Fixed monthly', monthlyBase: 60000, costCategory: 'Salaries: Teaching' },
    items: [], gross: 0, recoveries: 0, net: 0, ...over,
  };
}

function makeRun(over: Partial<PayrollRun>): PayrollRun {
  return {
    id: 'r-1', runNumber: 'PAY-2026-10-01', serviceMonth: '2026-10', kind: 'Standard',
    calculationState: 'Draft', disbursementState: 'Unpaid', revision: 1,
    costPostingIds: [], payoutBatchIds: [], createdBy: 'a', createdAt: 't', ...over,
  };
}

function ctx(over: Partial<ApprovalContext> = {}): ApprovalContext {
  return {
    actor: 'admin', timestamp: '2026-11-05T09:00:00', approvalDate: '2026-11-05',
    existingApprovedStandardRun: false, closedMonths: [], missingStructureStaffIds: [], unverifiedInputStaffIds: [], ...over,
  };
}

describe('service-month bounds and eligibility (§4.8, §10.2)', () => {
  it('bounds a 31-day month', () => {
    deepStrictEqual(serviceMonthBounds('2026-10'), { start: '2026-10-01', end: '2026-10-31', days: 31 });
  });

  it('pairs each employed staff with the structure in force, and lists gaps (§65 t21 spirit)', () => {
    const staff = [
      { id: 'st-1', joiningDate: '2026-01-01', employmentStatus: 'Active' },
      { id: 'st-2', joiningDate: '2026-01-01', employmentStatus: 'Active' },
      { id: 'st-3', joiningDate: '2025-01-01', leavingDate: '2026-06-30', employmentStatus: 'Left' },
    ] as unknown as Staff[];
    const structures = [fixedStructure({ id: 'ps-1', staffId: 'st-1' })];
    const r = resolveEligibility(staff, structures, '2026-10');
    deepStrictEqual(r.eligible.map((e) => e.staffId), ['st-1']);
    deepStrictEqual(r.missingStructure, ['st-2']); // st-3 left before October, excluded entirely
  });

  it('defaults a structure category from staff type (§8)', () => {
    equal(defaultSalaryCategory('Teaching'), 'Salaries: Teaching');
    equal(defaultSalaryCategory('Clinical instructor/doctor'), 'Honoraria: Clinical instructors and doctors');
  });
});

describe('building a line: gross → recovery → net (§10, §12)', () => {
  it('snapshots the structure and recovers within the caps (payslip §59)', () => {
    const b = buildPayrollLine({
      runId: 'r-1', lineId: 'l-1', staffId: 'st-42', staffType: 'Teaching',
      structure: fixedStructure(), items: [item('Base', 60000), item('Allowance', 2000)],
      recoveryRequested: 10000, advances: [{ advanceId: 'ADV-0041', balance: 40000, paymentDate: '2026-09-15' }],
    });
    equal(b.line.gross, 62000);
    equal(b.line.net, 52000);
    equal(b.line.recoveries, 10000);
    equal(b.line.snapshot.costCategory, 'Salaries: Teaching');
    deepStrictEqual(b.recoveries.map((r) => ({ a: r.advanceId, n: r.amount })), [{ a: 'ADV-0041', n: 10000 }]);
    equal(b.problems.length, 0);
  });
});

describe('the approve posting contract (§20.3, §23, §65)', () => {
  const bundle = (): DraftBundle => ({
    run: makeRun({}),
    lines: [
      makeLine({ id: 'l-1', gross: 1000000, recoveries: 30000, net: 970000 }),
      makeLine({ id: 'l-2', staffId: 'st-2', gross: 300000, recoveries: 10000, net: 290000 }),
    ],
    recoveries: [
      { id: 'l-1~rec~ADV-1', payrollLineId: 'l-1', advanceId: 'ADV-1', amount: 30000, selection: 'Oldest first' },
      { id: 'l-2~rec~ADV-2', payrollLineId: 'l-2', advanceId: 'ADV-2', amount: 10000, selection: 'Oldest first' },
    ],
  });

  it('freezes gross, recovery and net exactly as the §21 sample (§65 t20)', () => {
    const r = approvePayrollRun(bundle(), ctx());
    equal(r.ok, true);
    equal(r.alreadyApproved, false);
    equal(r.run?.calculationState, 'Approved');
    equal(r.run?.disbursementState, 'Unpaid'); // approval moves no money
    equal(r.run?.totals?.gross, 1300000);
    equal(r.run?.totals?.advanceRecoveries, 40000);
    equal(r.run?.totals?.netPayable, 1260000);
    equal(r.run?.totals?.stillPayable, 1260000);
  });

  it('creates a cost posting and a payable per line, and a recovery event per advance (§65 t19→t20)', () => {
    const r = approvePayrollRun(bundle(), ctx());
    equal(r.postings?.length, 2);
    equal(r.payables?.length, 2);
    equal(r.recoveryEvents?.length, 2);
    equal(r.postings?.reduce((s, p) => s + p.amount, 0), 1300000);
    equal(r.payables?.reduce((s, p) => s + p.net, 0), 1260000);
    // A draft posted nothing: the same run still in Draft has no records until approved.
    equal(computeRunTotals(bundle().lines).netPayable, 1260000);
  });

  it('books the cost to the service month even when approved and paid later (§65 t37)', () => {
    const r = approvePayrollRun(bundle(), ctx({ approvalDate: '2026-11-05' }));
    equal(r.postings?.every((p) => p.serviceMonth === '2026-10'), true);
  });

  it('classifies a teaching gross into the reserved Staff category (§65 t36)', () => {
    const r = approvePayrollRun({
      run: makeRun({}), lines: [makeLine({ gross: 800000, net: 800000 })], recoveries: [],
    }, ctx());
    const teaching = r.postings?.filter((p) => p.category === 'Salaries: Teaching').reduce((s, p) => s + p.amount, 0);
    equal(teaching, 800000);
  });

  it('blocks approval on an unverified input, a duplicate standard, or a closed month (§65 t5, t21, t40)', () => {
    equal(approvePayrollRun(bundle(), ctx({ unverifiedInputStaffIds: ['st-1'] })).ok, false);
    equal(approvePayrollRun(bundle(), ctx({ existingApprovedStandardRun: true })).ok, false);
    equal(approvePayrollRun(bundle(), ctx({ closedMonths: ['2026-10'] })).ok, false);
  });

  it('requires a supplemental to reference the original (§20.4)', () => {
    const bad = { run: makeRun({ id: 'r-2', runNumber: 'PAY-2026-10-02', kind: 'Supplemental' }), lines: [], recoveries: [] };
    equal(approvePayrollRun(bad, ctx()).ok, false);
    const good = { ...bad, run: makeRun({ id: 'r-2', runNumber: 'PAY-2026-10-02', kind: 'Supplemental', referencesRunId: 'r-1' }) };
    equal(approvePayrollRun(good, ctx()).ok, true);
  });

  it('a second approval finds it already approved and posts nothing (§65 t50)', () => {
    const approved = { ...bundle(), run: makeRun({ calculationState: 'Approved' }) };
    const r = approvePayrollRun(approved, ctx());
    equal(r.ok, true);
    equal(r.alreadyApproved, true);
    equal(r.postings, undefined);
  });
});

describe('reversal of an approved run (§20.4, §65 t43)', () => {
  const approvedBundle = (): DraftBundle => ({
    run: makeRun({ calculationState: 'Approved' }),
    lines: [makeLine({ gross: 100000, recoveries: 10000, net: 90000 })],
    recoveries: [{ id: 'l-1~rec~ADV-1', payrollLineId: 'l-1', advanceId: 'ADV-1', amount: 10000, selection: 'Oldest first' }],
  });

  it('undoes cost and recovery together as linked events when nobody was paid', () => {
    const r = reversePayrollRun(approvedBundle(), { actor: 'admin', timestamp: '2026-11-06T10:00:00', disbursementsExist: false, closedMonths: [] });
    equal(r.ok, true);
    equal(r.run?.calculationState, 'Reversed');
    equal(r.reversalPostings?.[0].amount, -100000);
    equal(r.reversalPostings?.[0].reversesPostingId, 'l-1~cost');
    equal(r.recoveryReversalEvents?.[0].kind, 'Reversed');
  });

  it('refuses to cancel once a disbursement exists (§20.4)', () => {
    const r = reversePayrollRun(approvedBundle(), { actor: 'admin', timestamp: '2026-11-06T10:00:00', disbursementsExist: true, closedMonths: [] });
    equal(r.ok, false);
    notEqual(r.problems.find((p) => /supplemental/.test(p)), undefined);
  });
});

describe('the month-close finalized check (§22, §65 t38, t39)', () => {
  it('passes for an approved run even when staff remain unpaid (§65 t38)', () => {
    const runs = [makeRun({ calculationState: 'Approved', disbursementState: 'Unpaid' })];
    const s = monthClosePayrollStatus('2026-10', runs);
    equal(s.finalized, true);
    notEqual(s.reasons.find((r) => /still-payable/.test(r)), undefined);
  });

  it('fails while the standard run is still draft (§65 t39)', () => {
    const s = monthClosePayrollStatus('2026-10', [makeRun({ calculationState: 'Draft' })]);
    equal(s.finalized, false);
  });

  it('passes when no payroll was recorded, with a reason (§22)', () => {
    const s = monthClosePayrollStatus('2026-11', [makeRun({ runNumber: 'PAY-2026-11-01', serviceMonth: '2026-11', noPayrollReason: 'Institute closed for the month' })]);
    equal(s.finalized, true);
  });

  it('fails when a supplemental is still open (§22)', () => {
    const runs = [
      makeRun({ calculationState: 'Approved' }),
      makeRun({ id: 'r-2', runNumber: 'PAY-2026-10-02', kind: 'Supplemental', referencesRunId: 'r-1', calculationState: 'Submitted' }),
    ];
    equal(monthClosePayrollStatus('2026-10', runs).finalized, false);
  });
});
