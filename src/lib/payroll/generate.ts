// ============================================
// MediCMS Desktop — Staff & Payroll: payroll generation (§11, §19–§20, §65 t5)
//
// Turns one staff member's structure and their *Verified* work inputs into the
// earned `PayrollLineItem[]` the run core then freezes. Kept pure and separate
// from the wizard so the shape of a generated line is unit-tested rather than
// improvised in JSX. §11 step 6 is the load-bearing rule here: only a Verified
// work input becomes a line — a Draft is never counted. §9 is the other one:
// nothing here infers a reduction from a leave; an unpaid-leave line becomes a
// Reduction only because the Admin entered an amount against it. Proration and
// session/honorarium arithmetic reuse the calc core so rounding matches §65.
// ============================================

import type {
  Advance,
  AdvanceEvent,
  EarningComponent,
  PayrollLine,
  PayrollLineItem,
  PayrollRecovery,
  PayrollRun,
  PayStructure,
  RunKind,
  ServiceMonth,
  Staff,
  WorkInput,
} from './types.ts';
import { daysInServiceMonth, prorateMonthlyAmount, sessionGross, honorariumGross } from './calc.ts';
import { eligibleDaysInMonth } from './structures.ts';
import { buildPayrollLine, defaultSalaryCategory, resolveEligibility } from './run.ts';
import type { DraftBundle } from './run.ts';
import { outstandingOldestFirst } from './advances.ts';

/** `pr-####` run id, monotonic from the numeric suffix; never reused (§19). */
export function nextRunId(existing: readonly { id: string }[]): string {
  let max = 0;
  for (const r of existing) {
    const m = /^pr-(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `pr-${String(max + 1).padStart(4, '0')}`;
}

export interface EarnedItemsInput {
  /** Stable per run+staff; every item id hangs off it. */
  lineId: string;
  month: ServiceMonth;
  structure: PayStructure;
  staff: Pick<Staff, 'staffType' | 'joiningDate' | 'leavingDate'>;
  /** The caller passes the month's inputs; only `Verified` ones are used (§11). */
  workInputs: readonly WorkInput[];
}

/**
 * §11 the earned lines for one staff member's month. The structure contributes a
 * prorated base and its allowance defaults (fixed monthly), or a fixed honorarium;
 * Verified work inputs contribute their quantity or amount. Session and unit
 * honoraria need the structure's per-unit rate.
 */
export function buildEarnedItems(input: EarnedItemsInput): PayrollLineItem[] {
  const monthDays = daysInServiceMonth(input.month);
  const eligibleDays = eligibleDaysInMonth(input.month, [
    { from: input.structure.effectiveFrom, to: input.structure.effectiveTo },
    { from: input.staff.joiningDate, to: input.staff.leavingDate },
  ]);
  const category = input.structure.costCategory ?? defaultSalaryCategory(input.staff.staffType);
  const rate = input.structure.ratePerSession ?? 0;
  const items: PayrollLineItem[] = [];

  const push = (
    component: EarningComponent,
    amount: number,
    extra?: Partial<PayrollLineItem>,
  ): void => {
    items.push({
      id: `${input.lineId}~${component}~${items.length}`,
      component,
      amount,
      costCategory: category,
      programTag: input.structure.programTag,
      ...extra,
    });
  };

  if (input.structure.type === 'Fixed monthly' && input.structure.monthlyBase !== undefined) {
    push('Base', prorateMonthlyAmount(input.structure.monthlyBase, eligibleDays, monthDays), {
      eligibleDays,
      denominator: monthDays,
      serviceFrom: `${input.month}-01`,
    });
    for (const a of input.structure.allowanceDefaults ?? []) {
      const amount = a.followsBaseProration ? prorateMonthlyAmount(a.amount, eligibleDays, monthDays) : a.amount;
      push('Allowance', amount, { reason: a.label });
    }
  }

  if (input.structure.type === 'Honorarium' && input.structure.honorariumFixed !== undefined) {
    push('Honorarium', honorariumGross({ fixed: input.structure.honorariumFixed }));
  }

  // §11 step 6 only a Verified input counts. Paid leave carries no money (§9).
  for (const w of input.workInputs.filter((x) => x.state === 'Verified')) {
    switch (w.type) {
      case 'Session':
        if (w.units) push('Session', sessionGross(w.units, rate), { sourceWorkInputId: w.id });
        break;
      case 'Honorarium':
        // A fixed honorarium already paid the month; only a unit-based one uses the input.
        if (input.structure.honorariumFixed === undefined && w.units) {
          push('Honorarium', sessionGross(w.units, rate), { sourceWorkInputId: w.id });
        }
        break;
      case 'Allowance':
        if (w.amount) push('Allowance', w.amount, { sourceWorkInputId: w.id, reason: w.note });
        break;
      case 'Bonus':
        if (w.amount) push('Bonus', w.amount, { sourceWorkInputId: w.id, reason: w.note });
        break;
      case 'Correction':
        if (w.amount) push('Correction', w.amount, { sourceWorkInputId: w.id, reason: w.reason ?? w.note });
        break;
      case 'Unpaid leave':
        // §9 only an Admin-entered amount reduces pay; a dated leave alone infers nothing.
        if (w.amount) push('Reduction', w.amount, { sourceWorkInputId: w.id, reason: w.reason ?? w.note ?? 'Unpaid leave' });
        break;
      case 'Paid leave':
        break;
    }
  }

  return items;
}

/**
 * §10.5 / §11 how much of one advance the policy asks to recover in a service
 * month, before the per-run available-salary cap. A Manual-per-run policy is 0 —
 * the Admin chooses it on the review screen. Recovery has not started before the
 * advance's start month (ISO `YYYY-MM` compares lexically).
 */
export function recoveryRequestForMonth(advance: Advance, balance: number, month: ServiceMonth): number {
  if (balance <= 0) return 0;
  if (advance.startRecoveryMonth > month) return 0;
  switch (advance.recoveryPolicy) {
    case 'Fixed per month':
      return Math.min(advance.fixedRecoveryAmount ?? 0, balance);
    case 'Remaining in full':
      return balance;
    case 'Manual per run':
      return 0;
  }
}

export interface GenerateRunInput {
  runId: string;
  runNumber: string;
  month: ServiceMonth;
  kind: RunKind;
  referencesRunId?: string;
  staffGroup?: string;
  staff: readonly Staff[];
  structures: readonly PayStructure[];
  workInputs: readonly WorkInput[];
  advances: readonly Advance[];
  advanceEvents: readonly AdvanceEvent[];
  actor: string;
  now: string;
}

export interface GeneratedRun {
  /** A Draft run with its frozen lines and planned recoveries — no money, no totals. */
  bundle: DraftBundle;
  /** §4.8 staff who span the month but have no structure; the run skips them and the wizard reports them. */
  missingStructure: string[];
}

/**
 * §11 / §19 assemble a whole Draft run: every eligible staff gets a line built
 * from their structure and Verified inputs, and their advance recovery is
 * planned oldest-first within the §10.3 caps. The run is left in `Draft` with no
 * `totals` — those freeze only at approval in the run core. Shared by the wizard
 * and the review screen's recalculation so generation is one tested path.
 */
export function generateRunDraft(input: GenerateRunInput): GeneratedRun {
  const { eligible, missingStructure } = resolveEligibility(input.staff, input.structures, input.month);
  const staffById = new Map(input.staff.map((s) => [s.id, s]));
  const lines: PayrollLine[] = [];
  const recoveries: PayrollRecovery[] = [];

  for (const e of eligible) {
    const s = staffById.get(e.staffId);
    if (!s) continue;
    const lineId = `${input.runId}~${e.staffId}`;
    const items = buildEarnedItems({
      lineId,
      month: input.month,
      structure: e.structure,
      staff: s,
      workInputs: input.workInputs.filter((w) => w.staffId === e.staffId && w.serviceMonth === input.month),
    });
    const staffAdvances = input.advances.filter((a) => a.staffId === e.staffId);
    const outstanding = outstandingOldestFirst(staffAdvances, input.advanceEvents);
    const recoveryRequested = staffAdvances.reduce((sum, a) => {
      const balance = outstanding.find((o) => o.advanceId === a.id)?.balance ?? 0;
      return sum + recoveryRequestForMonth(a, balance, input.month);
    }, 0);
    const built = buildPayrollLine({
      runId: input.runId,
      lineId,
      staffId: e.staffId,
      staffType: s.staffType,
      structure: e.structure,
      items,
      recoveryRequested,
      advances: outstanding,
      selection: 'Oldest first',
    });
    lines.push(built.line);
    recoveries.push(...built.recoveries);
  }

  const run: PayrollRun = {
    id: input.runId,
    runNumber: input.runNumber,
    serviceMonth: input.month,
    kind: input.kind,
    referencesRunId: input.referencesRunId,
    staffGroup: input.staffGroup,
    calculationState: 'Draft',
    disbursementState: 'Unpaid',
    revision: 1,
    costPostingIds: [],
    payoutBatchIds: [],
    createdBy: input.actor,
    createdAt: input.now,
  };

  return { bundle: { run, lines, recoveries }, missingStructure };
}
