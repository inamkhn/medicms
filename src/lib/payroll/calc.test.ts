// ============================================
// MediCMS Desktop — Staff & Payroll: pay calculation tests (§8–§10, §65)
// Worked cases 1–4, 6–11, 51 and 52 straight from the design table, plus the
// rounding and cap rules. Pure, no clock. Run with: npm test
// (Case 5 — an unverified session input blocks approval — is a preflight rule
//  that lives in the run core, P4.)
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, notEqual, throws } from 'node:assert/strict';

import {
  aggregateRunTotals,
  computeLineTotals,
  daysInServiceMonth,
  halfUpDivide,
  honorariumGross,
  prorateBaseSegments,
  prorateMonthlyAmount,
  runTotalsMatch,
  sessionGross,
} from './calc.ts';
import type { EarningComponent, PayrollLineItem } from './types.ts';

function item(component: EarningComponent, amount: number): PayrollLineItem {
  return { id: `i-${component}-${amount}`, component, amount, costCategory: 'Salaries: Teaching' };
}

describe('money primitives (§10.1)', () => {
  it('halves up on an exact .5 and leaves whole numbers alone (§65 t51)', () => {
    equal(halfUpDivide(10001 * 15, 30), 5001); // 10,001 prorated 15/30
    equal(halfUpDivide(900000, 30), 30000);
    equal(halfUpDivide(7, 2), 4);
    equal(halfUpDivide(6, 2), 3);
  });

  it('refuses a bad divide', () => {
    throws(() => halfUpDivide(10, 0), /denominator must be positive/);
    throws(() => halfUpDivide(1.5, 2), /whole numbers/);
  });

  it('knows the calendar days in a service month', () => {
    equal(daysInServiceMonth('2026-10'), 31);
    equal(daysInServiceMonth('2026-02'), 28);
    equal(daysInServiceMonth('2024-02'), 29); // leap
    throws(() => daysInServiceMonth('2026-13'), /01–12/);
  });
});

describe('fixed monthly pay and proration (§8, §10.2)', () => {
  it('pays the untouched base for a full month (§65 t1)', () => {
    equal(prorateMonthlyAmount(60000, 30, 30), 60000);
  });

  it('prorates a joining month to eligible days (§65 t7)', () => {
    equal(prorateMonthlyAmount(60000, 15, 30), 30000);
  });

  it('rounds a half rupee up (§65 t51)', () => {
    equal(prorateMonthlyAmount(10001, 15, 30), 5001);
  });

  it('refuses days outside the month', () => {
    throws(() => prorateMonthlyAmount(60000, 31, 30), /run 0…month length/);
  });

  it('splits a mid-month rate change into dated segments that sum (§65 t8)', () => {
    const r = prorateBaseSegments(30, [
      { rate: 60000, eligibleDays: 15 },
      { rate: 66000, eligibleDays: 15 },
    ]);
    deepStrictEqual(r.segments.map((s) => s.amount), [30000, 33000]);
    equal(r.total, 63000);
  });
});

describe('variable pay (§8, §10)', () => {
  it('pays sessions as units × rate (§65 t3)', () => {
    equal(sessionGross(12, 4000), 48000);
  });

  it('pays a clinical honorarium per unit (§65 t4)', () => {
    equal(honorariumGross({ units: 5, rate: 8000 }), 40000);
  });

  it('takes a fixed honorarium for the month, ignoring units (§8)', () => {
    equal(honorariumGross({ fixed: 25000 }), 25000);
  });

  it('refuses a honorarium with neither form', () => {
    throws(() => honorariumGross({}), /fixed amount or units/);
  });
});

describe('one payroll line: gross → net (§9, §10, §12)', () => {
  it('adds an allowance to base (§65 t2)', () => {
    const r = computeLineTotals({ items: [item('Base', 60000), item('Allowance', 2000)], recovery: 0, zeroPayReason: undefined });
    equal(r.gross, 62000);
    equal(r.net, 62000);
    equal(r.problems.length, 0);
  });

  it('carries a zero-pay line only with a reason (§65 t6, §10.6)', () => {
    const noReason = computeLineTotals({ items: [item('Session', 0)], recovery: 0 });
    equal(noReason.gross, 0);
    notEqual(noReason.problems.find((p) => /zero-pay line/.test(p)), undefined);

    const withReason = computeLineTotals({ items: [item('Session', 0)], recovery: 0, zeroPayReason: 'No sessions this month' });
    equal(withReason.problems.length, 0);
  });

  it('honours an Admin-confirmed absence reduction (§65 t9)', () => {
    // 3 unpaid days on a 60,000 / 30-day month = a 6,000 reduction line.
    const reduction = prorateMonthlyAmount(60000, 3, 30);
    equal(reduction, 6000);
    const r = computeLineTotals({ items: [item('Base', 60000), item('Reduction', reduction)], recovery: 0 });
    equal(r.gross, 54000);
  });

  it('does not reduce pay for a verified paid-leave month (§65 t10)', () => {
    const r = computeLineTotals({ items: [item('Base', 60000)], recovery: 0 });
    equal(r.gross, 60000);
    equal(r.breakdown.reductions, 0);
  });

  it('reduces net but not gross for an advance recovery (§10, §14)', () => {
    const r = computeLineTotals({ items: [item('Base', 100000)], recovery: 10000 });
    equal(r.gross, 100000);
    equal(r.net, 90000);
  });

  it('refuses a recovery larger than the earned gross (§10.3)', () => {
    const r = computeLineTotals({ items: [item('Base', 20000)], recovery: 30000 });
    notEqual(r.problems.find((p) => /cannot exceed/.test(p)), undefined);
  });

  it('refuses a negative earned gross and a fractional rupee (§10.1, §10.3)', () => {
    const neg = computeLineTotals({ items: [item('Base', 1000), item('Reduction', 2000)], recovery: 0 });
    notEqual(neg.problems.find((p) => /gross cannot be negative/.test(p)), undefined);
    const frac = computeLineTotals({ items: [{ id: 'x', component: 'Base', amount: 1000.5, costCategory: 'Salaries: Teaching' }], recovery: 0 });
    notEqual(frac.problems.find((p) => /whole rupees/.test(p)), undefined);
  });
});

describe('the run ties out to its lines (§64.9, §65 t52)', () => {
  it('sums per-line gross, recovery and net', () => {
    const lines = [
      { gross: 100000, recoveries: 10000, net: 90000 },
      { gross: 60000, recoveries: 0, net: 60000 },
      { gross: 48000, recoveries: 0, net: 48000 },
    ];
    deepStrictEqual(aggregateRunTotals(lines), { gross: 208000, recoveries: 10000, net: 198000 });
  });

  it('passes when stored totals equal the summed lines', () => {
    const lines = [{ gross: 800000, recoveries: 40000, net: 760000 }];
    const problems = runTotalsMatch(lines, { gross: 800000, advanceRecoveries: 40000, netPayable: 760000 });
    deepStrictEqual(problems, []);
  });

  it('flags a stored total that drifts from the lines', () => {
    const lines = [{ gross: 800000, recoveries: 40000, net: 760000 }];
    const problems = runTotalsMatch(lines, { gross: 800001, advanceRecoveries: 40000, netPayable: 760000 });
    notEqual(problems.find((p) => /Stored gross/.test(p)), undefined);
  });

  it('flags a line whose net is not gross less recovery', () => {
    const lines = [{ gross: 100000, recoveries: 10000, net: 95000 }];
    const problems = runTotalsMatch(lines, { gross: 100000, advanceRecoveries: 10000, netPayable: 95000 });
    notEqual(problems.find((p) => /net must equal/.test(p)), undefined);
  });
});
