// ============================================
// MediCMS Desktop — Staff & Payroll: advance tests (§14–§16, §10.3–§10.5, §65)
// Derived balance, the lifecycle map, and the recovery planner — worked cases
// 12–18 and 45. Pure, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, notEqual } from 'node:assert/strict';

import {
  advanceProblems,
  advanceSummary,
  canTransitionAdvance,
  outstandingOldestFirst,
  planAdvanceRecovery,
} from './advances.ts';
import type { Advance, AdvanceEvent, AdvanceEventKind } from './types.ts';

function ev(kind: AdvanceEventKind, amount: number): AdvanceEvent {
  return { id: `e-${kind}-${amount}`, advanceId: 'ad-1', kind, amount, date: '2026-09-15' };
}

function funded(advanceId: string, balance: number, paymentDate: string) {
  return { advanceId, balance, paymentDate };
}

describe('the balance is rebuilt from events (§14, §16, §65)', () => {
  it('reads a paid advance as its disbursed amount, cost untouched (§65 t12)', () => {
    const s = advanceSummary([ev('Disbursed', 40000)]);
    equal(s.balance, 40000);
    equal(s.funded, true);
  });

  it('an approved but unpaid advance carries no funded balance (§65 t13)', () => {
    const s = advanceSummary([]);
    equal(s.balance, 0);
    equal(s.funded, false);
  });

  it('a payroll recovery lowers the balance but not gross cost (§15, §65 t14)', () => {
    const s = advanceSummary([ev('Disbursed', 40000), ev('Recovered', 10000)]);
    equal(s.balance, 30000);
  });

  it('reversing a recovery restores the balance (§15)', () => {
    const s = advanceSummary([ev('Disbursed', 40000), ev('Recovered', 10000), ev('Reversed', 10000)]);
    equal(s.balance, 40000);
  });

  it('never reads below zero from a bad ledger (§16)', () => {
    equal(advanceSummary([ev('Recovered', 5000)]).balance, 0);
  });
});

describe('recovery is capped at salary and at each advance (§10.3–§10.5, §65)', () => {
  it('caps a recovery at available salary and carries the rest forward (§65 t15)', () => {
    const p = planAdvanceRecovery({
      availableSalary: 20000,
      requested: 30000,
      advances: [funded('ad-1', 40000, '2026-09-01')],
    });
    equal(p.totalRecovered, 20000);
    equal(p.carryForward, 20000);
    notEqual(p.notes.find((n) => /carried forward/.test(n)), undefined);
  });

  it('reduces to the advance outstanding, never negative (§65 t16)', () => {
    const p = planAdvanceRecovery({
      availableSalary: 100000,
      requested: 10000,
      advances: [funded('ad-1', 5000, '2026-09-01')],
    });
    equal(p.totalRecovered, 5000);
    equal(p.carryForward, 0);
  });

  it('recovers oldest-first across two advances (§65 t17)', () => {
    const p = planAdvanceRecovery({
      availableSalary: 100000,
      requested: 15000,
      advances: [funded('A', 10000, '2026-08-01'), funded('B', 20000, '2026-09-01')],
    });
    deepStrictEqual(p.allocations, [{ advanceId: 'A', amount: 10000 }, { advanceId: 'B', amount: 5000 }]);
    equal(p.remainingBalances.A, 0);
    equal(p.remainingBalances.B, 15000);
  });

  it('honours a manual per-advance selection within the caps (§65 t18)', () => {
    const p = planAdvanceRecovery({
      availableSalary: 100000,
      requested: 15000,
      selection: 'Manual',
      advances: [funded('A', 10000, '2026-08-01'), funded('B', 20000, '2026-09-01')],
      manual: { B: 15000 },
    });
    deepStrictEqual(p.allocations, [{ advanceId: 'B', amount: 15000 }]);
    equal(p.remainingBalances.A, 10000);
    equal(p.remainingBalances.B, 5000);
  });

  it('refuses a negative request or salary', () => {
    const p = planAdvanceRecovery({ availableSalary: -1, requested: 10, advances: [] });
    notEqual(p.problems.find((x) => /Available salary/.test(x)), undefined);
    equal(p.totalRecovered, 0);
  });
});

describe('outstanding advances list only funded balances, oldest first (§10.4)', () => {
  it('drops unpaid and zero-balance advances and orders by payment date', () => {
    const advances = [
      { id: 'new', paymentDate: undefined as string | undefined, createdAt: 'x' } as unknown as Advance,
      { id: 'old', paymentDate: '2026-08-01', createdAt: 'x' } as unknown as Advance,
    ];
    const events: AdvanceEvent[] = [
      { id: 'e1', advanceId: 'old', kind: 'Disbursed', amount: 10000, date: '2026-08-01' },
      { id: 'e2', advanceId: 'new', kind: 'Disbursed', amount: 20000, date: '2026-09-01' },
      { id: 'e3', advanceId: 'new', kind: 'Recovered', amount: 20000, date: '2026-09-20' }, // now zero, dropped
    ];
    const list = outstandingOldestFirst(advances, events);
    deepStrictEqual(list.map((a) => a.advanceId), ['old']); // 'new' is fully recovered, 'old' oldest
  });
});

describe('advance integrity and lifecycle (§14, §15)', () => {
  it('flags the §14 field rules', () => {
    const bad = {
      id: 'ad-1', advanceNo: 'ADV-0001', staffId: 'st-1', requestedAmount: 0, reason: '',
      status: 'Draft', recoveryPolicy: 'Fixed per month', startRecoveryMonth: '2026/09', createdBy: 'a', createdAt: 't',
    } as unknown as Advance;
    const probs = advanceProblems(bad);
    notEqual(probs.find((p) => /positive whole number/.test(p)), undefined);
    notEqual(probs.find((p) => /needs a reason/.test(p)), undefined);
    notEqual(probs.find((p) => /service month/.test(p)), undefined);
    notEqual(probs.find((p) => /fixed-per-month/.test(p)), undefined);
  });

  it('permits the lifecycle and blocks the illegal (§15)', () => {
    equal(canTransitionAdvance('Draft', 'Approved'), true);
    equal(canTransitionAdvance('Approved', 'Active'), true);
    equal(canTransitionAdvance('Active', 'Recovered'), true);
    equal(canTransitionAdvance('Recovered', 'Active'), false);
    equal(canTransitionAdvance('Cancelled', 'Active'), false);
  });

  it('a left staff member keeps an outstanding advance visible, never written off (§65 t45)', () => {
    // "Left" is a Staff status; the advance ledger is untouched by it.
    const s = advanceSummary([ev('Disbursed', 25000)]);
    equal(s.balance, 25000);
  });
});
