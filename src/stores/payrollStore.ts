// ============================================
// MediCMS Desktop — Staff & Payroll Store (§4–§22, §64)
//
// The payroll module's dumb storage: the record collections §64 lists, persisted
// so a draft survives a reload. It keeps *records only* — no balances, no totals
// other than an approved run's frozen snapshot — because every figure is derived
// in src/lib/payroll and read through those pure functions (§6.1). No action here
// does arithmetic and none moves money: staff/adance/run edits guard through the
// pure validators, and approval/reversal go through `transactions.ts`, which
// applies the frozen run and its cost/payable/recovery records all-or-nothing.
// Nothing is deleted — mistakes are corrected by linked reversals (§34 spirit).
// Like moneyStore it takes `actor`/`now` from the caller so the store stays
// clock-free. Money-out is Finance Core's: the screens post through
// `moneyStore.postEntries` first, then call the apply* actions below, which
// only ever record the payroll-side settlement of a posting that succeeded.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Advance,
  AdvanceEvent,
  AdvanceStatus,
  AllocationDraft,
  ApprovalResult,
  DisbursementState,
  DraftBundle,
  PayrollCostPosting,
  PayrollDisbursement,
  PayrollLine,
  PayrollPayable,
  PayrollPayoutAllocation,
  PayrollPayoutBatch,
  PayrollRecordSlice,
  PayrollRecovery,
  PayrollRun,
  PayStructure,
  PayoutMode,
  ReversalResult,
  Staff,
  TransactionOutcome,
  WorkInput,
} from '@/lib/payroll';
import {
  advanceProblems,
  applyApproval,
  applyReversal,
  approvePayrollRun,
  canTransitionAdvance,
  derivePayablePositions,
  generateRunDraft,
  nextAdvanceNo,
  nextBatchNo,
  nextStaffNo,
  planBatchProblems,
  reversePayrollRun,
  runDisbursementState,
} from '@/lib/payroll';

/** A staff record before the store assigns its id, number and audit stamps. */
export type NewStaffInput = Omit<Staff, 'id' | 'staffNo' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'>;
/** An advance before the store assigns its id/number and stamps it as a Draft. */
export type NewAdvance = Omit<Advance, 'id' | 'advanceNo' | 'status' | 'createdBy' | 'createdAt' | 'approvedBy' | 'approvedAt'>;
/** Editable staff fields — identity, the staff number and the audit stamps stay fixed. */
export type StaffPatch = Omit<Partial<Staff>, 'id' | 'staffNo' | 'createdBy' | 'createdAt'>;
/**
 * Editable work-input fields — the id, staff, month and audit stamps stay fixed.
 * Changing any earned content (§11 rule: units/amount/type/window) resets a
 * Verified line back to Draft so a revision is never silently trusted.
 */
export type WorkInputPatch = Omit<
  Partial<WorkInput>,
  'id' | 'staffId' | 'serviceMonth' | 'state' | 'verifiedBy' | 'verifiedAt' | 'createdBy' | 'createdAt'
>;
/** The content fields a re-verification turns on (§11 rule 6). */
const WORK_INPUT_CONTENT_KEYS = ['type', 'units', 'amount', 'fromDate', 'toDate', 'note'] as const;

function upsertById<T extends { id: string }>(list: T[], record: T): T[] {
  const index = list.findIndex((r) => r.id === record.id);
  if (index === -1) return [...list, record];
  const copy = list.slice();
  copy[index] = record;
  return copy;
}

/**
 * §55 the rupees each line already has claimed on *live* (uncancelled) batches of
 * a run, optionally excluding one batch (the one being re-checked). The planner
 * layers these open claims onto a new batch so two batches can never jointly
 * plan past a line's approved net. Derived from the records, never stored.
 */
function plannedByLine(
  batches: readonly PayrollPayoutBatch[],
  allocations: readonly PayrollPayoutAllocation[],
  runId: string,
  excludeBatchId: string | null,
): Record<string, number> {
  const live = new Set(
    batches.filter((b) => b.runId === runId && b.state !== 'Cancelled' && b.id !== excludeBatchId).map((b) => b.id),
  );
  const map: Record<string, number> = {};
  for (const a of allocations) if (live.has(a.batchId)) map[a.payrollLineId] = (map[a.payrollLineId] ?? 0) + a.authorizedAmount;
  return map;
}

interface PayrollState {
  staff: Staff[];
  payStructures: PayStructure[];
  workInputs: WorkInput[];
  advances: Advance[];
  advanceEvents: AdvanceEvent[];
  runs: PayrollRun[];
  lines: PayrollLine[];
  recoveries: PayrollRecovery[];
  costPostings: PayrollCostPosting[];
  payables: PayrollPayable[];
  payoutBatches: PayrollPayoutBatch[];
  payoutAllocations: PayrollPayoutAllocation[];
  /** Money movements that settle allocations, posted through Finance Core (§57). */
  disbursements: PayrollDisbursement[];

  // —— staff (§4) —— the prefix args are the §60 Settings values the screens pass in
  addStaff: (input: NewStaffInput, actor: string, now: string, staffPrefix?: string) => { staff: Staff | null; problems: string[] };
  updateStaff: (id: string, patch: StaffPatch, actor: string, now: string) => string[];
  // —— pay structures (§8) ——
  addPayStructure: (structure: PayStructure) => string[];
  // —— work inputs (§9, §11) ——
  addWorkInput: (input: WorkInput) => string[];
  updateWorkInput: (id: string, patch: WorkInputPatch) => string[];
  verifyWorkInput: (id: string, actor: string, now: string) => string[];
  // —— advances (§14–§15) ——
  addAdvance: (input: NewAdvance, actor: string, now: string, advancePrefix?: string) => { advance: Advance | null; problems: string[] };
  transitionAdvance: (id: string, to: AdvanceStatus, actor: string, now: string) => string[];
  addAdvanceEvent: (event: AdvanceEvent) => string[];
  // —— runs (§19–§21) ——
  saveDraftRun: (bundle: DraftBundle) => void;
  regenerateRunDraft: (id: string, actor: string, now: string) => string[];
  submitRun: (id: string, actor: string, now: string) => string[];
  cancelRun: (id: string, reason: string, actor: string, now: string) => string[];
  approveRun: (bundle: DraftBundle, ctx: Parameters<typeof approvePayrollRun>[1]) => TransactionOutcome;
  reverseRun: (bundle: DraftBundle, ctx: Parameters<typeof reversePayrollRun>[1]) => TransactionOutcome;
  // —— payout batches (§55–§56). Plan and authorize are payroll-side only; the
  // money movement that executes a batch is Finance Core's — the screens post
  // the entries via moneyStore, then apply the settlement here. ——
  planPayoutBatch: (
    input: { runId: string; mode: PayoutMode; accountId: string; allocations: AllocationDraft[] },
    actor: string,
    now: string,
    batchPrefix?: string,
  ) => { batch: PayrollPayoutBatch | null; problems: string[] };
  authorizePayoutBatch: (batchId: string, actor: string, now: string) => string[];
  cancelPayoutBatch: (batchId: string, reason: string, actor: string, now: string) => string[];
  // —— execution (§56.2, §57, §15) — apply the payroll side of a Finance posting. ——
  applyExecution: (
    batchId: string,
    disbursements: readonly PayrollDisbursement[],
    batchPatch: Partial<PayrollPayoutBatch>,
  ) => string[];
  setDisbursementState: (id: string, state: DisbursementState) => string[];
  applyAdvancePayment: (advanceId: string, event: AdvanceEvent, advancePatch: Partial<Advance>) => string[];
}

const sliceOf = (s: PayrollState): PayrollRecordSlice => ({
  runs: s.runs,
  recoveries: s.recoveries,
  costPostings: s.costPostings,
  payables: s.payables,
  advanceEvents: s.advanceEvents,
});

export const usePayrollStore = create<PayrollState>()(
  persist(
    (set, get) => ({
      staff: [],
      payStructures: [],
      workInputs: [],
      advances: [],
      advanceEvents: [],
      runs: [],
      lines: [],
      recoveries: [],
      costPostings: [],
      payables: [],
      payoutBatches: [],
      payoutAllocations: [],
      disbursements: [],

      addStaff: (input, actor, now, staffPrefix) => {
        const state = get();
        const problems: string[] = [];
        if (!input.fullName.trim()) problems.push('A staff record needs a name (§4).');
        if (!input.joiningDate) problems.push('A staff record needs a joining date (§4).');
        const cnic = input.cnic?.trim();
        if (cnic && state.staff.some((s) => s.cnic && s.cnic.trim() === cnic)) {
          problems.push('That CNIC is already on another staff record (§4 rule 2).');
        }
        if (problems.length) return { staff: null, problems };
        const staffNo = nextStaffNo(state.staff, staffPrefix);
        const seq = Number(/(\d+)$/.exec(staffNo)?.[1] ?? state.staff.length + 1);
        const created: Staff = { ...input, id: `st-${seq}`, staffNo, createdBy: actor, createdAt: now };
        set((s) => ({ staff: [...s.staff, created] }));
        return { staff: created, problems: [] };
      },

      updateStaff: (id, patch, actor, now) => {
        const state = get();
        if (!state.staff.some((s) => s.id === id)) return [`Staff ${id} does not exist (§4).`];
        set((s) => ({
          staff: s.staff.map((st) => (st.id === id ? { ...st, ...patch, updatedBy: actor, updatedAt: now } : st)),
        }));
        return [];
      },

      addPayStructure: (structure) => {
        const state = get();
        const problems: string[] = [];
        if (!state.staff.some((s) => s.id === structure.staffId)) problems.push(`Staff ${structure.staffId} does not exist for this pay structure (§8).`);
        if (!structure.effectiveFrom) problems.push('A pay structure needs an effective-from date (§8).');
        if (!structure.monthlyBase && !structure.ratePerSession && !structure.honorariumFixed) {
          problems.push('A pay structure sets a monthly base, a session rate or a fixed honorarium (§8).');
        }
        if (state.payStructures.some((p) => p.id === structure.id)) problems.push(`Pay structure ${structure.id} already exists — ids are never reused.`);
        if (problems.length) return problems;
        set((s) => ({ payStructures: [...s.payStructures, structure] }));
        return [];
      },

      addWorkInput: (input) => {
        const state = get();
        const problems: string[] = [];
        if (!state.staff.some((s) => s.id === input.staffId)) problems.push(`Staff ${input.staffId} does not exist for this work input (§9).`);
        if (!/^\d{4}-\d{2}$/.test(input.serviceMonth)) problems.push('A work input is filed for a service month, YYYY-MM (§9).');
        if (input.units !== undefined && (!Number.isInteger(input.units) || input.units < 0)) problems.push('Work-input units are whole non-negative counts (§10.1).');
        if (state.workInputs.some((w) => w.id === input.id)) problems.push(`Work input ${input.id} already exists — ids are never reused.`);
        if (problems.length) return problems;
        set((s) => ({ workInputs: [...s.workInputs, input] }));
        return [];
      },

      updateWorkInput: (id, patch) => {
        const state = get();
        const existing = state.workInputs.find((w) => w.id === id);
        if (!existing) return [`Work input ${id} does not exist (§9).`];
        const contentChanged = WORK_INPUT_CONTENT_KEYS.some(
          (key) => patch[key] !== undefined && patch[key] !== existing[key],
        );
        set((s) => ({
          workInputs: s.workInputs.map((w) =>
            w.id === id
              ? contentChanged
                ? { ...w, ...patch, state: 'Draft', verifiedBy: undefined, verifiedAt: undefined }
                : { ...w, ...patch }
              : w,
          ),
        }));
        return [];
      },

      verifyWorkInput: (id, actor, now) => {
        const state = get();
        const existing = state.workInputs.find((w) => w.id === id);
        if (!existing) return [`Work input ${id} does not exist (§9).`];
        if (existing.state === 'Verified') return [];
        set((s) => ({
          workInputs: s.workInputs.map((w) => (w.id === id ? { ...w, state: 'Verified', verifiedBy: actor, verifiedAt: now } : w)),
        }));
        return [];
      },

      addAdvance: (input, actor, now, advancePrefix) => {
        const state = get();
        const problems: string[] = [];
        if (!state.staff.some((s) => s.id === input.staffId)) problems.push(`Staff ${input.staffId} does not exist (§14).`);
        const advanceNo = nextAdvanceNo(state.advances, advancePrefix);
        const seq = Number(/(\d+)$/.exec(advanceNo)?.[1] ?? state.advances.length + 1);
        const draft: Advance = { ...input, id: `adv-${seq}`, advanceNo, status: 'Draft', createdBy: actor, createdAt: now };
        problems.push(...advanceProblems(draft));
        if (problems.length) return { advance: null, problems };
        set((s) => ({ advances: [...s.advances, draft] }));
        return { advance: draft, problems: [] };
      },

      transitionAdvance: (id, to, actor, now) => {
        const state = get();
        const advance = state.advances.find((a) => a.id === id);
        if (!advance) return [`Advance ${id} does not exist (§14).`];
        if (!canTransitionAdvance(advance.status, to)) return [`An advance cannot move from ${advance.status} to ${to} (§15).`];
        set((s) => ({
          advances: s.advances.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: to,
                  ...(to === 'Approved'
                    ? { approvedAmount: a.approvedAmount ?? a.requestedAmount, approvedBy: actor, approvedAt: now }
                    : {}),
                }
              : a,
          ),
        }));
        return [];
      },

      addAdvanceEvent: (event) => {
        const state = get();
        const problems: string[] = [];
        if (!state.advances.some((a) => a.id === event.advanceId)) problems.push(`Advance ${event.advanceId} does not exist (§14).`);
        if (!Number.isInteger(event.amount) || event.amount <= 0) problems.push('An advance event is a positive whole number of rupees (§14).');
        if (state.advanceEvents.some((e) => e.id === event.id)) problems.push(`Advance event ${event.id} is already recorded — the ledger is append-only (integrity 5).`);
        if (problems.length) return problems;
        set((s) => ({ advanceEvents: [...s.advanceEvents, event] }));
        return [];
      },

      saveDraftRun: (bundle) => {
        const lineIds = new Set(bundle.lines.map((l) => l.id));
        set((s) => ({
          runs: upsertById(s.runs, bundle.run),
          lines: [...s.lines.filter((l) => l.runId !== bundle.run.id), ...bundle.lines],
          recoveries: [...s.recoveries.filter((r) => !lineIds.has(r.payrollLineId)), ...bundle.recoveries],
        }));
      },

      // §21 recalculate a Draft run from the current structures and Verified inputs,
      // keeping its identity and bumping the revision. An Approved run is immutable.
      regenerateRunDraft: (id, actor, now) => {
        const state = get();
        const run = state.runs.find((r) => r.id === id);
        if (!run) return [`Run ${id} does not exist (§19).`];
        if (run.calculationState !== 'Draft') return ['Only a Draft run can be recalculated; an approved run is frozen (§21).'];
        const { bundle, missingStructure } = generateRunDraft({
          runId: run.id,
          runNumber: run.runNumber,
          month: run.serviceMonth,
          kind: run.kind,
          referencesRunId: run.referencesRunId,
          staffGroup: run.staffGroup,
          staff: state.staff,
          structures: state.payStructures,
          workInputs: state.workInputs,
          advances: state.advances,
          advanceEvents: state.advanceEvents,
          actor: run.createdBy,
          now: run.createdAt,
        });
        const lineIds = new Set(bundle.lines.map((l) => l.id));
        set((s) => ({
          lines: [...s.lines.filter((l) => l.runId !== id), ...bundle.lines],
          recoveries: [...s.recoveries.filter((r) => !lineIds.has(r.payrollLineId)), ...bundle.recoveries],
          runs: s.runs.map((r) => (r.id === id ? { ...r, revision: r.revision + 1, updatedBy: actor, updatedAt: now } : r)),
        }));
        return missingStructure.map((sid) => `No eligible pay structure for staff ${sid} this month; they were left off the run (§4.8).`);
      },

      submitRun: (id, actor, now) => {
        const state = get();
        const run = state.runs.find((r) => r.id === id);
        if (!run) return [`Run ${id} does not exist (§19).`];
        if (run.calculationState !== 'Draft') return ['Only a Draft run can be submitted (§19).'];
        if (!state.lines.some((l) => l.runId === id)) return ['A run with no staff lines cannot be submitted (§19).'];
        set((s) => ({ runs: s.runs.map((r) => (r.id === id ? { ...r, calculationState: 'Submitted', updatedBy: actor, updatedAt: now } : r)) }));
        return [];
      },

      cancelRun: (id, reason, actor, now) => {
        const state = get();
        const run = state.runs.find((r) => r.id === id);
        if (!run) return [`Run ${id} does not exist (§19).`];
        if (run.calculationState !== 'Draft' && run.calculationState !== 'Submitted') {
          return ['Only a Draft or Submitted run can be cancelled; an approved run is reversed (§20.4).'];
        }
        if (!reason.trim()) return ['Cancelling a run needs a reason (§20.4).'];
        set((s) => ({
          runs: s.runs.map((r) => (r.id === id ? { ...r, calculationState: 'Cancelled', reviewNote: reason, updatedBy: actor, updatedAt: now } : r)),
        }));
        return [];
      },

      approveRun: (bundle, ctx) => {
        const result: ApprovalResult = approvePayrollRun(bundle, ctx);
        const outcome = applyApproval(sliceOf(get()), result);
        if (outcome.ok && outcome.applied && outcome.next) {
          const next = outcome.next;
          const lineIds = new Set(bundle.lines.map((l) => l.id));
          set((s) => ({
            runs: next.runs,
            costPostings: next.costPostings,
            payables: next.payables,
            advanceEvents: next.advanceEvents,
            lines: [...s.lines.filter((l) => l.runId !== bundle.run.id), ...bundle.lines],
            recoveries: [...s.recoveries.filter((r) => !lineIds.has(r.payrollLineId)), ...bundle.recoveries],
          }));
        }
        return outcome;
      },

      reverseRun: (bundle, ctx) => {
        const result: ReversalResult = reversePayrollRun(bundle, ctx);
        const outcome = applyReversal(sliceOf(get()), result);
        if (outcome.ok && outcome.applied && outcome.next) {
          const next = outcome.next;
          set(() => ({
            runs: next.runs,
            costPostings: next.costPostings,
            payables: next.payables,
            advanceEvents: next.advanceEvents,
          }));
        }
        return outcome;
      },

      planPayoutBatch: ({ runId, mode, accountId, allocations }, actor, now, batchPrefix) => {
        const s = get();
        const run = s.runs.find((r) => r.id === runId);
        if (!run) return { batch: null, problems: [`Run ${runId} does not exist (§19).`] };
        const payables = s.payables.filter((p) => p.runId === runId);
        const positions = derivePayablePositions(payables, s.disbursements);
        const already = plannedByLine(s.payoutBatches, s.payoutAllocations, runId, null);
        const problems = planBatchProblems({ run, allocations, positions, alreadyPlannedByLine: already });
        if (problems.length) return { batch: null, problems };
        const batchNo = nextBatchNo(run.serviceMonth, s.payoutBatches, batchPrefix);
        const batch: PayrollPayoutBatch = {
          id: batchNo, batchNo, runId, mode, accountId,
          state: 'Prepared', createdBy: actor, createdAt: now,
        };
        const created: PayrollPayoutAllocation[] = allocations.map((a) => ({
          id: `${batchNo}~${a.payrollLineId}`, batchId: batchNo, payrollLineId: a.payrollLineId, authorizedAmount: a.amount,
        }));
        set((st) => ({
          payoutBatches: [...st.payoutBatches, batch],
          payoutAllocations: [...st.payoutAllocations, ...created],
          runs: st.runs.map((r) => (r.id === runId ? { ...r, payoutBatchIds: [...r.payoutBatchIds, batchNo] } : r)),
        }));
        return { batch, problems: [] };
      },

      authorizePayoutBatch: (batchId, actor, now) => {
        const s = get();
        const batch = s.payoutBatches.find((b) => b.id === batchId);
        if (!batch) return [`Batch ${batchId} does not exist (§55).`];
        if (batch.state !== 'Prepared' && batch.state !== 'Ready') return ['Only a Prepared or Ready batch can be authorized (§56).'];
        const run = s.runs.find((r) => r.id === batch.runId);
        if (!run) return [`Run ${batch.runId} does not exist (§19).`];
        const payables = s.payables.filter((p) => p.runId === run.id);
        const positions = derivePayablePositions(payables, s.disbursements);
        const allocations = s.payoutAllocations
          .filter((a) => a.batchId === batchId)
          .map((a) => ({ payrollLineId: a.payrollLineId, amount: a.authorizedAmount }));
        const already = plannedByLine(s.payoutBatches, s.payoutAllocations, run.id, batchId);
        const problems = planBatchProblems({ run, allocations, positions, alreadyPlannedByLine: already });
        if (problems.length) return problems;
        set((st) => ({
          payoutBatches: st.payoutBatches.map((b) => (b.id === batchId ? { ...b, state: 'Authorized', authorizedBy: actor, authorizedAt: now } : b)),
        }));
        return [];
      },

      cancelPayoutBatch: (batchId, reason, actor, now) => {
        const batch = get().payoutBatches.find((b) => b.id === batchId);
        if (!batch) return [`Batch ${batchId} does not exist (§55).`];
        if (batch.state === 'Executed' || batch.state === 'Part executed') {
          return ['An executed batch is corrected by a linked Finance reversal, not cancelled (§27, §56).'];
        }
        if (batch.state === 'Cancelled') return [];
        if (!reason.trim()) return ['Cancelling a payout batch needs a reason (§56).'];
        void actor; void now;
        set((st) => ({ payoutBatches: st.payoutBatches.map((b) => (b.id === batchId ? { ...b, state: 'Cancelled' } : b)) }));
        return [];
      },

      // §56.2/§57 the payroll side of an execution the screen already posted in
      // Finance: settle the batch's lines and move the batch, all-or-nothing.
      // Guards keep an impossible state out of storage even if a screen misuses
      // the result — the money entry itself was validated by moneyStore.
      applyExecution: (batchId, disbursements, batchPatch) => {
        const s = get();
        const batch = s.payoutBatches.find((b) => b.id === batchId);
        if (!batch) return [`Batch ${batchId} does not exist (§55).`];
        if (batch.state !== 'Authorized') return ['Only an authorized batch can be executed (§56).'];
        const problems: string[] = [];
        const known = new Set(s.disbursements.map((d) => d.id));
        for (const d of disbursements) {
          if (known.has(d.id)) problems.push(`Disbursement ${d.id} is already recorded — the ledger is append-only (integrity 5).`);
        }
        if (problems.length) return problems;
        const nextDisbursements = [...s.disbursements, ...disbursements];
        const runState = runDisbursementState(
          derivePayablePositions(s.payables.filter((p) => p.runId === batch.runId), nextDisbursements),
        );
        set((st) => ({
          disbursements: nextDisbursements,
          payoutBatches: st.payoutBatches.map((b) => (b.id === batchId ? { ...b, ...batchPatch } : b)),
          runs: st.runs.map((r) => (r.id === batch.runId ? { ...r, disbursementState: runState } : r)),
        }));
        return [];
      },

      // §57.2/§41 a payroll cheque's lifecycle: issued (Posted + chequeId) money
      // has been committed; clearing it makes it paid, cancelling restores the
      // payable. The Finance posting/cancel happened first in moneyStore.
      setDisbursementState: (id, state) => {
        const s = get();
        const existing = s.disbursements.find((d) => d.id === id);
        if (!existing) return [`Disbursement ${id} does not exist (§29).`];
        if (existing.state === state) return [];
        if (existing.state !== 'Posted') return [`Only a posted settlement changes lifecycle state, not ${existing.state} (§57.2).`];
        const nextDisbursements = s.disbursements.map((d) => (d.id === id ? { ...d, state } : d));
        const batch = s.payoutBatches.find((b) => b.id === existing.batchId);
        const runState = batch
          ? runDisbursementState(derivePayablePositions(s.payables.filter((p) => p.runId === batch.runId), nextDisbursements))
          : null;
        set((st) => ({
          disbursements: nextDisbursements,
          runs: runState && batch ? st.runs.map((r) => (r.id === batch.runId ? { ...r, disbursementState: runState } : r)) : st.runs,
        }));
        return [];
      },

      // §15/§67 the advance's money moved through Finance; record the Disbursed
      // event (the ledger the balance is derived from) and activate it.
      applyAdvancePayment: (advanceId, event, advancePatch) => {
        const s = get();
        const advance = s.advances.find((a) => a.id === advanceId);
        if (!advance) return [`Advance ${advanceId} does not exist (§14).`];
        if (advance.status !== 'Pending disbursement') return ['Only a Pending disbursement advance can be paid (§15).'];
        if (s.advanceEvents.some((e) => e.id === event.id)) return [`Advance event ${event.id} is already recorded — the ledger is append-only (integrity 5).`];
        set((st) => ({
          advanceEvents: [...st.advanceEvents, event],
          advances: st.advances.map((a) => (a.id === advanceId ? { ...a, ...advancePatch } : a)),
        }));
        return [];
      },
    }),
    {
      name: 'medicms-payroll',
      version: 1,
      partialize: (state) => ({
        staff: state.staff,
        payStructures: state.payStructures,
        workInputs: state.workInputs,
        advances: state.advances,
        advanceEvents: state.advanceEvents,
        runs: state.runs,
        lines: state.lines,
        recoveries: state.recoveries,
        costPostings: state.costPostings,
        payables: state.payables,
        payoutBatches: state.payoutBatches,
        payoutAllocations: state.payoutAllocations,
        disbursements: state.disbursements,
      }),
    },
  ),
);
