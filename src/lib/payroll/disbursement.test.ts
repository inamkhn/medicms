// ============================================
// MediCMS Desktop — Staff & Payroll: disbursement tests (§25–§30, §65 t22–t30)
// Derived payable positions, never-overpay, aggregate execution, cheque
// lifecycle and cash-floor rules. Money itself is Finance's; this proves the
// payroll-side settlement and the blocks. Pure, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, notEqual } from 'node:assert/strict';

import {
  aggregateExecutionProblems,
  authorizeBatchProblems,
  cashPostingProblems,
  chequeCancelProblems,
  chequeClearProblems,
  derivePayablePositions,
  disbursementClass,
  planBatchProblems,
  runDisbursementState,
} from './disbursement.ts';
import type { PayablePosition } from './disbursement.ts';
import type { DisbursementState, PayrollDisbursement, PayrollPayable, PayrollRun } from './types.ts';

function payable(lineId: string, net: number): PayrollPayable {
  return { id: `${lineId}~payable`, payrollLineId: lineId, runId: 'r-1', staffId: 'st-1', net } as PayrollPayable;
}

function disb(lineId: string, amount: number, state: DisbursementState, chequeId?: string): PayrollDisbursement {
  return { id: `d-${lineId}-${state}-${amount}`, batchId: 'b-1', payrollLineId: lineId, direction: 'Out', amount, actualDate: '2026-11-06', state, chequeId } as PayrollDisbursement;
}

const approvedRun = (): PayrollRun =>
  ({ id: 'r-1', runNumber: 'PAY-2026-10-01', serviceMonth: '2026-10', kind: 'Standard', calculationState: 'Approved', disbursementState: 'Unpaid', revision: 2, totals: { netPayable: 1260000 } } as unknown as PayrollRun);
const draftRun = (): PayrollRun =>
  ({ ...approvedRun(), calculationState: 'Draft', totals: undefined } as unknown as PayrollRun);

function position(lineId: string, stillPayable: number): PayablePosition {
  return { payrollLineId: lineId, approvedNet: stillPayable, paid: 0, pendingCheques: 0, stillPayable };
}

describe('the payable position is derived from disbursements (§29)', () => {
  it('a bank payment commits money out and cuts the remaining payable (§65 t22)', () => {
    const p = derivePayablePositions([payable('l-1', 1260000)], [disb('l-1', 1050000, 'Posted')])[0];
    equal(p.paid, 1050000);
    equal(p.stillPayable, 210000);
  });

  it('cash then reduces it further (§65 t23)', () => {
    const p = derivePayablePositions([payable('l-1', 1260000)], [disb('l-1', 1050000, 'Posted'), disb('l-1', 130000, 'Posted')])[0];
    equal(p.paid, 1180000);
    equal(p.stillPayable, 80000);
  });

  it('an issued cheque is a commitment, not a payment (§65 t24)', () => {
    const d = disb('l-1', 80000, 'Posted', 'ch-1');
    equal(disbursementClass(d), 'pending');
    const p = derivePayablePositions([payable('l-1', 1260000)], [disb('l-1', 1180000, 'Posted'), d])[0];
    equal(p.paid, 1180000);
    equal(p.pendingCheques, 80000);
    equal(p.stillPayable, 0);
  });

  it('clearing the cheque turns it into money out (§65 t25)', () => {
    const cleared = disb('l-1', 80000, 'Cleared', 'ch-1');
    equal(disbursementClass(cleared), 'paid');
    const p = derivePayablePositions([payable('l-1', 80000)], [cleared])[0];
    equal(p.paid, 80000);
    equal(p.pendingCheques, 0);
  });

  it('cancelling the cheque restores the payable (§65 t26)', () => {
    const cancelled = disb('l-1', 80000, 'Cancelled', 'ch-1');
    equal(disbursementClass(cancelled), 'none');
    const p = derivePayablePositions([payable('l-1', 80000)], [cancelled])[0];
    equal(p.stillPayable, 80000);
  });
});

describe('a line is never paid beyond its approved net (§25, §30, §65 t29)', () => {
  it('blocks a payout on a Draft run', () => {
    const problems = authorizeBatchProblems({ run: draftRun(), allocations: [{ payrollLineId: 'l-1', amount: 50000 }], positions: [position('l-1', 52000)] });
    notEqual(problems.find((p) => /Draft run/.test(p)), undefined);
  });

  it('blocks paying 60,000 on a 52,000 net line (§65 t29)', () => {
    const problems = authorizeBatchProblems({ run: approvedRun(), allocations: [{ payrollLineId: 'l-1', amount: 60000 }], positions: [position('l-1', 52000)] });
    notEqual(problems.find((p) => /exceed the approved net/.test(p)), undefined);
  });

  it('allows a batch within the still-payable amount', () => {
    const problems = authorizeBatchProblems({ run: approvedRun(), allocations: [{ payrollLineId: 'l-1', amount: 52000 }], positions: [position('l-1', 52000)] });
    equal(problems.length, 0);
  });
});

describe('planning layers the open claims of other live batches (§55, §64.7)', () => {
  it('allows a batch that fits once prior plans are counted', () => {
    const problems = planBatchProblems({
      run: approvedRun(),
      allocations: [{ payrollLineId: 'l-1', amount: 20000 }],
      positions: [position('l-1', 52000)],
      alreadyPlannedByLine: { 'l-1': 30000 },
    });
    equal(problems.length, 0);
  });
  it('blocks when the new batch plus other batches exceed the net (§55)', () => {
    const problems = planBatchProblems({
      run: approvedRun(),
      allocations: [{ payrollLineId: 'l-1', amount: 25000 }],
      positions: [position('l-1', 52000)],
      alreadyPlannedByLine: { 'l-1': 30000 },
    });
    notEqual(problems.find((p) => /already has .* planned on other batches/.test(p)), undefined);
  });
  it('a batch that alone exceeds the net is reported once (§65 t29)', () => {
    const problems = planBatchProblems({
      run: approvedRun(),
      allocations: [{ payrollLineId: 'l-1', amount: 60000 }],
      positions: [position('l-1', 52000)],
      alreadyPlannedByLine: {},
    });
    equal(problems.filter((p) => /exceed the approved net/.test(p)).length, 1);
  });
});

describe('aggregate execution by the Accountant (§27, §65 t28, t30)', () => {
  it('blocks a total that differs from the approved batch (§65 t30)', () => {
    const problems = aggregateExecutionProblems({ authorizedTotal: 1050000, enteredTotal: 1040000, reference: 'BANK-BULK-2941' });
    notEqual(problems.find((p) => /does not match/.test(p)), undefined);
  });

  it('requires a reference', () => {
    const problems = aggregateExecutionProblems({ authorizedTotal: 1050000, enteredTotal: 1050000, reference: '  ' });
    notEqual(problems.find((p) => /needs its reference/.test(p)), undefined);
  });

  it('a repeated execution reference posts nothing twice (§65 t28)', () => {
    const problems = aggregateExecutionProblems({ authorizedTotal: 1050000, enteredTotal: 1050000, reference: 'BANK-BULK-2941', alreadyExecutedReference: 'BANK-BULK-2941' });
    notEqual(problems.find((p) => /already posted/.test(p)), undefined);
  });

  it('passes a clean aggregate confirmation', () => {
    equal(aggregateExecutionProblems({ authorizedTotal: 1050000, enteredTotal: 1050000, reference: 'BANK-BULK-2941' }).length, 0);
  });
});

describe('mode-specific posting rules (§26, §65 t23, t27)', () => {
  it('refuses a cash payout that would go negative (§65 t23)', () => {
    notEqual(cashPostingProblems({ amount: 130000, accountAvailable: 120000 }).find((p) => /cannot go negative/.test(p)), undefined);
    equal(cashPostingProblems({ amount: 130000, accountAvailable: 250000 }).length, 0);
  });

  it('a post-dated cheque cannot clear before its date (§65 t27)', () => {
    notEqual(chequeClearProblems({ chequeDate: '2026-11-10', clearingDate: '2026-11-06' }).find((p) => /cannot clear before/.test(p)), undefined);
    equal(chequeClearProblems({ chequeDate: '2026-11-10', clearingDate: '2026-11-10' }).length, 0);
  });

  it('cancelling a cheque needs a reason; a cleared one is reversed not cancelled (§26)', () => {
    notEqual(chequeCancelProblems({ reason: '', alreadyCleared: false }).find((p) => /needs a reason/.test(p)), undefined);
    notEqual(chequeCancelProblems({ reason: 'stale', alreadyCleared: true }).find((p) => /Finance reversal/.test(p)), undefined);
    equal(chequeCancelProblems({ reason: 'cheque lost in post', alreadyCleared: false }).length, 0);
  });
});

describe('the run disbursement state rolls up from the positions (§19, §57)', () => {
  it('unpaid until money or a cheque commitment lands', () => {
    equal(runDisbursementState([position('l-1', 52000)]), 'Unpaid');
  });
  it('part paid while any line remains payable (§19)', () => {
    const a: PayablePosition = { payrollLineId: 'l-1', approvedNet: 100, paid: 100, pendingCheques: 0, stillPayable: 0 };
    const b: PayablePosition = { payrollLineId: 'l-2', approvedNet: 50, paid: 0, pendingCheques: 0, stillPayable: 50 };
    equal(runDisbursementState([a, b]), 'Part paid');
  });
  it('an uncleared cheque leaves the run pending, never paid (§29, §65 t24)', () => {
    const a: PayablePosition = { payrollLineId: 'l-1', approvedNet: 80000, paid: 0, pendingCheques: 80000, stillPayable: 0 };
    equal(runDisbursementState([a]), 'Pending cheque clearance');
    equal(runDisbursementState([{ ...a, paid: 80000, pendingCheques: 0 }]), 'Paid');
  });
});
