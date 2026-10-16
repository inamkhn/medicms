// ============================================
// MediCMS Desktop — Academic core: moving today's data (§27, §48 step 1)
// Turns the old name-based batch rows into ID-linked batches, and plans the re-link
// of students whose saved (program, batch name, session) should now point at a batch
// id. Pure — no store, no clock. Run: npm run test
// ============================================

import { programIdOfLegacy } from './seed.ts';
import type { AcademicBatch } from './types.ts';

/** A row of the old `batchStore.Batch` reduced to what migration reads. */
export interface LegacyBatchRow {
  programLegacy: string; // old `ProgramCode` value
  name: string;
  session: number;
  isActive: boolean;
}

/**
 * §27 / §45 case 27: existing batches come across as Running (they are in flight),
 * with admissions Open when active and Closed when the old batch was disabled. There
 * is no Term 1 start date yet — the setup-health panel flags that (§37), it is not
 * invented here. Duplicate (program, name) rows collapse to one, as before.
 */
export function migrateBatches(
  rows: readonly LegacyBatchRow[],
  meta: { createdBy: string; createdAt: string },
): AcademicBatch[] {
  const seen = new Set<string>();
  const out: AcademicBatch[] = [];
  for (const row of rows) {
    const key = `${row.programLegacy}||${row.name.toLowerCase()}||${row.session}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `batch-${row.programLegacy}-${row.name}-${row.session}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      programId: programIdOfLegacy(row.programLegacy),
      session: row.session,
      name: row.name,
      status: 'Running',
      admissions: row.isActive ? 'Open' : 'Closed',
      seats: null,
      term1Start: null,
      schedule: [],
      createdBy: meta.createdBy,
      createdAt: meta.createdAt,
    });
  }
  return out;
}

/** A student reduced to the fields the re-link match reads (sno is the key). */
export interface StudentBatchKey {
  sno: number;
  programLegacy: string;
  name: string;
  session: number;
}

export interface RelinkPlanItem {
  sno: number;
  /** The batch id the student's saved name resolved to, or null for the re-link tool. */
  batchId: string | null;
}

/**
 * §26 / §45 case 28: match a student's saved batch name to a batch in the same
 * program and session, ignoring capital letters and surrounding space. Anything that
 * matches nothing is left as null so the re-link tool can surface it rather than
 * guessing.
 */
export function planRelink(
  students: readonly StudentBatchKey[],
  batches: readonly AcademicBatch[],
): RelinkPlanItem[] {
  return students.map((s) => {
    const wanted = s.name.trim().toLowerCase();
    const programId = programIdOfLegacy(s.programLegacy);
    const hit = batches.find(
      (b) =>
        b.programId === programId &&
        b.session === s.session &&
        b.name.trim().toLowerCase() === wanted,
    );
    return { sno: s.sno, batchId: hit ? hit.id : null };
  });
}

/** How many of the plan's students could not be matched (drives the re-link badge). */
export function countUnmatched(plan: readonly RelinkPlanItem[]): number {
  return plan.filter((item) => item.batchId === null).length;
}
