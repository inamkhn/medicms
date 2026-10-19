// ============================================
// MediCMS Desktop — Staff & Payroll: transaction tests (§19–§23, §64, §65 t19–t21, t43, t50)
// The all-or-nothing contract: a rejected approval changes nothing, a re-request
// posts nothing, and a reversal only appends contra records. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, notEqual } from 'node:assert/strict';

import { applyApproval, applyReversal } from './transactions.ts';
import type { PayrollRecordSlice } from './transactions.ts';
import type { ApprovalResult, ReversalResult } from './run.ts';
import type { AdvanceEvent, PayrollCostPosting, PayrollPayable, PayrollRun } from './types.ts';

const draftRun = (): PayrollRun => ({ id: 'r-1', runNumber: 'PAY-2026-10-01', serviceMonth: '2026-10', kind: 'Standard', calculationState: 'Draft', disbursementState: 'Unpaid', revision: 1 } as PayrollRun);
const approvedRun = (): PayrollRun => ({ ...draftRun(), calculationState: 'Approved', revision: 2, totals: { gross: 100000, advanceRecoveries: 40000, netPayable: 60000 } as PayrollRun['totals'] } as PayrollRun);

const emptySlice = (): PayrollRecordSlice => ({ runs: [draftRun()], recoveries: [], costPostings: [], payables: [], advanceEvents: [] });

function goodApproval(): ApprovalResult {
  return {
    ok: true,
    alreadyApproved: false,
    problems: [],
    run: approvedRun(),
    postings: [{ id: 'l-1~cost', runId: 'r-1', payrollLineId: 'l-1', category: 'Salaries: Teaching', serviceMonth: '2026-10', amount: 100000 } as PayrollCostPosting],
    payables: [{ id: 'l-1~payable', payrollLineId: 'l-1', runId: 'r-1', staffId: 'st-1', net: 60000 } as PayrollPayable],
    recoveryEvents: [{ id: 'rec-1~event', advanceId: 'adv-1', kind: 'Recovered', amount: 40000, date: '2026-11-05', payrollLineId: 'l-1' } as AdvanceEvent],
  };
}

describe('approval is all-or-nothing (§19, §65 t19)', () => {
  it('on a clean approval stores the run and appends cost, payable and recovery together', () => {
    const outcome = applyApproval(emptySlice(), goodApproval());
    equal(outcome.ok, true);
    equal(outcome.applied, true);
    const next = outcome.next!;
    equal(next.runs[0].calculationState, 'Approved');
    equal(next.costPostings.length, 1);
    equal(next.payables.length, 1);
    equal(next.advanceEvents.length, 1);
  });

  it('a rejected approval changes nothing (§20.3)', () => {
    const before = emptySlice();
    const outcome = applyApproval(before, { ok: false, alreadyApproved: false, problems: ['closed month'] });
    equal(outcome.ok, false);
    equal(outcome.applied, false);
    equal(outcome.next, undefined);
    equal(before.costPostings.length, 0);
  });
});

describe('a second approval posts nothing (§65 t50, integrity 5)', () => {
  it('an already-approved result is a no-op', () => {
    const before = emptySlice();
    const outcome = applyApproval(before, { ok: true, alreadyApproved: true, problems: [], run: approvedRun() });
    equal(outcome.applied, false);
    equal(outcome.next, before);
  });

  it('re-applying a built result whose posting ids exist is refused outright', () => {
    const once = applyApproval(emptySlice(), goodApproval()).next!;
    const twice = applyApproval(once, goodApproval());
    equal(twice.ok, false);
    equal(twice.applied, false);
    notEqual(twice.problems.find((p) => /posts once/.test(p)), undefined);
    equal(once.costPostings.length, 1);
  });
});

describe('a reversal only appends contra records (§20.4, §65 t43)', () => {
  it('flips the run and adds a negative cost and a reversal event, keeping the originals', () => {
    const approvedSlice = applyApproval(emptySlice(), goodApproval()).next!;
    const result: ReversalResult = {
      ok: true,
      problems: [],
      run: { ...approvedRun(), calculationState: 'Reversed' } as PayrollRun,
      reversalPostings: [{ id: 'l-1~cost~reversal', runId: 'r-1', payrollLineId: 'l-1', category: 'Salaries: Teaching', serviceMonth: '2026-10', amount: -100000, reversesPostingId: 'l-1~cost' } as PayrollCostPosting],
      recoveryReversalEvents: [{ id: 'rec-1~reversal', advanceId: 'adv-1', kind: 'Reversed', amount: 40000, date: '2026-11-06', payrollLineId: 'l-1' } as AdvanceEvent],
    };
    const outcome = applyReversal(approvedSlice, result);
    equal(outcome.applied, true);
    const next = outcome.next!;
    equal(next.runs[0].calculationState, 'Reversed');
    equal(next.costPostings.length, 2); // original + contra, neither rewritten
    equal(next.costPostings[1].amount, -100000);
    equal(next.advanceEvents.length, 2);
    // A reversal never deletes the payable — the paid/unpaid history stays auditable.
    equal(next.payables.length, 1);
  });

  it('a refused reversal changes nothing', () => {
    const before = applyApproval(emptySlice(), goodApproval()).next!;
    const outcome = applyReversal(before, { ok: false, problems: ['disbursements exist'] });
    equal(outcome.applied, false);
    equal(outcome.next, undefined);
    equal(before.runs[0].calculationState, 'Approved');
  });
});
