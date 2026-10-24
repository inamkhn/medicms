// ============================================
// MediCMS Desktop — Payments: the safety checks (§17, §21)
//
// §17 is a table of nine checks and §21 turns two of them into acceptance lines
// ("A counter operator cannot back-date. An Accountant cannot back-date beyond 7
// days."). They are all pure questions about one draft payment, so they live
// here: the payment screen asks once, gets two lists — what blocks the save and
// what needs a second confirmation — and cannot forget a row of the table.
//
// No store, no clock: `today` and `now` are passed in, so a test can sit on
// 9 October 2026 and the answer is reproducible.
// ============================================

import { daysBetween } from '../dates.ts';
import { reversedEntryIds } from '../ledger/entries.ts';
import type { LedgerEntry, PaymentMode } from '../ledger/types.ts';
import type { PaymentSettings } from './types.ts';

/** The roles the §17 limits are written for — the app's `UserRole`, unaliased. */
export type PayRole = 'Admin' | 'Accountant' | 'Counter' | 'Viewer';

/** §17 "Back-dating" per role, and whether the date needs a written reason. */
export interface BackDateRule {
  /** Days back this role may post; null means any open day (Admin). */
  days: number | null;
  needsReason: boolean;
  /** The sentence the date field shows under itself. */
  label: string;
}

export function backDateRule(role: PayRole, settings: PaymentSettings): BackDateRule {
  switch (role) {
    case 'Admin':
      return { days: null, needsReason: true, label: 'Any open day, with a reason.' };
    case 'Accountant':
      return {
        days: settings.backDateDays,
        needsReason: true,
        label: `Today or up to ${settings.backDateDays} days back, with a reason.`,
      };
    default:
      // Counter (and Viewer, who cannot reach this screen) record today only.
      return { days: 0, needsReason: false, label: "Today's date only." };
  }
}

export interface PaymentSafetyInput {
  studentSno: number;
  /** Whole rupees, always positive (§6). */
  amount: number;
  /** The date the payment is posted on, `YYYY-MM-DD` (§17 back-dating). */
  date: string;
  mode: PaymentMode;
  /** Local `YYYY-MM-DD` — the clock, passed in. */
  today: string;
  /** Local `YYYY-MM-DDTHH:mm:ss` — the duplicate window measures against it. */
  now: string;
  role: PayRole;
  settings: PaymentSettings;
  /** Days already closed (§17 "Closed day"); a closed day blocks a payment. */
  closedDays?: readonly string[];
  /** Entries to check against; only this student's payments are looked at. */
  entries: readonly LedgerEntry[];
  /** Everything owed before this payment — zero means no dues at all. */
  dues: number;
  /** Rupees the preview could not place on a charge. */
  credit: number;
  /** §17 "Accountant: up to 7 days, with a reason" — the operator's words. */
  reason?: string;
  /** From `bookGate` — null while a numbered book is available (§17). */
  bookProblem?: string | null;
  /** §17 "Struck-off or on-leave student: allowed, with a banner." */
  studentFlag?: 'struckOff' | 'completed' | null;
}

export interface PaymentSafety {
  /** Reasons the save cannot proceed. Empty means the payment may be recorded. */
  blockers: string[];
  /** §17 "Record anyway?" questions — each one needs an explicit yes. */
  confirms: string[];
  /** Informational lines shown above the button; never block. */
  notices: string[];
  /** The earlier payment a duplicate warning is about, for the message. */
  duplicateOf: LedgerEntry | null;
}

/**
 * Run the §17 table over one draft. The result is what the screen renders: red
 * blockers, a yellow confirmation for each question, grey notices.
 */
export function paymentSafety(input: PaymentSafetyInput): PaymentSafety {
  const blockers: string[] = [];
  const confirms: string[] = [];
  const notices: string[] = [];
  const { amount, date, today, settings } = input;

  // §17 "Zero or negative amount — blocked"; §20 "decimals not accepted".
  if (!Number.isInteger(amount)) {
    blockers.push('Whole rupees only — the amount cannot have decimals.');
  } else if (amount <= 0) {
    blockers.push('Enter an amount above zero.');
  }

  // §17 "Future date — blocked."
  if (date > today) blockers.push('A payment cannot be dated in the future.');

  // §17 "Closed day — blocked until an Admin reopens the day."
  if (date <= today && (input.closedDays ?? []).includes(date)) {
    blockers.push('This day is closed. Ask an Admin to reopen it before recording a payment.');
  }

  // §17 "Back-dating" — role window, then the reason the rule asks for.
  const rule = backDateRule(input.role, settings);
  if (rule.days !== null && daysBetween(date, today) > rule.days) {
    blockers.push(
      input.role === 'Counter'
        ? "A counter operator can record today's payments only."
        : `An accountant can back-date up to ${rule.days} days. Ask an Admin for an older date.`,
    );
  } else if (rule.needsReason && date < today && !(input.reason ?? '').trim()) {
    blockers.push('Write the reason for the back-dated payment.');
  }

  // §17 "Receipt book — no active book, or the book is full."
  if (input.bookProblem) blockers.push(input.bookProblem);

  // §17 duplicate: same student, same amount, same mode, within the window.
  const duplicate = findDuplicate(input);
  if (duplicate) {
    const at = duplicate.createdAt.slice(11, 16);
    confirms.push(
      `A similar payment was recorded at ${at} by ${duplicate.createdBy}. Record anyway?`,
    );
  }

  // §17 "An amount above 500,000 asks for a second confirmation."
  if (amount > settings.largeAmount) {
    confirms.push('This is a large amount. Confirm it once more before saving.');
  }

  // §17 "This leaves 5,000 as credit"; above 10,000 it needs a confirmation.
  if (input.credit > settings.creditConfirm) {
    confirms.push('A credit this large needs an extra confirmation.');
  } else if (input.credit > 0) {
    notices.push(`This leaves ${input.credit.toLocaleString('en-PK')} as credit.`);
  }

  // §17 "No dues at all — the whole amount will be credit."
  if (input.dues <= 0) {
    notices.push('This student has no dues. The whole amount will be credit.');
  }

  // §17 "Struck-off or on-leave student — allowed, with a banner."
  if (input.studentFlag === 'struckOff') {
    notices.push('This student is struck off. A payment is still allowed and is recorded.');
  } else if (input.studentFlag === 'completed') {
    notices.push('This student has completed the course. A payment is still allowed.');
  }

  return { blockers, confirms, notices, duplicateOf: duplicate };
}

/**
 * §17 "Same student, same amount and same mode within 10 minutes of an earlier
 * payment." A reversed payment does not raise the warning twice — it is no longer
 * money in hand.
 */
function findDuplicate(input: PaymentSafetyInput): LedgerEntry | null {
  const reversed = reversedEntryIds(input.entries);
  const windowMinutes = input.settings.duplicateWindowMinutes;
  const now = new Date(input.now).getTime();

  const earlier = input.entries
    .filter(
      (entry) =>
        entry.type === 'Payment' &&
        entry.studentSno === input.studentSno &&
        !reversed.has(entry.id) &&
        entry.amount === input.amount &&
        entry.paymentMode === input.mode,
    )
    .map((entry) => ({
      entry,
      minutes: (now - new Date(entry.createdAt).getTime()) / 60_000,
    }))
    .filter((row) => row.minutes >= 0 && row.minutes <= windowMinutes)
    .sort((a, b) => a.minutes - b.minutes);

  return earlier[0]?.entry ?? null;
}
