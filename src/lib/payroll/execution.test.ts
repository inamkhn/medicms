// ============================================
// MediCMS Desktop — Staff & Payroll: execution tests (§56.2, §57, §41, §67, §65 t28–t30)
// The money-out contract: an aggregate bank/cash execution, the §41 cross-module
// reconciliation, cash floors, idempotent refs, exact-amount holds, and advance
// disbursement. Pure, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, ok } from 'node:assert/strict';

import { buildAdvancePayment, buildBatchExecution } from './execution.ts';
import { computePaymentPosition } from './reports.ts';
import type { Advance, PayrollPayoutAllocation, PayrollPayoutBatch, PayrollPayable, PayrollRun } from './types.ts';
import type { MoneyAccount } from '../finance/types.ts';
import { kindDirection } from '../finance/entries.ts';

const bank = (): MoneyAccount => ({ id: 'acc-bank', name: 'Meezan main', type: 'bank', status: 'Active' });
const counter = (): MoneyAccount => ({ id: 'acc-counter', name: 'Counter cash', type: 'counterCash', status: 'Active' });

const approvedRun = (): PayrollRun =>
  ({ id: 'r-1', runNumber: 'PAY-2026-10-01', serviceMonth: '2026-10', kind: 'Standard', calculationState: 'Approved', totals: { netPayable: 1_260_000 } } as unknown as PayrollRun);

function batch(over: Partial<PayrollPayoutBatch> = {}): PayrollPayoutBatch {
  return {
    id: 'PB-202610-001', batchNo: 'PB-202610-001', runId: 'r-1', mode: 'Bank transfer', accountId: 'acc-bank',
    state: 'Authorized', createdBy: 'Admin', createdAt: '2026-11-05T09:00:00', ...over,
  };
}

function alloc(lineId: string, amount: number, batchId = 'PB-202610-001'): PayrollPayoutAllocation {
  return { id: `${batchId}~${lineId}`, batchId, payrollLineId: lineId, authorizedAmount: amount };
}

const SERIES = { entryNo: 100, actionNo: 50, now: '2026-11-06T09:00:00' };

function execInput(over: Parameters<typeof buildBatchExecution>[0] extends infer I ? Partial<I> : never) {
  return {
    batch: batch(), run: approvedRun(), allocations: [alloc('l-1', 1_050_000)],
    authorizedTotal: 1_050_000, enteredTotal: 1_050_000, reference: 'BANK-BULK-2941',
    executionDate: '2026-11-06', today: '2026-11-07', account: bank(), accountAvailable: 2_000_000,
    series: SERIES, actor: 'Accountant', ...over,
  } as Parameters<typeof buildBatchExecution>[0];
}

describe('aggregate bank/cash payout execution (§56.2, §57.1)', () => {
  it('posts one cleared PayrollPayment out and settles every line (§56.2)', () => {
    const r = buildBatchExecution(execInput({}));
    ok(r.ok, r.problems.join(' '));
    equal(r.moneyEntry?.kind, 'PayrollPayment');
    equal(r.moneyEntry?.direction, 'Out');
    equal(r.moneyEntry?.amount, 1_050_000);
    equal(r.moneyEntry?.cleared, true);
    equal(r.disbursements.length, 1);
    equal(r.disbursements[0].state, 'Posted');
    equal(r.batchPatch?.state, 'Executed');
  });

  it('a differing aggregate amount is held for an Admin, never split (§65 t30)', () => {
    const r = buildBatchExecution(execInput({ enteredTotal: 1_000_000 }));
    ok(!r.ok);
    ok(r.problems.some((p) => p.includes('does not match')));
    ok(!r.moneyEntry);
  });

  it('a missing reference and a repeated reference both post nothing (§27, §65 t28)', () => {
    ok(buildBatchExecution(execInput({ reference: '  ' })).problems.some((p) => p.includes('reference')));
    const dup = buildBatchExecution(execInput({ alreadyExecutedReference: 'BANK-BULK-2941' }));
    ok(!dup.ok);
    ok(dup.problems.some((p) => p.includes('already posted')));
  });

  it('cash can never go negative; a bank overdraft warns but proceeds (§26, §60)', () => {
    const shortCash = buildBatchExecution(execInput({
      batch: batch({ mode: 'Cash', accountId: 'acc-counter' }), account: counter(), accountAvailable: 500_000,
    }));
    ok(!shortCash.ok);
    ok(shortCash.problems.some((p) => p.includes('negative')));

    const overBank = buildBatchExecution(execInput({ accountAvailable: 100_000 }));
    ok(overBank.ok, overBank.problems.join(' '));
    ok(overBank.warnings.some((w) => w.includes('overdrawn')));
  });

  it('refuses a cheque batch, an unauthorized batch and a future date (§57.2, §56, §7.1)', () => {
    ok(buildBatchExecution(execInput({ batch: batch({ mode: 'Cheque' }) })).problems.some((p) => p.includes('per cheque')));
    ok(buildBatchExecution(execInput({ batch: batch({ state: 'Ready' }) })).problems.some((p) => p.includes('authorized')));
    ok(buildBatchExecution(execInput({ executionDate: '2026-12-01', today: '2026-11-07' })).problems.some((p) => p.includes('not later')));
  });

  it('an unacknowledged cash hand-over posts the money but keeps the batch Part executed (§57.1)', () => {
    const cash = { batch: batch({ mode: 'Cash', accountId: 'acc-counter' }), account: counter(), accountAvailable: 2_000_000 };
    const open = buildBatchExecution(execInput({ ...cash }));
    ok(open.ok, open.problems.join(' '));
    equal(open.batchPatch?.state, 'Part executed');
    ok(open.warnings.some((w) => w.includes('Part executed')));
    const handed = buildBatchExecution(execInput({ ...cash, packetsPrepared: true, acknowledgementsComplete: true }));
    ok(handed.ok, handed.problems.join(' '));
    equal(handed.batchPatch?.state, 'Executed');
    // a bank batch is not gated by the cash hand-over checkboxes
    equal(buildBatchExecution(execInput({ packetsPrepared: false })).batchPatch?.state, 'Executed');
  });
});

describe('§41 cross-module reconciliation after the illustrative payouts', () => {
  it('bank 1,050,000 + cash 130,000 cleared and an 80,000 cheque pending nets to zero still payable', () => {
    const batches: PayrollPayoutBatch[] = [
      batch({ id: 'PB-b', batchNo: 'PB-b', mode: 'Bank transfer', accountId: 'acc-bank' }),
      batch({ id: 'PB-c', batchNo: 'PB-c', mode: 'Cash', accountId: 'acc-counter' }),
      batch({ id: 'PB-k', batchNo: 'PB-k', mode: 'Cheque', accountId: 'acc-bank' }),
    ];
    const payables: PayrollPayable[] = [
      { id: 'pb1', payrollLineId: 'l-1', runId: 'r-1', staffId: 'st-1', net: 1_050_000 } as PayrollPayable,
      { id: 'pb2', payrollLineId: 'l-2', runId: 'r-1', staffId: 'st-2', net: 130_000 } as PayrollPayable,
      { id: 'pb3', payrollLineId: 'l-3', runId: 'r-1', staffId: 'st-3', net: 80_000 } as PayrollPayable,
    ];
    const disbursements = [
      { id: 'd1', batchId: 'PB-b', payrollLineId: 'l-1', direction: 'Out', amount: 1_050_000, actualDate: '2026-11-06', state: 'Posted' },
      { id: 'd2', batchId: 'PB-c', payrollLineId: 'l-2', direction: 'Out', amount: 130_000, actualDate: '2026-11-06', state: 'Posted' },
      { id: 'd3', batchId: 'PB-k', payrollLineId: 'l-3', direction: 'Out', amount: 80_000, actualDate: '2026-11-06', state: 'Posted', chequeId: 'ch-1' },
    ] as unknown as Parameters<typeof computePaymentPosition>[1];

    const pos = computePaymentPosition(payables, disbursements, batches);
    equal(pos.approvedNet, 1_260_000);
    equal(pos.bank, 1_050_000);
    equal(pos.cash, 130_000);
    equal(pos.chequePending, 80_000);
    equal(pos.chequeCleared, 0);
    equal(pos.clearedTotal, 1_180_000);
    equal(pos.toDisburse, 0);

    // When the cheque clears, money out rises and pending falls (§41 closing line).
    const cleared = computePaymentPosition(payables, [
      disbursements[0], disbursements[1], { ...disbursements[2], state: 'Cleared' },
    ] as unknown as Parameters<typeof computePaymentPosition>[1], batches);
    equal(cleared.chequeCleared, 80_000);
    equal(cleared.chequePending, 0);
    equal(cleared.clearedTotal, 1_260_000);
  });
});

describe('advance disbursement moves money through Finance (§15, §67)', () => {
  const pending = (): Advance =>
    ({ id: 'adv-1', advanceNo: 'ADV-0041', staffId: 'st-1', requestedAmount: 50_000, approvedAmount: 50_000, status: 'Pending disbursement', recoveryPolicy: 'Fixed per month', startRecoveryMonth: '2026-11', reason: 'medical', createdBy: 'Admin', createdAt: '2026-11-01T09:00:00' } as unknown as Advance);

  function advInput(over: Partial<Parameters<typeof buildAdvancePayment>[0]> = {}) {
    return {
      advance: pending(), method: 'Bank transfer' as const, accountId: 'acc-bank', paymentDate: '2026-11-06',
      today: '2026-11-07', account: bank(), accountAvailable: 2_000_000, series: SERIES, actor: 'Admin', ...over,
    } as Parameters<typeof buildAdvancePayment>[0];
  }

  it('posts a StaffAdvance money-out and activates the advance with a Disbursed event', () => {
    const r = buildAdvancePayment(advInput());
    ok(r.ok, r.problems.join(' '));
    equal(r.moneyEntry?.kind, 'StaffAdvance');
    equal(r.moneyEntry?.amount, 50_000);
    equal(r.event?.kind, 'Disbursed');
    equal(r.advancePatch?.status, 'Active');
  });

  it('the StaffAdvance kind is always money out (§67)', () => {
    equal(kindDirection('StaffAdvance'), 'Out');
  });

  it('only a Pending disbursement advance pays, cash floors hold, cheques are refused (§15, §26, §57.2)', () => {
    ok(buildAdvancePayment(advInput({ advance: { ...pending(), status: 'Approved' } as unknown as Advance })).problems.some((p) => p.includes('Pending disbursement')));
    ok(buildAdvancePayment(advInput({ method: 'Cheque' })).problems.some((p) => p.includes('cheque')));
    const short = buildAdvancePayment(advInput({ method: 'Cash', accountId: 'acc-counter', account: counter(), accountAvailable: 10_000 }));
    ok(!short.ok);
    ok(short.problems.some((p) => p.includes('negative')));
  });
});
