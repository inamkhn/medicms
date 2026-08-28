// ============================================
// MediCMS Desktop v4.0 - Student Store
// In-memory student records (seeded from mock data;
// will be backed by SQLite later)
// ============================================

import { create } from 'zustand';
import { MOCK_STUDENTS } from '@/lib/mockData';
import type { Student } from '@/types';

export type NewStudentInput = Omit<Student, 'sno' | 'struckOff' | 'isTestRecord' | 'synced'>;

interface StudentState {
  students: Student[];
  addStudent: (input: NewStudentInput) => Student;
  updateStudent: (sno: number, patch: Partial<Student>) => void;
  strikeOff: (sno: number, reason: string, details: string, date: string) => void;
  reverseStrikeOff: (sno: number) => void;
}

export const useStudentStore = create<StudentState>((set, get) => ({
  students: [...MOCK_STUDENTS],

  addStudent: (input) => {
    const sno = Math.max(...get().students.map(s => s.sno)) + 1;
    const created: Student = {
      ...input,
      sno,
      struckOff: false,
      isTestRecord: false,
      synced: true,
    };
    set((state) => ({ students: [...state.students, created] }));
    return created;
  },

  updateStudent: (sno, patch) =>
    set((state) => ({
      students: state.students.map((s) => (s.sno === sno ? { ...s, ...patch } : s)),
    })),

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
}));
