// ============================================
// MediCMS Desktop — Staff & Payroll: pay calculation (§8–§10, §65)
//
// The arithmetic that turns a staff member's structure, prorated days and
// confirmed work into earned gross, then net payable. Everything here is pure:
// no clock, no store, no DOM — the rupees and the dates come in. Rules obeyed:
//   • Whole PKR only. Integer counts × integer rates are exact; a *ratio* such
//     as proration is rounded to the nearest rupee, halves up (§10.1, §65 t51).
//   • Default monthly proration = monthly rate × eligible calendar days ÷
//     calendar days in the service month (§10.2). A mid-month rate change is
//     prorated as explicit dated segments that sum to the base (§65 t8).
//   • Earned gross cannot be negative; net = gross − advance recovery (§10).
//   • Unpaid-leave *inference* is a deferred unit: nothing here deduces a
//     reduction from a leave. An Admin-confirmed reduction or correction is a
//     plain line and is honoured (§9), which is what §65 t9 exercises.
// ============================================

import type {
  EarningComponent,
  PayrollLineItem,
  ProrationSegment,
  ServiceMonth,
} from './types.ts';

// ----------------------------------------------------------------------------
// Money primitives (§10.1)
// ----------------------------------------------------------------------------

/**
 * Divide two non-negative whole rupee-ish counts rounding to the nearest
 * integer, halves up. Integer arithmetic so `5000.5` becomes `5001` exactly
 * (§65 t51) without any float wobble.
 */
export function halfUpDivide(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new Error('Proration divides whole numbers; round the inputs first (§10.1).');
  }
  if (denominator <= 0) throw new Error('A proration denominator must be positive (§10.2).');
  if (numerator < 0) throw new Error('Proration rounds a non-negative amount (§10.1).');
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** Calendar days in a `YYYY-MM` service month — the proration denominator (§10.2). */
export function daysInServiceMonth(month: ServiceMonth): number {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`A service month is YYYY-MM, got "${month}" (§19).`);
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) throw new Error(`A service month's month is 01–12, got "${month}" (§19).`);
  // Day 0 of the next month is the last day of this one — deterministic, no clock read.
  return new Date(year, mon, 0).getDate();
}

/**
 * §10.2 default monthly proration: `monthly rate × eligible calendar days ÷
 * calendar days in the service month`, rounded halves up. Full-month service
 * returns the monthly amount untouched (§65 t1, t7).
 */
export function prorateMonthlyAmount(
  monthlyAmount: number,
  eligibleDays: number,
  monthDays: number,
): number {
  if (!Number.isInteger(monthlyAmount) || monthlyAmount < 0) {
    throw new Error('A monthly rate is a whole non-negative amount (§10.1).');
  }
  if (!Number.isInteger(eligibleDays) || eligibleDays < 0 || eligibleDays > monthDays) {
    throw new Error('Eligible days are whole and run 0…month length (§10.2).');
  }
  if (eligibleDays === 0) return 0;
  if (eligibleDays === monthDays) return monthlyAmount;
  return halfUpDivide(monthlyAmount * eligibleDays, monthDays);
}

/**
 * §65 t8: a rate that changes mid-month prorates in explicit dated segments;
 * each segment uses the whole-month denominator and the segments sum to the
 * base. The caller passes the eligible days already carved up by the effective
 * dates, so nothing here reads a calendar.
 */
export function prorateBaseSegments(
  monthDays: number,
  segments: readonly { rate: number; eligibleDays: number; from?: string; to?: string }[],
): { segments: ProrationSegment[]; total: number } {
  let total = 0;
  const out: ProrationSegment[] = segments.map((s) => {
    const amount = prorateMonthlyAmount(s.rate, s.eligibleDays, monthDays);
    total += amount;
    return { from: s.from ?? '', to: s.to ?? '', rate: s.rate, eligibleDays: s.eligibleDays, amount };
  });
  return { segments: out, total };
}

/** §65 t3: a per-class/session line is an integer count × an integer rate. */
export function sessionGross(units: number, rate: number): number {
  if (!Number.isInteger(units) || units < 0) throw new Error('Session counts are whole and non-negative (§10.1).');
  if (!Number.isInteger(rate) || rate < 0) throw new Error('A per-session rate is a whole non-negative amount (§10.1).');
  return units * rate;
}

/**
 * §8 honorarium: either a fixed amount for the service month, or approved units
 * × a per-unit rate. The two are not mixed; a fixed amount wins if supplied.
 */
export function honorariumGross(input: { fixed?: number; units?: number; rate?: number }): number {
  if (input.fixed !== undefined) {
    if (!Number.isInteger(input.fixed) || input.fixed < 0) throw new Error('A fixed honorarium is a whole non-negative amount (§10.1).');
    return input.fixed;
  }
  if (input.units !== undefined && input.rate !== undefined) return sessionGross(input.units, input.rate);
  throw new Error('A honorarium is either a fixed amount or units × a rate (§8).');
}

// ----------------------------------------------------------------------------
// One payroll line: components → gross → net (§10, §12)
// ----------------------------------------------------------------------------

/** Components that add to earned gross; `Reduction` is the only one that subtracts (§9). */
const ADDITIVE: readonly EarningComponent[] = ['Base', 'Session', 'Honorarium', 'Allowance', 'Bonus', 'Correction'];

/** The §19 run-bucket totals a line contributes to, alongside the raw per-component map. */
export interface LineBreakdown {
  byComponent: Record<EarningComponent, number>;
  base: number;
  sessionPay: number;
  honoraria: number;
  allowances: number;
  reductions: number;
  gross: number;
}

/** §10.6 / §12 the checks a line must pass before it can enter an approved run. */
export interface PayLineDraft {
  items: readonly PayrollLineItem[];
  /** Approved advance recovery for the line; capped by the advance core (P3). */
  recovery: number;
  zeroPayReason?: string;
}

export interface PayLineResult {
  gross: number;
  recoveries: number;
  net: number;
  breakdown: LineBreakdown;
  problems: string[];
}

/**
 * §12 the checks and the numbers for one staff line. Gross is the sum of the
 * additive components less reductions; net is gross less the recovery. Refuses
 * a non-integer or negative rupee, a negative earned gross (§10.3), a recovery
 * larger than the gross, and a zero-pay line with no reason (§10.6).
 */
export function computeLineTotals(draft: PayLineDraft): PayLineResult {
  const problems: string[] = [];
  const byComponent: Record<EarningComponent, number> = {
    Base: 0, Session: 0, Honorarium: 0, Allowance: 0, Bonus: 0, Reduction: 0, Correction: 0,
  };

  for (const item of draft.items) {
    if (!Number.isInteger(item.amount) || item.amount < 0) {
      problems.push(`A ${item.component} line is in whole rupees and never negative (§10.1).`);
      continue;
    }
    byComponent[item.component] += item.amount;
  }

  const additive = ADDITIVE.reduce((sum, c) => sum + byComponent[c], 0);
  const gross = additive - byComponent.Reduction;
  if (gross < 0) problems.push('Earned gross cannot be negative (§10.3).');

  if (!Number.isInteger(draft.recovery) || draft.recovery < 0) {
    problems.push('An advance recovery is in whole rupees and never negative (§10.1).');
  }
  const recoveries = draft.recovery;
  const net = gross - recoveries;
  if (gross >= 0 && net < 0) {
    problems.push('A recovery cannot exceed the line\'s earned gross — it is capped at available salary (§10.3).');
  }
  if (gross === 0 && problems.length === 0 && !draft.zeroPayReason?.trim()) {
    problems.push('A zero-pay line needs an explicit reason and stays visible (§10.6).');
  }

  return {
    gross,
    recoveries,
    net,
    breakdown: {
      byComponent,
      base: byComponent.Base,
      sessionPay: byComponent.Session,
      honoraria: byComponent.Honorarium,
      allowances: byComponent.Allowance + byComponent.Bonus + byComponent.Correction,
      reductions: byComponent.Reduction,
      gross,
    },
    problems,
  };
}

// ----------------------------------------------------------------------------
// The run: per-line totals must add up to the stored totals (§64 integrity 9, §65 t52)
// ----------------------------------------------------------------------------

export interface RunAggregate {
  gross: number;
  recoveries: number;
  net: number;
}

/** Sum the frozen per-line totals into the run's gross / recovery / net (§19, t52). */
export function aggregateRunTotals(lines: readonly { gross: number; recoveries: number; net: number }[]): RunAggregate {
  return lines.reduce<RunAggregate>(
    (acc, l) => ({ gross: acc.gross + l.gross, recoveries: acc.recoveries + l.recoveries, net: acc.net + l.net }),
    { gross: 0, recoveries: 0, net: 0 },
  );
}

/**
 * §64 integrity 9: the run's stored totals must equal the sum of its approved
 * lines and each line's net must be gross less its recovery. Returns the
 * mismatch messages — empty means the run ties out.
 */
export function runTotalsMatch(
  lines: readonly { gross: number; recoveries: number; net: number }[],
  totals: { gross: number; advanceRecoveries: number; netPayable: number },
): string[] {
  const problems: string[] = [];
  const agg = aggregateRunTotals(lines);
  for (const l of lines) {
    if (l.net !== l.gross - l.recoveries) {
      problems.push('A line\'s net must equal its gross less its recovery (§10).');
      break;
    }
  }
  if (agg.gross !== totals.gross) problems.push(`Stored gross ${totals.gross} does not equal the lines' ${agg.gross} (§64.9).`);
  if (agg.recoveries !== totals.advanceRecoveries) problems.push(`Stored recoveries ${totals.advanceRecoveries} do not equal the lines' ${agg.recoveries} (§64.9).`);
  if (agg.net !== totals.netPayable) problems.push(`Stored net payable ${totals.netPayable} does not equal the lines' ${agg.net} (§64.9).`);
  return problems;
}
