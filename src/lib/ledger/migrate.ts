// ============================================
// MediCMS Desktop — Ledger: moving off the three-column row (§7.10, §6)
//
// "Any ledger line stored as a negative discount becomes a Special charge of the
// same amount. All other lines keep their type." (§7.10)
//
// One legacy row could carry three different things at once — a demand, a
// concession and a payment — because there were three amount columns and one type.
// The typed model has one amount per entry, so a row expands into as many entries as
// it holds money in, in the order §8 prints them: charge, then reduction, then
// payment.
//
// The legacy row shape lives here rather than in src/types because it is migration
// input only: nothing in the running app reads or writes it after the first load.
// ============================================

import { SEMESTER_OPTIONS } from '../constants.ts';
import { REASON_MIN_LENGTH, entryId, typeDirection } from './entries.ts';
import { readPaymentMode } from './mode.ts';
import type { LedgerEntry, PaymentMode } from './types.ts';

/** The nine types the old ledger row could hold. */
export type LegacyTransactionType =
  | 'Demand' | 'Pay' | 'Disc' | 'Exam' | 'CT' | 'Annual' | 'Fine' | 'Adj' | 'Refund';

/** One row of the pre-typed ledger: three amount columns, direction in the signs. */
export interface LegacyLedgerRow {
  id: string;
  studentSno: number;
  txnNo: number;
  date: string;
  type: LegacyTransactionType;
  semester?: string | null;
  session?: number | null;
  fees: number;
  discount: number;
  payment: number;
  receiptNo: string | null;
  receivedBy: string | null;
  paymentMode?: string | null;
  narration: string;
  createdAt: string;
  createdBy: string;
  synced?: boolean;
}

/** A migrated row's author, when the row itself does not say who wrote it. */
const MIGRATED_BY = 'Migrated';

/**
 * Reductions and adjustments carry a reason in the new model (§5). Old rows had only
 * a narration, so the narration becomes the reason and this is what a row with
 * nothing at all gets — it says where the entry came from instead of inventing a
 * justification nobody gave.
 */
const MIGRATED_REASON = 'Migrated from the pre-typed ledger';

/** Old free-text charge types, for a description when the narration is empty. */
const LEGACY_CHARGE_WORDS: Partial<Record<LegacyTransactionType, string>> = {
  Exam: 'Exam fee charge',
  CT: 'Clinical training charge',
  Annual: 'Annual charges',
  Fine: 'Fine',
};

/** Term number for the old semester label; unknown labels simply have no term. */
function termOfSemester(label: string | null | undefined): number | null {
  if (!label) return null;
  const index = SEMESTER_OPTIONS.indexOf(label as (typeof SEMESTER_OPTIONS)[number]);
  return index < 0 ? null : index + 1;
}

function firstText(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) return candidate.trim();
  }
  return '';
}

/**
 * §5 wants a reason a reader could act on, and the old rows had only a narration —
 * sometimes as thin as "Waiver". Since an entry is never edited (§7.1), a migrated
 * reason below the §5 length would be refused by the ledger check for ever and could
 * never be fixed, so a short narration keeps its own words and gains the note of
 * where it came from. An empty narration is the note alone.
 */
function reasonOf(narration: string): string {
  const text = narration.trim();
  if (text.length >= REASON_MIN_LENGTH) return text;
  return text ? `${text} — ${MIGRATED_REASON}` : MIGRATED_REASON;
}

/**
 * What the OLD formula produced for one row, kept so the migration's money
 * conservation can be asserted rupee for rupee. One deliberate exception is
 * documented in `migrateLegacyRows`: a legacy Refund row reduced the balance, which
 * is the opposite of §6.
 */
export function legacyBalanceEffect(row: LegacyLedgerRow): number {
  const increases = row.fees + (row.discount < 0 ? -row.discount : 0);
  const reduces = (row.discount > 0 ? row.discount : 0) + row.payment;
  return increases - reduces;
}

interface DraftEntry {
  type: LedgerEntry['type'];
  amount: number;
  description: string;
  reference?: string | null;
  paymentMode?: PaymentMode;
  reason?: string | null;
}

/** The entries one legacy row expands into, in the order §8 lists them. */
function piecesOf(row: LegacyLedgerRow): DraftEntry[] {
  const narration = firstText(row.narration);
  const term = termOfSemester(row.semester);
  const pieces: DraftEntry[] = [];

  // A special charge stored in the demand column (the old Exam/CT/Annual/Fine rows)
  // and a demand are both charges; only the wording differs. An 'Adj' row that added
  // money was correcting an amount that was too low, which is its own type (§6).
  if (row.fees > 0) {
    const words = LEGACY_CHARGE_WORDS[row.type];
    const type: LedgerEntry['type'] = row.type === 'Adj' ? 'AdjustmentAdd' : words ? 'SpecialCharge' : 'FeeCharge';
    pieces.push({
      type,
      amount: row.fees,
      description: firstText(
        narration,
        words,
        type === 'AdjustmentAdd' ? 'Adjustment (add)' : null,
        term === null ? 'Fee charge' : `Term ${term} fee charge`,
      ),
      // An Adjustment (add) needs a reason (§5); a charge does not.
      reason: type === 'AdjustmentAdd' ? reasonOf(narration) : null,
    });
  }

  // §7.10, the one rule that has no exception: a negative discount is a charge.
  if (row.discount < 0) {
    pieces.push({
      type: 'SpecialCharge',
      amount: -row.discount,
      description: firstText(narration, 'Special charge'),
      reason: null,
    });
  }

  if (row.discount > 0) {
    pieces.push({
      // An 'Adj' line that reduced the balance was a correction, not a concession.
      type: row.type === 'Adj' ? 'AdjustmentReduce' : 'Concession',
      amount: row.discount,
      description: firstText(
        narration,
        row.type === 'Adj' ? 'Adjustment (reduce)' : 'Concession',
      ),
      reason: reasonOf(narration),
    });
  }

  if (row.payment > 0) {
    if (row.type === 'Refund') {
      pieces.push({
        type: 'Refund',
        amount: row.payment,
        description: firstText(narration, 'Refund paid to student'),
        reference: row.receiptNo,
        paymentMode: readPaymentMode(row.paymentMode, narration),
        reason: reasonOf(narration),
      });
    } else {
      const mode = readPaymentMode(row.paymentMode, narration);
      pieces.push({
        type: 'Payment',
        amount: row.payment,
        description: firstText(
          narration,
          `Payment${row.receiptNo ? ` ${row.receiptNo}` : ''}, ${mode.toLowerCase()}`,
        ),
        reference: row.receiptNo,
        paymentMode: mode,
      });
    }
  }

  return pieces;
}

/** §5 — the types a charge line must carry a due date for. */
const CHARGE_TYPES: readonly LedgerEntry['type'][] = ['FeeCharge', 'SpecialCharge', 'AdjustmentAdd'];

/** Entries §5 says must point at the charge they reduce. */
const REDUCTION_TYPES: readonly LedgerEntry['type'][] = ['Concession', 'AdjustmentReduce'];

/** What a reduction may be linked to: a billed charge, not an adjustment of one. */
const LINKABLE_CHARGE_TYPES: readonly LedgerEntry['type'][] = ['FeeCharge', 'SpecialCharge'];

/**
 * §5 wants a concession to name the charge it reduced. An old row never recorded
 * that — there was no linked-entry field, only a discount column on the same line —
 * so the best guess is the nearest charge that could have meant it: the last charge
 * posted for the same term, otherwise the last charge posted at all. A reduction
 * with no candidate ahead of it stays unlinked, and `charges.ts` then reports it as
 * credit rather than pretending it paid off something.
 */
function linkCandidate(
  chargeByTerm: Map<number, string>,
  lastChargeId: string | null,
  term: number | null,
): string | null {
  if (term !== null) {
    const sameTerm = chargeByTerm.get(term);
    if (sameTerm) return sameTerm;
  }
  return lastChargeId;
}

/**
 * Convert the old ledger into typed entries, per student, in posting order, with
 * fresh entry numbers and a rebuilt `balanceAfter` (§7.3: the stored copy is
 * rebuilt automatically on the move).
 *
 * Deliberate change of sign, stated once: a legacy `Refund` row reduced the balance,
 * because the old formula added whatever was in the payment column to "paid". §6 says
 * a refund increases the balance — money handed back takes credit away — so a
 * migrated refund now does the thing it always should have done.
 */
export function migrateLegacyRows(rows: readonly LegacyLedgerRow[]): LedgerEntry[] {
  const byStudent = new Map<number, LegacyLedgerRow[]>();
  for (const row of rows) {
    const list = byStudent.get(row.studentSno);
    if (list) list.push(row);
    else byStudent.set(row.studentSno, [row]);
  }

  const entries: LedgerEntry[] = [];
  for (const [studentSno, list] of [...byStudent.entries()].sort((a, b) => a[0] - b[0])) {
    const ordered = [...list].sort((a, b) =>
      a.date === b.date ? a.txnNo - b.txnNo : a.date < b.date ? -1 : 1,
    );
    let entryNo = 0;
    let running = 0;
    let lastChargeId: string | null = null;
    const chargeByTerm = new Map<number, string>();

    for (const row of ordered) {
      const semesterTerm = termOfSemester(row.semester);
      for (const piece of piecesOf(row)) {
        entryNo += 1;
        const id = entryId(studentSno, entryNo);
        const isReduction = REDUCTION_TYPES.includes(piece.type);
        const linkedEntryId = isReduction ? linkCandidate(chargeByTerm, lastChargeId, semesterTerm) : null;
        running += typeDirection(piece.type) * piece.amount;
        entries.push({
          id,
          studentSno,
          entryNo,
          // Old rows already hold a local YYYY-MM-DD date; nothing here reads a clock.
          date: row.date,
          type: piece.type,
          amount: piece.amount,
          description: piece.description,
          reference: piece.reference ?? null,
          // A payment or a refund settles money; it does not belong to a term.
          term: piece.type === 'Payment' || piece.type === 'Refund' ? null : semesterTerm,
          // A legacy charge was due when it was billed (§24.1 asks every charge for
          // a due date; nothing older than this row can disagree with that).
          dueDate: CHARGE_TYPES.includes(piece.type) ? row.date : null,
          linkedEntryId,
          reason: piece.reason ?? null,
          createdBy: firstText(row.createdBy, row.receivedBy, MIGRATED_BY),
          createdAt: row.createdAt,
          approvedBy: null,
          // One action per old row, so a split row can still be traced back to it (§5).
          actionNo: `migrated-${row.id}`,
          paymentMode: piece.paymentMode,
          balanceAfter: running,
        });

        // The trackers move after the entry is written, so a charge posted on the
        // same row as its own discount receives the link (§8.1 entries 1 and 2).
        if (LINKABLE_CHARGE_TYPES.includes(piece.type)) {
          lastChargeId = id;
          if (semesterTerm !== null) chargeByTerm.set(semesterTerm, id);
        }
      }
    }
  }

  return entries;
}
