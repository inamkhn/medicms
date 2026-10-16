// ============================================
// MediCMS Desktop — Academic core: data shapes
// BATCHES_ACADEMIC_SETUP_DESIGN.md §5, §16, §18. Courses, programs, sessions and
// batches become editable data instead of compile-time unions. These are the pure
// record shapes only — no store, no clock, no React. The app-side screens reach them
// through `@/lib/academic`; the stores seed and persist them.
// ============================================

/** §2 / §8: how a program counts its teaching periods. */
export type TermSystem = 'Semester' | 'Year' | 'Term';

/** §17: a batch is Planned until Term 1 starts, Running once it has, Completed by hand. */
export type BatchStatus = 'Planned' | 'Running' | 'Completed';

/** §17: admissions is a switch independent of status. */
export type AdmissionsState = 'Open' | 'Closed';

/** §Feature 2: a session (academic year) is Open or Closed; exactly one is Current. */
export type SessionState = 'Open' | 'Closed';

export type ActiveOrDisabled = 'Active' | 'Disabled';

/** §18.1: one row of a batch's generated-then-editable term schedule. */
export interface TermRow {
  term: number; // 1-based term number
  starts: string; // YYYY-MM-DD
  ends: string; // YYYY-MM-DD, the day before the next term starts
}

/** §5.1 */
export interface AcademicCourse {
  id: string;
  name: string;
  status: ActiveOrDisabled;
  order: number;
  /** The old `CourseCode` union member this seed row came from (§48 step 1 bridge). */
  legacyValue?: string;
}

/** §5.2 — the term system, count and length all live here now. */
export interface AcademicProgram {
  id: string;
  courseId: string;
  name: string;
  shortCode: string; // ≤ 8 chars, unique; part of every batch display name (§7 rule 7)
  termSystem: TermSystem;
  numTerms: number; // 1..12
  termsPerYear: number; // 1 | 2 | 3 | 4 | 6 | 12; term length = 12 ÷ this (§5.2)
  status: ActiveOrDisabled;
  order: number;
  notes?: string | null;
  /** The old `ProgramCode` union member this seed row came from (§48 step 1 bridge). */
  legacyValue?: string;
}

/** Feature 2 — a session replaces the fixed 2017-2028 list. */
export interface AcademicSession {
  id: string;
  year: number; // e.g. 2026
  state: SessionState;
  isCurrent: boolean;
  notes?: string | null;
}

/** §16 — a batch now carries status, admissions, seats and its schedule. */
export interface AcademicBatch {
  id: string;
  programId: string; // linked by ID, not name (§46)
  session: number;
  name: string; // optional; '' when the program has one batch per session
  status: BatchStatus;
  admissions: AdmissionsState;
  seats: number | null; // optional whole number (§19)
  term1Start: string | null; // required before the batch can be Running (§16)
  schedule: TermRow[];
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  changedBy?: string | null;
}

/** §18.3: the per-student term position the due-for-promotion check needs. */
export interface TermPosition {
  term: number;
  active: boolean; // counts toward the batch only when active
  heldBack: boolean; // a held-back student is never "behind schedule"
}

/** §18.2: where the batch's calendar sits today. */
export type CalendarTerm =
  | { state: 'notStarted' }
  | { state: 'term'; term: number; starts: string }
  | { state: 'finished'; lastEnds: string };
