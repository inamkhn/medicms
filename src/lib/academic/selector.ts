// ============================================
// MediCMS Desktop — Academic core: selector candidates (§38)
// The one rule set behind the shared AcademicSelector: given a screen context and the
// live academic data, which courses / programs / sessions / batches are offered, which
// are greyed with a reason, and which are hidden. §38.3 tabulates the per-context rules;
// they live here as pure functions so every screen resolves the SAME options and the
// tests can pin them before any React (§45 "written as automated tests before the
// screens that use them"). No store, no clock, no ledger graph — membership and template
// lookup come from the pure batchMembership / templateRules helpers only.
// ============================================

import type { FeeTemplate, Student } from '../../types';
import { findActiveFor } from '../fee/templateRules.ts';
import { batchDisplayName, isBatchFull } from './batch.ts';
import { calendarTermOf, isDueForPromotion } from './schedule.ts';
import { studentsInBatch } from './batchMembership.ts';
import type {
  AcademicBatch, AcademicCourse, AcademicProgram, AcademicSession, CalendarTerm,
} from './types.ts';

/** §38.3: the six surfaces that embed the picker, each with its own offer rules. */
export type SelectorContext =
  | 'admission'
  | 'directory'
  | 'promotion'
  | 'feeTemplate'
  | 'editStudent';

/** One offered batch, with the grey-out state and reason the picker renders (§38.1). */
export interface SelectorBatch {
  batch: AcademicBatch;
  displayName: string;
  admitted: number;
  /** Visible but not selectable — carries `reason` (§38.2 greyed options). */
  disabled: boolean;
  reason?: string;
  calendar: CalendarTerm;
  dueForPromotion: boolean;
}

/** §38.3 programs: Active everywhere, all in the directory, the student's own when editing. */
export function selectorPrograms(
  context: SelectorContext,
  programs: readonly AcademicProgram[],
  opts?: { programId?: string },
): AcademicProgram[] {
  if (context === 'editStudent') {
    return programs.filter((p) => p.id === opts?.programId);
  }
  if (context === 'directory') return [...programs];
  return programs.filter((p) => p.status === 'Active');
}

/**
 * §38.1 cascade: a course is offered when it owns at least one offered program. In the
 * directory every course shows. `offeredPrograms` is the already-filtered program list.
 */
export function selectorCourses(
  context: SelectorContext,
  courses: readonly AcademicCourse[],
  offeredPrograms: readonly AcademicProgram[],
): AcademicCourse[] {
  if (context === 'directory') return [...courses];
  const owned = new Set(offeredPrograms.map((p) => p.courseId));
  return courses.filter((c) => c.status === 'Active' && owned.has(c.id));
}

/** §38.3 sessions: every session in the directory and promotion, open ones elsewhere. */
export function selectorSessions(
  context: SelectorContext,
  sessions: readonly AcademicSession[],
): AcademicSession[] {
  if (context === 'directory' || context === 'promotion') return [...sessions];
  return sessions.filter((s) => s.state === 'Open');
}

/**
 * §38.3 batches for a chosen (program, session). Completed batches are hidden in the
 * directory unless `includeCompleted`; the admission and edit-student contexts keep the
 * near-miss batches visible but greyed with a reason so the operator sees why (§38.2).
 */
export function selectorBatches(input: {
  context: SelectorContext;
  batches: readonly AcademicBatch[];
  program: AcademicProgram | undefined;
  course: AcademicCourse | undefined;
  students: readonly Student[];
  templates: readonly FeeTemplate[];
  today: string;
  programId: string;
  session: number;
  includeCompleted?: boolean;
  graceDays?: number;
}): SelectorBatch[] {
  const {
    context, batches, program, course, students, templates, today,
    programId, session, includeCompleted = false, graceDays = 7,
  } = input;

  const inScope = batches.filter((b) => b.programId === programId && b.session === session);

  const out: SelectorBatch[] = [];
  for (const batch of inScope) {
    // Status gates first — many contexts never even show the batch.
    if (context === 'promotion') {
      if (batch.status !== 'Running') continue;
    } else if (context === 'directory') {
      if (batch.status === 'Completed' && !includeCompleted) continue;
    } else {
      // admission / feeTemplate / editStudent: only Planned or Running are candidates.
      if (batch.status === 'Completed') continue;
    }

    const admitted = studentsInBatch(batch, program, students).length;
    const calendar = calendarTermOf(batch.schedule, today);
    const dueForPromotion = isDueForPromotion(
      studentsInBatch(batch, program, students).map((s) => ({
        term: parseInt(s.semester, 10) || 0,
        active: !s.struckOff,
        heldBack: false,
      })),
      calendar,
      today,
      graceDays,
    );

    const entry: SelectorBatch = {
      batch,
      displayName: program ? batchDisplayName(program.shortCode, batch.name, batch.session) : `Batch ${batch.id}`,
      admitted,
      disabled: false,
      calendar,
      dueForPromotion,
    };

    if (context === 'admission' || context === 'editStudent') {
      const reason = admissionBlockReason(batch, program, course, templates, admitted);
      if (reason) {
        entry.disabled = true;
        entry.reason = reason;
      }
    }

    out.push(entry);
  }

  return out;
}

/** Why an admission/edit-student batch is visible but unusable (§38.3, §40.1). */
function admissionBlockReason(
  batch: AcademicBatch,
  program: AcademicProgram | undefined,
  course: AcademicCourse | undefined,
  templates: readonly FeeTemplate[],
  admitted: number,
): string | undefined {
  if (batch.admissions === 'Closed') return 'Admissions closed';
  if (isBatchFull(batch.seats, admitted)) return 'Seats full';
  if (program?.legacyValue && course?.legacyValue) {
    const template = findActiveFor(templates, {
      course: course.legacyValue as FeeTemplate['course'],
      program: program.legacyValue as FeeTemplate['program'],
      session: batch.session,
      batch: batch.name,
    });
    if (!template) return 'No fee template';
  }
  return undefined;
}
