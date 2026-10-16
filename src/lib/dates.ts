// ============================================
// MediCMS Desktop v4.0 — Local calendar dates
// Design doc §15: every "today"/"this month" figure uses the LOCAL date of the
// computer, not UTC. `new Date().toISOString()` is the trap — it shifts the
// boundary by the UTC offset, so a 2:00 AM payment lands on yesterday's
// collection here. Nothing in the app may derive a day/month key from ISO
// output; these are the only functions allowed to make that decision.
// ============================================

/** Local calendar day as `YYYY-MM-DD`, matching the ISO date strings stored on
 *  ledger/bank/expense rows (those are plain dates with no offset attached). */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local month as `YYYY-MM`. */
export function monthKey(d: Date = new Date()): string {
  return dayKey(d).slice(0, 7);
}

export function todayKey(): string {
  return dayKey();
}

/**
 * A `YYYY-MM-DD` day moved forward by whole days, staying on the local calendar.
 * Ledger due dates are built this way (§5, §24.1): a charge due 15 days after it
 * was posted must not land a day out because the maths went through UTC.
 */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return dayKey(new Date(year, month - 1, day + days));
}

/**
 * A `YYYY-MM-DD` day moved by whole months on the local calendar, keeping the same
 * day-of-month (§18.1 "on the same day of the month"). A day the target month does
 * not have clamps to its last day — 31 Jan + 1 month is 28/29 Feb, never 3 Mar.
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const anchor = new Date(year, month - 1 + months, 1);
  const lastDayOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return dayKey(new Date(anchor.getFullYear(), anchor.getMonth(), Math.min(day, lastDayOfMonth)));
}

/** Whole days between two local dates (`to − from`); negative when `to` is earlier.
 *  Rounded because a DST shift makes one of the two midnights an hour off; the true
 *  span is always a whole number of days. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const ms = new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime();
  return Math.round(ms / 86_400_000);
}

export function thisMonthKey(): string {
  return monthKey();
}

/** True when a stored `YYYY-MM-DD` date falls in the local current month.
 *  Prefix compare is safe because the keys are zero-padded. */
export function isThisMonth(date: string, month = thisMonthKey()): boolean {
  return date.slice(0, 7) === month;
}

/** True when a stored date is the local current day. */
export function isToday(date: string): boolean {
  return date.slice(0, 10) === todayKey();
}

/** §13: "Good morning, Saba". Boundaries are wall-clock hours, deliberately
 *  local — a counter opening at 6 AM should not read "good afternoon". */
export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** §13: "Friday, 9 October 2026" — day name, no leading zero on the day. */
export function longDate(d: Date = new Date()): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
