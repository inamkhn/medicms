// ============================================
// MediCMS Desktop v4.0 - Type Definitions
// Based on Desktop_Module_Architecture_v4
// ============================================

// --- User & Auth ---
export type UserRole = 'Admin' | 'Principal';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
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
export type BatchName = 
  | '1st Batch' | '2nd Batch' | '3rd Batch' | '4th Batch' | '5th Batch'
  | '6th Batch' | '7th Batch' | '8th Batch' | '9th Batch' | '10th Batch'
  | '11th Batch' | '12th Batch' | '13th Batch' | '14th Batch' | '15th Batch'
  | '16th Batch' | '17th Batch';

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
  batch: BatchName;
  session: number;                // Year e.g. 2017
  semester: Semester;             // Current semester (derived from ledger)
  photoUrl?: string | null;        // Base64 data URL or remote URL (for ID Card)
  dob?: string | null;               // ISO date (YYYY-MM-DD)
  gender?: 'Male' | 'Female' | 'Other' | null;
  domicile?: string | null;          // District / Tehsil
  emergencyContact?: string | null;
  struckOff: boolean;
  struckOffDate?: string;
  struckOffReason?: string;
  isTestRecord: boolean;          // For "Director Sb" type entries
  synced: boolean;
}

// --- Fee Template ---
export interface FeeTemplate {
  id: string;
  course: CourseCode;             // Parent course
  program: ProgramCode;           // Sub-course
  semester: Semester;
  batch: BatchName;
  session: number;
  admissionFee: number;
  tuitionFee: number;             // Stored as tuition_fee (corrected from Tution_Fee)
  idCardFee: number;
  annualCharges: number;          // Applies Sem 3+ only
  securityFee: number;            // Never used (always 0)
  enrollmentFee: number;
  diplomaFee: number;             // Applies Sem 4 only
  clinicalCharges: number;        // Applies Sem 3 only
}

// --- Ledger Transaction ---
export type TransactionType = 
  | 'Demand'   // Fee demand
  | 'Pay'      // Payment received
  | 'Disc'     // Discount/waiver
  | 'Exam'     // Exam fee
  | 'CT'       // Clinical Training
  | 'Adj'      // Ledger adjustment
  | 'Refund';  // Refund to student

export interface LedgerTransaction {
  id: string;
  studentSno: number;             // FK to students.sno (NOT position ID)
  txnNo: number;                  // Sequential within student
  date: string;                   // ISO date
  type: TransactionType;
  semester?: Semester;
  session?: number;
  
  // Amount columns
  fees: number;                   // Fee demand amount
  discount: number;               // Discount amount (positive reduces balance)
  payment: number;                // Payment received
  
  // Receipt info
  receiptNo: string | null;       // Dedicated field, not in narration
  receivedBy: string | null;      // Auto-filled from logged-in user
  
  narration: string;
  
  // Audit
  createdAt: string;
  createdBy: string;
  synced: boolean;
}

// --- Computed Balance (never stored) ---
export interface ComputedBalance {
  sno: number;
  totalDemanded: number;
  totalDiscount: number;
  totalPaid: number;
  totalCharges: number;           // Exam fees, CT, etc.
  balance: number;                // fees - discount - payment + charges
}

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
export type AuditAction = 
  | 'Payment' | 'Fee Demand' | 'Charge Added' | 'Ledger Adjustment'
  | 'New Admission' | 'Student Edit' | 'Struck Off' | 'Struck Off Reversed'
  | 'Bank Entry' | 'Expense Added' | 'Fee Template Change'
  | 'Sync Event' | 'Login' | 'Data Import';

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: AuditAction;
  studentSno?: number;
  details: string;
  changes?: { field: string; before: string; after: string }[];
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

// --- Import Wizard State ---
export interface ImportStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'warning' | 'error';
  recordsCount?: number;
  warnings?: string[];
}

// --- Student Status Badge ---
export type StudentBadgeType = 
  | 'active'           // Struck_Off = No, balance = 0
  | 'dues'             // Struck_Off = No, balance > 0
  | 'credit'           // Struck_Off = No, balance < 0
  | 'struck_off'       // Struck_Off = Yes, balance <= 0
  | 'struck_off_dues'  // Struck_Off = Yes, balance > 0
  | 'struck_off_credit'; // Struck_Off = Yes, balance < 0

export interface StudentWithBalance extends Student {
  computedBalance: number;
  badge: StudentBadgeType;
}
