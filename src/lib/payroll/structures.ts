// ============================================
// MediCMS Desktop — Staff & Payroll: pay structures & work-input helpers
// (§8–§11, §49–§50)
//
// Pure rules the P9 screens lean on so their arithmetic and period logic are
// unit-tested rather than improvised in JSX: the cost-category default, the
// never-overlap effective period (§8 integrity 2), the eligible-day count and
// illustrative-month preview (§49), and the id/number minting the record stores
// need. No clock, no store, no DOM — the rupees and dates come in. All money is
// whole PKR; proration reuses the calc core so rounding matches §65 t51/t7.
// ============================================

import type {
  AllowanceDefault,
  IsoDate,
  PayStructure,
  PayStructureType,
  SalaryCostCategory,
  ServiceMonth,
  StaffType,
} from './types.ts';
import { daysInServiceMonth, prorateMonthlyAmount } from './calc.ts';

/** Open-ended effective period compares as "never ends"; dates are ISO so this is lexical. */
const OPEN_END = '9999-12-31';

/** §8 the cost category a staff type defaults to; still editable within the reserved set. */
export function defaultCostCategory(staffType: StaffType): SalaryCostCategory {
  switch (staffType) {
    case 'Teaching': return 'Salaries: Teaching';
    case 'Administration': return 'Salaries: Administration';
    case 'Support': return 'Salaries: Support';
    case 'Visiting faculty': return 'Honoraria: Visiting faculty';
    case 'Clinical instructor/doctor': return 'Honoraria: Clinical instructors and doctors';
  }
}

/** `ps-####` monotonic from the numeric suffix; ids are never reused. */
export function nextStructureId(existing: readonly Pick<PayStructure, 'id'>[]): string {
  let max = 0;
  for (const r of existing) {
    const m = /^ps-(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `ps-${String(max + 1).padStart(4, '0')}`;
}

/** `wi-####` monotonic from the numeric suffix; ids are never reused. */
export function nextWorkInputId(existing: readonly { id: string }[]): string {
  let max = 0;
  for (const r of existing) {
    const m = /^wi-(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `wi-${String(max + 1).padStart(4, '0')}`;
}

/**
 * §8 integrity 2: a structure's effective period must not overlap another for the
 * same staff. An open end is treated as running forever, so the last "current"
 * structure and any new one must be disjoint. A single clear message is enough
 * to stop the save.
 */
export function structureOverlapProblems(
  siblings: readonly Pick<PayStructure, 'effectiveFrom' | 'effectiveTo'>[],
  candidate: { effectiveFrom: IsoDate; effectiveTo?: IsoDate },
): string[] {
  if (!candidate.effectiveFrom) return ['A pay structure needs an effective-from date (§8).'];
  if (candidate.effectiveTo && candidate.effectiveTo < candidate.effectiveFrom) {
    return ['A structure cannot end before it begins (§8).'];
  }
  const cFrom = candidate.effectiveFrom;
  const cTo = candidate.effectiveTo ?? OPEN_END;
  const overlap = siblings.find((s) => {
    const sFrom = s.effectiveFrom;
    const sTo = s.effectiveTo ?? OPEN_END;
    return cFrom <= sTo && sFrom <= cTo;
  });
  if (overlap) {
    return [
      `This period overlaps an existing structure (${overlap.effectiveFrom}–${overlap.effectiveTo ?? 'open'}) — a staff's structures must not overlap (§8).`,
    ];
  }
  return [];
}

/** Calendar days of a service month that fall inside *every* supplied window. */
export function eligibleDaysInMonth(month: ServiceMonth, windows: readonly { from: IsoDate; to?: IsoDate }[]): number {
  const days = daysInServiceMonth(month);
  let count = 0;
  for (let d = 1; d <= days; d += 1) {
    const day = `${month}-${String(d).padStart(2, '0')}`;
    if (windows.every((w) => day >= w.from && day <= (w.to ?? OPEN_END))) count += 1;
  }
  return count;
}

/** Does this structure's effective period cover any day of the service month? */
export function structureActiveOnMonth(structure: Pick<PayStructure, 'effectiveFrom' | 'effectiveTo'>, month: ServiceMonth): boolean {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInServiceMonth(month)).padStart(2, '0')}`;
  return structure.effectiveFrom <= last && (structure.effectiveTo ?? OPEN_END) >= first;
}

/** §49.2/§50 what a structure type expects from the monthly work input. */
export function workRequirement(type: PayStructureType): { label: string; needsVerifiedQuantity: boolean } {
  if (type === 'Per session') return { label: 'Class count', needsVerifiedQuantity: true };
  if (type === 'Honorarium') return { label: 'Honorarium sessions', needsVerifiedQuantity: true };
  return { label: 'Leave review', needsVerifiedQuantity: false };
}

export interface StructurePreviewInput {
  type: PayStructureType;
  serviceMonth: ServiceMonth;
  effectiveFrom: IsoDate;
  effectiveTo?: IsoDate;
  joiningDate: IsoDate;
  leavingDate?: IsoDate;
  monthlyBase?: number;
  ratePerSession?: number;
  honorariumFixed?: number;
  allowanceDefaults?: AllowanceDefault[];
}

export interface StructurePreview {
  serviceMonth: ServiceMonth;
  monthDays: number;
  eligibleDays: number;
  base: number;
  allowance: number;
  /** The illustrative earned gross this month; 0 when verified work sets it. */
  illustrativeGross: number;
  note: string;
}

/**
 * §49 one illustrative service month of a structure, including mid-month
 * proration (§10.2) bounded by both the effective period and the employment
 * window. Session/honorarium-by-units show their rate and a note that a verified
 * quantity is required — the number is not guessed (§50.2).
 */
export function previewStructure(input: StructurePreviewInput): StructurePreview {
  const monthDays = daysInServiceMonth(input.serviceMonth);
  const eligibleDays = eligibleDaysInMonth(input.serviceMonth, [
    { from: input.effectiveFrom, to: input.effectiveTo },
    { from: input.joiningDate, to: input.leavingDate },
  ]);
  const shape = { serviceMonth: input.serviceMonth, monthDays, eligibleDays, base: 0, allowance: 0, illustrativeGross: 0 };

  if (input.type === 'Fixed monthly') {
    const base = prorateMonthlyAmount(input.monthlyBase ?? 0, eligibleDays, monthDays);
    const allowance = (input.allowanceDefaults ?? []).reduce(
      (sum, a) => sum + (a.followsBaseProration ? prorateMonthlyAmount(a.amount, eligibleDays, monthDays) : a.amount),
      0,
    );
    return {
      ...shape,
      base,
      allowance,
      illustrativeGross: base + allowance,
      note: eligibleDays === monthDays ? 'Full month of service.' : `Prorated to ${eligibleDays}/${monthDays} eligible calendar days (§10.2).`,
    };
  }

  if (input.type === 'Honorarium' && input.honorariumFixed !== undefined) {
    return { ...shape, illustrativeGross: input.honorariumFixed, note: 'Fixed honorarium for the service month (§8).' };
  }

  if (input.type === 'Honorarium') {
    return { ...shape, note: `Honorarium = approved units × ${input.ratePerSession ?? 0} per unit — the verified quantity sets it (§8).` };
  }

  return { ...shape, note: `Session pay = verified sessions × ${input.ratePerSession ?? 0}; a verified monthly quantity is required (§49.2).` };
}
