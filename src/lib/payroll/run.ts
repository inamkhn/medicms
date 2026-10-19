// ============================================
// MediCMS Desktop — Staff & Payroll: the payroll run (§19–§22, §64, §65)
//
// The run state machine and its posting contract. Pure: every rupee, date, id
// and actor comes in, nothing is read from a clock or a store. The load-bearing
// rule (§18, §20.3, §23): **a run decides what is owed; it never moves money.**
// Approval atomically freezes the run and creates the cost / payable / recovery
// records — but debits no bank or cash account. Money moves only later, through
// Finance Core, at disbursement (P5). Corrections never rewrite an approved
// run: they are a linked reversal or a supplemental (§20.4).
// ============================================

import type {
  AdvanceEvent,
  PayrollCostPosting,
  PayrollLine,
  PayrollLineItem,
  PayrollPayable,
  PayrollRecovery,
  PayrollRun,
  PayStructure,
  PayStructureSnapshot,
  SalaryCostCategory,
  ServiceMonth,
  Staff,
  StaffType,
} from './types.ts';
import type { OutstandingAdvance } from './advances.ts';
import { computeLineTotals, daysInServiceMonth, runTotalsMatch } from './calc.ts';
import { planAdvanceRecovery } from './advances.ts';

// ----------------------------------------------------------------------------
// Service-month bounds and eligibility (§4.8, §20.1)
// ----------------------------------------------------------------------------

export interface MonthBounds {
  start: string;
  end: string;
  days: number;
}

/** The first and last calendar day of a `YYYY-MM` service month (§10.2). */
export function serviceMonthBounds(month: ServiceMonth): MonthBounds {
  const days = daysInServiceMonth(month);
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, '0')}`, days };
}

/** §8 a structure is in force if its effective range overlaps the month. */
function overlapsMonth(from: string, to: string | undefined, bounds: MonthBounds): boolean {
  return from <= bounds.end && (to === undefined || to >= bounds.start);
}

export interface EligibleStaff {
  staffId: string;
  structure: PayStructure;
}

/**
 * §4.8 / §20.1 who a run may pay for a service month: a person employed across
 * any part of it, paired with the structure in force that month. Anyone with no
 * structure is reported as `missingStructure` — payroll cannot be generated for
 * them until an Admin adds one (§4 rule 8).
 */
export function resolveEligibility(
  staff: readonly Staff[],
  structures: readonly PayStructure[],
  month: ServiceMonth,
): { eligible: EligibleStaff[]; missingStructure: string[] } {
  const bounds = serviceMonthBounds(month);
  const eligible: EligibleStaff[] = [];
  const missingStructure: string[] = [];
  for (const s of staff) {
    const spansMonth = s.joiningDate <= bounds.end && (s.leavingDate === undefined || s.leavingDate >= bounds.start);
    if (!spansMonth) continue;
    const structure = structures.find((st) => st.staffId === s.id && overlapsMonth(st.effectiveFrom, st.effectiveTo, bounds));
    if (structure) eligible.push({ staffId: s.id, structure });
    else missingStructure.push(s.id);
  }
  return { eligible, missingStructure };
}

/** §8 the default Staff cost category a structure maps to, by staff type. */
export function defaultSalaryCategory(staffType: StaffType): SalaryCostCategory {
  switch (staffType) {
    case 'Teaching': return 'Salaries: Teaching';
    case 'Administration': return 'Salaries: Administration';
    case 'Support': return 'Salaries: Support';
    case 'Visiting faculty': return 'Honoraria: Visiting faculty';
    case 'Clinical instructor/doctor': return 'Honoraria: Clinical instructors and doctors';
  }
}

// ----------------------------------------------------------------------------
// One line: earnings → recovery → net, frozen into a snapshot (§10, §12)
// ----------------------------------------------------------------------------

export interface PayLineBuild {
  runId: string;
  lineId: string;
  staffId: string;
  staffType: StaffType;
  structure: PayStructure;
  /** §10 the earned lines already shaped by the wizard using the §8–§10 primitives. */
  items: PayrollLineItem[];
  zeroPayReason?: string;
  /** §10.5 rupees the policy or Admin wants recovered this run. */
  recoveryRequested: number;
  advances: OutstandingAdvance[];
  selection?: 'Oldest first' | 'Manual';
  manual?: Record<string, number>;
}

export interface BuiltLine {
  line: PayrollLine;
  recoveries: PayrollRecovery[];
  /** §10.5 the recovery plan's notices/carry-forward for the review screen. */
  plan: ReturnType<typeof planAdvanceRecovery>;
  problems: string[];
}

/**
 * §10 / §12 build one frozen staff line. Gross is the earned items' total; the
 * recovery is planned against the outstanding advances within the caps (§10.3),
 * then net is gross less what was actually recovered. The structure is snapshotted
 * so a later rate edit cannot reach this line (§10.8, §65 t11).
 */
export function buildPayrollLine(build: PayLineBuild): BuiltLine {
  const grossOnly = computeLineTotals({ items: build.items, recovery: 0 });
  const plan = planAdvanceRecovery({
    availableSalary: grossOnly.gross,
    requested: build.recoveryRequested,
    advances: build.advances,
    selection: build.selection,
    manual: build.manual,
  });
  const totals = computeLineTotals({ items: build.items, recovery: plan.totalRecovered, zeroPayReason: build.zeroPayReason });

  const snapshot: PayStructureSnapshot = {
    structureId: build.structure.id,
    revision: build.structure.revision,
    type: build.structure.type,
    monthlyBase: build.structure.monthlyBase,
    ratePerSession: build.structure.ratePerSession,
    honorariumFixed: build.structure.honorariumFixed,
    costCategory: build.structure.costCategory ?? defaultSalaryCategory(build.staffType),
  };

  const line: PayrollLine = {
    id: build.lineId,
    runId: build.runId,
    staffId: build.staffId,
    snapshot,
    items: build.items,
    gross: totals.gross,
    recoveries: totals.recoveries,
    net: totals.net,
    zeroPayReason: build.zeroPayReason,
  };

  const recoveries: PayrollRecovery[] = plan.allocations.map((a) => ({
    id: `${build.lineId}~rec~${a.advanceId}`,
    payrollLineId: build.lineId,
    advanceId: a.advanceId,
    amount: a.amount,
    selection: build.selection ?? 'Oldest first',
  }));

  return { line, recoveries, plan, problems: [...totals.problems, ...plan.problems] };
}

// ----------------------------------------------------------------------------
// A draft run and its frozen totals (§19)
// ----------------------------------------------------------------------------

export interface DraftBundle {
  run: PayrollRun;
  lines: PayrollLine[];
  recoveries: PayrollRecovery[];
}

/** §19 the run's frozen rupee totals, summed from the approved lines (§64.9, §65 t52). */
export function computeRunTotals(lines: readonly PayrollLine[]): NonNullable<PayrollRun['totals']> {
  let base = 0, sessionPay = 0, honoraria = 0, allowances = 0, reductions = 0, gross = 0, recoveries = 0, net = 0;
  for (const l of lines) {
    const { breakdown } = computeLineTotals({ items: l.items, recovery: l.recoveries });
    base += breakdown.base;
    sessionPay += breakdown.sessionPay;
    honoraria += breakdown.honoraria;
    allowances += breakdown.allowances;
    reductions += breakdown.reductions;
    gross += l.gross;
    recoveries += l.recoveries;
    net += l.net;
  }
  return {
    base, sessionPay, honoraria, allowances, reductions, gross,
    advanceRecoveries: recoveries, netPayable: net,
    paid: 0, pendingCheques: 0, stillPayable: net,
  };
}

// ----------------------------------------------------------------------------
// Preflight → submit → approve (§11, §19, §20.3, §20.4, §22, §65 t5, t20, t21, t40, t50)
// ----------------------------------------------------------------------------

export interface ApprovalContext {
  actor: string;
  timestamp: string;
  /** §65 t21 the ISO posting date the recoveries commit on (approval date). */
  approvalDate: string;
  existingApprovedStandardRun: boolean;
  closedMonths: readonly ServiceMonth[];
  missingStructureStaffIds: readonly string[];
  unverifiedInputStaffIds: readonly string[];
}

/** §20.3 the checks that stand between a submitted run and approval. */
export function preflightProblems(bundle: DraftBundle, ctx: ApprovalContext): string[] {
  const { run, lines } = bundle;
  const problems: string[] = [];

  if (run.kind === 'Standard' && ctx.existingApprovedStandardRun) {
    problems.push(`An approved standard run already exists for ${run.serviceMonth}. Approve a supplemental instead (§19, §65 t21).`);
  }
  if (run.kind === 'Supplemental' && !run.referencesRunId) {
    problems.push('A supplemental run must reference the original it corrects (§19, §20.4).');
  }
  if (ctx.closedMonths.includes(run.serviceMonth)) {
    problems.push(`${run.serviceMonth} is a closed month. A correction posts in the current open month with the original service reference (§22, §65 t40).`);
  }
  for (const l of lines) {
    if (ctx.missingStructureStaffIds.includes(l.staffId)) problems.push(`No eligible pay structure for staff ${l.staffId} this month (§4.8).`);
    if (ctx.unverifiedInputStaffIds.includes(l.staffId)) problems.push(`Work input for staff ${l.staffId} is not Verified; only verified inputs may be approved (§11, §65 t5).`);
    if (l.net < 0) problems.push(`A recovery exceeds the earned gross on staff ${l.staffId}'s line (§10.3).`);
  }
  return problems;
}

export interface ApprovalResult {
  ok: boolean;
  /** §65 t50 a second request finds the run already approved and posts nothing. */
  alreadyApproved: boolean;
  problems: string[];
  run?: PayrollRun;
  postings?: PayrollCostPosting[];
  payables?: PayrollPayable[];
  recoveryEvents?: AdvanceEvent[];
}

/**
 * §20.3 approve a run. On the first request that clears preflight this freezes
 * the totals and returns the cost postings, salary payables and committed
 * recovery events as one atomic set — and **no money entry** (§23). A run already
 * approved returns `{ alreadyApproved }` and posts nothing (§65 t50); money and
 * account balances are untouched throughout.
 */
export function approvePayrollRun(bundle: DraftBundle, ctx: ApprovalContext): ApprovalResult {
  if (bundle.run.calculationState === 'Approved') {
    return { ok: true, alreadyApproved: true, problems: [], run: bundle.run };
  }

  const problems = preflightProblems(bundle, ctx);
  if (bundle.run.calculationState === 'Cancelled' || bundle.run.calculationState === 'Reversed') {
    problems.push('A cancelled or reversed run cannot be approved (§20.4).');
  }
  if (problems.length) return { ok: false, alreadyApproved: false, problems };

  const totals = computeRunTotals(bundle.lines);
  const mismatch = runTotalsMatch(bundle.lines, { gross: totals.gross, advanceRecoveries: totals.advanceRecoveries, netPayable: totals.netPayable });
  if (mismatch.length) return { ok: false, alreadyApproved: false, problems: mismatch };

  // §37 the cost belongs to the service month, whatever day it is approved or paid.
  const postings: PayrollCostPosting[] = bundle.lines.map((l) => ({
    id: `${l.id}~cost`,
    runId: bundle.run.id,
    payrollLineId: l.id,
    category: l.snapshot.costCategory ?? 'Salaries: Administration',
    serviceMonth: bundle.run.serviceMonth,
    amount: l.gross,
  }));
  const payables: PayrollPayable[] = bundle.lines.map((l) => ({
    id: `${l.id}~payable`,
    payrollLineId: l.id,
    runId: bundle.run.id,
    staffId: l.staffId,
    net: l.net,
  }));
  const recoveryEvents: AdvanceEvent[] = bundle.recoveries.map((r) => ({
    id: `${r.id}~event`,
    advanceId: r.advanceId,
    kind: 'Recovered' as const,
    amount: r.amount,
    date: ctx.approvalDate,
    payrollLineId: r.payrollLineId,
  }));

  const run: PayrollRun = {
    ...bundle.run,
    calculationState: 'Approved',
    disbursementState: 'Unpaid',
    totals,
    approvedBy: ctx.actor,
    approvedAt: ctx.timestamp,
    lockedRevision: bundle.run.revision,
    revision: bundle.run.revision + 1,
    updatedBy: ctx.actor,
    updatedAt: ctx.timestamp,
  };

  return { ok: true, alreadyApproved: false, problems: [], run, postings, payables, recoveryEvents };
}

// ----------------------------------------------------------------------------
// Reversal of an approved run (§20.4, §34 spirit, §65 t43)
// ----------------------------------------------------------------------------

export interface ReversalContext {
  actor: string;
  timestamp: string;
  /** §20.4 once any disbursement is made the run stays visible and is fixed by a supplemental, not a cancel. */
  disbursementsExist: boolean;
  /** §20.4 a reconciled or closed month needs reopening before its movement is reversed (§65 t44). */
  closedMonths: readonly ServiceMonth[];
}

export interface ReversalResult {
  ok: boolean;
  problems: string[];
  run?: PayrollRun;
  reversalPostings?: PayrollCostPosting[];
  recoveryReversalEvents?: AdvanceEvent[];
}

/**
 * §20.4 / §65 t43 reverse an approved run that has paid no one: the cost, the
 * payable and the committed recoveries undo together as linked contra events.
 * Nothing is deleted and no money moves here (any money reversal is a linked
 * Finance reversal, P5/P14). Once a disbursement exists, this is refused.
 */
export function reversePayrollRun(bundle: DraftBundle, ctx: ReversalContext): ReversalResult {
  const problems: string[] = [];
  if (bundle.run.calculationState !== 'Approved') problems.push('Only an approved run is reversed (§20.4).');
  if (ctx.disbursementsExist) problems.push('Some disbursements are already made. Use a linked supplemental run or reversal, never a cancel (§20.4).');
  if (ctx.closedMonths.includes(bundle.run.serviceMonth)) problems.push(`${bundle.run.serviceMonth} is closed. An Admin must reopen it before its run is reversed (§34).`);
  if (problems.length) return { ok: false, problems };

  const reversalPostings: PayrollCostPosting[] = bundle.lines.map((l) => ({
    id: `${l.id}~cost~reversal`,
    runId: bundle.run.id,
    payrollLineId: l.id,
    category: l.snapshot.costCategory ?? 'Salaries: Administration',
    serviceMonth: bundle.run.serviceMonth,
    amount: -l.gross,
    reversesPostingId: `${l.id}~cost`,
  }));
  const recoveryReversalEvents: AdvanceEvent[] = bundle.recoveries.map((r) => ({
    id: `${r.id}~reversal`,
    advanceId: r.advanceId,
    kind: 'Reversed' as const,
    amount: r.amount,
    date: ctx.timestamp.slice(0, 10),
    payrollLineId: r.payrollLineId,
  }));

  const run: PayrollRun = {
    ...bundle.run,
    calculationState: 'Reversed',
    updatedBy: ctx.actor,
    updatedAt: ctx.timestamp,
  };
  return { ok: true, problems: [], run, reversalPostings, recoveryReversalEvents };
}

// ----------------------------------------------------------------------------
// Month-close contract (§22, §65 t38, t39)
// ----------------------------------------------------------------------------

export interface MonthCloseStatus {
  finalized: boolean;
  reasons: string[];
}

/**
 * §22 the month-close "Staff pay for the month is finalised" check. It passes
 * when the standard run is approved and frozen (unpaid salaries do **not** block
 * it, §65 t38) or when no-payroll was recorded with a reason; a still-Draft or
 * Submitted run, or an unresolved supplemental, blocks it (§65 t39).
 */
export function monthClosePayrollStatus(month: ServiceMonth, runs: readonly PayrollRun[]): MonthCloseStatus {
  const forMonth = runs.filter((r) => r.serviceMonth === month);
  const reasons: string[] = [];

  // §22 an explicit "No payroll for this month" record is not a payable standard run.
  const noPayrollRecord = forMonth.find((r) => r.noPayrollReason?.trim());
  const standard = forMonth.find((r) => r.kind === 'Standard' && !r.noPayrollReason?.trim());

  if (!standard) {
    if (noPayrollRecord) return { finalized: true, reasons: [`No payroll for ${month} recorded with a reason (§22).`] };
    return { finalized: false, reasons: [`No payroll run exists for ${month} (§22).`] };
  }

  if (standard.calculationState === 'Draft' || standard.calculationState === 'Submitted') {
    reasons.push(`The standard run ${standard.runNumber} is ${standard.calculationState}; approve or explicitly resolve it before closing (§22, §65 t39).`);
    return { finalized: false, reasons };
  }

  const unresolvedSupplementals = forMonth
    .filter((r) => r.kind === 'Supplemental' && (r.calculationState === 'Draft' || r.calculationState === 'Submitted'))
    .map((r) => r.runNumber);
  if (unresolvedSupplementals.length) {
    reasons.push(`Supplemental runs still open: ${unresolvedSupplementals.join(', ')} (§22).`);
    return { finalized: false, reasons };
  }

  if (standard.disbursementState !== 'Paid') {
    reasons.push(`Payroll is finalised; ${month} still-payable salary remains a payable and is paid later (§22, §65 t38).`);
  }
  return { finalized: true, reasons };
}
