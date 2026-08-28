// ============================================
// MediCMS Desktop v4.0 - Constants
// ============================================

import type { ProgramCode, BatchName, Semester, ExpenseCategory, CourseCode } from '@/types';

// --- Courses & Sub-courses ---
export interface SubCourseDef { value: ProgramCode; label: string; terms: Semester[]; }

export interface CourseDef {
  code: CourseCode;
  label: string;
  system: 'semester' | 'annual' | 'months';
  durationLabel: string;
  subCourses: SubCourseDef[];
}

const PARAMEDICS_TERMS: Semester[] = ['1st', '2nd', '3rd', '4th'];

export const COURSES: CourseDef[] = [
  {
    code: 'Paramedics',
    label: 'Paramedics',
    system: 'semester',
    durationLabel: '2 Years / 4 Semesters',
    subCourses: [
      { value: 'Health', label: 'Health', terms: PARAMEDICS_TERMS },
      { value: 'Surgical', label: 'Surgical', terms: PARAMEDICS_TERMS },
      { value: 'Anaesthesia', label: 'Anaesthesia', terms: PARAMEDICS_TERMS },
      { value: 'Dental', label: 'Dental', terms: PARAMEDICS_TERMS },
      { value: 'Radiology', label: 'Radiology', terms: PARAMEDICS_TERMS },
      { value: 'Pathology', label: 'Pathology', terms: PARAMEDICS_TERMS },
      { value: 'Cardiology', label: 'Cardiology', terms: PARAMEDICS_TERMS },
      { value: 'Pharmacy', label: 'Pharmacy Tech', terms: PARAMEDICS_TERMS },
      { value: 'Dialysis', label: 'Dialysis', terms: PARAMEDICS_TERMS },
    ],
  },
  {
    code: 'PharmacyB',
    label: 'Pharmacy B (Category B)',
    system: 'annual',
    durationLabel: '2 Years / Annual',
    subCourses: [
      { value: 'PharmacyB', label: 'Pharmacy Cat-B', terms: ['1st', '2nd'] },
    ],
  },
  {
    code: 'PNC',
    label: 'PNC (Pakistan Nursing Council)',
    system: 'annual',
    durationLabel: '2 Years Diploma / Annual',
    subCourses: [
      { value: 'LHV', label: 'LHV', terms: ['1st', '2nd'] },
      { value: 'CMW', label: 'CMW', terms: ['1st', '2nd'] },
      { value: 'CNA', label: 'CNA', terms: ['1st', '2nd'] },
    ],
  },
  {
    code: 'BSN',
    label: 'BS Nursing',
    system: 'semester',
    durationLabel: '4 Years / 8 Semesters',
    subCourses: [
      { value: 'BSN', label: 'BS Nursing', terms: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'] },
    ],
  },
  {
    code: 'DHMS',
    label: 'Homeopathic Council',
    system: 'annual',
    durationLabel: 'DHMS 4 Years / Annual',
    subCourses: [
      { value: 'DHMS', label: 'DHMS', terms: ['1st', '2nd', '3rd', '4th'] },
    ],
  },
  {
    code: 'Ultrasound',
    label: 'Ultrasound Course',
    system: 'months',
    durationLabel: '6 Months / 1 Year',
    subCourses: [
      { value: 'Ultrasound6M', label: 'Ultrasound 6 Months', terms: ['1st'] },
      { value: 'Ultrasound1Y', label: 'Ultrasound 1 Year', terms: ['1st', '2nd'] },
    ],
  },
];

// --- Derived program options (flattened from COURSES) ---
export const PROGRAM_OPTIONS: { value: ProgramCode; label: string }[] = COURSES.flatMap(
  (course) => course.subCourses.map((sub) => ({ value: sub.value, label: sub.label }))
);

// --- Course lookup helpers ---
export function getCourseDef(code: CourseCode): CourseDef {
  const course = COURSES.find((c) => c.code === code);
  if (!course) throw new Error(`Unknown course: ${code}`);
  return course;
}

export function getSubCourseDef(program: ProgramCode): { course: CourseDef; sub: SubCourseDef } {
  const course = COURSES.find((c) => c.subCourses.some((s) => s.value === program));
  if (!course) throw new Error(`Unknown program: ${program}`);
  const sub = course.subCourses.find((s) => s.value === program)!;
  return { course, sub };
}

export function getCourseOfProgram(program: ProgramCode): CourseCode {
  return getSubCourseDef(program).course.code;
}

// --- Batches ---
export const BATCH_OPTIONS: BatchName[] = [
  '1st Batch', '2nd Batch', '3rd Batch', '4th Batch', '5th Batch',
  '6th Batch', '7th Batch', '8th Batch', '9th Batch', '10th Batch',
  '11th Batch', '12th Batch', '13th Batch', '14th Batch', '15th Batch',
  '16th Batch', '17th Batch',
];

// --- Semesters / Terms ---
export const SEMESTER_OPTIONS: Semester[] = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

// --- Sessions (years) ---
export const SESSION_OPTIONS = Array.from(
  { length: 12 },
  (_, i) => 2017 + i
); // 2017-2028

// --- Expense Categories ---
export const EXPENSE_CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: 'SAL', label: 'Salaries' },
  { value: 'FOOD', label: 'Foods' },
  { value: 'UTIL', label: 'Utility Bills' },
  { value: 'BLDG', label: 'Building Rent' },
  { value: 'CT', label: 'Clinical Training' },
  { value: 'DR', label: 'Dr. Remuneration' },
  { value: 'FAC', label: 'Faculty Payment' },
  { value: 'REFUND', label: 'Fee Refund' },
  { value: 'FURN', label: 'Furnitures' },
  { value: 'ELEC', label: 'Electronic Equipment' },
  { value: 'IDCARD', label: 'ID Card' },
  { value: 'STAT', label: 'Stationary' },
  { value: 'ADV', label: 'Advertisement' },
  { value: 'OTHER', label: 'Other' },
];

// --- Struck Off Reasons ---
export const STRUCK_OFF_REASONS = [
  'Non-payment of fees',
  'Disciplinary action',
  'Voluntarily withdrawn',
  'Long absence (> 75% shortage)',
  'Other',
] as const;

// --- Charge Types (for Add Charge screen) ---
export const CHARGE_TYPES = [
  { value: 'Exam', label: 'Exam Fee', defaultNarration: '@2700 Exam Fees' },
  { value: 'CT', label: 'Clinical Training', defaultNarration: 'Clinical Training Fee' },
  { value: 'Annual', label: 'Annual Charges', defaultNarration: 'Annual Charges' },
  { value: 'Late', label: 'Late Payment Fine', defaultNarration: 'Late Payment Fine' },
  { value: 'Library', label: 'Library Fine', defaultNarration: 'Library Fine' },
  { value: 'Equipment', label: 'Equipment Damage', defaultNarration: 'Equipment Damage Charge' },
  { value: 'Other', label: 'Other / Custom', defaultNarration: '' },
] as const;

// --- Adjustment Types (for Ledger Adjustment screen) ---
export const ADJUSTMENT_TYPES = [
  { value: 'reverse', label: 'Reverse wrong entry' },
  { value: 'grace', label: 'Grace marks waiver' },
  { value: 'writeoff', label: 'Write-off / waiver' },
  { value: 'refund', label: 'Refund to student' },
  { value: 'other', label: 'Other correction' },
] as const;

// --- Institute Info ---
export const INSTITUTE_INFO = {
  name: 'Paramedical Institute',
  location: 'Saidu Sharif, Swat',
  phone: '0946-XXXXXXX',
};

// --- Bank Info ---
export const BANK_INFO = {
  name: 'Bank Al Habib Limited Islamic',
  branch: 'Saidu Sharif',
  accountNo: '5533-0081-000190-01-1',
};

// --- Keyboard Shortcuts ---
export const KEYBOARD_SHORTCUTS = [
  { key: 'F3', action: 'Global search overlay' },
  { key: 'F5', action: 'Sync Now' },
  { key: 'Ctrl+N', action: 'New Admission' },
  { key: 'Ctrl+P', action: 'Record Payment' },
  { key: 'Ctrl+R', action: 'Reprint last receipt' },
  { key: 'Ctrl+D', action: 'Daily cash report' },
  { key: 'Esc', action: 'Close drawer / cancel form' },
  { key: 'Enter', action: 'Confirm / submit focused form' },
] as const;

// --- Fee Rules (from real data analysis) ---
export const FEE_RULES = {
  annualChargesFirstSemester: 3,    // Applies Sem 3+
  clinicalChargesSemester: 3,       // Applies Sem 3 only
  diplomaFeeSemester: 4,            // Applies Sem 4 only
  creditGuardThreshold: -10000,     // Warn if balance goes below this
} as const;
