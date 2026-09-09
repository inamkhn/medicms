// ============================================
// MediCMS Desktop v4.0 - Live Balance (single source of truth)
// Balance is ALWAYS derived from ledger transactions, never from
// a stored/static "Dues" column or MOCK_BALANCES dict.
// Formula: balance = Σ(fees) + Σ(charges) - Σ(discounts) - Σ(payments)
// Charges are stored as negative discount in Exam/CT transactions.
// ============================================

import type { LedgerTransaction, Student, StudentWithBalance } from '@/types';
import { getStudentBadge } from '@/lib/utils';

export interface LedgerBalanceBreakdown {
  totalDemanded: number;
  totalCharges: number;
  totalDiscount: number;
  totalPaid: number;
  balance: number;
}

export function computeLedgerBalance(txns: LedgerTransaction[]): LedgerBalanceBreakdown {
  let totalDemanded = 0;
  let totalCharges = 0;
  let totalDiscount = 0;
  let totalPaid = 0;
  for (const t of txns) {
    totalDemanded += t.fees;
    if (t.discount < 0) totalCharges += Math.abs(t.discount);
    else totalDiscount += t.discount;
    totalPaid += t.payment;
  }
  return {
    totalDemanded,
    totalCharges,
    totalDiscount,
    totalPaid,
    balance: totalDemanded + totalCharges - totalDiscount - totalPaid,
  };
}

export function getLiveBalance(sno: number, transactions: LedgerTransaction[]): number {
  return computeLedgerBalance(transactions.filter((t) => t.studentSno === sno)).balance;
}

export function getBalanceBreakdown(sno: number, transactions: LedgerTransaction[]): LedgerBalanceBreakdown {
  return computeLedgerBalance(transactions.filter((t) => t.studentSno === sno));
}

/** Live replacement for mockData.getStudentsWithBalance — pass live ledger txns. */
export function getStudentsWithBalanceLive(
  students: Student[],
  transactions: LedgerTransaction[]
): StudentWithBalance[] {
  // Group balances in one pass (O(n+m) instead of O(n*m))
  const bySno = new Map<number, LedgerTransaction[]>();
  for (const t of transactions) {
    const arr = bySno.get(t.studentSno);
    if (arr) arr.push(t);
    else bySno.set(t.studentSno, [t]);
  }
  return students.map((student) => {
    const balance = computeLedgerBalance(bySno.get(student.sno) ?? []).balance;
    return { ...student, computedBalance: balance, badge: getStudentBadge(student.struckOff, balance) };
  });
}
