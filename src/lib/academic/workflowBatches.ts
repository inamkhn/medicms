import type { FeeTemplate, Student } from '../../types';
import type { AcademicBatch, AcademicCourse, AcademicProgram, AcademicSession } from './types.ts';
import { selectorBatches, selectorSessions, type SelectorContext } from './selector.ts';

export interface AcademicCatalogue {
  courses: readonly AcademicCourse[];
  programs: readonly AcademicProgram[];
  sessions: readonly AcademicSession[];
  batches: readonly AcademicBatch[];
}

/** Bridge the existing student program codes to the managed academic catalogue. */
export function workflowBatches(
  catalogue: AcademicCatalogue,
  placement: { course: string; program: string },
  context: Extract<SelectorContext, 'admission' | 'promotion'>,
  students: readonly Student[],
  templates: readonly FeeTemplate[],
  today: string,
) {
  const course = catalogue.courses.find(c => c.legacyValue === placement.course && c.status === 'Active');
  const program = catalogue.programs.find(p => p.legacyValue === placement.program && p.courseId === course?.id && p.status === 'Active');
  if (!course || !program) return [];
  return selectorSessions(context, catalogue.sessions).flatMap(session => selectorBatches({
    context, batches: catalogue.batches, program, course, students, templates, today,
    programId: program.id, session: session.year,
  }));
}

/** Imports can restore historical records, but must resolve one exact cohort. */
export function importBatch(catalogue: AcademicCatalogue, placement: {
  course: string; program: string; session: number; batch: string;
}): AcademicBatch | undefined {
  const course = catalogue.courses.find(c => c.legacyValue === placement.course);
  const program = catalogue.programs.find(p => p.legacyValue === placement.program && p.courseId === course?.id);
  if (!program || !catalogue.sessions.some(s => s.year === placement.session)) return undefined;
  const matches = catalogue.batches.filter(b => b.programId === program.id && b.session === placement.session
    && b.name.trim().toLowerCase() === placement.batch.trim().toLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}
