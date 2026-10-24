// ============================================
// MediCMS Desktop v4.0 - Type Definitions
// Based on Desktop_Module_Architecture_v4
// ============================================

// The fee engine owns the component shape; the stored template references it instead
// of keeping a second copy that could drift (FEE_TEMPLATES_AND_ADMISSION_DESIGN §5.2).
import type { ConcessionRecord, FeeComponent } from '@/lib/fee/types';

export type { FeeComponent, ChargeTiming } from '@/lib/fee/types';

// The ledger owns its own entry model (PAYMENTS_RECEIPTS_LEDGER_DESIGN §5, §6); the
// app references it rather than keeping a second copy that could drift.
export type {
  LedgerEntry,
  LedgerEntryLine,
  LedgerEntryType,
  PaymentMode,
} from '@/lib/ledger/types';

// The academic core owns the courses/programs/sessions/batches model
// (BATCHES_ACADEMIC_SETUP_DESIGN §5, §16-§18); the app references it rather than
// keeping a second copy. The legacy `Batch` below is superseded in Phase 2.
export type {
  AcademicCourse,
  AcademicProgram,
  AcademicSession,
  AcademicBatch,
  TermRow,
  TermPosition,
  TermSystem,
  BatchStatus,
  AdmissionsState,
  SessionState,
  CalendarTerm,
} from '@/lib/academic/types';

// --- User & Auth ---
// Design doc Feature 1 §3: four roles replace the single hardcoded Admin.
export type UserRole = 'Admin' | 'Accountant' | 'Counter' | 'Viewer';

export const ROLE_LABELS: Record<UserRole, string> = {
  Admin: 'Admin',
  Accountant: 'Accountant',
  Counter: 'Counter operator',
  Viewer: 'Viewer',
};

/**
 * The session shape the rest of the UI reads (Header/Sidebar name, `receivedBy`,
 * audit `user`). Deliberately free of any secret — the credential record is AppUser.
 * Keeping this identical to the old `User` means existing `user.name / user.role`
 * call sites are untouched by the multi-user redesign.
 */
export interface User {
  id: string;
  username: string;
  name: string;      // full name
  role: UserRole;
}

/**
 * A stored account. `passwordHash` is the only credential material kept; the
 * plaintext never lands in storage (Feature 1 §6). Lock counters live here so a
 * locked account survives a reload (§10). Users are disabled, never deleted, so
 * old audit entries still resolve to a real name (§7).
 */
export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  status: 'Active' | 'Disabled';
  passwordHash: string;
  passwordSalt: string;
  /** true after an admin reset until the user picks their own password (§7). */
  mustChangePassword: boolean;
  /** Optional receipt book for counter operators who issue receipts (§7). */
  receiptBookId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  /** Consecutive failed sign-ins since the last success (§6). */
  failedAttempts: number;
  /** ISO timestamp; the account is locked for sign-in until this moment (§6). */
  lockedUntil: string | null;
}

// --- Programs & Courses ---
export type CourseCode = 'Paramedics' | 'PharmacyB' | 'PNC' | 'BSN' | 'DHMS' | 'Ultrasound';

export type ProgramCode =
  // Paramedics sub-courses
  | 'Health' | 'Surgical' | 'Pharmacy' | 'Radiology'
  | 'Pathology' | 'Cardiology' | 'Anaesthesia' | 'Dental' | 'Dialysis'
  // PNC sub-courses
  | 'LHV' | 'CMW' | 'CNA'
  // Standalone courses (sub-course = the course itself)
  | 'PharmacyB' | 'BSN' | 'DHMS'
  // Ultrasound sub-courses
  | 'Ultrasound6M' | 'Ultrasound1Y';

export const PROGRAMS: ProgramCode[] = [
  'Health', 'Surgical', 'Pharmacy', 'Radiology',
  'Pathology', 'Cardiology', 'Anaesthesia', 'Dental', 'Dialysis',
  'LHV', 'CMW', 'CNA',
  'PharmacyB', 'BSN', 'DHMS',
  'Ultrasound6M', 'Ultrasound1Y',
];

// --- Batch & Session ---
export type BatchName = string;

export interface Batch {
  id: string;
  course: CourseCode;
  program: ProgramCode;   // strict per-program: each batch belongs to exactly one program
  name: string;           // e.g. "1st Batch", "Batch-A 2026"
  session: number;        // e.g. 2026
  isActive: boolean;
  createdAt: string;
}

export type Semester = '1st' | '2nd' | '3rd' | '4th' | '5th' | '6th' | '7th' | '8th';

// --- Student ---
export interface Student {
  sno: number;                    // Global Student Number (primary key)
  name: string;
  fatherName: string;
  contact: string | null;
  address: string | null;
  cnic: string | null;            // NULL if not entered (never "nil"/"n/a")
  regDate: string;                // ISO date
  course: CourseCode;             // Parent course (e.g. Paramedics, PNC)
  program: ProgramCode;           // Sub-course (e.g. Health, LHV)
  batch: string;
  session: number;                // Year e.g. 2017
  semester: Semester;             // Current semester (derived from ledger)
  // Locked fee at admission: full Sem-1 total + recurring promotion default.
  // Derived from the v2 template so a student's locked figures and the template can
  // never disagree (§7.4 - the plan is a copy).
  baseFeeTotal?: number;
  baseFeeRecurring?: number;
  baseFeeBreakup?: LegacyFeeHeads;
  // §13.2/§15.2: the concession records the plan was saved with, and the template
  // (version included) it was copied from. Template amounts stay untouched; the
  // student's figure is always derived from these records (§13.3).
  planConcessions?: ConcessionRecord[];
  feeTemplateId?: string;
  feeTemplateVersion?: number;
  photoUrl?: string | null;        // Base64 data URL or remote URL (for ID Card)
  dob?: string | null;               // ISO date (YYYY-MM-DD)
  gender?: 'Male' | 'Female' | 'Other' | null;
  domicile?: string | null;          // District / Tehsil
  emergencyContact?: string | null;
  // §23.3 import columns that the model used to drop on the floor:
  guardianName?: string | null;       // person who pays the fees, if not the student
  guardianPhone?: string | null;
  councilRegistrationNo?: string | null; // issued by the council, where one applies
  rollNo?: string | null;             // institute roll number
  previousEducation?: string | null;  // §25 editable: school/college before admission
  struckOff: boolean;
  struckOffDate?: string;
  struckOffReason?: string;
  /** §26.5: finished the final term — leaves active counts, kept for payments. */
  completed?: boolean;
  completedDate?: string;
  /** §26.5: temporarily away — a reason and expected return date are required. */
  onLeave?: boolean;
  leaveReason?: string;
  leaveDate?: string;
  leaveReturnDate?: string;
  isTestRecord: boolean;          // For "Director Sb" type entries
  synced: boolean;
  /** Stamped by `updateStudent` so an import undo can tell an edited row (§23.7). */
  updatedAt?: string;
}

// --- Fee Template (v2, design doc §5) ---
export type TemplateStatus = 'Draft' | 'Active' | 'Archived';

/**
 * The eight heads the pre-v2 screens and stored student breakups are written in.
 * `otherFees` carries components that are not one of the legacy eight, so a
 * hand-built template with a "Lab fee" cannot quietly lose that money.
 */
export interface LegacyFeeHeads {
  admissionFee: number;
  tuitionFee: number;
  idCardFee: number;
  annualCharges: number;
  securityFee: number;
  enrollmentFee: number;
  diplomaFee: number;
  clinicalCharges: number;
  otherFees: number;
}

/**
 * One row of the old per-semester, eight-head table. Migration input only — it
 * genuinely has no `otherFees` column, which is why it does not extend the full
 * nine-head record.
 */
export interface LegacyFeeTemplateRow extends Omit<LegacyFeeHeads, 'otherFees'> {
  id: string;
  course: CourseCode;
  program: ProgramCode;
  semester: Semester;
  batch: string;
  session: number;
}

/**
 * One template covers the whole program (§5.1): the fee for each term is computed
 * from `components` by the engine rather than stored per semester. `batch` is ''
 * for an all-batches template, which is used only when no batch-specific one
 * exists (§7.3).
 */
export interface FeeTemplate {
  id: string;
  name: string;
  course: CourseCode;
  program: ProgramCode;
  session: number;
  batch: string;
  status: TemplateStatus;
  /** Raised on every save of an Active template (§7.9); a plan records it (§15.2). */
  version: number;
  notes?: string;
  /** From the program's term list in constants (§5.1). */
  totalTerms: number;
  /** From Settings, defaulting to the course system (§5.4). Must be > 0 to activate (§7.10). */
  termsPerYear: number;
  /** Due-date defaults, §5.1 and §31 #6: 14 days after admission, 15 after posting. */
  admissionDueDays: number;
  termDueDays: number;
  components: FeeComponent[];
  createdAt: string;
  updatedAt: string;
}

// --- Payment mode ---
// Declared in lib/ledger/types.ts with the entry that carries it, and re-exported
// above: where the money physically came from is a property of a ledger entry
// (§14, §32), not a separate concept the app keeps its own copy of.

// The old three-column LedgerTransaction / TransactionType row is gone (§1). Its
// shape lives only as LegacyLedgerRow / LegacyTransactionType in lib/ledger/migrate.ts,
// which is the migration input; nothing new is posted as one.

// --- Balance Display State ---
export type BalanceState = 
  | { type: 'dues'; amount: number }      // balance > 0
  | { type: 'cleared' }                    // balance === 0
  | { type: 'credit'; amount: number };   // balance < 0

// --- Expense ---
export type ExpenseCategory = 
  | 'ADV'       // Advertisement
  | 'BLDG'      // Building Rent
  | 'CT'        // Clinical Training
  | 'DR'        // Dr. Remuneration
  | 'ELEC'      // Electronic Equipment
  | 'FAC'       // Faculty Payment
  | 'REFUND'    // Fee Refund
  | 'FOOD'      // Foods
  | 'FURN'      // Furnitures
  | 'IDCARD'    // ID Card
  | 'SAL'       // Salaries
  | 'STAT'      // Stationary
  | 'UTIL'      // Utility Bills
  | 'OTHER';    // Other

export const EXPENSE_CATEGORIES: { code: ExpenseCategory; label: string }[] = [
  { code: 'SAL', label: 'Salaries' },
  { code: 'FOOD', label: 'Foods' },
  { code: 'UTIL', label: 'Utility Bills' },
  { code: 'BLDG', label: 'Building Rent' },
  { code: 'CT', label: 'Clinical Training' },
  { code: 'DR', label: 'Dr. Remuneration' },
  { code: 'FAC', label: 'Faculty Payment' },
  { code: 'REFUND', label: 'Fee Refund' },
  { code: 'FURN', label: 'Furnitures' },
  { code: 'ELEC', label: 'Electronic Equipment' },
  { code: 'IDCARD', label: 'ID Card' },
  { code: 'STAT', label: 'Stationary' },
  { code: 'ADV', label: 'Advertisement' },
  { code: 'OTHER', label: 'Other' },
];

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  time: string;
  givenBy: string;
  details: string;
  bankTransactionId: string | null;  // Link to bank withdrawal
  billUrl?: string | null;           // Base64 bill/memo photo
  synced: boolean;
}

// --- Bank Transaction ---
export interface BankTransaction {
  sno: number;
  date: string;
  deposit: number;
  withdrawal: number;
  balance: number;
  narration: string;
  linkedExpenseId: string | null;
  isPersonal: boolean;             // Flagged as personal/non-operational
  synced: boolean;
}

// --- Audit Log ---
/** One before/after pair. Named here because ConfirmWithReasonDialog emits this
 *  same shape, so a recorded edit and the dialog that produced it cannot drift. */
export interface AuditChange {
  field: string;
  before: string;
  after: string;
}

export type AuditAction =
  | 'Payment' | 'Fee Demand' | 'Charge Added' | 'Ledger Adjustment' | 'Ledger Reversal'
  | 'New Admission' | 'Student Edit' | 'Struck Off' | 'Struck Off Reversed'
  | 'Bank Entry' | 'Expense Added' | 'Fee Template Change'
  | 'Sync Event' | 'Login' | 'Data Import'
  // Academic setup — BATCHES_ACADEMIC_SETUP_DESIGN §7/§12: every program/session/batch change is audited
  | 'Academic Setup'
  // Finance core — FINANCE_CORE_DESIGN §3: accounts, transfers, deposits, day closes
  | 'Finance Entry'
  // Staff & Payroll — STAFF_PAYROLL_DESIGN §47/§48: staff record create/edit (secret-free)
  | 'Staff Entry'
  // Staff & Payroll — STAFF_PAYROLL_DESIGN §60: a payroll Settings change is audited
  | 'Settings Change'
  // PAYMENTS §27.1: "every reprint is counted" — the count is on the register, the
  // who and when belong in the audit trail beside it.
  | 'Receipt Reprint'
  // Access events — Feature 1 §8
  | 'Failed Sign In' | 'Sign Out' | 'Auto-Lock' | 'Unlock'
  | 'Password Change' | 'Password Reset' | 'User Created' | 'User Disabled' | 'Role Changed'
  // Students doc §23.1: every export is written to the audit trail
  | 'Export'
  // Students doc §26.2/§27.4: a credit refund raised at strike-off
  | 'Fee Refund'
  // Students doc §26.5: completed, put on leave, returned from leave
  | 'Student Status'
  // Students doc §23.7: an Admin undoes an import; the undo stays in the trail
  | 'Import Undo';

// --- Import batch record (students doc §23.7) ---
// What one CSV import created, kept so it can be undone exactly: the SNOs it
// admitted and the opening-balance entries it posted. Both the import and the
// undo stay in the audit trail.
export interface ImportBatchRecord {
  id: string;
  /** ISO timestamp of the confirmed import — the "after the import" mark (§23.7). */
  at: string;
  /** Local `YYYY-MM-DD` for the history line. */
  date: string;
  user: string;
  /** Students the import created (Create-anyway rows included; updates excluded). */
  snos: number[];
  /** Opening-balance entry ids the import posted. */
  entryIds: string[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: AuditAction;
  studentSno?: number;
  details: string;
  changes?: AuditChange[];
  synced: boolean;
}

// --- Sync Status ---
export type SyncStatusType = 'online' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  status: SyncStatusType;
  lastSync: string | null;
  pendingCount: number;
  error?: string;
}

// --- Student Status Badge ---
export type StudentBadgeType =
  | 'active'           // Struck_Off = No, balance = 0
  | 'dues'             // Struck_Off = No, balance > 0
  | 'credit'           // Struck_Off = No, balance < 0
  | 'struck_off'       // Struck_Off = Yes, balance <= 0
  | 'struck_off_dues'  // Struck_Off = Yes, balance > 0
  | 'struck_off_credit' // Struck_Off = Yes, balance < 0
  | 'completed'        // §26.5: finished the final term
  | 'on_leave';        // §26.5: temporarily away

export interface StudentWithBalance extends Student {
  computedBalance: number;
  badge: StudentBadgeType;
}
