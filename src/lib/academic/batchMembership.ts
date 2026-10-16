// ============================================
// MediCMS Desktop — Academic core: batch membership (pure)
// The two batch↔data lookups that BOTH the app-side figures (batchStats) and the
// tested academic barrel need: which students sit in a batch, and which fee
// templates name it. They live in their own file because they must stay free of the
// ledger/fee engine graph (which imports the `@/` alias and so cannot be loaded by
// `node --test`). batchStats re-exports them for its screens; the selector imports
// them directly. Students still carry the legacy (program, batch name, session)
// triple, so membership is matched by program legacy value + session + name,
// ignoring capital letters and surrounding space — the same rule the batch page uses.
// ============================================

import type { FeeTemplate, Student } from '../../types';
import type { AcademicBatch, AcademicProgram } from './types.ts';

/** Students whose saved (program, session, batch name) point at this batch. */
export function studentsInBatch<T extends Student>(
  batch: AcademicBatch,
  program: AcademicProgram | undefined,
  students: readonly T[],
): T[] {
  if (!program?.legacyValue) return [];
  const wanted = batch.name.trim().toLowerCase();
  return students.filter(
    (s) =>
      s.program === program.legacyValue &&
      s.session === batch.session &&
      s.batch.trim().toLowerCase() === wanted,
  );
}

/**
 * Every fee template that names this batch (exact batch, same program + session),
 * whatever its status. Used by the rename dialog's impact line (§34.1) and the
 * delete gate (§17/§34.5): a batch with a template pointing at it is "used".
 */
export function templatesForBatch(
  batch: AcademicBatch,
  program: AcademicProgram | undefined,
  templates: readonly FeeTemplate[],
): FeeTemplate[] {
  if (!program?.legacyValue) return [];
  const wanted = batch.name.trim().toLowerCase();
  return templates.filter(
    (t) =>
      t.program === program.legacyValue &&
      t.session === batch.session &&
      t.batch.trim().toLowerCase() === wanted,
  );
}
