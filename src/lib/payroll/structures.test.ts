// ============================================
// MediCMS Desktop — Staff & Payroll: structures & work-input helper tests
// (§8–§11, §49–§50). Pure, no DOM, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, deepEqual, ok } from 'node:assert/strict';

import {
  defaultCostCategory,
  eligibleDaysInMonth,
  nextStructureId,
  nextWorkInputId,
  previewStructure,
  structureActiveOnMonth,
  structureOverlapProblems,
  workRequirement,
} from './structures.ts';

describe('cost category defaults from staff type (§8)', () => {
  it('maps each type to a reserved payroll category', () => {
    equal(defaultCostCategory('Teaching'), 'Salaries: Teaching');
    equal(defaultCostCategory('Administration'), 'Salaries: Administration');
    equal(defaultCostCategory('Support'), 'Salaries: Support');
    equal(defaultCostCategory('Visiting faculty'), 'Honoraria: Visiting faculty');
    equal(defaultCostCategory('Clinical instructor/doctor'), 'Honoraria: Clinical instructors and doctors');
  });
});

describe('record ids are minted and never reused (§8, §9)', () => {
  it('starts each series and counts up from the highest issued', () => {
    equal(nextStructureId([]), 'ps-0001');
    equal(nextStructureId([{ id: 'ps-0004' }, { id: 'ps-0009' }]), 'ps-0010');
    equal(nextWorkInputId([{ id: 'wi-0001' }, { id: 'wi-0007' }]), 'wi-0008');
    equal(nextWorkInputId([{ id: 'not-a-series' }]), 'wi-0001');
  });
});

describe('a pay structure never overlaps another for one staff (§8 integrity 2)', () => {
  it('refuses an overlapping period', () => {
    const siblings = [{ effectiveFrom: '2026-01-01', effectiveTo: '2026-09-30' }];
    ok(structureOverlapProblems(siblings, { effectiveFrom: '2026-09-01' }).length > 0);
  });

  it('accepts a disjoint later period against an open-ended one', () => {
    const siblings = [{ effectiveFrom: '2026-01-01', effectiveTo: '2026-09-30' }];
    deepEqual(structureOverlapProblems(siblings, { effectiveFrom: '2026-10-01' }), []);
  });

  it('refuses a period that ends before it begins, and one missing its start', () => {
    ok(structureOverlapProblems([], { effectiveFrom: '2026-10-01', effectiveTo: '2026-05-01' }).length > 0);
    ok(structureOverlapProblems([], { effectiveFrom: '' }).length > 0);
  });
});

describe('eligible calendar days bound a service month (§10.2)', () => {
  it('counts a full month, a mid-month start, and a dated window', () => {
    equal(eligibleDaysInMonth('2026-10', [{ from: '2026-01-01' }]), 31);
    equal(eligibleDaysInMonth('2026-10', [{ from: '2026-10-15' }]), 17);
    equal(eligibleDaysInMonth('2026-10', [{ from: '2026-10-15', to: '2026-10-20' }]), 6);
    // Intersection of a structure window and an employment window.
    equal(eligibleDaysInMonth('2026-10', [{ from: '2026-01-01' }, { from: '2026-10-10', to: '2026-10-12' }]), 3);
  });

  it('only marks a month active when the period reaches into it', () => {
    ok(structureActiveOnMonth({ effectiveFrom: '2026-09-15', effectiveTo: '2026-10-10' }, '2026-10'));
    ok(!structureActiveOnMonth({ effectiveFrom: '2026-11-01' }, '2026-10'));
  });
});

describe('illustrative month preview (§49)', () => {
  it('fixed monthly: full month is base plus allowance', () => {
    const p = previewStructure({
      type: 'Fixed monthly', serviceMonth: '2026-10', effectiveFrom: '2026-01-01',
      joiningDate: '2024-01-01', monthlyBase: 60000,
      allowanceDefaults: [{ label: 'Responsibility', amount: 2000 }],
    });
    equal(p.base, 60000);
    equal(p.illustrativeGross, 62000);
  });

  it('fixed monthly: a mid-month start prorates, rounding halves up', () => {
    // 30-day month, eligible 1 day of a 10,000 base → 10000/30 = 333.33 → 333.
    const p = previewStructure({
      type: 'Fixed monthly', serviceMonth: '2026-09', effectiveFrom: '2026-09-30',
      joiningDate: '2024-01-01', monthlyBase: 10000,
    });
    equal(p.eligibleDays, 1);
    equal(p.base, 333);
  });

  it('session and honorarium-by-units do not guess the quantity', () => {
    const s = previewStructure({ type: 'Per session', serviceMonth: '2026-10', effectiveFrom: '2026-01-01', joiningDate: '2024-01-01', ratePerSession: 8000 });
    equal(s.illustrativeGross, 0);
    ok(s.note.includes('verified'));
    const h = previewStructure({ type: 'Honorarium', serviceMonth: '2026-10', effectiveFrom: '2026-01-01', joiningDate: '2024-01-01', honorariumFixed: 15000 });
    equal(h.illustrativeGross, 15000);
  });
});

describe('work requirement follows the pay type (§50)', () => {
  it('session and honorarium need a verified quantity; fixed needs a leave review', () => {
    equal(workRequirement('Per session').needsVerifiedQuantity, true);
    equal(workRequirement('Honorarium').needsVerifiedQuantity, true);
    equal(workRequirement('Fixed monthly').needsVerifiedQuantity, false);
  });
});
