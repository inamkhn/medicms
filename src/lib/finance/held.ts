// ============================================
// MediCMS Desktop — Finance core: money held for others (§18, §53, §55.3)
//
// Held money is not income: the student credit a payment left behind, the
// security deposit the plan marks refundable, and the incoming cheques still in
// the drawer (§18). The overview, the month-end report and the held-money report
// all print this figure, so it is worked out once, here, from the fee engine —
// the plan is priced the way the cancel screen prices it (§5.2), never guessed.
//
// Pure, and relative at runtime: `node --test` type-strips it without the alias.
// ============================================

import type { FeeTemplate, LedgerEntry, Student } from '../../types/index.ts';
import { planPreview } from '../fee/planPreview.ts';
import { suggestRefund, type RefundLine } from '../fee/refund.ts';
import { termFeesOf } from '../fee/templateCompat.ts';

/** §18: a student who has left — struck off, finished or on leave — holds nothing. */
export function isActiveStudent(student: Student): boolean {
  return !student.struckOff && !student.completed && !student.onLeave;
}

/**
 * What each student has actually paid. A reversal names the entry it undoes
 * (§7.1), so a reversed payment counts as nothing rather than as a refund.
 */
export function paidByStudent(entries: readonly LedgerEntry[]): Map<number, number> {
  const reversed = new Set<string>();
  for (const entry of entries) {
    if (entry.type === 'Reversal' && entry.linkedEntryId) reversed.add(entry.linkedEntryId);
  }
  const paid = new Map<number, number>();
  for (const entry of entries) {
    if (entry.type !== 'Payment' || reversed.has(entry.id)) continue;
    paid.set(entry.studentSno, (paid.get(entry.studentSno) ?? 0) + entry.amount);
  }
  return paid;
}

export interface HeldInput {
  students: readonly Student[];
  templates: readonly FeeTemplate[];
  ledgerEntries: readonly LedgerEntry[];
}

/**
 * §18 "Security deposits held": for every active student, the refundable part of
 * their plan that their payments have covered. The plan is priced per component
 * (concessions included) so a deposit is counted only where it is really held.
 */
export function securityDepositsHeld({ students, templates, ledgerEntries }: HeldInput): number {
  const paid = paidByStudent(ledgerEntries);
  let total = 0;
  for (const student of students) {
    if (!isActiveStudent(student)) continue;
    const template = templates.find((t) => t.id === student.feeTemplateId);
    if (!template) continue;
    const priced = planPreview(termFeesOf(template).terms, student.planConcessions ?? [], 1);
    const refundableIds = new Set(template.components.filter((c) => c.refundable).map((c) => c.id));
    const lines: RefundLine[] = priced.opening.lines.map((line) => ({
      name: line.name,
      net: line.net,
      refundable: refundableIds.has(line.componentId),
    }));
    total += suggestRefund({ paid: paid.get(student.sno) ?? 0, lines });
  }
  return total;
}

export interface HeldParts {
  /** §18: a payment that came in before the charge it will pay off. */
  creditHeld: number;
  depositsHeld: number;
  /** §18: incoming cheques not yet cleared into a bank. */
  chequesInHand: number;
}

/** §53 "Held for others" — the three parts, added the one way they are added. */
export function heldForOthers({ creditHeld, depositsHeld, chequesInHand }: HeldParts): number {
  return creditHeld + depositsHeld + chequesInHand;
}
