// ============================================
// MediCMS Desktop - Fee engine: concession records (§13.3, §13.4, §13.5)
// The plan keeps template amounts untouched and stores each reduction as a record;
// the student's figure is always derived, so nothing is lost and every reduction
// carries a reason.
// ============================================

import type { ConcessionRecord, TemplateLine, TermScope } from './types.ts';

export interface ConcessionLine extends TemplateLine {
  /** Rupees removed from this component by component-level concessions. */
  concession: number;
  net: number;
}

export interface ApplyConcessionsResult {
  lines: ConcessionLine[];
  templateTotal: number;
  componentConcession: number;
  planConcession: number;
  totalConcession: number;
  netTotal: number;
  /** §13.3 - a concession larger than its component is reduced to fit, and says so. */
  warnings: string[];
  /** What each live record actually removed, so it can post as its own ledger entry. */
  applied: { concessionId: string; amount: number }[];
}

/** §13.4 - does this concession reach `term`? */
export function scopeApplies(scope: TermScope, term: number): boolean {
  switch (scope.mode) {
    case 'termOnly':
      return term === scope.term;
    case 'remainingTerms':
      return term >= scope.fromTerm;
    case 'specificTerms':
      return term >= scope.from && term <= scope.to;
    default:
      return false;
  }
}

/** Rupees, halves rounding up (§13.3 bullet 3, §28 case 5). */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * What a record asks off a single component. 'setAmount' is expressed as the
 * difference between the template amount and the chosen figure (§13.3).
 */
function requestedOff(record: ConcessionRecord, templateAmount: number, currentNet: number): number {
  switch (record.kind) {
    case 'waive':
      return currentNet;
    case 'fixed':
      return record.value;
    case 'percent':
      return roundHalfUp((currentNet * record.value) / 100);
    case 'setAmount':
      return Math.max(0, templateAmount - record.value);
    default:
      return 0;
  }
}

/**
 * Apply the concessions that reach `term` to one term's template lines.
 * Order (§13.3 bullet 2): component concessions, then a whole-plan percent, then a
 * whole-plan fixed amount. A net figure can never fall below zero.
 */
export function applyConcessions(
  lines: readonly TemplateLine[],
  concessions: readonly ConcessionRecord[],
  term: number,
): ApplyConcessionsResult {
  const warnings: string[] = [];
  const applied: { concessionId: string; amount: number }[] = [];

  const netByComponent = new Map<string, number>(lines.map((l) => [l.componentId, l.amount]));
  const offByComponent = new Map<string, number>();
  const nameById = new Map<string, string>(lines.map((l) => [l.componentId, l.name]));

  const recordLabel = (r: ConcessionRecord): string => `${r.reasonCategory}${r.note ? ` (${r.note})` : ''}`;

  // 1. Component-level concessions, in the order given.
  for (const record of concessions) {
    if (record.target.kind !== 'component') continue;
    if (!scopeApplies(record.scope, term)) continue;
    if (!Number.isFinite(record.value) || record.value < 0) {
      warnings.push(`${recordLabel(record)} ignored - amount must be zero or more`);
      continue;
    }
    const componentId = record.target.componentId;
    const templateAmount = netByComponent.get(componentId);
    if (templateAmount === undefined) {
      warnings.push(`${recordLabel(record)} targets unknown component "${componentId}"`);
      continue;
    }

    const currentNet = templateAmount - (offByComponent.get(componentId) ?? 0);
    const requested = requestedOff(record, templateAmount, currentNet);
    const used = Math.min(Math.max(0, requested), currentNet);
    if (used < requested) {
      warnings.push(
        `${recordLabel(record)} reduced to ${used} - it could not exceed the remaining ${currentNet} on "${nameById.get(componentId) ?? componentId}"`,
      );
    }
    if (used === 0) continue;
    offByComponent.set(componentId, (offByComponent.get(componentId) ?? 0) + used);
    applied.push({ concessionId: record.id, amount: used });
  }

  const componentConcession = [...offByComponent.values()].reduce((sum, v) => sum + v, 0);
  const templateTotal = lines.reduce((sum, l) => sum + l.amount, 0);

  // 2. Whole-plan percent, then 3. whole-plan fixed / waive / set-amount.
  let planConcession = 0;
  const planRecords = concessions.filter((r) => r.target.kind === 'plan' && scopeApplies(r.scope, term));
  for (const record of [...planRecords.filter((r) => r.kind === 'percent'), ...planRecords.filter((r) => r.kind !== 'percent')]) {
    if (!Number.isFinite(record.value) || record.value < 0) {
      warnings.push(`${recordLabel(record)} ignored - amount must be zero or more`);
      continue;
    }
    const remaining = templateTotal - componentConcession - planConcession;
    const requested = record.kind === 'percent'
      ? roundHalfUp((remaining * record.value) / 100)
      : record.kind === 'setAmount'
        ? Math.max(0, templateTotal - componentConcession - record.value)
        : requestedOff(record, templateTotal, remaining);
    const used = Math.min(Math.max(0, requested), remaining);
    if (used < requested) {
      warnings.push(`${recordLabel(record)} reduced to ${used} - only ${remaining} of the plan was left to concede`);
    }
    if (used === 0) continue;
    planConcession += used;
    applied.push({ concessionId: record.id, amount: used });
  }

  const totalConcession = componentConcession + planConcession;

  return {
    lines: lines.map((l) => {
      const concession = offByComponent.get(l.componentId) ?? 0;
      return { ...l, concession, net: l.amount - concession };
    }),
    templateTotal,
    componentConcession,
    planConcession,
    totalConcession,
    netTotal: templateTotal - totalConcession,
    warnings,
    applied,
  };
}
