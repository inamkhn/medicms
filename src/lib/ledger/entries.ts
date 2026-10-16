// ============================================
// MediCMS Desktop — Ledger: entry types, direction and rules (§5, §6, §7)
// The table §6 turns into code, plus the checks every posting screen runs
// before it writes. Pure: no clock, so `today` is always passed in by the caller.
// ============================================

import type { LedgerEntry, LedgerEntryLine, LedgerEntryType } from './types.ts';

/** The words the ledger, statements and receipts print (§54). */
export const ENTRY_LABELS: Record<LedgerEntryType, string> = {
  OpeningBalanceDues: 'Opening balance (dues)',
  OpeningBalanceCredit: 'Opening balance (credit)',
  FeeCharge: 'Fee charge',
  SpecialCharge: 'Special charge',
  AdjustmentAdd: 'Adjustment (add)',
  Concession: 'Concession',
  Payment: 'Payment',
  AdjustmentReduce: 'Adjustment (reduce)',
  WriteOff: 'Write-off',
  Refund: 'Refund',
  Reversal: 'Reversal',
};

/** §6, the "Increases" column. Everything else in the table reduces. */
const INCREASING: readonly LedgerEntryType[] = [
  'OpeningBalanceDues',
  'FeeCharge',
  'SpecialCharge',
  'AdjustmentAdd',
  'Refund',
];

/** §5 — a reason is the only thing that makes these auditable. */
const REASON_REQUIRED: readonly LedgerEntryType[] = [
  'Concession',
  'AdjustmentAdd',
  'AdjustmentReduce',
  'WriteOff',
  'Refund',
  'Reversal',
];

/** §5 — "For fee charges, special charges and Adjustment (add)". */
const DUE_DATE_REQUIRED: readonly LedgerEntryType[] = [
  'FeeCharge',
  'SpecialCharge',
  'AdjustmentAdd',
];

/** Anything shorter is not a reason; the ledger screen already enforced 10. */
export const REASON_MIN_LENGTH = 10;

/** How far a reversal chain is followed before the data has stopped making sense. */
const REVERSAL_CHAIN_LIMIT = 16;

/** Entry numbers start at 1 and never come back (§5). */
export function entryId(studentSno: number, entryNo: number): string {
  return `e-${studentSno}-${entryNo}`;
}

/** The next entry number for a student: one above the highest ever used (§5). */
export function nextEntryNo(entries: readonly LedgerEntry[], studentSno: number): number {
  let max = 0;
  for (const e of entries) {
    if (e.studentSno === studentSno && e.entryNo > max) max = e.entryNo;
  }
  return max + 1;
}

export type EntryLookup = (id: string) => LedgerEntry | undefined;

/** Index a student's entries so a reversal can find the entry it reverses. */
export function entryIndex(entries: readonly LedgerEntry[]): Map<string, LedgerEntry> {
  return new Map(entries.map((e) => [e.id, e]));
}

/** The lookup the functions below want, from a plain list. */
export function entryResolver(entries: readonly LedgerEntry[]): EntryLookup {
  const index = entryIndex(entries);
  return (id) => index.get(id);
}

/**
 * The §6 direction table for a type on its own.
 *
 * Only use it when there is no entry to consult — building an entry, migrating
 * old rows. A `Reversal` has no direction of its own (§6: it is the opposite of
 * the entry it reverses), so anything holding the full entry must call
 * `entryDirection` instead of passing 'Reversal' here.
 */
export function typeDirection(type: LedgerEntryType): 1 | -1 {
  return INCREASING.includes(type) ? 1 : -1;
}

/**
 * Which way an entry moves the balance: 1 increases dues, -1 reduces them (§6).
 *
 * A Reversal has no direction of its own — §6 defines it as the opposite of the
 * entry it reverses — so it is read from the target, walking through a reversal of
 * a reversal. An unlinked reversal is invalid (`entryProblems` blocks the save);
 * it is reported as increasing, the direction of the charge most often reversed,
 * rather than thrown over, because a display list must stay total.
 */
export function entryDirection(entry: LedgerEntry, resolve: EntryLookup): 1 | -1 {
  return directionOf(entry, resolve, 0);
}

/** Depth-bound so a corrupt cycle (A reverses B, B reverses A) cannot hang a list. */
function directionOf(entry: LedgerEntry, resolve: EntryLookup, depth: number): 1 | -1 {
  if (entry.type !== 'Reversal' || depth >= REVERSAL_CHAIN_LIMIT) return typeDirection(entry.type);
  const targetId = entry.linkedEntryId;
  const target = targetId ? resolve(targetId) : undefined;
  if (!target) return 1;
  return negate(directionOf(target, resolve, depth + 1));
}

/** §6 says a reversal is the opposite of its target; a reversal of a reversal lands back. */
function negate(direction: 1 | -1): 1 | -1 {
  return direction === 1 ? -1 : 1;
}

/** Signed rupees — the only place a sign is produced (§6). */
export function signedEffect(entry: LedgerEntry, resolve: EntryLookup): number {
  return entryDirection(entry, resolve) * entry.amount;
}

/** §54: entries that increase dues read "+ in red", reductions "- in green". */
export function entryIncreasesDues(entry: LedgerEntry, resolve: EntryLookup): boolean {
  return entryDirection(entry, resolve) === 1;
}

/**
 * The ids of every entry a Reversal points at (§7.1, §45).
 *
 * An entry is never deleted, so "is this one cancelled?" is a question about the
 * entries AFTER it — which is why the list, not the entry, answers it. Screens use
 * it to strike through a reversed row and to offer the "Show reversed" filter
 * (§54); `charges.ts` uses it so a reversed payment stops paying off a fee charge.
 */
export function reversedEntryIds(entries: readonly LedgerEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.type === 'Reversal' && entry.linkedEntryId) ids.add(entry.linkedEntryId);
  }
  return ids;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every §5 / §6 / §7 rule an entry has to satisfy, as plain sentences rather than
 * thrown exceptions: screens show them, the ledger check lists them, and a batch
 * save refuses to write while any remain.
 *
 * `all` is optional because a screen validating one entry before it is posted has
 * no use for the student's whole history; the ledger check passes it, which is what
 * lets it catch a dangling link or a reversal pointing at nothing.
 */
export function entryProblems(
  entry: LedgerEntry,
  context: { today: string; all?: readonly LedgerEntry[] },
): string[] {
  const problems: string[] = [];
  const resolve = context.all ? entryResolver(context.all) : () => undefined;

  if (!Number.isInteger(entry.studentSno) || entry.studentSno <= 0) {
    problems.push('Entry must belong to a student.');
  }
  if (!Number.isInteger(entry.entryNo) || entry.entryNo < 1) {
    problems.push('Entry number must be a positive whole number.');
  } else if (entry.id !== entryId(entry.studentSno, entry.entryNo)) {
    problems.push(`Entry id must be ${entryId(entry.studentSno, entry.entryNo)}, not "${entry.id}".`);
  }
  if (!ISO_DATE.test(entry.date)) {
    problems.push('Date must be a local calendar date (YYYY-MM-DD).');
  }
  if (!Number.isInteger(entry.amount)) {
    problems.push('Amount must be whole rupees (§7.2).');
  }
  if (entry.amount <= 0) {
    problems.push('Amount must be greater than zero — a zero entry says nothing (§6).');
  }
  if (!entry.description.trim()) {
    problems.push('Description is required — an entry nobody can read is not a record (§5).');
  }

  if (REASON_REQUIRED.includes(entry.type)) {
    const reason = entry.reason?.trim() ?? '';
    if (!reason) {
      problems.push(`${ENTRY_LABELS[entry.type]} requires a reason (§5).`);
    } else if (reason.length < REASON_MIN_LENGTH) {
      problems.push(
        `Reason needs ${REASON_MIN_LENGTH - reason.length} more characters — one-word reasons defeat the audit trail (§5).`,
      );
    }
  }

  if (DUE_DATE_REQUIRED.includes(entry.type) && !entry.dueDate) {
    problems.push(`${ENTRY_LABELS[entry.type]} requires a due date (§5).`);
  }
  if (entry.dueDate && !ISO_DATE.test(entry.dueDate)) {
    problems.push('Due date must be a local calendar date (YYYY-MM-DD).');
  }

  // §7.4 — only payments are locked to today; charges may be posted with a later
  // due date, which is a different thing entirely.
  if (entry.type === 'Payment' && ISO_DATE.test(entry.date) && entry.date > context.today) {
    problems.push('A payment cannot be future-dated (§7.4).');
  }

  if (entry.type === 'Reversal' && !entry.linkedEntryId) {
    problems.push('A reversal must name the entry it reverses (§6, §45).');
  }
  if (entry.linkedEntryId && context.all) {
    if (!resolve(entry.linkedEntryId)) {
      problems.push(`Linked entry "${entry.linkedEntryId}" does not exist (§5).`);
    }
  }

  if (entry.lines) {
    const sum = entry.lines.reduce((total, line) => total + line.amount, 0);
    if (sum !== entry.amount) {
      problems.push(`Itemised lines add up to ${sum} but the entry is ${entry.amount} (§5).`);
    }
    for (const line of entry.lines) {
      if (!line.name.trim()) problems.push('Every itemised line needs a name (§5).');
      if (!Number.isInteger(line.amount) || line.amount < 0) {
        problems.push(`Line "${line.name}" must be a whole number of rupees (§7.2).`);
      }
    }
  }

  return problems;
}

/** What the §7.6 / §7.7 status rules need to know about a student. */
export interface PostingStatus {
  struckOff: boolean;
  /** In their final term — promotion is over, but a certificate fee is not (§7.7). */
  completed: boolean;
}

/**
 * §7.6: for a struck-off student payments, refunds, adjustments and write-offs are
 * allowed, new fee charges, promotion and special charges are blocked.
 * §7.7: for a completed student payments and special charges are allowed, promotion
 * is not. Returns the sentence to show, or null when the posting may go ahead.
 */
export function postingBlocker(type: LedgerEntryType, status: PostingStatus): string | null {
  if (status.struckOff && (type === 'FeeCharge' || type === 'SpecialCharge')) {
    return 'Blocked — the student is struck off, so no new charge may be posted (§7.6).';
  }
  if (status.completed && type === 'FeeCharge') {
    return 'Blocked — the student has completed the program; only special charges may be posted (§7.7).';
  }
  return null;
}

/** Entries that carry money in or out of the till, for the day book and receipts. */
export function isMoneyMovement(type: LedgerEntryType): boolean {
  return type === 'Payment' || type === 'Refund';
}

/** Convenience for screens that build a line list out of a template's components. */
export function linesTotal(lines: readonly LedgerEntryLine[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}
