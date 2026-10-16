// ============================================
// MediCMS Desktop — Academic core: term schedule and promotion due
// §18. The schedule is generated from the Term 1 start and the program's term
// length, then hand-edited; the calendar term and the due-for-promotion flag are
// derived from it. `today` is always passed in — this module never reads a clock.
// ============================================

import { addDays, addMonths, daysBetween } from '../dates.ts';
import { termLengthMonthsOf } from './terms.ts';
import type { CalendarTerm, TermPosition, TermRow } from './types.ts';

/**
 * §18.1 / §45 cases 4-5. Term N starts (N − 1) × term-length months after Term 1
 * on the same day of the month; each term ends the day before the next starts (and
 * the last ends one day before where a further term *would* begin).
 */
export function generateSchedule(
  term1Start: string,
  numTerms: number,
  termsPerYear: number,
): TermRow[] {
  const months = termLengthMonthsOf(termsPerYear);
  const rows: TermRow[] = [];
  for (let i = 0; i < numTerms; i++) {
    const starts = addMonths(term1Start, i * months);
    const ends = addDays(addMonths(term1Start, (i + 1) * months), -1);
    rows.push({ term: i + 1, starts, ends });
  }
  return rows;
}

/**
 * §18.2 / §45 cases 6-12: the calendar term is the highest term whose start date
 * has passed. Before Term 1 → "notStarted"; after the last term ends → "finished"
 * (the app then suggests marking the batch completed).
 */
export function calendarTermOf(schedule: readonly TermRow[], today: string): CalendarTerm {
  if (schedule.length === 0) return { state: 'notStarted' };
  const first = schedule[0];
  const last = schedule[schedule.length - 1];
  // Dates are zero-padded YYYY-MM-DD, so lexicographic compare is calendar order.
  if (today < first.starts) return { state: 'notStarted' };
  if (today > last.ends) return { state: 'finished', lastEnds: last.ends };
  let current = first;
  for (const row of schedule) {
    if (row.starts <= today) current = row;
    else break;
  }
  return { state: 'term', term: current.term, starts: current.starts };
}

/**
 * §18.3 / §45 cases 13-15: a batch is due for promotion when at least one active,
 * not-held-back student sits below the calendar term AND that calendar term started
 * more than `graceDays` ago. Only meaningful while the batch is mid-schedule.
 */
export function isDueForPromotion(
  positions: readonly TermPosition[],
  calendar: CalendarTerm,
  today: string,
  graceDays: number,
): boolean {
  if (calendar.state !== 'term') return false;
  const anyBehind = positions.some(
    (p) => p.active && !p.heldBack && p.term < calendar.term,
  );
  if (!anyBehind) return false;
  return daysBetween(calendar.starts, today) > graceDays;
}
