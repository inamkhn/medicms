// ============================================
// MediCMS Desktop v4.0 — Bank balance (single source of truth)
// §14: "Opening balance + all deposits − all withdrawals, calculated from the
// bank ledger. The dashboard and the bank page use the SAME calculation."
// The stored per-row `balance` is a running total that can drift (CSV import,
// personal rows), so the canonical figure is derived from the deposits/withdrawals
// themselves and shared by every consumer. Both screens MUST call this.
// ============================================

import type { BankTransaction } from '@/types';

/** Closing balance of the whole account. Personal (non-operational) movements are
 *  included: money that left the account is gone regardless of who flagged it. */
export function computeBankBalance(transactions: readonly BankTransaction[]): number {
  return transactions.reduce((sum, t) => sum + t.deposit - t.withdrawal, 0);
}

export function totalDeposits(transactions: readonly BankTransaction[]): number {
  return transactions.reduce((sum, t) => sum + t.deposit, 0);
}

export function totalWithdrawals(transactions: readonly BankTransaction[]): number {
  return transactions.reduce((sum, t) => sum + t.withdrawal, 0);
}

/** §17 Needs-attention + the bank page's untagged banner share this count so the
 *  dashboard number and the page it links to can never disagree. A withdrawal
 *  that is neither linked to an expense nor flagged personal is "not linked". */
export function unlinkedWithdrawals(transactions: readonly BankTransaction[]): BankTransaction[] {
  return transactions.filter((t) => t.withdrawal > 0 && !t.linkedExpenseId && !t.isPersonal);
}
