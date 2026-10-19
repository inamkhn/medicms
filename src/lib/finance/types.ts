// ============================================
// MediCMS Desktop — Finance core: accounts and money entries (§5–§7)
// Every rupee is In, Out or a Transfer in a named money account. Balances are
// always calculated, never stored (§6.1); entries are append-only (§7.2).
// ============================================

/** The six account types of §5. The last two are system accounts: money reaches
 *  them only through cheque events, never by hand. */
export type MoneyAccountType =
  | 'counterCash'   // Counter cash — one per counter
  | 'pettyCash'     // Petty cash — optional float
  | 'bank'          // Bank account
  | 'wallet'        // Mobile wallet
  | 'chequesInHand' // Incoming cheques not yet cleared
  | 'issuedCheques'; // Cheques written not yet cleared (system view per bank)

/** §6 — an account is Active or Closed. Closed accounts take no entries. */
export type MoneyAccountStatus = 'Active' | 'Closed';

export interface MoneyAccount {
  id: string;
  /** "For example 'Meezan, main account'" (§6). */
  name: string;
  type: MoneyAccountType;
  /** Bank or wallet details; screens show only the last 4 digits (§6). */
  bankName?: string;
  accountNo?: string;
  /** Responsible person, for cash accounts (§6). */
  responsible?: string;
  status: MoneyAccountStatus;
  notes?: string;
  /**
   * §10/§66: the fixed amount a petty cash float is kept at, so the page can
   * show the suggested top-up and the below-25% warning. Only a petty cash
   * account carries one; it is a setting, never a balance — the balance stays
   * calculated from the entries (§6.1).
   */
  float?: number;
}

/** §7.1 — direction is literally the word "In" or "Out". */
export type MoneyDirection = 'In' | 'Out';

/** The kinds of §7.2. "Transfer out and transfer in" is one row of the table
 *  but two kinds, because each side is its own entry; "Reversal" takes the
 *  direction of the opposite of the entry it reverses. */
export type MoneyEntryKind =
  | 'OpeningBalance'
  | 'StudentPayment'
  | 'StudentPaymentReversal'
  | 'ChequeClearedIn'
  | 'RefundToStudent'
  | 'BillPayment'
  | 'PayrollPayment'
  | 'StaffAdvance'
  | 'ChequeClearedOut'
  | 'TransferOut'
  | 'TransferIn'
  | 'CashDifference'
  | 'BankCharge'
  | 'OtherReceipt'
  | 'OwnerWithdrawal'
  | 'Reversal';

/**
 * A money entry (§7.1). Append-only: nothing here is ever edited or deleted;
 * a mistake is fixed with a `Reversal` entry (§34). Amounts are whole rupees
 * and always positive — the direction carries the sign (§7.1).
 */
export interface MoneyEntry {
  /** `me-<no>` — unique and never reused (§7.1). */
  id: string;
  no: number;
  /** The date the money moved, local `YYYY-MM-DD` (§7.1). */
  date: string;
  accountId: string;
  direction: MoneyDirection;
  amount: number;
  kind: MoneyEntryKind;
  /** Student, vendor, staff member and so on, where there is one (§7.1). */
  payee?: string;
  /** For money out: the cost category (§7.1). Category records arrive in F4. */
  category?: string;
  /** Receipt, voucher, cheque, deposit slip or bank reference (§7.1). */
  reference?: string;
  /** The receipt, voucher, bill or transfer that created it (§7.1). */
  linkedDoc?: string;
  /** Entries created by one action share it (§7.1) — a transfer pair, a
   *  voucher and its money-out, the two sides of a reversed transfer. */
  actionId: string;
  createdBy: string;
  /** Recorded when an approval was needed (§3, §7.1). */
  approvedBy?: string;
  /** Balances count cleared entries only (§6.1). */
  cleared: boolean;
  /** Set when matched to a bank statement line (§7.1) — reconciliation, F6. */
  reconciled: boolean;
  /** Kind `Reversal`: the entry this reverses (§34). */
  reverses?: string;
  /** Required for Reversal (§34) and Cash difference (§11). */
  reason?: string;
  /** §9 gives transfers a free note; it rides on both sides of the pair. */
  note?: string;
  createdAt: string;
}
