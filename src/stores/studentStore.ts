// ============================================
// MediCMS Desktop v4.0 - Student Store
// Student records, persisted locally so an admission survives closing the app
// (cross-cutting rule, "Nothing resets on reload"). The mock seed is the first-run
// content only: once storage exists it wins, and an encrypted database replaces
// local storage in the storage phase of the design docs.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_FEE_TEMPLATES, MOCK_STUDENTS } from '@/lib/mockData';
import { legacyPlanFor } from '@/lib/fee/templateCompat';
import { convertLegacyRows } from '@/lib/fee/templateSeed';
import { findActiveFor } from '@/lib/fee/templateRules';
import { nowISO } from '@/lib/txn';
import { getNextSno } from '@/lib/sno';
import type { Student } from '@/types';

// Re-exported for existing importers (NewAdmission's preview, stores/index).
export { getNextSno };

// The templates the fee template store will seed from, converted the same way, so a
// seeded student's locked figures are the very numbers the template screen shows.
// `now` is a fixed moment because these timestamps are not used for anything here.
const SEED_TEMPLATES = convertLegacyRows(MOCK_FEE_TEMPLATES, { now: '2020-01-01T00:00:00.000Z' });

/**
 * Seed students predate the locked-fee fields. Fill them from the placement's
 * template - opening term total, next billed term as the promotion default - exactly
 * as admission would have written them (§7.4).
 */
function backfillLockedFee(s: Student): Student {
  if (typeof s.baseFeeRecurring === 'number') return s;
  const template = findActiveFor(SEED_TEMPLATES, s)
    ?? SEED_TEMPLATES.find((t) => t.program === s.program && t.course === s.course);
  if (!template) return s;
  const plan = legacyPlanFor(template, 1);
  return {
    ...s,
    baseFeeTotal: plan.baseFeeTotal || undefined,
    baseFeeRecurring: plan.baseFeeRecurring || undefined,
    baseFeeBreakup: plan.baseFeeBreakup,
  };
}

export type NewStudentInput = Omit<Student, 'sno' | 'struckOff' | 'isTestRecord' | 'synced'>;

interface StudentState {
  students: Student[];
  /** §27: highest SNO ever issued. Never lowered — not by strike-off, not by an import undo. */
  snoFloor: number;
  addStudent: (input: NewStudentInput) => Student;
  updateStudent: (sno: number, patch: Partial<Student>) => void;
  /** §23.7: undo an import removes exactly the students that import created. */
  removeStudents: (snos: readonly number[]) => void;
  strikeOff: (sno: number, reason: string, details: string, date: string) => void;
  reverseStrikeOff: (sno: number) => void;
  /** §26.5: finished the final term — leaves the active counts, ledger kept. */
  markCompleted: (sno: number, date: string) => void;
  /** §26.5: temporarily away — reason and expected return date are required. */
  putOnLeave: (sno: number, reason: string, returnDate: string, date: string) => void;
  /** §26.5: back to Active; the caller writes the reason to the audit trail. */
  returnFromLeave: (sno: number) => void;
}

export const useStudentStore = create<StudentState>()(
  persist(
    (set, get) => ({
      students: MOCK_STUDENTS.map(backfillLockedFee),
      snoFloor: 0,

      addStudent: (input) => {
        const sno = getNextSno(get().students, get().snoFloor ?? 0);
        const created: Student = {
          ...input,
          sno,
          struckOff: false,
          isTestRecord: false,
          synced: true,
        };
        set((state) => ({ students: [...state.students, created], snoFloor: sno }));
        return created;
      },

      updateStudent: (sno, patch) =>
        set((state) => ({
          // The stamp separates "set up by the import" from "edited after it" (§23.7).
          students: state.students.map((s) => (s.sno === sno ? { ...s, ...patch, updatedAt: nowISO() } : s)),
        })),

      removeStudents: (snos) => {
        // snoFloor is deliberately untouched: the removed numbers stay retired (§27).
        const gone = new Set(snos);
        set((state) => ({ students: state.students.filter((s) => !gone.has(s.sno)) }));
      },

      strikeOff: (sno, reason, details, date) =>
        set((state) => ({
          students: state.students.map((s) =>
            s.sno === sno
              ? {
                  ...s,
                  struckOff: true,
                  struckOffDate: date,
                  struckOffReason: [reason, details].filter(Boolean).join(' — '),
                }
              : s
          ),
        })),

      reverseStrikeOff: (sno) =>
        set((state) => ({
          students: state.students.map((s) =>
            s.sno === sno
              ? { ...s, struckOff: false, struckOffDate: undefined, struckOffReason: undefined }
              : s
          ),
        })),

      markCompleted: (sno, date) =>
        set((state) => ({
          students: state.students.map((s) =>
            s.sno === sno ? { ...s, completed: true, completedDate: date } : s
          ),
        })),

      putOnLeave: (sno, reason, returnDate, date) =>
        set((state) => ({
          students: state.students.map((s) =>
            s.sno === sno
              ? { ...s, onLeave: true, leaveReason: reason, leaveReturnDate: returnDate, leaveDate: date }
              : s
          ),
        })),

      returnFromLeave: (sno) =>
        set((state) => ({
          students: state.students.map((s) =>
            s.sno === sno
              ? { ...s, onLeave: false, leaveReason: undefined, leaveReturnDate: undefined, leaveDate: undefined }
              : s
          ),
        })),
    }),
    {
      name: 'medicms-students',
      partialize: (s) => ({ students: s.students, snoFloor: s.snoFloor }),
    }
  )
);
