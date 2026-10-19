// ============================================
// MediCMS Desktop — Staff & Payroll: payout execution (§56.2, §57, §67, §41)
//
// This is the one place the payroll module is allowed to move money, and it
// moves it *through Finance Core*: it never edits a payable or a balance, it
// produces the money entries and settlement records a screen then posts via
// `moneyStore.postEntries` (the sole §6/§7 gatekeeper). Everything here is pure
// — no store, no clock — so the posting contract is unit-testable and the §41
// cross-module figures reconcile by construction (§64 integrity 9). Three rules
// decide every branch:
//   • An aggregate execution pays the authorized batch total *exactly*; a
//     differing amount is held for an Admin, never split across staff (§27).
//   • A repeated execution reference posts nothing twice (§65 t28).
//   • Cash never goes negative; a bank overdraft is a warning, not a block (§60).
// Cheque batches settle per cheque through Finance's issued-cheque lifecycle
// (§57.2), so an aggregate execution refuses them here.
// ============================================

import type { MoneyAccount, MoneyEntry } from '../finance/types.ts';
import { actionId, isCashLike, moneyEntryId } from '../finance/entries.ts';
import {
  aggregateExecutionProblems,
  cashPostingProblems,
  payoutRunProblems,
} from './disbursement.ts';
import type {
  Advance,
  AdvanceEvent,
  PayrollDisbursement,
  PayrollPayoutAllocation,
  PayrollPayoutBatch,
  PayrollRun,
  PayoutMode,
} from './types.ts';

/** Where the caller minted the money entry / action numbers, and its clock. */
export interface ExecutionSeries {
  entryNo: number;
  actionNo: number;
  /** ISO timestamp; the pure core never reads a clock. */
  now: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ----------------------------------------------------------------------------
// Bank / cash aggregate execution (§56.2, §57.1)
// ----------------------------------------------------------------------------

export interface BatchExecutionInput {
  batch: PayrollPayoutBatch;
  run: PayrollRun;
  allocations: readonly PayrollPayoutAllocation[];
  /** Sum of the batch's authorized allocations — the amount that must leave. */
  authorizedTotal: number;
  /** The Accountant's confirmed aggregate figure — must equal authorizedTotal. */
  enteredTotal: number;
  reference: string;
  executionDate: string;
  today: string;
  account?: MoneyAccount;
  /** Cleared balance of the payout account, for the cash floor / overdraft. */
  accountAvailable: number;
  /** A reference another executed batch already used — idempotency (§65 t28). */
  alreadyExecutedReference?: string;
  /** §57.1 'Cash packets/receipts prepared by Admin' — cash batches only. */
  packetsPrepared?: boolean;
  /** §57.1 'Staff acknowledgements completed' — incomplete keeps the batch Part executed. */
  acknowledgementsComplete?: boolean;
  series: ExecutionSeries;
  actor: string;
}

export interface BatchExecutionResult {
  ok: boolean;
  problems: string[];
  warnings: string[];
  moneyEntry?: MoneyEntry;
  disbursements: PayrollDisbursement[];
  batchPatch?: Partial<PayrollPayoutBatch>;
}

/**
 * §56.2/§57.1 turn an authorized bank or cash batch into one cleared
 * `PayrollPayment` money-out entry for the exact authorized total plus a settled
 * disbursement per staff line. The named recipients are never on the money entry
 * (§27) — the payee is a restricted aggregate label. Nothing is posted here; the
 * screen feeds `moneyEntry` to `moneyStore.postEntries` and, only on success,
 * applies the disbursements and batch patch.
 */
export function buildBatchExecution(input: BatchExecutionInput): BatchExecutionResult {
  const { batch, run, allocations, authorizedTotal, enteredTotal, reference, executionDate, today, account } = input;
  const problems: string[] = [];
  const warnings: string[] = [];

  if (batch.mode === 'Cheque') problems.push('A cheque batch settles per cheque, not as an aggregate (§57.2).');
  if (batch.state !== 'Authorized') problems.push('Only an authorized batch can be executed (§56).');
  problems.push(...payoutRunProblems(run));

  if (!account) problems.push(`Payout account ${batch.accountId} does not exist (§6).`);
  else if (account.status === 'Closed') problems.push(`${account.name} is Closed and takes no entries (§6.4).`);

  if (!DATE_RE.test(executionDate)) problems.push('An execution carries a local date (YYYY-MM-DD) (§7.1).');
  else if (executionDate > today) problems.push(`Money is dated the day it moved, not later: ${executionDate} is after ${today} (§7.1).`);

  problems.push(...aggregateExecutionProblems({
    authorizedTotal,
    enteredTotal,
    reference,
    alreadyExecutedReference: input.alreadyExecutedReference,
  }));

  if (account && isCashLike(account)) {
    problems.push(...cashPostingProblems({ amount: authorizedTotal, accountAvailable: input.accountAvailable }));
  } else if (account && account.type === 'bank' && authorizedTotal > input.accountAvailable) {
    warnings.push(`${account.name} would go overdrawn by this payout — recorded, not blocked (§60).`);
  }

  if (problems.length) return { ok: false, problems, warnings, disbursements: [] };

  const entryId = moneyEntryId(input.series.entryNo);
  const act = actionId(input.series.actionNo);
  const moneyEntry: MoneyEntry = {
    id: entryId,
    no: input.series.entryNo,
    date: executionDate,
    accountId: batch.accountId,
    direction: 'Out',
    amount: authorizedTotal,
    kind: 'PayrollPayment',
    payee: 'Staff payroll — restricted',
    reference: reference.trim(),
    linkedDoc: batch.batchNo,
    actionId: act,
    createdBy: input.actor,
    cleared: true,
    reconciled: false,
    createdAt: input.series.now,
  };

  const disbursements: PayrollDisbursement[] = allocations.map((a) => ({
    id: `${batch.batchNo}~${a.payrollLineId}`,
    batchId: batch.id,
    allocationId: a.id,
    payrollLineId: a.payrollLineId,
    direction: 'Out',
    amount: a.authorizedAmount,
    moneyEntryId: entryId,
    actualDate: executionDate,
    state: 'Posted',
    reference: reference.trim(),
  }));

  const batchPatch: Partial<PayrollPayoutBatch> = {
    state: 'Executed',
    externalReference: reference.trim(),
    executionDate,
    financeActionId: act,
  };

  // §57.1: one cash movement is not treated as multiple acknowledged staff
  // payments until the hand-over is confirmed — the money has moved and every
  // line settles, but the batch stays Part executed with the exception mapped
  // privately by an Admin.
  if (batch.mode === 'Cash' && !(input.packetsPrepared && input.acknowledgementsComplete)) {
    batchPatch.state = 'Part executed';
    warnings.push('Cash packets or acknowledgements are incomplete — the batch stays Part executed until an Admin confirms the hand-over (§57.1).');
  }

  return { ok: true, problems: [], warnings, moneyEntry, disbursements, batchPatch };
}

// ----------------------------------------------------------------------------
// Advance disbursement (§15, §67) — money out with a recoverable balance
// ----------------------------------------------------------------------------

export interface AdvancePaymentInput {
  advance: Advance;
  method: PayoutMode;
  accountId: string;
  paymentDate: string;
  today: string;
  account?: MoneyAccount;
  accountAvailable: number;
  reference?: string;
  series: ExecutionSeries;
  actor: string;
}

export interface AdvancePaymentResult {
  ok: boolean;
  problems: string[];
  warnings: string[];
  moneyEntry?: MoneyEntry;
  event?: AdvanceEvent;
  advancePatch?: Partial<Advance>;
}

/**
 * §15/§67 paying an approved-but-unpaid advance is the only transition that
 * moves money: it posts a `StaffAdvance` money-out entry (an advance is money
 * out, never salary cost — §67 keeps it apart from a payroll payment), appends a
 * `Disbursed` event so the balance becomes derivable (§17), and flips the advance
 * to Active. Cash floors are enforced; a cheque advance is settled per cheque.
 */
export function buildAdvancePayment(input: AdvancePaymentInput): AdvancePaymentResult {
  const { advance, method, accountId, paymentDate, today, account } = input;
  const problems: string[] = [];
  const warnings: string[] = [];
  const amount = advance.approvedAmount ?? advance.requestedAmount;

  if (advance.status !== 'Pending disbursement') problems.push('Only a Pending disbursement advance can be paid (§15).');
  if (method === 'Cheque') problems.push('A cheque advance is issued through the cheque register (§57.2).');
  if (!Number.isInteger(amount) || amount <= 0) problems.push('An advance is a positive whole number of rupees (§14).');

  if (!DATE_RE.test(paymentDate)) problems.push('A payment carries a local date (YYYY-MM-DD) (§7.1).');
  else if (paymentDate > today) problems.push(`Money is dated the day it moved, not later: ${paymentDate} is after ${today} (§7.1).`);

  if (!account) problems.push(`Payout account ${accountId} does not exist (§6).`);
  else if (account.status === 'Closed') problems.push(`${account.name} is Closed and takes no entries (§6.4).`);

  if (account && isCashLike(account)) {
    problems.push(...cashPostingProblems({ amount, accountAvailable: input.accountAvailable }));
  } else if (account && account.type === 'bank' && amount > input.accountAvailable) {
    warnings.push(`${account.name} would go overdrawn by this advance — recorded, not blocked (§60).`);
  }

  if (problems.length) return { ok: false, problems, warnings };

  const entryId = moneyEntryId(input.series.entryNo);
  const act = actionId(input.series.actionNo);
  const moneyEntry: MoneyEntry = {
    id: entryId,
    no: input.series.entryNo,
    date: paymentDate,
    accountId,
    direction: 'Out',
    amount,
    kind: 'StaffAdvance',
    reference: input.reference?.trim() || undefined,
    linkedDoc: advance.advanceNo,
    actionId: act,
    createdBy: input.actor,
    cleared: true,
    reconciled: false,
    createdAt: input.series.now,
  };

  const event: AdvanceEvent = {
    id: `${advance.id}~pay~${input.series.actionNo}`,
    advanceId: advance.id,
    kind: 'Disbursed',
    amount,
    date: paymentDate,
    moneyEntryId: entryId,
    actionId: act,
  };

  const advancePatch: Partial<Advance> = {
    status: 'Active',
    method,
    payoutAccountId: accountId,
    paymentDate,
    financeReference: input.reference?.trim() || undefined,
  };

  return { ok: true, problems: [], warnings, moneyEntry, event, advancePatch };
}
