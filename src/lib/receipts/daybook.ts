// ============================================
// MediCMS Desktop — Receipts: the day book (§9.2, §60)
//
// "A register of everything entered on one day." Totals by payment mode and by
// entry type, and the rows themselves with the receipt number and who entered
// them. Pure: the caller names the day, the counter and the two filters, so
// §9.2's sample totals for 9 October 2026 are reproducible under `node --test`.
//
// A voided payment is not money collected: it leaves the mode totals and joins
// the voids line (§60 "Voids -30,000 (1)"), because a receipt that was cancelled
// can never count twice.
// ============================================

import { ENTRY_LABELS, reversedEntryIds } from '../ledger/entries.ts';
import type { LedgerEntry, LedgerEntryType, PaymentMode } from '../ledger/types.ts';

/** §14 — the four ways money arrives, in the order the day book prints them. */
export const PAYMENT_MODES: readonly PaymentMode[] = ['Cash', 'Bank', 'Online', 'Cheque'];

/** One line of the day's register (§60 "Time · Receipt · Student · Type · Mode · Amount · By"). */
export interface DayBookRow {
  id: string;
  /** The entry's created-at stamp; the screen prints only its time part. */
  createdAt: string;
  /** The receipt number, or the reference the entry carries. */
  reference: string;
  studentSno: number;
  studentName: string;
  type: LedgerEntryType;
  mode: PaymentMode | null;
  amount: number;
  by: string;
  /** §60: a voided receipt stays on the day it was entered, marked void. */
  voided: boolean;
}

export interface DayBookModeTotal {
  mode: PaymentMode;
  count: number;
  amount: number;
}

export interface DayBookTypeTotal {
  type: LedgerEntryType;
  label: string;
  count: number;
  amount: number;
}

export interface DayBook {
  date: string;
  /** All four modes, always, so a printed day book keeps its shape. */
  byMode: DayBookModeTotal[];
  /** Every entry type that appears in the filtered day, the payment included. */
  byType: DayBookTypeTotal[];
  /** Money collected in the filtered day — voids are not part of it (§60). */
  collected: number;
  collectedCount: number;
  voids: { count: number; amount: number };
  rows: DayBookRow[];
}

export interface DayBookOptions {
  date: string;
  mode?: PaymentMode | 'All';
  type?: LedgerEntryType | 'All';
  /** A counter operator sees only their own entries (§60). */
  counter?: string | null;
  names?: ReadonlyMap<number, string>;
}

/**
 * §9.2/§60 — everything entered on `date`, totalled by mode and by type.
 *
 * The mode filter applies to payments only (a concession has no mode), and the
 * type filter to the entries; both narrow the totals as well as the rows, so the
 * figures on screen always describe what is on screen.
 */
export function dayBook(entries: readonly LedgerEntry[], options: DayBookOptions): DayBook {
  const voidedIds = reversedEntryIds(entries);
  const names = options.names ?? new Map<number, string>();
  const byMode: DayBookModeTotal[] = PAYMENT_MODES.map((mode) => ({ mode, count: 0, amount: 0 }));
  const byTypeTotals = new Map<LedgerEntryType, DayBookTypeTotal>();
  const rows: DayBookRow[] = [];
  const voids = { count: 0, amount: 0 };
  let collected = 0;
  let collectedCount = 0;

  for (const entry of entries) {
    if (entry.date !== options.date) continue;
    const isPayment = entry.type === 'Payment';
    if (options.mode && options.mode !== 'All') {
      if (!isPayment || (entry.paymentMode ?? 'Cash') !== options.mode) continue;
    }
    if (options.type && options.type !== 'All' && entry.type !== options.type) continue;
    if (options.counter && entry.createdBy !== options.counter) continue;

    const voided = isPayment && voidedIds.has(entry.id);
    rows.push({
      id: entry.id,
      createdAt: entry.createdAt,
      reference: entry.reference ?? '',
      studentSno: entry.studentSno,
      studentName: names.get(entry.studentSno) ?? `SNO ${entry.studentSno}`,
      type: entry.type,
      mode: isPayment ? entry.paymentMode ?? 'Cash' : null,
      amount: entry.amount,
      by: entry.createdBy,
      voided,
    });

    if (isPayment) {
      if (voided) {
        voids.count += 1;
        voids.amount += entry.amount;
      } else {
        collected += entry.amount;
        collectedCount += 1;
        const slot = byMode.find((row) => row.mode === (entry.paymentMode ?? 'Cash'));
        if (slot) {
          slot.count += 1;
          slot.amount += entry.amount;
        }
      }
    }

    const total = byTypeTotals.get(entry.type) ?? {
      type: entry.type,
      label: ENTRY_LABELS[entry.type],
      count: 0,
      amount: 0,
    };
    total.count += 1;
    total.amount += entry.amount;
    byTypeTotals.set(entry.type, total);
  }

  // Newest first: the day book reads like the counter's own day, last thing on top.
  rows.sort((a, b) => (a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt)));

  return {
    date: options.date,
    byMode,
    byType: [...byTypeTotals.values()],
    collected,
    collectedCount,
    voids,
    rows,
  };
}

/**
 * §9.2 "It feeds the day closing screen": the cash a counter must be holding is
 * what the day book says came in by cash, minus nothing — a voided receipt never
 * arrived (§60).
 */
export function cashTaken(book: DayBook): number {
  return book.byMode.find((row) => row.mode === 'Cash')?.amount ?? 0;
}
