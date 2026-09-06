// ============================================
// MediCMS Desktop v4.0 - Student Store
// In-memory student records (seeded from mock data;
// will be backed by SQLite later)
// ============================================

import { create } from 'zustand';
import { MOCK_FEE_TEMPLATES, MOCK_STUDENTS } from '@/lib/mockData';
import type { Student } from '@/types';

function backfillLockedFee(s: Student): Student {
  if (typeof s.baseFeeRecurring === 'number') return s;
  const tpl = MOCK_FEE_TEMPLATES.find(
    (t) => t.program === s.program && t.course === s.course && t.semester === '1st'
  );
  if (!tpl) return s;
  const full =
    tpl.admissionFee + tpl.tuitionFee + tpl.idCardFee + tpl.annualCharges +
    tpl.securityFee + tpl.enrollmentFee + tpl.diplomaFee + tpl.clinicalCharges;
  const recurring = tpl.tuitionFee + tpl.annualCharges + tpl.clinicalCharges + tpl.diplomaFee;
  return {
    ...s,
    baseFeeTotal: full,
    baseFeeRecurring: recurring || full,
    baseFeeBreakup: {
      admissionFee: tpl.admissionFee, tuitionFee: tpl.tuitionFee, idCardFee: tpl.idCardFee,
      annualCharges: tpl.annualCharges, securityFee: tpl.securityFee, enrollmentFee: tpl.enrollmentFee,
      diplomaFee: tpl.diplomaFee, clinicalCharges: tpl.clinicalCharges,
    },
  };
}

export type NewStudentInput = Omit<Student, 'sno' | 'struckOff' | 'isTestRecord' | 'synced'>;

export function getNextSno(students: Student[]): number {
  return Math.max(0, ...students.map(s => s.sno)) + 1;
}

interface StudentState {
  students: Student[];
  addStudent: (input: NewStudentInput) => Student;
  updateStudent: (sno: number, patch: Partial<Student>) => void;
  strikeOff: (sno: number, reason: string, details: string, date: string) => void;
  reverseStrikeOff: (sno: number) => void;
}

export const useStudentStore = create<StudentState>((set, get) => ({
  students: MOCK_STUDENTS.map(backfillLockedFee),

  addStudent: (input) => {
    const sno = getNextSno(get().students);
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
