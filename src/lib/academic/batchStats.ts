// ============================================
// MediCMS Desktop — Academic core: batch figures (§22, §31)
// The one place that turns a stored batch + the live student/template data into the
// figures every screen shows: admitted, active, term spread, calendar term,
// due-for-promotion, seats meter and the matching fee template. The list, the drawer
// and (later) the batch page all read through here so a count can never disagree
// between screens (§42.2 "every screen reads batches through these functions").
//
// Students still carry the legacy (program, batch name, session) triple, so batch
// membership is resolved the same way planRelink resolves a student to a batch id —
// program + session + name, ignoring case and surrounding space. `heldBack` is not
// modelled on the student yet, so it reads false.
// ============================================

import type { FeeTemplate, LedgerEntry, Student } from '../../types';
import { findActiveFor } from '../fee/templateRules.ts';
import { getStudentsWithBalanceLive } from '../balance.ts';
import { chargeStatesByStudent, overdueTotal } from '../ledger/charges.ts';
import { addDays, addMonths, isThisMonth } from '../dates.ts';
import { isBatchFull, seatsPercent } from './batch.ts';
import { calendarTermOf, isDueForPromotion } from './schedule.ts';
import { studentsInBatch, templatesForBatch } from './batchMembership.ts';
import type { AcademicBatch, AcademicCourse, AcademicProgram, CalendarTerm, TermRow } from './types.ts';

// Re-exported so existing screen imports (BatchDrawer, BatchMoreMenu) keep resolving
// from this module while the pure lookups live in batchMembership (node-test-safe).
export { studentsInBatch, templatesForBatch };

export interface BatchFigures {
  admitted: number;
  activeStudents: number;
  /** Lowest / highest term any active student sits in, or null when none are active. */
  studentTermMin: number | null;
  studentTermMax: number | null;
  calendar: CalendarTerm;
  dueForPromotion: boolean;
  /** Percentage of seats taken, or null when seats are unset. */
  seatsPct: number | null;
  full: boolean;
  template: FeeTemplate | undefined;
}

export interface BatchFigureInput {
  batch: AcademicBatch;
  program: AcademicProgram | undefined;
  course: AcademicCourse | undefined;
  students: readonly Student[];
  templates: readonly FeeTemplate[];
  /** Local `YYYY-MM-DD`; never read from a clock here (§48 step 2). */
  today: string;
  /** §18.3 grace window in days before a behind-schedule batch is flagged (§47 #2). */
  graceDays?: number;
}

function studentTermOf(s: Student): number {
  const n = parseInt(s.semester, 10);
  return Number.isFinite(n) ? n : 0;
}

export function computeBatchFigures(input: BatchFigureInput): BatchFigures {
  const { batch, program, course, students, templates, today, graceDays = 7 } = input;

  const matched = studentsInBatch(batch, program, students);
  const active = matched.filter((s) => !s.struckOff);
  const activeTerms = active.map(studentTermOf).filter((n) => n > 0);

  const positions = matched.map((s) => ({ term: studentTermOf(s), active: !s.struckOff, heldBack: false }));
  const calendar = calendarTermOf(batch.schedule, today);

  const template =
    program?.legacyValue && course?.legacyValue
      ? findActiveFor(templates, {
          course: course.legacyValue as FeeTemplate['course'],
          program: program.legacyValue as FeeTemplate['program'],
          session: batch.session,
          batch: batch.name,
        })
      : undefined;

  return {
    admitted: matched.length,
    activeStudents: active.length,
    studentTermMin: activeTerms.length ? Math.min(...activeTerms) : null,
    studentTermMax: activeTerms.length ? Math.max(...activeTerms) : null,
    calendar,
    dueForPromotion: isDueForPromotion(positions, calendar, today, graceDays),
    seatsPct: seatsPercent(batch.seats, matched.length),
    full: isBatchFull(batch.seats, matched.length),
    template,
  };
}

// --- §22 fee figures (batch page) -------------------------------------------
// Money is derived through the SAME engine the ledger screens use — balances from
// getStudentsWithBalanceLive, overdue from chargeStatesByStudent + overdueTotal — so
// a batch's Fees card can never disagree with the student's own ledger. Kept here,
// next to the other figures, rather than re-derived on the screen (§42.2).

export interface BatchFeeFigures {
  /** Σ positive balance of the batch's active students (§22 Outstanding). */
  outstanding: number;
  /** The overdue part of that, past each charge's due date (§22 Overdue). */
  overdue: number;
  /** Σ credit (negative) balances of the batch's active students (§22 Credit held). */
  creditHeld: number;
  /** Payments booked this month by any student in the batch (§22 Collected this month). */
  collectedThisMonth: number;
  /** Active students who owe something — the "With dues" tab count. */
  withDues: number;
  /** Active students counted per term that has a fee charge (§33.4 Charged column). */
  chargedByTerm: Record<number, number>;
  /** Active students with no fee charge at all — the fee-plan coverage gap (§33.5). */
  withoutCharge: number;
}

export interface BatchFeeInput {
  /** The batch's students, straight from studentsInBatch (active and struck-off alike). */
  students: readonly Student[];
  /** The full ledger; entries are filtered to these students here. */
  entries: readonly LedgerEntry[];
  today: string;
}

export function computeBatchFeeFigures({ students, entries, today }: BatchFeeInput): BatchFeeFigures {
  const withBal = getStudentsWithBalanceLive(students, entries);
  const active = withBal.filter((s) => !s.struckOff);
  const batchSno = new Set(students.map((s) => s.sno));
  const activeSno = new Set(active.map((s) => s.sno));

  const outstanding = active.reduce((sum, s) => sum + Math.max(0, s.computedBalance), 0);
  const creditHeld = active.reduce((sum, s) => sum + Math.max(0, -s.computedBalance), 0);
  const withDues = active.filter((s) => s.computedBalance > 0).length;

  const states = chargeStatesByStudent(entries);
  let overdue = 0;
  for (const sno of activeSno) {
    const state = states.get(sno);
    if (state) overdue += overdueTotal(state, today);
  }

  const collectedThisMonth = entries
    .filter((e) => e.type === 'Payment' && batchSno.has(e.studentSno) && isThisMonth(e.date))
    .reduce((sum, e) => sum + e.amount, 0);

  const chargedPerTerm = new Map<number, Set<number>>();
  const studentsWithCharge = new Set<number>();
  for (const e of entries) {
    if (e.type !== 'FeeCharge' || !activeSno.has(e.studentSno)) continue;
    studentsWithCharge.add(e.studentSno);
    if (typeof e.term === 'number' && e.term > 0) {
      let set = chargedPerTerm.get(e.term);
      if (!set) { set = new Set(); chargedPerTerm.set(e.term, set); }
      set.add(e.studentSno);
    }
  }
  const chargedByTerm: Record<number, number> = {};
  for (const [term, set] of chargedPerTerm) chargedByTerm[term] = set.size;

  return {
    outstanding,
    overdue,
    creditHeld,
    collectedThisMonth,
    withDues,
    chargedByTerm,
    withoutCharge: active.filter((s) => !studentsWithCharge.has(s.sno)).length,
  };
}

// --- §33.4 term-schedule presentation and editing helpers --------------------

export type ScheduleTermStatus = 'done' | 'current' | 'upcoming';

/** Done (a past term), Current (the calendar term) or Upcoming, from the schedule. */
export function termStatusOf(row: TermRow, calendar: CalendarTerm): ScheduleTermStatus {
  if (calendar.state === 'finished') return 'done';
  if (calendar.state === 'notStarted') return 'upcoming';
  if (row.term < calendar.term) return 'done';
  if (row.term === calendar.term) return 'current';
  return 'upcoming';
}

/** §33.4 "dates must stay in order": edited start dates may not go backwards. */
export function scheduleOrderProblem(rows: readonly TermRow[]): string | null {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].starts <= rows[i - 1].starts) {
      return `Term ${rows[i].term} must start after Term ${rows[i - 1].term}.`;
    }
  }
  return null;
}

/**
 * §33.4 "end dates update automatically": each term ends the day before the next
 * starts, and the last runs one full term length from its own start.
 */
export function normalizeScheduleEnds(starts: readonly string[], termLengthMonths: number): TermRow[] {
  return starts.map((start, i) => ({
    term: i + 1,
    starts: start,
    ends: i + 1 < starts.length ? addDays(starts[i + 1], -1) : addDays(addMonths(start, termLengthMonths), -1),
  }));
}
