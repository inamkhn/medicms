// ============================================
// MediCMS Desktop v4.0 - Utility Functions
// ============================================

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import type { StudentBadgeType, BalanceState, CourseCode } from '@/types';
import { getCourseDef } from '@/lib/constants';

// --- Class name utility ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Currency formatting ---
export function formatPKR(amount: number): string {
  return `PKR ${amount.toLocaleString('en-PK')}`;
}

// --- Date formatting ---
export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy');
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy HH:mm');
}

export function formatTime(date: string | Date): string {
  return format(new Date(date), 'HH:mm');
}

// --- Balance computation and display ---
export function computeBalanceState(balance: number): BalanceState {
  if (balance > 0) return { type: 'dues', amount: balance };
  if (balance === 0) return { type: 'cleared' };
  return { type: 'credit', amount: Math.abs(balance) };
}

export function getStudentBadge(struckOff: boolean, balance: number): StudentBadgeType {
  if (struckOff) {
    if (balance > 0) return 'struck_off_dues';
    if (balance < 0) return 'struck_off_credit';
    return 'struck_off';
  }
  if (balance > 0) return 'dues';
  if (balance < 0) return 'credit';
  return 'active';
}

export function formatBalanceDisplay(balance: number): { label: string; color: string } {
  if (balance > 0) {
    return { label: `⚠ PKR ${balance.toLocaleString()} due`, color: 'text-amber-600' };
  }
  if (balance === 0) {
    return { label: '✅ Cleared', color: 'text-green-600' };
  }
  return { label: `✅ Credit PKR ${Math.abs(balance).toLocaleString()}`, color: 'text-blue-600' };
}

// --- CNIC formatting ---
export function formatCNIC(cnic: string | null): string {
  if (!cnic) return 'Not entered';
  // Format: XXXXX-XXXXXXX-X
  const cleaned = cnic.replace(/\D/g, '');
  if (cleaned.length !== 13) return cnic;
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5, 12)}-${cleaned.slice(12)}`;
}

// --- CNIC validation ---
export function isValidCNIC(cnic: string): boolean {
  const cleaned = cnic.replace(/\D/g, '');
  return cleaned.length === 13;
}

// --- Normalize CNIC (handle "nil", "nic", etc.) ---
export function normalizeCNIC(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase();
  if (['nil', 'nic', 'n/a', 'na', '-'].includes(cleaned)) return null;
  return value.trim();
}

// --- Semester label ---
export function getSemesterLabel(semester: string): string {
  return `${semester} Semester`;
}

// --- Term label (per course system) ---
export function getTermLabel(system: 'semester' | 'annual' | 'months', term: string): string {
  if (system === 'annual') return `${term} Year`;
  if (system === 'months') return `${term} Term`;
  return `${term} Semester`;
}

// --- Batch to Session mapping (approximate) ---
export function batchToSession(batch: string): number {
  const match = batch.match(/^(\d+)/);
  if (!match) return new Date().getFullYear();
  const batchNum = parseInt(match[1], 10);
  // 1st Batch = 2017, 2nd = 2017, 3rd = 2019, etc.
  // This is approximate - actual mapping should come from data
  return 2016 + batchNum;
}

// --- Generate receipt number ---
export function generateReceiptNumber(_block: { start: number; end: number }, current: number): string {
  return `#${current}`;
}

// --- Fee template total (always computed) ---
export function computeFeeTemplateTotal(template: {
  admissionFee: number;
  tuitionFee: number;
  idCardFee: number;
  annualCharges: number;
  securityFee: number;
  enrollmentFee: number;
  diplomaFee: number;
  clinicalCharges: number;
}): number {
  return (
    template.admissionFee +
    template.tuitionFee +
    template.idCardFee +
    template.annualCharges +
    template.securityFee +
    template.enrollmentFee +
    template.diplomaFee +
    template.clinicalCharges
  );
}

// --- Fee semester warnings ---
export function getFeeWarnings(semester: string, feeType: string, amount: number, course?: CourseCode): string | null {
  if (amount === 0) return null;
  // Paramedics business rules only apply to semester-system courses
  if (course && getCourseDef(course).system !== 'semester') return null;
  
  const semNum = parseInt(semester, 10);
  
  if (feeType === 'annualCharges' && semNum < 3) {
    return '⚠ Annual Charges usually 0 in Sem 1 & 2 — confirm';
  }
  if (feeType === 'clinicalCharges' && semNum !== 3) {
    return '⚠ Clinical Charges confirmed only in Sem 3 — confirm';
  }
  if (feeType === 'diplomaFee' && semNum < 4) {
    return '⚠ Diploma Fee usually only in Sem 4 — confirm';
  }
  return null;
}

// --- Search highlight ---
export function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '**$1**');
}

// --- Pluralize ---
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}
