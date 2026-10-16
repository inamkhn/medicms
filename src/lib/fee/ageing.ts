// ============================================
// MediCMS Desktop - Fee engine: overdue amounts and ageing (§24)
// A fee charge is Current until its due date passes; after that the unpaid part -
// measured after allocation - is Overdue. `today` is always supplied by the caller
// so a sample position such as §24.5's "9 October 2026" is reproducible.
// ============================================

import type { PostedCharge } from './types.ts';
import { unpaidOf } from './allocation.ts';

export type AgeingBucket = 'notYetDue' | 'd1to30' | 'd31to60' | 'd61to90' | 'over90';

export interface AgeingRow {
  chargeId: string;
  term: number;
  unpaid: number;
  /** 0 while the charge is Current. */
  daysOverdue: number;
  bucket: AgeingBucket;
}

export interface AgeingResult {
  /** §24.1 - the unpaid part of every charge past its due date. */
  overdueTotal: number;
  notYetDueTotal: number;
  buckets: Record<AgeingBucket, number>;
  /** How long the oldest unpaid charge has been overdue - the defaulter column (§13). */
  oldestDays: number;
  rows: AgeingRow[];
}

/** Local calendar days between two YYYY-MM-DD dates; negative when `toDate` is earlier. */
export function daysBetween(fromDate: string, toDate: string): number {
  const from = parseDay(fromDate);
  const to = parseDay(toDate);
  if (from === null || to === null) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** Midnight UTC for a YYYY-MM-DD string, or null when it is not a real date. */
function parseDay(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(stamp) ? null : stamp;
}

/** §24.2 - the five ageing buckets. */
export function bucketFor(daysOverdue: number, unpaid: number): AgeingBucket {
  if (unpaid <= 0 || daysOverdue <= 0) return 'notYetDue';
  if (daysOverdue <= 30) return 'd1to30';
  if (daysOverdue <= 60) return 'd31to60';
  if (daysOverdue <= 90) return 'd61to90';
  return 'over90';
}

/** Split a student's charges into the §24.2 ageing buckets. */
export function computeAgeing(charges: readonly PostedCharge[], today: string): AgeingResult {
  const buckets: Record<AgeingBucket, number> = {
    notYetDue: 0,
    d1to30: 0,
    d31to60: 0,
    d61to90: 0,
    over90: 0,
  };
  const rows: AgeingRow[] = [];
  let overdueTotal = 0;
  let notYetDueTotal = 0;
  let oldestDays = 0;

  for (const charge of charges) {
    const unpaid = unpaidOf(charge);
    const daysOverdue = Math.max(0, daysBetween(charge.dueDate, today));
    const bucket = bucketFor(daysOverdue, unpaid);
    rows.push({ chargeId: charge.id, term: charge.term, unpaid, daysOverdue, bucket });

    buckets[bucket] += unpaid;
    if (bucket === 'notYetDue') notYetDueTotal += unpaid;
    else {
      overdueTotal += unpaid;
      if (daysOverdue > oldestDays) oldestDays = daysOverdue;
    }
  }

  return { overdueTotal, notYetDueTotal, buckets, oldestDays, rows };
}
