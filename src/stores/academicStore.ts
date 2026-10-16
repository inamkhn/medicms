// ============================================
// MediCMS Desktop — Academic Store (courses, programs, sessions, batches as data)
//
// BATCHES_ACADEMIC_SETUP_DESIGN §48 step 1. Today these are frozen constants and a
// name-only batchStore; here they become editable records so an Admin can add a
// program or session without a code change. The store only holds and shapes data —
// every rule (naming, duplicates, schedule, promotion, seats) lives in the pure
// src/lib/academic core, so a screen can never disagree with it.
//
// Phase 2 is additive: nothing is rewired to read this yet. Admission, fee templates
// and promotion switch over in Phases 4 and 7.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { COURSES, SESSION_OPTIONS } from '@/lib/constants';
import { MOCK_STUDENTS, MOCK_FEE_TEMPLATES } from '@/lib/mockData';
import {
  buildAcademicSeed,
  migrateBatches,
  programIdOfLegacy,
  type AcademicBatch,
  type AcademicCourse,
  type AcademicProgram,
  type AcademicSession,
  type AdmissionsState,
  type BatchStatus,
  type LegacyBatchRow,
  type SeedCourse,
  type SessionState,
  type TermRow,
} from '@/lib/academic';

// --- Seed from today's catalogue (§6) and today's batch rows (§27) ---

function seedCoursesAsInput(): SeedCourse[] {
  return COURSES.map((c) => ({
    code: c.code,
    label: c.label,
    system: c.system,
    subCourses: c.subCourses.map((s) => ({ value: s.value, label: s.label, numTerms: s.terms.length })),
  }));
}

function seedBatchRows(): LegacyBatchRow[] {
  const rows: LegacyBatchRow[] = [];
  for (const s of MOCK_STUDENTS) rows.push({ programLegacy: s.program, name: s.batch, session: s.session, isActive: true });
  for (const t of MOCK_FEE_TEMPLATES) rows.push({ programLegacy: t.program, name: t.batch, session: t.session, isActive: true });
  return rows;
}

function buildSeedState() {
  const currentYear = new Date().getFullYear();
  const seed = buildAcademicSeed(seedCoursesAsInput(), SESSION_OPTIONS, currentYear);
  const batches = migrateBatches(seedBatchRows(), {
    createdBy: 'System',
    createdAt: new Date().toISOString(),
  });
  return { courses: seed.courses, programs: seed.programs, sessions: seed.sessions, batches };
}

// --- Query filters ---

export interface ProgramFilter { courseId?: string; activeOnly?: boolean; }
export interface BatchFilter { programId?: string; session?: number; status?: BatchStatus; includeCompleted?: boolean; }

interface AcademicState {
  courses: AcademicCourse[];
  programs: AcademicProgram[];
  sessions: AcademicSession[];
  batches: AcademicBatch[];

  // Reads
  listCourses: () => AcademicCourse[];
  listPrograms: (filter?: ProgramFilter) => AcademicProgram[];
  getProgram: (id: string) => AcademicProgram | undefined;
  getSession: (year: number) => AcademicSession | undefined;
  getCurrentSession: () => AcademicSession | undefined;
  listBatches: (filter?: BatchFilter) => AcademicBatch[];
  getBatch: (id: string) => AcademicBatch | undefined;
  /** Look up the new program id for an old `ProgramCode` value (migration bridge). */
  programIdForLegacy: (legacy: string) => string;

  // Writes (thin — callers validate through @/lib/academic first)
  addCourse: (course: Omit<AcademicCourse, 'id'> & { id?: string }) => AcademicCourse;
  updateCourse: (id: string, patch: Partial<Omit<AcademicCourse, 'id'>>) => void;
  addProgram: (program: Omit<AcademicProgram, 'id'> & { id?: string }) => AcademicProgram;
  updateProgram: (id: string, patch: Partial<Omit<AcademicProgram, 'id'>>) => void;
  /** §7 rule 6: only ever called for a program with no batches and no templates — the
   *  screen checks that first; the store stays thin and does not re-validate. */
  deleteProgram: (id: string) => void;
  addSession: (year: number) => AcademicSession | null;
  setCurrentSession: (year: number) => void;
  setSessionState: (year: number, state: SessionState) => void;
  /** §12 rule 5: the screen refuses to delete a session that has batches/templates. */
  deleteSession: (year: number) => void;
  updateSession: (year: number, patch: Partial<Omit<AcademicSession, 'id' | 'year'>>) => void;
  createBatch: (batch: Omit<AcademicBatch, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => AcademicBatch;
  updateBatch: (id: string, patch: Partial<Omit<AcademicBatch, 'id'>>, changedBy: string) => void;
  setAdmissions: (id: string, admissions: AdmissionsState, changedBy: string) => void;
  setStatus: (id: string, status: BatchStatus, changedBy: string) => void;
  setSchedule: (id: string, schedule: TermRow[], changedBy: string) => void;
  /** §17/§34.5: the screen refuses to delete a batch that has students or templates. */
  deleteBatch: (id: string) => void;
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

export const useAcademicStore = create<AcademicState>()(
  persist(
    (set, get) => ({
      ...buildSeedState(),

      listCourses: () => [...get().courses].sort(byOrder),

      listPrograms: (filter) => {
        const { courseId, activeOnly } = filter ?? {};
        return get()
          .programs
          .filter((p) => (courseId ? p.courseId === courseId : true))
          .filter((p) => (activeOnly ? p.status === 'Active' : true))
          .sort(byOrder);
      },

      getProgram: (id) => get().programs.find((p) => p.id === id),

      getSession: (year) => get().sessions.find((s) => s.year === year),

      getCurrentSession: () => get().sessions.find((s) => s.isCurrent),

      // §47 #8: completed batches are hidden unless explicitly asked for.
      listBatches: (filter) => {
        const { programId, session, status, includeCompleted } = filter ?? {};
        return get()
          .batches
          .filter((b) => (programId ? b.programId === programId : true))
          .filter((b) => (session !== undefined ? b.session === session : true))
          .filter((b) => (status ? b.status === status : true))
          .filter((b) => (includeCompleted ? true : b.status !== 'Completed'));
      },

      getBatch: (id) => get().batches.find((b) => b.id === id),

      programIdForLegacy: (legacy) => programIdOfLegacy(legacy),

      addCourse: (course) => {
        const created: AcademicCourse = { ...course, id: course.id ?? `course-${crypto.randomUUID().slice(0, 8)}` };
        set((state) => ({ courses: [...state.courses, created] }));
        return created;
      },

      updateCourse: (id, patch) =>
        set((state) => ({ courses: state.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

      addProgram: (program) => {
        const created: AcademicProgram = { ...program, id: program.id ?? `prog-${crypto.randomUUID().slice(0, 8)}` };
        set((state) => ({ programs: [...state.programs, created] }));
        return created;
      },

      updateProgram: (id, patch) =>
        set((state) => ({
          programs: state.programs.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      deleteProgram: (id) =>
        set((state) => ({ programs: state.programs.filter((p) => p.id !== id) })),

      addSession: (year) => {
        if (get().sessions.some((s) => s.year === year)) return null;
        const created: AcademicSession = { id: `session-${year}`, year, state: 'Open', isCurrent: false };
        set((state) => ({ sessions: [...state.sessions, created] }));
        return created;
      },

      setCurrentSession: (year) =>
        set((state) => ({
          sessions: state.sessions.map((s) => ({ ...s, isCurrent: s.year === year, state: s.year === year ? 'Open' : s.state })),
        })),

      setSessionState: (year, s) =>
        set((state) => ({
          // The Current session cannot be Closed here — the screen guards that (§45 case 23).
          sessions: state.sessions.map((x) => (x.year === year && !x.isCurrent ? { ...x, state: s } : x)),
        })),

      deleteSession: (year) =>
        set((state) => ({ sessions: state.sessions.filter((x) => x.year !== year) })),

      updateSession: (year, patch) =>
        set((state) => ({ sessions: state.sessions.map((x) => (x.year === year ? { ...x, ...patch } : x)) })),

      createBatch: (batch) => {
        const created: AcademicBatch = {
          ...batch,
          id: batch.id ?? `batch-${batch.programId}-${batch.name}-${batch.session}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          createdAt: batch.createdAt ?? new Date().toISOString(),
        };
        set((state) => ({ batches: [...state.batches, created] }));
        return created;
      },

      updateBatch: (id, patch, changedBy) =>
        set((state) => ({
          batches: state.batches.map((b) => (b.id === id ? { ...b, ...patch, changedBy } : b)),
        })),

      setAdmissions: (id, admissions, changedBy) =>
        set((state) => ({
          batches: state.batches.map((b) => (b.id === id ? { ...b, admissions, changedBy } : b)),
        })),

      // §17: completing forces admissions Closed.
      setStatus: (id, status, changedBy) =>
        set((state) => ({
          batches: state.batches.map((b) =>
            b.id === id ? { ...b, status, admissions: status === 'Completed' ? 'Closed' : b.admissions, changedBy } : b,
          ),
        })),

      setSchedule: (id, schedule, changedBy) =>
        set((state) => ({
          batches: state.batches.map((b) => (b.id === id ? { ...b, schedule, changedBy } : b)),
        })),

      // §17/§34.5: the caller (More menu) refuses to delete a batch that has students or templates.
      deleteBatch: (id) =>
        set((state) => ({ batches: state.batches.filter((b) => b.id !== id) })),
    }),
    {
      name: 'medicms-academic',
      version: 1,
      partialize: (state) => ({
        courses: state.courses,
        programs: state.programs,
        sessions: state.sessions,
        batches: state.batches,
      }),
    },
  ),
);
