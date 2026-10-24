// ============================================
// MediCMS Desktop — Receipts: the student statement (§9.1, §55)
//
// "Header with institute name, student details, period and who printed it.
// Balance brought forward, then every entry in the period with a running
// balance. A summary: brought forward, charges, concessions, payments, balance.
// An Unpaid fee charges list with due dates and days overdue. An ageing line.
// Two variants: Full statement and Dues only."
//
// Pure: the caller names the period and today, so the §9.1 sample for Bilal
// Ahmed (1 January to 9 October 2026, closing 53,000 due) is reproducible under
// `node --test`. The ageing itself is the fee core's own (§24), not a copy.
// ============================================

import { ageingOf, chargeStateOf } from '../ledger/charges.ts';
import { chronological } from '../ledger/balance.ts';
import { entryDirection, entryResolver } from '../ledger/entries.ts';
import type { LedgerEntry } from '../ledger/types.ts';
import { daysBetween, type AgeingResult } from '../fee/ageing.ts';

/** §9.1/§55 — the two variants of the same statement. */
export type StatementLayout = 'Full' | 'DuesOnly';

/** One entry of the period, split into the two money columns the statement prints. */
export interface StatementRow {
  entry: LedgerEntry;
  /** What the entry billed, for the Charges column (0 for a credit). */
  charges: number;
  /** What it took off, for the Credits column (0 for a charge). */
  credits: number;
  /** The running balance after this entry. */
  balance: number;
}

/** §9.1 "Brought forward 47,000 | Charges 61,000 | Concessions 0 | Payments 55,000". */
export interface StatementSummary {
  broughtForward: number;
  charges: number;
  concessions: number;
  payments: number;
  /** Every credit in the period, concessions and payments included. */
  credits: number;
  balance: number;
}

/** §9.1 "Unpaid fee charges: Term 3 · 53,000 · due 20 Jul 2026 · 81 days overdue". */
export interface StatementUnpaid {
  chargeId: string;
  label: string;
  term: number | null;
  unpaid: number;
  dueDate: string;
  daysOverdue: number;
}

export interface StudentStatement {
  from: string;
  to: string;
  layout: StatementLayout;
  /** Everything before `from`, as one figure (§9.1 "Brought forward"). */
  broughtForward: number;
  /** Empty for the dues-only variant: that one prints the summary and the dues. */
  rows: StatementRow[];
  summary: StatementSummary;
  unpaid: StatementUnpaid[];
  unpaidTotal: number;
  /** §9.1's ageing line and §24's five buckets, straight from the fee core. */
  ageing: AgeingResult;
}

export interface StatementOptions {
  from: string;
  to: string;
  today: string;
  layout?: StatementLayout;
}

/**
 * §9.1/§55 — one student's statement for a period.
 *
 * The balance always comes from the entries themselves (§7.3): the brought
 * forward figure is every entry dated before the period, and each row adds its
 * own effect, so the closing balance and the last row always agree.
 */
export function studentStatement(
  entries: readonly LedgerEntry[],
  options: StatementOptions,
): StudentStatement {
  const { from, to, today } = options;
  const layout = options.layout ?? 'Full';
  const ordered = chronological(entries);
  const resolve = entryResolver(ordered);

  let broughtForward = 0;
  const inPeriod: LedgerEntry[] = [];
  for (const entry of ordered) {
    if (entry.date < from) {
      const direction = entryDirection(entry, resolve);
      broughtForward += direction * entry.amount;
    } else if (entry.date <= to) {
      inPeriod.push(entry);
    }
  }

  let charges = 0;
  let credits = 0;
  let concessions = 0;
  let payments = 0;
  let running = broughtForward;
  const rows: StatementRow[] = [];

  for (const entry of inPeriod) {
    const direction = entryDirection(entry, resolve);
    const inflated = direction * entry.amount;
    running += inflated;
    if (inflated > 0) charges += inflated;
    else credits -= inflated;
    if (entry.type === 'Concession') concessions += entry.amount;
    if (entry.type === 'Payment') payments += entry.amount;
    rows.push({
      entry,
      charges: inflated > 0 ? inflated : 0,
      credits: inflated < 0 ? -inflated : 0,
      balance: running,
    });
  }

  const state = chargeStateOf(entries);
  const unpaid: StatementUnpaid[] = state.charges
    .filter((charge) => charge.unpaid > 0)
    .map((charge) => ({
      chargeId: charge.entryId,
      label: charge.label,
      term: charge.term,
      unpaid: charge.unpaid,
      dueDate: charge.dueDate,
      daysOverdue: Math.max(0, daysBetween(charge.dueDate, today)),
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    from,
    to,
    layout,
    broughtForward,
    // §9.1: the dues-only variant prints just the summary and the unpaid charges.
    rows: layout === 'DuesOnly' ? [] : rows,
    summary: {
      broughtForward,
      charges,
      concessions,
      payments,
      credits,
      balance: running,
    },
    unpaid,
    unpaidTotal: unpaid.reduce((sum, row) => sum + row.unpaid, 0),
    ageing: ageingOf(state, today),
  };
}
