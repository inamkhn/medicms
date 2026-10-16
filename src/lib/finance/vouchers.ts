// ============================================
// MediCMS Desktop — Finance core: payment vouchers (§29, §30, §32, §63)
// Every payment out carries a numbered voucher. The voucher is saved with its
// bill allocation, its money entry (or the cheque it writes) and the audit
// entry together, or not at all (§29). It pays by cash, bank transfer, cheque
// or wallet (§30); a cheque pays the bill at once but posts no money until it
// clears, so the balance stays and the available balance falls (§31.3). Above
// the Accountant's payout limit an Admin approves with a password (§32, §79.20).
// Pure: no clock, no store — dates, the timestamp and the numbers come in from
// the caller; allocation reuses the §27 rules in bills.ts.
// ============================================

import type { MoneyAccount, MoneyEntry } from './types.ts';
import {
  actionId,
  moneyEntryId,
  moneyEntryProblems,
  monthKey,
  spendCheck,
} from './entries.ts';
import type { Bill, BillPayment } from './bills.ts';
import { allocatePayment, unpaidFor } from './bills.ts';
import type { Vendor } from './vendors.ts';
import { issueCheque, type Chequebook, type ChequeContext, type IssuedCheque } from './cheques.ts';
import type { PostingContext } from './transfer.ts';
import { reverseMoneyEntry } from './transfer.ts';
import type { FinanceLimits } from './limits.ts';

/** §30 — the four ways money leaves. */
export type VoucherMode = 'Cash' | 'Bank' | 'Cheque' | 'Wallet';

export const VOUCHER_MODE_LABELS: Record<VoucherMode, string> = {
  Cash: 'Cash',
  Bank: 'Bank transfer',
  Cheque: 'Cheque',
  Wallet: 'Wallet',
};

/** §29 — one payment voucher, prepared and (where required) approved. */
export interface PaymentVoucher {
  /** `pv-<n>` — internal id, never reused. */
  id: string;
  /** `PV-0412` — the printed number, issued by the system and never reused (§29). */
  no: string;
  vendorId?: string;
  /** The name on the voucher: a vendor, or free text for a petty payment (§29). */
  payee: string;
  /** The date the payment was made (§29, §30). */
  date: string;
  /** Whole rupees, always positive — the total that left the account (§29). */
  amount: number;
  mode: VoucherMode;
  /** Cash/bank/wallet: the account money left; a cheque leaves it on clearing (§30). */
  accountId?: string;
  /** Cheque mode: the issued-cheque record that stands for this payment (§31.2). */
  chequeId?: string;
  reference?: string;
  /** The bills this voucher paid, with the split shown (§29). */
  allocations: BillPayment[];
  /** §27: what was left after the bills were covered — vendor credit. */
  credit: number;
  /**
   * §27: how much of the vendor's standing credit this payment applied to its
   * bills. The standing credit is derived from the register (each voucher's
   * credit less what later vouchers used), so a void brings it back by itself.
   */
  creditUsed?: number;
  preparedBy: string;
  /** Recorded when an Admin approval was needed (§3, §32). */
  approvedBy?: string;
  /** The money entry this voucher posted (cash/bank/wallet), for a later reversal (§34). */
  moneyEntryId?: string;
  voided?: boolean;
  voidReason?: string;
  createdAt: string;
}

/** The §63 form before a voucher exists. */
export interface PayOutDraft {
  vendorId?: string;
  /** A free-text payee for a petty payment that names no vendor bill (§29). */
  payeeText?: string;
  /**
   * §66: the expense category a petty voucher carries. A bill payment takes its
   * category from the bill; a bill-less petty payment names one here, and it is
   * stamped on the money-out entry so the cash book and reports show it.
   */
  category?: string;
  amount: number;
  date: string;
  mode: VoucherMode;
  /** Cash/Bank/Wallet: the account money leaves (§30). */
  accountId?: string;
  reference?: string;
  /** Cheque mode fields (§30, §63). */
  chequebookId?: string;
  chequeNo?: string;
  chequeDate?: string;
  acPayee?: boolean;
  /** §27 "Choose bills": pay these in this order; default is the vendor's oldest due first. */
  billIds?: readonly string[];
  /** §63 per-bill amounts on the chosen bills; when set they drive the split. */
  perBill?: Readonly<Record<string, number>>;
  preparedBy: string;
  /** The approving Admin's name, when §32 approval was required. */
  approvedBy?: string;
}

export interface PayOutContext {
  accounts: readonly MoneyAccount[];
  entries: readonly MoneyEntry[];
  bills: readonly Bill[];
  payments: readonly BillPayment[];
  vendors: readonly Vendor[];
  /** §27: the register, for the vendor's standing credit the payment must apply. */
  vouchers: readonly PaymentVoucher[];
  chequebooks: readonly Chequebook[];
  cheques: readonly IssuedCheque[];
  closedMonths?: readonly string[];
  /** The caller's role — only an Accountant needs approval above the limit (§3). */
  role: string;
  today: string;
  now: string;
  limits: FinanceLimits;
  /** §26/§32 back-dating cap for an Accountant; Admin passes `undefined`. */
  maxBackDateDays?: number;
  /** Numbers the screen took from the stores; nothing here is stored until posted. */
  series: { entryNo: number; actionNo: number; voucherNo: string };
}

export type PayOutResult =
  | {
      ok: true;
      voucher: PaymentVoucher;
      /** The split to append to the bill payments, each tagged with the voucher (§29). */
      payments: BillPayment[];
      /** Cash/bank/wallet post a money-out entry; a cheque posts none until it clears (§30). */
      moneyEntry?: MoneyEntry;
      /** Cheque mode: the register record to append (§31.2). */
      cheque?: IssuedCheque;
      warnings: string[];
    }
  | { ok: false; errors: string[] };

// -------------------------------------------
// Small local date helper — the tested module stays free of `@/`.
// -------------------------------------------

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

// -------------------------------------------
// Voucher numbers (§29: `PV-` and a sequence, never reused).
// -------------------------------------------

export function nextVoucherId(vouchers: readonly PaymentVoucher[]): string {
  let max = 0;
  for (const v of vouchers) {
    const parsed = /^pv-(\d+)$/.exec(v.id);
    if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
  }
  return `pv-${max + 1}`;
}

/** The `PV-` number, counted from the highest already issued and zero-padded to 4. */
export function nextVoucherNo(vouchers: readonly PaymentVoucher[]): string {
  let max = 0;
  for (const v of vouchers) {
    const parsed = /^PV-(\d+)$/.exec(v.no);
    if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
  }
  return `PV-${String(max + 1).padStart(4, '0')}`;
}

/**
 * §3 / §32 / §79.20: an Accountant pays out up to `accountantPayoutLimit` per
 * voucher; above it an Admin must approve. An Admin never needs approval.
 */
export function approvalRequired(role: string, amount: number, limits: FinanceLimits): boolean {
  return role === 'Accountant' && amount > limits.accountantPayoutLimit;
}

/**
 * §3/§77: the same rule on the way back. An Accountant reverses up to
 * `accountantOtherEntryLimit`; a bigger reversal — including voiding a bigger
 * voucher — needs an Admin, and it is a separate limit from the payout one
 * because Settings changes them apart.
 */
export function reversalApprovalRequired(role: string, amount: number, limits: FinanceLimits): boolean {
  return role === 'Accountant' && amount > limits.accountantOtherEntryLimit;
}

/** The account the payment mode expects, by its type (§30). */
function modeAccountTypes(mode: VoucherMode): MoneyAccount['type'][] {
  if (mode === 'Cash') return ['counterCash', 'pettyCash'];
  if (mode === 'Bank') return ['bank'];
  if (mode === 'Wallet') return ['wallet'];
  return [];
}

/**
 * §27 / §79.14: what a vendor's register stands in credit — every live
 * voucher's overpayment, less what later vouchers have already applied. A void
 * drops out of the sum, so its credit returns by itself (§34).
 */
export function standingVendorCredit(vouchers: readonly PaymentVoucher[], vendorId: string): number {
  let credit = 0;
  for (const v of vouchers) {
    if (v.voided || v.vendorId !== vendorId) continue;
    credit += v.credit - (v.creditUsed ?? 0);
  }
  return Math.max(0, credit);
}

/**
 * §27: how a payment of `amount` that covered `appliedTotal` of bills splits
 * between the vendor's standing credit and the money that leaves now. The
 * credit goes first; what the money does not need stays as credit.
 */
export function splitCredit(
  appliedTotal: number,
  standingCredit: number,
  amount: number,
): { creditUsed: number; credit: number } {
  const creditUsed = Math.min(standingCredit, appliedTotal);
  return { creditUsed, credit: amount - (appliedTotal - creditUsed) };
}

function buildAllocations(
  candidates: readonly Bill[],
  payments: readonly BillPayment[],
  amount: number,
  draft: PayOutDraft,
): { applied: BillPayment[]; credit: number } {
  if (draft.perBill) {
    const applied: BillPayment[] = [];
    let appliedTotal = 0;
    for (const [billId, want] of Object.entries(draft.perBill)) {
      const bill = candidates.find((b) => b.id === billId);
      if (!bill || want <= 0) continue;
      const take = Math.min(want, unpaidFor(bill, payments));
      if (take > 0) {
        applied.push({ billId, amount: take });
        appliedTotal += take;
      }
    }
    return { applied, credit: Math.max(0, amount - appliedTotal) };
  }
  return allocatePayment(candidates, payments, amount, draft.billIds ? { billIds: draft.billIds } : {});
}

/**
 * §29/§30/§32: prepare a payment voucher. It validates every rule, allocates
 * the amount across the payee's bills (oldest due first, or the chosen split),
 * and produces the money entry (cash/bank/wallet) or the cheque (cheque mode)
 * that the screen posts together with the voucher and its audit entry. Nothing
 * is written here — a `PayOutResult` is a plan, all-or-nothing at the store.
 */
export function createPaymentVoucher(draft: PayOutDraft, ctx: PayOutContext): PayOutResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Number.isInteger(draft.amount) || draft.amount <= 0) {
    errors.push('A voucher pays a whole number of rupees, always positive (§29).');
  }

  const vendor = draft.vendorId ? ctx.vendors.find((v) => v.id === draft.vendorId) : undefined;
  if (draft.vendorId && !vendor) errors.push(`Vendor ${draft.vendorId} does not exist (§25).`);
  const payee = vendor?.name ?? draft.payeeText?.trim();
  if (!payee) errors.push('A voucher names its payee — a vendor, or free text for a petty payment (§29).');

  // Posting-date rules ride the payment side (§26/§32: no future, no closed month, back-date cap).
  if (!isValidDate(draft.date)) {
    errors.push('The payment date is a local date (YYYY-MM-DD) (§29).');
  } else {
    if (draft.date > ctx.today) errors.push(`A payment is not dated into the future: ${draft.date} is after ${ctx.today} (§29).`);
    if (ctx.closedMonths?.includes(monthKey(draft.date))) {
      errors.push(`${monthKey(draft.date)} is a closed month. An Admin must reopen it before a payment is dated there (§34).`);
    }
    if (ctx.maxBackDateDays !== undefined && draft.date < addDays(ctx.today, -ctx.maxBackDateDays)) {
      errors.push(`A payment older than ${ctx.maxBackDateDays} days needs an Admin (§32).`);
    }
  }

  // Approval (§32, §79.20): above the Accountant's limit an Admin must have approved.
  if (approvalRequired(ctx.role, draft.amount, ctx.limits) && !draft.approvedBy?.trim()) {
    errors.push(`Pay out above ${ctx.limits.accountantPayoutLimit} needs an Admin to approve (§32).`);
  }

  // Mode panel validation (§30).
  let account: MoneyAccount | undefined;
  if (draft.mode !== 'Cheque') {
    account = ctx.accounts.find((a) => a.id === draft.accountId);
    if (!account) {
      errors.push('A payment names the account the money leaves (§30).');
    } else if (!modeAccountTypes(draft.mode).includes(account.type)) {
      errors.push(`${VOUCHER_MODE_LABELS[draft.mode]} pays out of a ${modeAccountTypes(draft.mode).join(' or ')} account, not ${account.name} (§30).`);
    } else if (account.status === 'Closed') {
      errors.push(`${account.name} is Closed and takes no entries (§6.4).`);
    } else if (account.type === 'pettyCash' && draft.amount > ctx.limits.pettyVoucherLimit) {
      errors.push(`A petty cash voucher is limited to ${ctx.limits.pettyVoucherLimit} (§77).`);
    }
  }

  // §27: the bills a payment can be allocated to belong to the payee and are live.
  const candidates = ctx.bills.filter((b) => b.status !== 'Cancelled' && (vendor ? b.vendorId === vendor.id : b.payeeText === draft.payeeText?.trim()));
  // §27 / §79.14: a vendor's standing credit is applied to the next bill by
  // itself, so the bills are covered from the credit before this money is.
  const standing = vendor ? standingVendorCredit(ctx.vouchers, vendor.id) : 0;
  const { applied } = buildAllocations(candidates, ctx.payments, draft.amount + standing, draft);
  const appliedTotal = applied.reduce((sum, a) => sum + a.amount, 0);
  const { creditUsed, credit } = splitCredit(appliedTotal, standing, draft.amount);

  // Every rupee that left is accounted: it covered a bill, or it stays as credit.
  if (credit < 0 || appliedTotal - creditUsed > draft.amount) {
    errors.push('The amount paid does not match the bills it covers (§27).');
  }
  // A chosen split that pays more than a bill owes, with no bills to cover it, is a mistake unless it is credit.
  if (draft.perBill && credit > 0 && candidates.length === 0 && !draft.payeeText?.trim() && vendor) {
    errors.push('A payment to a vendor with no bills should be a petty or credit payment, not a bill split (§29).');
  }

  // Cash warnings (§30/§77): a soft "consider a bank transfer" and the overdraft/shortage checks.
  if (draft.mode === 'Cash' && draft.amount > ctx.limits.cashPaymentWarningAbove) {
    warnings.push(`${draft.amount} in cash — consider a bank transfer (§30).`);
  }
  if (account) {
    const spend = spendCheck(ctx.accounts, ctx.entries, account.id, draft.amount);
    if (spend.problem) errors.push(spend.problem);
    if (spend.warning) warnings.push(spend.warning);
  }

  if (errors.length) return { ok: false, errors };

  const { entryNo, actionNo, voucherNo } = ctx.series;
  const voucher: PaymentVoucher = {
    id: `pv-${voucherNo.replace(/\D/g, '')}`,
    no: voucherNo,
    vendorId: vendor?.id,
    payee: payee as string,
    date: draft.date,
    amount: draft.amount,
    mode: draft.mode,
    accountId: account?.id,
    reference: draft.reference?.trim() || undefined,
    // §29: allocations ride on the voucher, tagged with it so a void can find them again.
    allocations: applied.map((a) => ({ ...a, voucherNo })),
    credit,
    creditUsed,
    preparedBy: draft.preparedBy,
    approvedBy: draft.approvedBy?.trim() || undefined,
    createdAt: ctx.now,
  };

  if (draft.mode === 'Cheque') {
    const chequeCtx: ChequeContext = {
      accounts: ctx.accounts,
      entries: ctx.entries,
      chequebooks: ctx.chequebooks,
      cheques: ctx.cheques,
      closedMonths: ctx.closedMonths,
      today: ctx.today,
      now: ctx.now,
    };
    const issued = issueCheque(chequeCtx, {
      chequebookId: draft.chequebookId ?? '',
      chequeNo: draft.chequeNo ?? '',
      payee: voucher.payee,
      amount: draft.amount,
      chequeDate: draft.chequeDate ?? draft.date,
      issueDate: draft.date,
      acPayee: draft.acPayee,
      linkedDoc: voucher.no,
      createdBy: draft.preparedBy,
    });
    if (!issued.ok) return { ok: false, errors: issued.errors };
    voucher.chequeId = issued.cheque.id;
    return { ok: true, voucher, payments: voucher.allocations, cheque: issued.cheque, warnings };
  }

  const moneyEntry: MoneyEntry = {
    id: moneyEntryId(entryNo),
    no: entryNo,
    date: draft.date,
    accountId: (account as MoneyAccount).id,
    direction: 'Out',
    amount: draft.amount,
    kind: 'BillPayment',
    payee: voucher.payee,
    category: draft.category?.trim() || undefined,
    reference: draft.reference?.trim() || voucher.no,
    linkedDoc: voucher.no,
    actionId: actionId(actionNo),
    createdBy: draft.preparedBy,
    approvedBy: draft.approvedBy?.trim() || undefined,
    cleared: true,
    reconciled: false,
    createdAt: ctx.now,
  };
  const structural = moneyEntryProblems(moneyEntry, {
    accounts: ctx.accounts,
    entries: [...ctx.entries, moneyEntry],
    closedMonths: ctx.closedMonths,
  });
  if (structural.length) return { ok: false, errors: structural };

  voucher.moneyEntryId = moneyEntry.id;
  return { ok: true, voucher, payments: voucher.allocations, moneyEntry, warnings };
}

// -------------------------------------------
// §34 — voiding a voucher. The money entry is reversed (or the uncleared
// cheque cancelled), the bills it paid go back to unpaid, and the number is
// struck through in the register but never reused.
// -------------------------------------------

export interface VoidDraft {
  reason: string;
  date: string;
  createdBy: string;
  /** §3/§77: the caller's role — an Accountant reverses only up to their limit. */
  role: string;
  limits: FinanceLimits;
  approvedBy?: string;
}

export type VoidResult =
  | {
      ok: true;
      /** The money-out entry's reversal, for a cash/bank/wallet voucher (§34). */
      reversal?: MoneyEntry;
      /** For a cheque voucher: the register entry to cancel (§31.2). */
      cancelChequeId?: string;
      /** The bill payments to withdraw so the bills return to unpaid (§34). */
      paymentsToRemove: BillPayment[];
      warnings: string[];
    }
  | { ok: false; errors: string[] };

export function voidVoucher(
  voucher: PaymentVoucher,
  ctx: PostingContext,
  cheques: readonly IssuedCheque[],
  draft: VoidDraft,
): VoidResult {
  if (voucher.voided) return { ok: false, errors: [`Voucher ${voucher.no} is already void (§34).`] };
  if (!draft.reason.trim()) return { ok: false, errors: ['Voiding a voucher needs a reason (§34).'] };
  if (reversalApprovalRequired(draft.role, voucher.amount, draft.limits) && !draft.approvedBy?.trim()) {
    return {
      ok: false,
      errors: [`Reversing ${voucher.amount} is above your reversal limit of ${draft.limits.accountantOtherEntryLimit} — an Admin must approve (§32).`],
    };
  }

  const paymentsToRemove = voucher.allocations;

  if (voucher.mode === 'Cheque') {
    const cheque = cheques.find((c) => c.id === voucher.chequeId);
    if (!cheque) return { ok: false, errors: [`Cheque for ${voucher.no} is missing from the register (§31.2).`] };
    // A cheque not yet presented cancels; a cleared one already moved money and is fixed by reversing its bank entry (§34).
    if (cheque.status === 'Cleared') {
      return { ok: false, errors: [`Cheque ${cheque.chequeNo} has cleared — reverse its bank entry instead of voiding the voucher (§34).`] };
    }
    return { ok: true, cancelChequeId: cheque.id, paymentsToRemove, warnings: [] };
  }

  const target = voucher.moneyEntryId ? ctx.entries.find((e) => e.id === voucher.moneyEntryId) : undefined;
  if (!target) return { ok: false, errors: [`The money entry for ${voucher.no} is missing from the books (§34).`] };
  const result = reverseMoneyEntry(ctx, {
    targetEntryId: target.id,
    date: draft.date,
    reason: draft.reason,
    createdBy: draft.createdBy,
    approvedBy: draft.approvedBy,
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  return { ok: true, reversal: result.entries[0], paymentsToRemove, warnings: result.warnings };
}
