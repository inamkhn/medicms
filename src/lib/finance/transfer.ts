// ============================================
// MediCMS Desktop — Finance core: transfers and reversals (§9, §34)
// A transfer creates both sides together and is never income or expense; the
// cash-deposit screen is a transfer with a slip. Nothing is edited or deleted —
// a correction is a Reversal entry, a transfer reversed as a pair.
// Pure: entry and action numbers come from the entries, the timestamp from ctx.
// ============================================

import type { MoneyAccount, MoneyEntry, MoneyEntryKind } from './types.ts';
import type { FinanceLimits } from './limits.ts';
import {
  actionId,
  isSystemAccount,
  moneyEntryProblems,
  monthKey,
  nextActionNo,
  nextMoneyEntryNo,
  reversedEntryIds,
  spendCheck,
} from './entries.ts';

export interface PostingContext {
  accounts: readonly MoneyAccount[];
  entries: readonly MoneyEntry[];
  /** `YYYY-MM` keys of closed months — postings into them are refused (§9). */
  closedMonths?: readonly string[];
  /** The caller's ISO timestamp; the pure core never reads a clock. */
  now: string;
}

export type PostingResult =
  | { ok: true; entries: MoneyEntry[]; warnings: string[] }
  | { ok: false; errors: string[] };

export interface TransferDraft {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  reference?: string;
  note?: string;
  payee?: string;
  createdBy: string;
  approvedBy?: string;
}

/** The §9 kinds of transfer, by their from → to account types. */
const TRANSFER_LINKS: readonly (readonly [MoneyAccount['type'], MoneyAccount['type']])[] = [
  ['counterCash', 'bank'], // cash deposit to bank
  ['pettyCash', 'bank'],
  ['bank', 'pettyCash'], // top-up of petty cash
  ['bank', 'bank'], // bank to bank
  ['bank', 'wallet'], // wallet funding, and back
  ['wallet', 'bank'],
  ['counterCash', 'pettyCash'],
  ['pettyCash', 'counterCash'],
  ['wallet', 'wallet'],
];

function accountOf(ctx: PostingContext, id: string): MoneyAccount | undefined {
  return ctx.accounts.find((a) => a.id === id);
}

/**
 * §9 — both sides are created under one action number, and neither side is
 * income or expense. A transfer cannot make a cash or petty cash account
 * negative, cannot be dated in a closed month, and never touches a system
 * account (§5). A bank or wallet going below zero is allowed with a warning
 * (§6.3).
 */
export function postTransfer(ctx: PostingContext, draft: TransferDraft): PostingResult {
  const errors: string[] = [];
  const from = accountOf(ctx, draft.fromAccountId);
  const to = accountOf(ctx, draft.toAccountId);

  if (!from) errors.push(`Unknown account ${draft.fromAccountId} (§6).`);
  if (!to) errors.push(`Unknown account ${draft.toAccountId} (§6).`);
  if (from && to) {
    if (from.id === to.id) errors.push('A transfer needs two different accounts (§9).');
    for (const a of [from, to]) {
      if (isSystemAccount(a)) {
        errors.push(`${a.name} is a system account — money never moves into or out of it by hand (§5).`);
      }
      if (a.status === 'Closed') errors.push(`${a.name} is Closed and takes no entries (§6.4).`);
    }
    if (
      !errors.length &&
      !TRANSFER_LINKS.some(([f, t]) => from.type === f && to.type === t)
    ) {
      errors.push(`No transfer is defined from ${from.name} to ${to.name} (§9).`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const fromChecked = from as MoneyAccount;
  const toChecked = to as MoneyAccount;
  const aid = actionId(nextActionNo(ctx.entries));
  const startNo = nextMoneyEntryNo(ctx.entries);
  const shared = {
    date: draft.date,
    amount: draft.amount,
    actionId: aid,
    linkedDoc: aid, // the transfer itself is the linked document (§7.1)
    reference: draft.reference,
    payee: draft.payee,
    note: draft.note,
    createdBy: draft.createdBy,
    approvedBy: draft.approvedBy,
    cleared: true,
    reconciled: false,
    createdAt: ctx.now,
  };
  const outward: MoneyEntry = {
    ...shared,
    id: `me-${startNo}`,
    no: startNo,
    accountId: fromChecked.id,
    direction: 'Out',
    kind: 'TransferOut',
  };
  const inward: MoneyEntry = {
    ...shared,
    id: `me-${startNo + 1}`,
    no: startNo + 1,
    accountId: toChecked.id,
    direction: 'In',
    kind: 'TransferIn',
  };

  const structural = [
    ...moneyEntryProblems(outward, ctx),
    ...moneyEntryProblems(inward, ctx),
  ];
  if (structural.length) return { ok: false, errors: structural };

  const spend = spendCheck(ctx.accounts, ctx.entries, fromChecked.id, draft.amount);
  if (spend.problem) return { ok: false, errors: [spend.problem] };
  const warnings = spend.warning ? [spend.warning] : [];
  return { ok: true, entries: [outward, inward], warnings };
}

export interface CashDepositDraft extends Omit<TransferDraft, 'toAccountId'> {
  bankAccountId: string;
  /** Total of the ticked closed days; a short deposit against it needs a note (§9). */
  daysTotal?: number;
  slipNo: string;
}

/**
 * §9 "Cash deposit": counter cash to a bank account with the deposit slip
 * number. If the deposited amount is less than the ticked days, a note is
 * required — the difference stays as cash in the counter account.
 */
export function postCashDeposit(ctx: PostingContext, draft: CashDepositDraft): PostingResult {
  const errors: string[] = [];
  const bank = accountOf(ctx, draft.bankAccountId);
  const counter = accountOf(ctx, draft.fromAccountId);
  if (!String(draft.slipNo).trim()) errors.push('A cash deposit carries the deposit slip number (§9).');
  if (bank && bank.type !== 'bank') errors.push('A cash deposit lands in a bank account (§9).');
  if (counter && counter.type !== 'counterCash') errors.push('A cash deposit starts at a counter cash account (§9).');
  if (
    draft.daysTotal !== undefined &&
    draft.amount < draft.daysTotal &&
    !draft.note?.trim()
  ) {
    errors.push('The deposit is short of the counted days — a note is required, and the difference stays as cash in the counter (§9).');
  }
  if (errors.length) return { ok: false, errors };

  return postTransfer(ctx, {
    fromAccountId: draft.fromAccountId,
    toAccountId: draft.bankAccountId,
    amount: draft.amount,
    date: draft.date,
    reference: String(draft.slipNo).trim(),
    note: draft.note,
    payee: draft.payee,
    createdBy: draft.createdBy,
    approvedBy: draft.approvedBy,
  });
}

export interface ReversalDraft {
  /** Either side of a transfer is enough — `reverseTransfer` finds the pair. */
  targetEntryId: string;
  date: string;
  reason: string;
  createdBy: string;
  approvedBy?: string;
}

function isTransferSide(kind: MoneyEntryKind): boolean {
  return kind === 'TransferOut' || kind === 'TransferIn';
}

/** §7.2: a Reversal takes "the opposite of the entry it reverses". */
function reversalOf(target: MoneyEntry, draft: ReversalDraft, ctx: PostingContext, no: number, aid: string): MoneyEntry {
  return {
    id: `me-${no}`,
    no,
    date: draft.date,
    accountId: target.accountId,
    direction: target.direction === 'In' ? 'Out' : 'In',
    amount: target.amount,
    kind: 'Reversal',
    payee: target.payee,
    reference: target.reference,
    linkedDoc: target.linkedDoc,
    actionId: aid,
    reverses: target.id,
    reason: draft.reason,
    createdBy: draft.createdBy,
    approvedBy: draft.approvedBy,
    cleared: true,
    reconciled: false,
    createdAt: ctx.now,
  };
}

/** Shared §34 checks for anything being reversed. */
function reverseBlockers(ctx: PostingContext, targets: readonly MoneyEntry[]): string[] {
  const errors: string[] = [];
  const already = reversedEntryIds(ctx.entries);
  for (const t of targets) {
    if (t.kind === 'Reversal') errors.push('A reversal is not itself reversed — post a fresh correct entry (§34).');
    if (already.has(t.id)) errors.push(`Entry ${t.id} is already reversed (§34).`);
    if (ctx.closedMonths?.includes(monthKey(t.date))) {
      errors.push(`${monthKey(t.date)} is a closed month. An Admin must reopen it before ${t.id} can be reversed (§34).`);
    }
  }
  return errors;
}

/** §34 — a single wrong entry, reversed. Transfers are refused: they go as a pair. */
export function reverseMoneyEntry(ctx: PostingContext, draft: ReversalDraft): PostingResult {
  const target = ctx.entries.find((e) => e.id === draft.targetEntryId);
  if (!target) return { ok: false, errors: [`Entry ${draft.targetEntryId} does not exist (§34).`] };
  if (isTransferSide(target.kind)) {
    return { ok: false, errors: ['A transfer is reversed as a pair, both sides together (§34).'] };
  }

  const errors = reverseBlockers(ctx, [target]);
  if (errors.length) return { ok: false, errors };

  const aid = actionId(nextActionNo(ctx.entries));
  const entry = reversalOf(target, draft, ctx, nextMoneyEntryNo(ctx.entries), aid);
  const structural = moneyEntryProblems(entry, ctx);
  if (structural.length) return { ok: false, errors: structural };

  if (entry.direction === 'Out') {
    const spend = spendCheck(ctx.accounts, ctx.entries, entry.accountId, entry.amount);
    if (spend.problem) return { ok: false, errors: [spend.problem] };
    if (spend.warning) return { ok: true, entries: [entry], warnings: [spend.warning] };
  }
  return { ok: true, entries: [entry], warnings: [] };
}

/** §34 — "A wrong transfer: reverse it. Both sides are reversed together." */
export function reverseTransfer(ctx: PostingContext, draft: ReversalDraft): PostingResult {
  const target = ctx.entries.find((e) => e.id === draft.targetEntryId);
  if (!target || !isTransferSide(target.kind)) {
    return { ok: false, errors: ['Only transfer entries are reversed as a pair (§34).'] };
  }
  const sides = ctx.entries.filter((e) => e.actionId === target.actionId && isTransferSide(e.kind));
  if (sides.length !== 2) {
    return { ok: false, errors: [`Transfer ${target.actionId} does not have both sides in the books (§9).`] };
  }

  const errors = reverseBlockers(ctx, sides);
  if (errors.length) return { ok: false, errors };

  const aid = actionId(nextActionNo(ctx.entries));
  let no = nextMoneyEntryNo(ctx.entries);
  const reversals = sides.map((side) => reversalOf(side, draft, ctx, no++, aid));

  for (const r of reversals) {
    const structural = moneyEntryProblems(r, ctx);
    if (structural.length) return { ok: false, errors: structural };
  }
  const warnings: string[] = [];
  for (const r of reversals) {
    if (r.direction !== 'Out') continue;
    const spend = spendCheck(ctx.accounts, ctx.entries, r.accountId, r.amount);
    if (spend.problem) return { ok: false, errors: [spend.problem] };
    if (spend.warning) warnings.push(spend.warning);
  }
  return { ok: true, entries: reversals, warnings };
}

// -------------------------------------------
// Which entries may be reversed from the book, and by whom (§34, §6.5)
// -------------------------------------------

/**
 * §7.2 "Reversal — Any correction", sorted by who owns the mistake. A hand or
 * setup entry has no document behind it, so it is reversed on its own
 * (`reverseMoneyEntry`); a transfer is reversed as a pair (`reverseTransfer`);
 * everything else already has a screen that owns its correction — a receipt is
 * voided from Payments, a bill payment from its voucher — so the money book
 * offers no reversal for it, and no second path can drift from the first.
 */
export type CorrectionRoute = 'generic' | 'transfer' | 'none';

const GENERIC_REVERSIBLE: ReadonlySet<MoneyEntryKind> = new Set<MoneyEntryKind>([
  'OpeningBalance', 'BankCharge', 'OtherReceipt', 'OwnerWithdrawal',
]);

export function correctionRoute(kind: MoneyEntryKind): CorrectionRoute {
  if (kind === 'TransferOut' || kind === 'TransferIn') return 'transfer';
  if (GENERIC_REVERSIBLE.has(kind)) return 'generic';
  return 'none';
}

/** Whether a row of the cash or bank book carries a Reverse action: a route,
 *  cleared, and not itself a reversal or already reversed (§34). */
export function reversibleEntry(entry: MoneyEntry, entries: readonly MoneyEntry[]): boolean {
  if (correctionRoute(entry.kind) === 'none' || !entry.cleared) return false;
  return !reversedEntryIds(entries).has(entry.id);
}

/**
 * §3/§32/§6.5/§77: who may complete a reversal without more. An Admin never
 * does. An Accountant reverses a hand or transfer entry up to
 * `accountantOtherEntryLimit`; a change to an opening balance always needs an
 * Admin (§6.5), however small. Any other role has no money write and never
 * reaches this — the button is hidden by `finance.pay`.
 */
export function correctionNeedsAdmin(
  role: string,
  kind: MoneyEntryKind,
  amount: number,
  limits: FinanceLimits,
): boolean {
  if (role !== 'Accountant') return false;
  if (kind === 'OpeningBalance') return true;
  return amount > limits.accountantOtherEntryLimit;
}
