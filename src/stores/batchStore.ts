// ============================================
// MediCMS - Batch Store (per-program batches)
// Each batch belongs to exactly one program.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Batch, CourseCode, ProgramCode } from '@/types';
import { getCourseOfProgram } from '@/lib/constants';
import { MOCK_STUDENTS, MOCK_FEE_TEMPLATES } from '@/lib/mockData';

function seedBatches(): Batch[] {
  const seen = new Set<string>();
  const out: Batch[] = [];
  const push = (program: ProgramCode, name: string, session: number) => {
    const key = `${program}||${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    let course: CourseCode;
    try {
      course = getCourseOfProgram(program);
    } catch {
      return;
    }
    out.push({
      id: `batch-${program}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      course,
      program,
      name,
      session,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  };
  for (const s of MOCK_STUDENTS) push(s.program, s.batch, s.session);
  for (const t of MOCK_FEE_TEMPLATES) push(t.program, t.batch, t.session);
  return out;
}

interface BatchState {
  batches: Batch[];
  addBatch: (program: ProgramCode, name: string, session: number) => Batch | null;
  renameBatch: (id: string, name: string, session: number) => void;
  setActive: (id: string, isActive: boolean) => void;
  getByProgram: (program: ProgramCode | '') => Batch[];
}

export const useBatchStore = create<BatchState>()(
  persist(
    (set, get) => ({
      batches: seedBatches(),

      addBatch: (program, name, session) => {
        const trimmed = name.trim();
        if (!program || !trimmed) return null;
        const exists = get().batches.some(
          (b) => b.program === program && b.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (exists) return null;
        const created: Batch = {
          id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          course: getCourseOfProgram(program),
          program,
          name: trimmed,
          session,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        set({ batches: [...get().batches, created] });
        return created;
      },

      renameBatch: (id, name, session) =>
        set({
          batches: get().batches.map((b) =>
            b.id === id ? { ...b, name: name.trim() || b.name, session } : b
          ),
        }),

      setActive: (id, isActive) =>
        set({
          batches: get().batches.map((b) => (b.id === id ? { ...b, isActive } : b)),
        }),

      getByProgram: (program) => {
        if (!program) return [];
        return get()
          .batches.filter((b) => b.program === program && b.isActive)
          .sort((a, b) => a.name.localeCompare(b.name));
      },
    }),
    { name: 'medicms-batches' }
  )
);
