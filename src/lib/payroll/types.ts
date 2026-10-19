// ============================================
// MediCMS Desktop — Staff & Payroll: the domain model (§4–§20, §55–§57, §64)
//
// This file only *describes* the records payroll keeps and the numbers it
// mints. It runs no rules and reads no clock or store. Two things every
// definition below obeys, taken straight from the document:
//   • Money is whole PKR (§10.1). Amounts are integers, always positive — the
//     line's component carries whether it adds to or reduces earned pay.
//   • Balances, totals, registers and statuses are *derived*, never stored
//     (§6.1 of Finance Core, restated by §64 integrity 9). Where an approved
//     run keeps a frozen snapshot it is called out as such — an approved run
//     is immutable history, not a mutable balance.
// The shape of a Finance money entry is Finance Core's (`moneyStore`); payroll
// reaches it only by reference. See §67: the new "Staff advance" entry kind and
// the payroll cost view are Finance Core changes, added in the integration unit.
// ============================================

import type { MoneyDirection } from '../finance/types.ts';

/** A local calendar date, `YYYY-MM-DD` — the same convention the finance cores use. */
export type IsoDate = string;
/** A service month, `YYYY-MM` (§19). Not a date; a payroll belongs to one of these. */
export type ServiceMonth = string;

// ----------------------------------------------------------------------------
// Feature 1 — the staff register (§4, §5)
// ----------------------------------------------------------------------------

/** §4 "Staff type". The type also defaults the structure's cost category (§8). */
export type StaffType =
  | 'Teaching'
  | 'Administration'
  | 'Support'
  | 'Visiting faculty'
  | 'Clinical instructor/doctor';
export const STAFF_TYPES: readonly StaffType[] = [
  'Teaching', 'Administration', 'Support', 'Visiting faculty', 'Clinical instructor/doctor',
];

/** §5 employment status. "Left" is a mark, never a delete (§4 rule 3). */
export type EmploymentStatus = 'Active' | 'On leave' | 'Left';
export const EMPLOYMENT_STATUSES: readonly EmploymentStatus[] = ['Active', 'On leave', 'Left'];

/** §4 employment mode. */
export type EmploymentMode = 'Regular' | 'Part-time' | 'Visiting' | 'Contract';
export const EMPLOYMENT_MODES: readonly EmploymentMode[] = ['Regular', 'Part-time', 'Visiting', 'Contract'];

/** §4 default payout preference and §8 usual payout mode — the three money routes. */
export type PayoutMode = 'Cash' | 'Bank transfer' | 'Cheque';
export const PAYOUT_MODES: readonly PayoutMode[] = ['Cash', 'Bank transfer', 'Cheque'];

/**
 * §4 the staff record. One record is one person even across many programs
 * (rule 1). The fields below `—— sensitive ——` are Admin-only: bank account
 * numbers and CNIC never leave the secure projection (§64 integrity 8), and the
 * last four digits are all that shows elsewhere (§4).
 */
export interface Staff {
  /** Internal key; distinct from the immutable, never-reused `staffNo`. */
  id: string;
  /** `ST-####` — generated, unique, never reused (§4, §64 integrity 1). */
  staffNo: string;
  fullName: string;
  fatherGuardianName?: string;
  // —— sensitive: Admin only (§4, §64 integrity 8) ——
  /** Normalised for the duplicate warning; identical CNIC is blocked (§4 rule 2). */
  cnic?: string;
  phone?: string;
  email?: string;
  address?: string;
  emergencyContact?: string;
  /** Same safe upload conventions as the Student module (§4); a name, not bytes. */
  photo?: string;
  staffType: StaffType;
  /** Required free text, or a Settings suggestion (§4). */
  designation: string;
  department?: string;
  /** §4 optional one or several Active programs; creates no academic batch. */
  programIds: string[];
  /** Required; cannot be after the leaving date (§4). */
  joiningDate: IsoDate;
  leavingDate?: IsoDate;
  employmentStatus: EmploymentStatus;
  employmentMode: EmploymentMode;
  payoutPreference?: PayoutMode;
  /** Admin-only; last four digits only outside the secure edit field (§4). */
  bankName?: string;
  bankAccount?: string;
  accountHolder?: string;
  /** Sensitive notes are Admin-only (§4). */
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

/**
 * §4 rule 6 / §64: a person who rejoins is reactivated under the same staff
 * number with a *new* period, never a duplicate. Employment history rides here.
 */
export interface StaffEmploymentPeriod {
  id: string;
  staffId: string;
  from: IsoDate;
  /** Open-ended while current; set when the member leaves (§4). */
  to?: IsoDate;
  designation?: string;
  department?: string;
  /** Why the period opened or closed; a rehire note (§64). */
  reason?: string;
}

// ----------------------------------------------------------------------------
// Feature 2 — pay structures and monthly work inputs (§8–§11)
// ----------------------------------------------------------------------------

/** §8 the three ways the institute pays. */
export type PayStructureType = 'Fixed monthly' | 'Per session' | 'Honorarium';
export const PAY_STRUCTURE_TYPES: readonly PayStructureType[] = ['Fixed monthly', 'Per session', 'Honorarium'];

/**
 * §8 the reserved Staff cost categories a structure maps to (default by staff
 * type). These are payroll's own — a manual vendor/Record-Cost bill naming one
 * is blocked (§65 test 47). Finance Core owns the category records; §67.
 */
export const SALARY_COST_CATEGORIES = [
  'Salaries: Teaching',
  'Salaries: Administration',
  'Salaries: Support',
  'Honoraria: Visiting faculty',
  'Honoraria: Clinical instructors and doctors',
] as const;
export type SalaryCostCategory = (typeof SALARY_COST_CATEGORIES)[number];

/** §8 an optional allowance default carried on a fixed structure. */
export interface AllowanceDefault {
  label: string;
  amount: number;
  /**
   * §65 policy note: a recurring allowance is not reduced by unpaid days unless
   * the structure says it follows base proration. Unpaid-leave reduction is a
   * deferred unit, but the flag is part of the structure shape now.
   */
  followsBaseProration?: boolean;
}

/**
 * §8 the pay structure. Effective-dated and never overlapping for one staff
 * member (integrity 2); a structure used by an approved run is never rewritten
 * (§8, §10 rule 8) — an approved line snapshots these figures instead.
 */
export interface PayStructure {
  id: string;
  staffId: string;
  type: PayStructureType;
  /** Fixed monthly base (§8). */
  monthlyBase?: number;
  /** Per-class/session rate, and the honorarium per-unit rate when it is unit-based (§8). */
  ratePerSession?: number;
  /** Honorarium expressed as a fixed amount for a service month (§8). */
  honorariumFixed?: number;
  allowanceDefaults?: AllowanceDefault[];
  /** Optional Staff cost category; defaults from staff type (§8). */
  costCategory?: SalaryCostCategory;
  /** Optional usual Finance program tag. No automatic multi-program split (§8). */
  programTag?: string;
  /** §8 kept separate from the numeric rate: the usual mode and a reference bank. */
  usualPayoutMode?: PayoutMode;
  referenceBankAccount?: string;
  effectiveFrom: IsoDate;
  /** Open-ended while current. */
  effectiveTo?: IsoDate;
  /** Why the structure changed (§8). */
  reason?: string;
  /** §64 revision counter; never reset. */
  revision: number;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  createdAt: string;
}

/**
 * §9 / §11 the earnings and review lines an Admin confirms for one service
 * month. Payroll generation uses only `Verified` inputs (§11 step 6); a revised
 * quantity needs a reason and re-verification.
 */
export type WorkInputType =
  | 'Session'
  | 'Honorarium'
  | 'Allowance'
  | 'Bonus'
  | 'Paid leave'
  | 'Unpaid leave'
  | 'Correction';
export const WORK_INPUT_TYPES: readonly WorkInputType[] = [
  'Session', 'Honorarium', 'Allowance', 'Bonus', 'Paid leave', 'Unpaid leave', 'Correction',
];

export type VerificationState = 'Draft' | 'Verified';

export interface WorkInput {
  id: string;
  staffId: string;
  serviceMonth: ServiceMonth;
  type: WorkInputType;
  /** Integer units for session/honorarium counts (§10.1). */
  units?: number;
  /** A fixed rupee line (allowance/bonus/correction); whole PKR, positive. */
  amount?: number;
  /** The dates a leave or a one-off covers, when the line is dated (§9). */
  fromDate?: IsoDate;
  toDate?: IsoDate;
  /** §11 state and its actor/time. */
  state: VerificationState;
  verifiedBy?: string;
  verifiedAt?: string;
  /** §11 a deliberate `0 — no sessions` and every revision carry a reason. */
  reason?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Feature 3 — staff advances (§14–§16)
// ----------------------------------------------------------------------------

/** §14 the six advance states. Money moves only at the "Pending disbursement → Active" pay. */
export type AdvanceStatus =
  | 'Draft'
  | 'Approved'
  | 'Pending disbursement'
  | 'Active'
  | 'Recovered'
  | 'Cancelled';
export const ADVANCE_STATUSES: readonly AdvanceStatus[] = [
  'Draft', 'Approved', 'Pending disbursement', 'Active', 'Recovered', 'Cancelled',
];

/** §14 recovery policy. */
export type RecoveryPolicy = 'Fixed per month' | 'Remaining in full' | 'Manual per run';
export const RECOVERY_POLICIES: readonly RecoveryPolicy[] = ['Fixed per month', 'Remaining in full', 'Manual per run'];

/**
 * §14 the advance record. Its **balance is never stored here** — it is rebuilt
 * from `AdvanceEvent`s (§17 "the balance is rebuilt ... not typed into a
 * mutable field"). Creating or approving moves no money (§15).
 */
export interface Advance {
  id: string;
  /** `ADV-####` — unique, never reused (§14). */
  advanceNo: string;
  staffId: string;
  /** Positive whole PKR (§14). */
  requestedAmount: number;
  /** The approved amount the balance starts from; absent while Draft (§64). */
  approvedAmount?: number;
  reason: string;
  status: AdvanceStatus;
  method?: PayoutMode;
  /** Existing Finance account and cheque books (§14) — by reference. */
  payoutAccountId?: string;
  financeReference?: string;
  chequeId?: string;
  /** Actual payment date; no future posted cash/bank movement (§14). */
  paymentDate?: IsoDate;
  recoveryPolicy: RecoveryPolicy;
  /** For the "Fixed per month" policy (§14). */
  fixedRecoveryAmount?: number;
  /** Defaults to the next service month (§14). */
  startRecoveryMonth: ServiceMonth;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  createdAt: string;
}

/** §64 one event on an advance's ledger. The balance is the running sum of these. */
export type AdvanceEventKind = 'Disbursed' | 'Recovered' | 'Reversed';

export interface AdvanceEvent {
  id: string;
  advanceId: string;
  kind: AdvanceEventKind;
  amount: number;
  /** Posting date of the event (§64). */
  date: IsoDate;
  /** A disbursement rides a Finance money entry / cheque; a recovery a payroll line (§64). */
  moneyEntryId?: string;
  actionId?: string;
  chequeId?: string;
  payrollLineId?: string;
  /** A reversed recovery names the event it undoes (§34 spirit, §15). */
  reversesEventId?: string;
  reason?: string;
}

// ----------------------------------------------------------------------------
// Feature 4 — the payroll run, its lines and postings (§19–§22, §64)
// ----------------------------------------------------------------------------

/** §19 calculation state. */
export type RunCalculationState = 'Draft' | 'Submitted' | 'Approved' | 'Cancelled' | 'Reversed';
/** §19 disbursement state, kept separate from the calculation state. */
export type RunDisbursementState = 'Unpaid' | 'Part paid' | 'Paid' | 'Pending cheque clearance';

/** §19 the run is the month's Standard or a linked Supplemental/Correction. */
export type RunKind = 'Standard' | 'Supplemental';

/** §19 the frozen rupee totals an approved run snapshots (see §64 integrity 9). */
export interface RunTotals {
  base: number;
  sessionPay: number;
  honoraria: number;
  allowances: number;
  reductions: number;
  gross: number;
  advanceRecoveries: number;
  netPayable: number;
  paid: number;
  pendingCheques: number;
  stillPayable: number;
}

/**
 * §19 the payroll run header. The rupee `totals` are the frozen snapshot written
 * only at approval — an approved run is immutable history, so this is not a
 * stored-and-drifting balance. Every draft figure is recomputed from the lines.
 */
export interface PayrollRun {
  id: string;
  /** `PAY-YYYY-MM-NN` — immutable (§19, integrity 1). Standard is always NN = 01. */
  runNumber: string;
  serviceMonth: ServiceMonth;
  kind: RunKind;
  /** A supplemental run references the original it corrects (§19, §20.4). */
  referencesRunId?: string;
  /** §19 group filter label; never spawns a second live standard run. */
  staffGroup?: string;
  calculationState: RunCalculationState;
  disbursementState: RunDisbursementState;
  revision: number;
  /** Frozen on approval; undefined while Draft/Submitted (§19, §21). */
  totals?: RunTotals;
  approvedBy?: string;
  approvedAt?: string;
  reviewNote?: string;
  /** §20.3 the calculation revision locked at approval. */
  lockedRevision?: number;
  /** §22 recorded when a month legitimately has no payroll. */
  noPayrollReason?: string;
  /** §19 Finance links, filled as the run pays out; all by reference. */
  costPostingIds: string[];
  payoutBatchIds: string[];
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

/** §10 / §64 a payroll line is one staff member's earnings for the run. */
export type EarningComponent =
  | 'Base'
  | 'Session'
  | 'Honorarium'
  | 'Allowance'
  | 'Bonus'
  | 'Reduction'
  | 'Correction';
export const EARNING_COMPONENTS: readonly EarningComponent[] = [
  'Base', 'Session', 'Honorarium', 'Allowance', 'Bonus', 'Reduction', 'Correction',
];

/** §65 test 8: a mid-month rate change prorates in explicit dated segments. */
export interface ProrationSegment {
  from: IsoDate;
  to: IsoDate;
  rate: number;
  /** Eligible calendar days this segment counts (§10.2). */
  eligibleDays: number;
  amount: number;
}

/**
 * §64 one earned/reduced line inside a payroll line. `amount` is a positive
 * whole rupee magnitude; the component says whether the calculation core adds it
 * to or takes it from earned gross. Snapshot fields keep §10 rule 8 true.
 */
export interface PayrollLineItem {
  id: string;
  component: EarningComponent;
  amount: number;
  /** The service dates this line covers, when dated (§64). */
  serviceFrom?: IsoDate;
  serviceTo?: IsoDate;
  /** §12 proration preview: eligible days and the month denominator shown. */
  eligibleDays?: number;
  denominator?: number;
  segments?: ProrationSegment[];
  /** The Verified work input this came from, if any (§64). */
  sourceWorkInputId?: string;
  costCategory: SalaryCostCategory | string;
  programTag?: string;
  /** Required for a zero-pay line and for every correction (§10.6, §9). */
  reason?: string;
}

/** §10 / §64 the frozen per-staff snapshot inside an approved line. */
export interface PayStructureSnapshot {
  structureId: string;
  revision: number;
  type: PayStructureType;
  monthlyBase?: number;
  ratePerSession?: number;
  honorariumFixed?: number;
  costCategory?: SalaryCostCategory;
}

export interface PayrollLine {
  id: string;
  runId: string;
  staffId: string;
  /** §64 the structure version this line was calculated from — a snapshot. */
  snapshot: PayStructureSnapshot;
  items: PayrollLineItem[];
  /** Derived-then-frozen rupees (§10). Kept on the line so a paid line is auditable. */
  gross: number;
  recoveries: number;
  net: number;
  /** §10.6 a zero-pay line stays visible with a reason rather than vanishing. */
  zeroPayReason?: string;
  /** §20.2 an Admin override needs a reason; the recalculation shows it. */
  overrideReason?: string;
}

/** §64 links a payroll line to the advance it recovers, and the advance event. */
export type RecoverySelection = 'Oldest first' | 'Manual';

export interface PayrollRecovery {
  id: string;
  payrollLineId: string;
  advanceId: string;
  amount: number;
  /** The `Recovered` advance event this committed (§64, §15). */
  advanceEventId?: string;
  selection: RecoverySelection;
  /** §10.4 a manual selection names why a specific advance was chosen. */
  reason?: string;
}

/**
 * §64 the cost posting that carries an approved line's gross into a service
 * month's Finance cost view. Not a money entry — money moves only on payment
 * (§67). Reversals are linked, never edits (§34 spirit).
 */
export interface PayrollCostPosting {
  id: string;
  runId: string;
  payrollLineId: string;
  category: SalaryCostCategory | string;
  serviceMonth: ServiceMonth;
  amount: number;
  /** The Finance action this posted under, once linked (§67). */
  actionId?: string;
  reversesPostingId?: string;
}

/**
 * §64 the salary payable an approved line creates — distinct from a vendor bill
 * (§67). What is still owed is derived from settlements and reversals, so only
 * the approved `net` is stored here; `settled`/`status` are calculated (P4/P5).
 */
export interface PayrollPayable {
  id: string;
  payrollLineId: string;
  runId: string;
  staffId: string;
  /** Approved net for the line; the ceiling nothing may be paid beyond (§29, test 29). */
  net: number;
}

// ----------------------------------------------------------------------------
// Feature 5 — disbursement (§55–§57, §64)
// ----------------------------------------------------------------------------

/** §55/§56 a payout batch's life. Named detail is Admin-only (§56.1 vs §56.2). */
export type PayoutBatchState =
  | 'Prepared'
  | 'Ready'
  | 'Authorized'
  | 'Executed'
  | 'Part executed'
  | 'Cancelled';
export const PAYOUT_BATCH_STATES: readonly PayoutBatchState[] = [
  'Prepared', 'Ready', 'Authorized', 'Executed', 'Part executed', 'Cancelled',
];

/**
 * §55/§64 a payout batch groups one run's lines by mode and account. The count
 * and authorized total are **derived from its allocations** (§64), never stored,
 * so they can never drift from what the named lines actually sum to.
 */
export interface PayrollPayoutBatch {
  id: string;
  /** `PB-YYYYMM-###` (§55, §64). */
  batchNo: string;
  runId: string;
  mode: PayoutMode;
  /** An existing Finance account (§55) — by reference. */
  accountId: string;
  state: PayoutBatchState;
  /** Bank or external execution reference the Accountant supplies (§56). */
  externalReference?: string;
  executionDate?: IsoDate;
  /** The Finance action id the execution posted under (§56.2, integrity 5). */
  financeActionId?: string;
  authorizedBy?: string;
  authorizedAt?: string;
  createdBy: string;
  createdAt: string;
}

/**
 * §64 assigns an approved batch to one payroll line for an authorized amount.
 * `settled` is derived from the disbursements that reference it; the never-
 * overpay rule (integrity 7) caps planned+issued+paid at the line's payable.
 */
export interface PayrollPayoutAllocation {
  id: string;
  batchId: string;
  payrollLineId: string;
  /** Authorized whole PKR for this line in this batch (§64). */
  authorizedAmount: number;
  /** For a cheque batch, the issued cheque that will settle it (§57.2). */
  chequeId?: string;
  note?: string;
}

/** §57/§64 the actual money movement that settles an allocation. */
export type DisbursementState = 'Planned' | 'Posted' | 'Cleared' | 'Cancelled' | 'Reversed';

export interface PayrollDisbursement {
  id: string;
  batchId: string;
  allocationId?: string;
  payrollLineId?: string;
  direction: MoneyDirection;
  amount: number;
  /** The Finance voucher / money entry / cheque this rides (§64). */
  voucherId?: string;
  moneyEntryId?: string;
  chequeId?: string;
  /** Actual date the money moved (§64). */
  actualDate: IsoDate;
  state: DisbursementState;
  reference?: string;
  reversesDisbursementId?: string;
}

// ----------------------------------------------------------------------------
// Identifiers (§4, §14, §19, §55, §64 integrity 1) — minted, never reused
// ----------------------------------------------------------------------------

/** Zero-pad a number to `width`, as the sample numbers `ST-0042`, `PB-202610-001` show. */
function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * §60 a stored prefix always ends in exactly one dash; a blank falls back to
 * the design default, so a half-typed Settings value never mints `ST0001`.
 */
function numberPrefix(prefix: string | undefined, fallback: string): string {
  const p = prefix?.trim() || fallback;
  return p.endsWith('-') ? p : `${p}-`;
}

/**
 * `<prefix>####`, the next number above every staff number seen. Never reuses
 * one (§4 rule, integrity 1) — the trailing digits count whatever their prefix,
 * so changing the §60 prefix never restarts the sequence on old records.
 */
export function nextStaffNo(existing: readonly Pick<Staff, 'staffNo'>[], prefix?: string): string {
  const p = numberPrefix(prefix, 'ST-');
  let max = 0;
  for (const s of existing) {
    const m = /(\d+)$/.exec(s.staffNo);
    if (m && Number(m[1]) > max) max = Number(m[1]);
  }
  return `${p}${pad(max + 1, 4)}`;
}

/** `<prefix>####`, next above every advance number seen. Never reused (§14, §60). */
export function nextAdvanceNo(existing: readonly Pick<Advance, 'advanceNo'>[], prefix?: string): string {
  const p = numberPrefix(prefix, 'ADV-');
  let max = 0;
  for (const a of existing) {
    const m = /(\d+)$/.exec(a.advanceNo);
    if (m && Number(m[1]) > max) max = Number(m[1]);
  }
  return `${p}${pad(max + 1, 4)}`;
}

/** The service month a dated record belongs to; `YYYY-MM-DD` → `YYYY-MM`. */
export function serviceMonthOf(date: IsoDate): ServiceMonth {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!m) throw new Error(`A payroll date must be YYYY-MM-DD, got "${date}" (§19).`);
  return `${m[1]}-${m[2]}`;
}

function isServiceMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

/**
 * `PAY-YYYY-MM-NN` for a service month: the next sequence number already used
 * in that month, plus one — a standard run is `01`, supplemental runs follow
 * (§19). The one-standard-per-month rule itself is enforced in the run core.
 */
export function nextRunNumber(month: ServiceMonth, existing: readonly Pick<PayrollRun, 'runNumber'>[], prefix?: string): string {
  if (!isServiceMonth(month)) throw new Error(`A service month is YYYY-MM, got "${month}" (§19).`);
  const runPrefix = `${numberPrefix(prefix, 'PAY-')}${month}-`;
  let max = 0;
  for (const r of existing) {
    if (r.runNumber.startsWith(runPrefix)) {
      const n = Number(r.runNumber.slice(runPrefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${runPrefix}${pad(max + 1, 2)}`;
}

/** `PB-YYYYMM-###` for a service month: the next batch number in that month (§55). */
export function nextBatchNo(month: ServiceMonth, existing: readonly Pick<PayrollPayoutBatch, 'batchNo'>[], prefix?: string): string {
  if (!isServiceMonth(month)) throw new Error(`A service month is YYYY-MM, got "${month}" (§55).`);
  const batchPrefix = `${numberPrefix(prefix, 'PB-')}${month.replace('-', '')}-`;
  let max = 0;
  for (const b of existing) {
    if (b.batchNo.startsWith(batchPrefix)) {
      const n = Number(b.batchNo.slice(batchPrefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${batchPrefix}${pad(max + 1, 3)}`;
}

// ----------------------------------------------------------------------------
// Settings (§60) — the payroll-owned defaults the screens read
// ----------------------------------------------------------------------------

/**
 * §60 the stored payroll settings: the four number prefixes feed the minters
 * above, and three rows seed the screens that create advances and runs. No
 * value ever rewrites an approved run — those keep their frozen snapshot
 * ("Changing a Settings value does not silently change already approved pay
 * runs", §60). The rows §60 marks Shared or fixed (proration calendar days,
 * cheque stale threshold, cash negative, bank overdraft, categories, formats,
 * re-authentication) belong to Finance Core or to the calculation contract and
 * are shown on the Settings screen, not stored twice here.
 */
export interface PayrollSettings {
  staffPrefix: string;
  runPrefix: string;
  batchPrefix: string;
  advancePrefix: string;
  /** §60 the month the pay-run wizard opens on. */
  generationDefaultMonth: 'previous unfinalized month' | 'current month';
  /** §60 the recovery-start month a new advance proposes. */
  startingRecoveryMonth: 'next service month' | 'current service month';
  /** §60 the recovery policy a new advance starts with. */
  recoveryPolicy: RecoveryPolicy;
}

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  staffPrefix: 'ST-',
  runPrefix: 'PAY-',
  batchPrefix: 'PB-',
  advancePrefix: 'ADV-',
  generationDefaultMonth: 'previous unfinalized month',
  startingRecoveryMonth: 'next service month',
  recoveryPolicy: 'Fixed per month',
};
