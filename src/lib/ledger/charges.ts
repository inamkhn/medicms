// ============================================
// MediCMS Desktop — Ledger: fee charges, what is unpaid, and ageing (§6, §24, §25)
//
// The balance is one number; a fee charge is the thing a student can actually be
// chased for. §6 line 133:
//
//   Unpaid on a fee charge = charge amount − concessions on it − payments allocated
//   to it − write-offs and reduce-adjustments allocated to it + add-adjustments
//   attached to it
//
// A Reversal of a charge is taken off the charge amount as well (§45): a cancelled
// charge must not stay on the unpaid list merely because the original entry remains
// visible in the ledger. Allocation itself is the fee engine's job
// (lib/fee/allocation.ts) and is reused here rather than re-implemented.
//
// The sweep runs in posting order over one student's entries, so money can only
// ever be spent on a charge that had already arrived, and credit in hand is applied
// to a charge as it is posted (§25.1, §66 case 5).
// ============================================

import type { Allocation, PostedCharge } from '../fee/types.ts';
import { allocatePayment, applyCreditToCharge } from '../fee/allocation.ts';
import { computeAgeing, type AgeingResult } from '../fee/ageing.ts';
import { chronological, computeEntryBalance } from './balance.ts';
import { entryResolver, reversedEntryIds } from './entries.ts';
import type { LedgerEntry, LedgerEntryType } from './types.ts';

/** One charge as the ledger, the profile and the statement see it. */
export interface ChargeView {
  entryId: string;
  type: LedgerEntryType;
  term: number | null;
  /** "Term 2" when it belongs to a term, otherwise the description (§8.2). */
  label: string;
  /** Billed amount, before anything was attached to or cancelled out of it. */
  billed: number;
  /** Adjustment (add) entries attached to this charge (§6). */
  added: number;
  /** Reversals of this charge (§45). */
  cancelled: number;
  /** Concessions, write-offs and reduce-adjustments landed on it (§6). */
  reduced: number;
  /** Payments and credit applied to it (§25). */
  paid: number;
  unpaid: number;
  dueDate: string;
  postedDate: string;
  description: string;
}

export interface ChargeState {
  charges: ChargeView[];
  /** The unpaid total of the charges below — the "Due" figure of §54. */
  unpaidTotal: number;
  /**
   * §25.1 - rupees in hand that no fee charge could take: money paid past what was
   * billed, and reductions that arrived with no charge to sit on.
   */
  credit: number;
  /**
   * Dues that no fee charge carries — a refund larger than the credit it was meant
   * to reduce, or an opening balance beyond its entries. Always 0 on well-formed
   * data; reported rather than hidden so `balance = unpaidTotal + unplacedDues -
   * credit` holds for every student, which is what the ledger header prints.
   */
  unplacedDues: number;
  /** What each payment paid off, in rupees per charge — the §54 "Allocated to" column. */
  allocations: Map<string, Allocation[]>;
  /**
   * Ids of the entries a Reversal cancelled (§45). A reversed payment holds no
   * credit — the money went back out of the till — so "Allocated to" prints nothing
   * for it rather than claiming the amount is still in hand.
   */
  reversed: Set<string>;
  /**
   * True while some payment's allocation was *derived* by the oldest-first sweep
   * instead of read from the entry. Feature 2 stores allocations on the payment
   * (§15); until then this bridge keeps ageing and the profile from reporting every
   * charge as unpaid when the money plainly arrived.
   */
  allocationsDerived: boolean;
}

/** Working row while the sweep runs: the charge plus everything done to it. */
interface Draft {
  entry: LedgerEntry;
  added: number;
  cancelled: number;
  reduced: number;
  paid: number;
}

/** What a reduction or payment entry points at: its allocations, or one charge. */
function targetsOf(entry: LedgerEntry): Allocation[] {
  if (entry.allocations?.length) return entry.allocations;
  return entry.linkedEntryId ? [{ chargeId: entry.linkedEntryId, amount: entry.amount }] : [];
}

/** A charge is anything that stands on the "dues" side of §6 line 133. */
function isCharge(entry: LedgerEntry): boolean {
  switch (entry.type) {
    case 'FeeCharge':
    case 'SpecialCharge':
      return true;
    // An Adjustment (add) with nothing to attach to is a charge in its own right.
    case 'AdjustmentAdd':
      return !entry.linkedEntryId;
    // A migrated student's opening dues are money to be chased, so it joins the
    // unpaid list; §5 gives it no due date, and `dueDateOf` files it as due when it
    // was posted — which for old data is the honest reading (§24.1).
    case 'OpeningBalanceDues':
      return true;
    default:
      return false;
  }
}

function termOf(entry: LedgerEntry): number | null {
  return typeof entry.term === 'number' && entry.term > 0 ? entry.term : null;
}

function labelOf(entry: LedgerEntry): string {
  const term = termOf(entry);
  return term !== null ? `Term ${term}` : entry.description;
}

/**
 * §24.1 - every charge has a due date. A row that somehow lacks one was due when it
 * was posted, which is the only reading that keeps ageing honest rather than
 * quietly filing old dues under "not yet due".
 */
function dueDateOf(entry: LedgerEntry): string {
  return entry.dueDate ?? entry.date;
}

/** Net amount still billed on a draft, ignoring what has been paid off. */
function netOf(draft: Draft): number {
  return Math.max(0, draft.entry.amount + draft.added - draft.cancelled);
}

function postedOf(draft: Draft): PostedCharge {
  return {
    id: draft.entry.id,
    term: termOf(draft.entry) ?? 0,
    label: labelOf(draft.entry),
    amount: netOf(draft),
    dueDate: dueDateOf(draft.entry),
    allocated: draft.reduced + draft.paid,
  };
}

function viewOf(draft: Draft): ChargeView {
  const net = netOf(draft);
  return {
    entryId: draft.entry.id,
    type: draft.entry.type,
    term: termOf(draft.entry),
    label: labelOf(draft.entry),
    billed: draft.entry.amount,
    added: draft.added,
    cancelled: draft.cancelled,
    reduced: draft.reduced,
    paid: draft.paid,
    unpaid: Math.max(0, net - draft.reduced - draft.paid),
    dueDate: dueDateOf(draft.entry),
    postedDate: draft.entry.date,
    description: draft.entry.description,
  };
}

function stateForStudent(entries: readonly LedgerEntry[]): ChargeState {
  const ordered = chronological(entries);
  const resolve = entryResolver(ordered);
  // §45 - a payment a reversal points at has given its money back, so it must not
  // sit on any charge.
  const reversed = reversedEntryIds(ordered);

  // Map insertion order is the chronological order, so the charge list the
  // profile prints needs no second sort (§8).
  const drafts = new Map<string, Draft>();
  const allocations = new Map<string, Allocation[]>();
  let allocationsDerived = false;
  // Credit in hand at this moment in the ledger, per §25.1. The reported figure is
  // derived from the balance at the end, so the two can never disagree.
  let creditInHand = 0;

  for (const entry of ordered) {
    if (isCharge(entry)) {
      const draft: Draft = { entry, added: 0, cancelled: 0, reduced: 0, paid: 0 };
      drafts.set(entry.id, draft);
      // §25.1: credit already in hand is applied to a fee charge as it is posted —
      // §66 case 5's 47,000 charge arriving against 5,000 credit reads 42,000.
      if (creditInHand > 0) {
        const applied = applyCreditToCharge(creditInHand, postedOf(draft));
        if (applied.applied > 0) {
          draft.paid += applied.applied;
          creditInHand = applied.remainingCredit;
        }
      }
      continue;
    }

    switch (entry.type) {
      case 'Reversal': {
        const target = entry.linkedEntryId ? resolve(entry.linkedEntryId) : undefined;
        const draft = target ? drafts.get(target.id) : undefined;
        // Only a reversal of a charge changes the charge. A reversal of a payment is
        // handled below, by that payment never being allocated.
        if (draft) draft.cancelled += entry.amount;
        break;
      }
      case 'AdjustmentAdd': {
        const draft = entry.linkedEntryId ? drafts.get(entry.linkedEntryId) : undefined;
        if (draft) draft.added += entry.amount;
        break;
      }
      case 'Concession':
      case 'WriteOff':
      case 'AdjustmentReduce': {
        const targets = targetsOf(entry);
        let placed = 0;
        for (const target of targets) {
          const draft = drafts.get(target.chargeId);
          if (draft) {
            draft.reduced += target.amount;
            placed += target.amount;
          }
        }
        creditInHand += Math.max(0, entry.amount - placed);
        break;
      }
      case 'Payment': {
        if (reversed.has(entry.id)) {
          allocations.set(entry.id, []);
          break;
        }
        if (entry.allocations?.length) {
          allocations.set(entry.id, entry.allocations);
          let placed = 0;
          for (const target of entry.allocations) {
            const draft = drafts.get(target.chargeId);
            if (draft) {
              draft.paid += target.amount;
              placed += target.amount;
            }
          }
          creditInHand += Math.max(0, entry.amount - placed);
          break;
        }
        // Oldest first over the charges that exist at this payment's moment, which
        // is what reproduces §8.2 entry 4: Term 2 17,000 then Term 3 8,000.
        allocationsDerived = true;
        const sweep = allocatePayment([...drafts.values()].map(postedOf), entry.amount);
        allocations.set(entry.id, sweep.allocations);
        for (const target of sweep.allocations) {
          const draft = drafts.get(target.chargeId);
          if (draft) draft.paid += target.amount;
        }
        creditInHand += sweep.credit;
        break;
      }
      case 'OpeningBalanceCredit':
        // Credit carried in from the old system: money in hand, not a payment.
        creditInHand += entry.amount;
        break;
      case 'Refund':
        // §6: a refund "reduces credit" — it hands money back out of what the
        // student had in hand. Anything beyond that is reported as unplaced dues.
        creditInHand = Math.max(0, creditInHand - entry.amount);
        break;
      default:
        // OpeningBalanceDues and a standalone Adjustment (add) are charges and were
        // handled above; every other type is covered. Nothing left to place.
        break;
    }
  }

  const charges = [...drafts.values()].map(viewOf);
  const unpaidTotal = charges.reduce((sum, charge) => sum + charge.unpaid, 0);
  // The balance is the truth (§4); the charge list has to account for it. Whatever
  // the list cannot explain is either credit in hand or dues no charge carries.
  const gap = computeEntryBalance(ordered).balance - unpaidTotal;

  return {
    charges,
    unpaidTotal,
    credit: Math.max(0, -gap),
    unplacedDues: Math.max(0, gap),
    allocations,
    reversed,
    allocationsDerived,
  };
}

/** A charge as the fee engine's ageing table wants it (§24). */
function postedFromView(charge: ChargeView): PostedCharge {
  return {
    id: charge.entryId,
    term: charge.term ?? 0,
    label: charge.label,
    amount: Math.max(0, charge.billed + charge.added - charge.cancelled),
    dueDate: charge.dueDate,
    allocated: charge.reduced + charge.paid,
  };
}

/**
 * One student's charge state. Callers pass the entries of a single student — which
 * is what every screen has already filtered to — so a payment can never be counted
 * against another student's fee charge (§5).
 */
export function chargeStateOf(entries: readonly LedgerEntry[]): ChargeState {
  return stateForStudent(entries);
}

/** The same, for the whole ledger: the defaulter list and the ledger check (§7.3). */
export function chargeStatesByStudent(entries: readonly LedgerEntry[]): Map<number, ChargeState> {
  const bySno = new Map<number, LedgerEntry[]>();
  for (const entry of entries) {
    const list = bySno.get(entry.studentSno);
    if (list) list.push(entry);
    else bySno.set(entry.studentSno, [entry]);
  }
  return new Map([...bySno].map(([sno, list]) => [sno, stateForStudent(list)]));
}

/** `entryId -> rupees still owing`, the list §9.1 prints as "Unpaid fee charges". */
export function unpaidByCharge(state: ChargeState): Record<string, number> {
  return Object.fromEntries(state.charges.map((charge) => [charge.entryId, charge.unpaid]));
}

/** §9.1: the ageing line, from the same charge state the ledger prints. */
export function ageingOf(state: ChargeState, today: string): AgeingResult {
  return computeAgeing(state.charges.map(postedFromView), today);
}

/** The unpaid rupees past their due date — the "Overdue" figure of §54. */
export function overdueTotal(state: ChargeState, today: string): number {
  return ageingOf(state, today).overdueTotal;
}

/**
 * The "Allocated to" column (§8.2): `Term 2: 17,000, Term 3: 8,000`. Money the
 * payment could not place on a charge is shown as credit held, never dropped —
 * except for a payment a reversal cancelled, which is holding nothing (§45).
 */
export function allocationLabels(
  payment: LedgerEntry,
  state: ChargeState,
): { label: string; amount: number }[] {
  if (state.reversed.has(payment.id)) return [];
  const placed = state.allocations.get(payment.id) ?? [];
  const labelById = new Map(state.charges.map((charge) => [charge.entryId, charge.label]));
  const rows = placed
    .filter((allocation) => allocation.amount > 0)
    .map((allocation) => ({
      label: labelById.get(allocation.chargeId) ?? 'Unapplied',
      amount: allocation.amount,
    }));
  const remainder = payment.amount - rows.reduce((sum, row) => sum + row.amount, 0);
  if (remainder > 0) rows.push({ label: 'Credit held', amount: remainder });
  return rows;
}
