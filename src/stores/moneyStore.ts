// ============================================
// MediCMS Desktop — Money Store
//
// The two persisted lists of the finance core: money accounts (§6) and the
// append-only money entries (§7). Like the ledger store there is no update and
// no remove for entries — a mistake is reversed (§34) — and nothing here does
// arithmetic: balances and the §6 / §7 / §9 rules live in src/lib/finance, so
// no screen can disagree with the books.
//
// §78.1: accounts and opening balances are entered at go-live. Until that is
// done on a real institute the store seeds the §5 setup with the §13 opening
// positions and the §13 October movement (same convention as the other
// mock-seeded stores); a real go-live clears them and starts from the counted
// cash and the real statement. The seeded movement is the money the payment
// vouchers in `src/lib/finance/seed.ts` posted, so the two stores agree.
// `closedMonths` is read by the posting rules long before month close owns it (F7).
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BANK_INFO } from '@/lib/constants';
import type { ChequeDeposit, DayClosing, MoneyAccount, MoneyEntry } from '@/lib/finance';
import type { Chequebook, IssuedCheque } from '@/lib/finance';
import type { MonthClosure, Reconciliation, StatementLine } from '@/lib/finance';
import type { PettyCount } from '@/lib/finance';
import {
  accountBalance,
  accountClosingProblems,
  chequebookProblems,
  isCashLike,
  isSystemAccount,
  moneyEntryProblems,
  withDemoMoneyEntries,
} from '@/lib/finance';

/** §5/§6: the accounts an institute starts with, plus the two system ones. */
const SEED_ACCOUNTS: MoneyAccount[] = [
  { id: 'acc-counter', name: 'Counter cash', type: 'counterCash', responsible: 'Main counter', status: 'Active' },
  { id: 'acc-petty', name: 'Petty cash', type: 'pettyCash', status: 'Active', float: 75_000 },
  { id: 'acc-bank', name: `${BANK_INFO.name} — ${BANK_INFO.branch}`, type: 'bank', bankName: BANK_INFO.name, accountNo: BANK_INFO.accountNo, status: 'Active' },
  { id: 'acc-cheques', name: 'Cheques in hand', type: 'chequesInHand', status: 'Active' },
  { id: 'acc-issued', name: 'Issued cheques', type: 'issuedCheques', status: 'Active' },
];

/** §13: the opening positions as dated Opening balance entries (§6, §78.1). */
function seedOpening(no: number, accountId: string, amount: number): MoneyEntry {
  return {
    id: `me-${no}`, no, date: '2026-10-01', accountId, direction: 'In', amount,
    kind: 'OpeningBalance', actionId: `a-${no}`, createdBy: 'Setup',
    cleared: true, reconciled: false, createdAt: '2026-10-01T08:00:00',
  };
}

const SEED_ENTRIES: MoneyEntry[] = [
  seedOpening(1, 'acc-bank', 1_172_000),
  seedOpening(2, 'acc-counter', 352_000),
  seedOpening(3, 'acc-petty', 73_000),
];

/** §13/§78: the seeded books are the openings plus the sample's October movement. */
const SEED_ALL_ENTRIES: MoneyEntry[] = withDemoMoneyEntries(SEED_ENTRIES);

/** What a batch of posted entries came to — the screen shows this, not a throw. */
export interface MoneyPostOutcome {
  ok: boolean;
  rejected: { id: string; problems: string[] }[];
}

/**
 * The reconciled flag on an entry follows the statement lines that match it
 * (§41/§42), so one action can never leave the two disagreeing.
 */
function reconciledFlags(entries: readonly MoneyEntry[], lines: readonly StatementLine[]): MoneyEntry[] {
  const matched = new Set<string>();
  for (const line of lines) {
    if (line.status !== 'Matched') continue;
    for (const id of line.matchedEntryIds ?? []) matched.add(id);
  }
  return entries.map((entry) => (entry.reconciled === matched.has(entry.id) ? entry : { ...entry, reconciled: matched.has(entry.id) }));
}

interface MoneyState {
  accounts: MoneyAccount[];
  entries: MoneyEntry[];
  /**
   * §33.5: the day closings of the day book, kept beside the money books —
   * every day keeps its own closing. (Re-opened days replace their record
   * when the reopen arrives, F7.)
   */
  closedDays: DayClosing[];
  /**
   * §48.2.3: every petty cash count, because an even count posts no entry and
   * the month close would otherwise have nothing to read (§69 item 3).
   */
  pettyCounts: PettyCount[];
  /** `YYYY-MM` keys, in the order they were closed (§51). */
  closedMonths: string[];
  /** §31.1: the chequebooks, each a number range drawn on one bank account. */
  chequebooks: Chequebook[];
  /**
   * §31.2: the issued-cheque register. A cheque is a record, not a money entry
   * — only a cleared one has posted money out (§31.3 available balance).
   */
  issuedCheques: IssuedCheque[];
  /** §40: the imported bank statement lines, never edited — matched or ignored. */
  statementLines: StatementLine[];
  /**
   * §34/§58: the deposits that sent a held cheque to the bank. No money moves
   * until it clears (§35); this only remembers the bank and the deposit date, so
   * a Received cheque becomes Deposited. One deposit per held entry.
   */
  chequeDeposits: ChequeDeposit[];
  /** §42: one finished reconciliation per account per month. */
  reconciliations: Reconciliation[];
  /** §48: the month records — Open, In review, Closed, and the report kept at closing. */
  monthClosures: MonthClosure[];
  /** Returns the refusal sentences; empty means the account was added. */
  addAccount: (account: MoneyAccount) => string[];
  /**
   * The next `acc-<n>` id. Account ids follow the same never-reused rule as
   * entry ids (§7.1) — a closed account keeps its id, so max + 1 is safe.
   */
  nextAccountId: () => string;
  /** Names and details may be corrected; id, type and status may not. */
  updateAccount: (id: string, patch: Partial<Pick<MoneyAccount, 'name' | 'bankName' | 'accountNo' | 'responsible' | 'notes' | 'float'>>) => void;
  /** §6.4 — close at a zero balance; deletion is the screens' business. */
  closeAccount: (id: string) => string[];
  /**
   * Append a finished batch, all-or-nothing. `today` is the caller's local
   * date: nothing may be dated into the future, and closed months are
   * refused by the pure rules (§9, §34).
   */
  postEntries: (batch: readonly MoneyEntry[], today: string) => MoneyPostOutcome;
  balanceOf: (accountId: string, asOf?: string) => number;
  /**
   * §33.5: save a counted day. Refused (returns false) when that day and
   * counter is already closed — a day re-closes only after the Admin reopens
   * it, which replaces the record. The pure §11 entry, if any, is posted by
   * the screen through `postEntries` in the same all-or-nothing action.
   */
  saveDayClose: (closing: DayClosing) => boolean;
  /**
   * §9: after a cash deposit posts, the ticked closed days carry its slip
   * number, so they leave the undeposited list. One day may deposit in
   * several slips; the numbers only ever grow.
   */
  markDaysDeposited: (dayKeys: readonly string[], slipNo: string) => void;
  /** §10/§48.2.3: keep the count itself beside the books; an even count leaves no entry. */
  savePettyCount: (count: PettyCount) => void;
  /**
   * §31.1: add a chequebook. Refused (returns sentences) when it draws on a
   * non-bank or Closed account, or its range overlaps another book on the same
   * bank — a cheque number is never in two books. Empty means the book was added.
   */
  addChequebook: (book: Chequebook) => string[];
  /**
   * §31.2: append a written cheque to the register. Light guard on top of the
   * screen's `issueCheque` check — the id and the number are never reused.
   */
  addIssuedCheque: (cheque: IssuedCheque) => string[];
  /** §31.2: after the cleared cheque's bank entry posts, mark the cheque paid. */
  markChequeCleared: (chequeId: string, clearedDate: string, clearedEntryId: string) => void;
  /** §31.2 / §79.16: cancel an uncleared cheque; the number stays spent. */
  cancelIssuedCheque: (chequeId: string, reason: string) => boolean;
  /** §34: send a held cheque to the bank — records the bank and date, posts no
   *  money. A second deposit of the same held cheque replaces nothing: the first wins. */
  markChequeDeposited: (deposit: ChequeDeposit) => void;
  /** The next `sl-<n>`; statement line ids never come back. */
  nextStatementLineId: () => string;
  /** §40: append the imported lines and return how many were kept. */
  addStatementLines: (lines: readonly Omit<StatementLine, 'id'>[]) => number;
  /** §41.2: confirm a suggestion — one line may match several entries. */
  matchStatementLine: (lineId: string, entryIds: readonly string[]) => void;
  /** §41.3: a line that does not belong is Ignored with its reason, never deleted. */
  ignoreStatementLine: (lineId: string, reason: string) => void;
  /** Take a line back to Unmatched so it can be matched again. */
  unmatchStatementLine: (lineId: string) => void;
  /** §42: save the finished reconciliation for its account and month. */
  saveReconciliation: (record: Reconciliation) => void;
  /** §42: an Admin reopens a reconciled period, with a reason, before a reversal. */
  reopenReconciliation: (id: string, by: string, reason: string, at: string) => void;
  /** §48: save the month's record; a Closed month joins `closedMonths` for the posting rules. */
  saveMonthClosure: (closure: MonthClosure) => void;
  /** §48.4: an Admin reopens a month with a reason; the lock lifts for that month only. */
  reopenMonth: (month: string, by: string, reason: string, at: string) => void;
}

export const useMoneyStore = create<MoneyState>()(
  persist(
    (set, get) => ({
      accounts: SEED_ACCOUNTS,
      entries: SEED_ALL_ENTRIES,
      closedDays: [],
      pettyCounts: [],
      closedMonths: [],
      chequebooks: [],
      issuedCheques: [],
      statementLines: [],
      reconciliations: [],
      monthClosures: [],
      chequeDeposits: [],

      nextAccountId: () => {
        let max = 0;
        for (const a of get().accounts) {
          const parsed = /^acc-(\d+)$/.exec(a.id);
          if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
        }
        return `acc-${max + 1}`;
      },

      addAccount: (account) => {
        const state = get();
        const problems: string[] = [];
        if (!account.name.trim()) problems.push('An account needs a name (§6).');
        if (state.accounts.some((a) => a.id === account.id)) {
          problems.push(`Account ${account.id} already exists — ids are never reused.`);
        }
        if (state.accounts.some((a) => a.name.trim().toLowerCase() === account.name.trim().toLowerCase())) {
          problems.push(`An account called "${account.name.trim()}" already exists (§6).`);
        }
        // §5: the system accounts exist by themselves — nobody adds a second.
        if (isSystemAccount(account) && state.accounts.some((a) => a.type === account.type)) {
          problems.push(`${account.name} is a system account — the setup already has one (§5).`);
        }
        if (problems.length) return problems;
        set((s) => ({ accounts: [...s.accounts, account] }));
        return [];
      },

      updateAccount: (id, patch) => {
        set((s) => ({
          accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }));
      },

      closeAccount: (id) => {
        const state = get();
        const account = state.accounts.find((a) => a.id === id);
        if (!account) return [`Account ${id} does not exist (§6).`];
        if (account.status === 'Closed') return [`${account.name} is already Closed.`];
        if (isSystemAccount(account)) return [`${account.name} is a system account — it is never closed by hand (§5).`];
        const problems = accountClosingProblems(state.entries, account);
        if (problems.length) return problems;
        set((s) => ({
          accounts: s.accounts.map((a) => (a.id === id ? { ...a, status: 'Closed' } : a)),
        }));
        return [];
      },

      postEntries: (batch, today) => {
        const state = get();
        const known = new Set(state.entries.map((e) => e.id));
        const accountsById = new Map(state.accounts.map((a) => [a.id, a]));
        const rejected: MoneyPostOutcome['rejected'] = [];

        // Cash floors are checked as the batch plays out, so an entry may
        // spend what an earlier entry of the same batch brought in.
        const running = new Map<string, number>();

        for (const entry of batch) {
          const problems = moneyEntryProblems(entry, {
            accounts: state.accounts,
            // The link and uniqueness checks see the books as they will be.
            entries: [...state.entries, ...batch],
            closedMonths: state.closedMonths,
          });
          if (known.has(entry.id)) {
            problems.push(`Entry ${entry.id} is already in the books — numbers only go forward (§7.1).`);
          }
          if (entry.date > today) {
            problems.push(`A money entry is dated the day the money moved, not later (§7.1): ${entry.date} is after ${today}.`);
          }

          const account = accountsById.get(entry.accountId);
          if (account && isCashLike(account) && entry.cleared) {
            let balance = running.get(account.id) ?? accountBalance(state.entries, account.id);
            if (entry.direction === 'Out') {
              if (balance - entry.amount < 0) {
                problems.push(`Not enough cash in ${account.name}. Top up first (§6.2).`);
              }
              balance -= entry.amount;
            } else {
              balance += entry.amount;
            }
            running.set(account.id, balance);
          }

          if (problems.length) rejected.push({ id: entry.id, problems });
        }

        if (rejected.length) return { ok: false, rejected };
        set((s) => ({ entries: [...s.entries, ...batch] }));
        return { ok: true, rejected: [] };
      },

      balanceOf: (accountId, asOf) => accountBalance(get().entries, accountId, asOf),

      saveDayClose: (closing) => {
        const state = get();
        const already = state.closedDays.some(
          (d) => d.date === closing.date && d.accountId === closing.accountId,
        );
        // A second closing of the same day only replaces the record after a
        // reopen; the reopen itself (Admin, with a reason) is the month/day
        // close screens' job (§33.5). Until then the day keeps its one closing.
        if (already) return false;
        set((s) => ({
          closedDays: [...s.closedDays, closing].sort((a, b) => (a.date === b.date ? a.accountId.localeCompare(b.accountId) : a.date < b.date ? -1 : 1)),
        }));
        return true;
      },

      markDaysDeposited: (dayKeys, slipNo) => {
        const wanted = new Set(dayKeys);
        set((s) => ({
          closedDays: s.closedDays.map((d) => {
            if (!wanted.has(`${d.date}|${d.accountId}`)) return d;
            const refs = new Set([...(d.depositRefs ?? []), slipNo]);
            return { ...d, depositRefs: [...refs].sort() };
          }),
        }));
      },

      savePettyCount: (count) => {
        set((s) => ({
          pettyCounts: [...s.pettyCounts, count].sort((a, b) =>
            a.date === b.date ? a.at.localeCompare(b.at) : a.date < b.date ? -1 : 1,
          ),
        }));
      },

      addChequebook: (book) => {
        const state = get();
        const problems: string[] = [];
        if (state.chequebooks.some((b) => b.id === book.id)) {
          problems.push(`Chequebook ${book.id} already exists — ids are never reused.`);
        }
        problems.push(...chequebookProblems(book, state.chequebooks, state.accounts));
        if (problems.length) return problems;
        set((s) => ({ chequebooks: [...s.chequebooks, book] }));
        return [];
      },

      addIssuedCheque: (cheque) => {
        const state = get();
        const problems: string[] = [];
        if (state.issuedCheques.some((c) => c.id === cheque.id)) {
          problems.push(`Cheque ${cheque.id} is already in the register — numbers only go forward.`);
        }
        if (state.issuedCheques.some((c) => c.bankAccountId === cheque.bankAccountId && c.chequeNo === cheque.chequeNo)) {
          problems.push(`Cheque ${cheque.chequeNo} has already been written on this bank — numbers are never reused (§31.2).`);
        }
        if (problems.length) return problems;
        set((s) => ({ issuedCheques: [...s.issuedCheques, cheque] }));
        return [];
      },

      markChequeCleared: (chequeId, clearedDate, clearedEntryId) => {
        set((s) => ({
          issuedCheques: s.issuedCheques.map((c) =>
            c.id === chequeId ? { ...c, status: 'Cleared' as const, clearedDate, clearedEntryId } : c,
          ),
        }));
      },

      cancelIssuedCheque: (chequeId, reason) => {
        const state = get();
        const cheque = state.issuedCheques.find((c) => c.id === chequeId);
        // Only an uncleared cheque cancels; a cleared one is corrected by reversing its entry (§34).
        if (!cheque || cheque.status !== 'Issued') return false;
        set((s) => ({
          issuedCheques: s.issuedCheques.map((c) =>
            c.id === chequeId ? { ...c, status: 'Cancelled' as const, cancelledReason: reason } : c,
          ),
        }));
        return true;
      },

      markChequeDeposited: (deposit) => {
        set((s) =>
          s.chequeDeposits.some((d) => d.heldId === deposit.heldId)
            ? s
            : { chequeDeposits: [...s.chequeDeposits, deposit] },
        );
      },

      nextStatementLineId: () => {
        let max = 0;
        for (const line of get().statementLines) {
          const parsed = /^sl-(\d+)$/.exec(line.id);
          if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
        }
        return `sl-${max + 1}`;
      },

      addStatementLines: (lines) => {
        if (lines.length === 0) return 0;
        let max = 0;
        for (const line of get().statementLines) {
          const parsed = /^sl-(\d+)$/.exec(line.id);
          if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
        }
        const stamped = lines.map((line, index) => ({ ...line, id: `sl-${max + 1 + index}` }));
        set((s) => ({ statementLines: [...s.statementLines, ...stamped] }));
        return stamped.length;
      },

      matchStatementLine: (lineId, entryIds) => {
        set((s) => {
          const statementLines = s.statementLines.map((line) =>
            line.id === lineId
              ? { ...line, status: 'Matched' as const, matchedEntryIds: [...entryIds], ignoredReason: undefined }
              : line,
          );
          return { statementLines, entries: reconciledFlags(s.entries, statementLines) };
        });
      },

      ignoreStatementLine: (lineId, reason) => {
        set((s) => {
          const statementLines = s.statementLines.map((line) =>
            line.id === lineId
              ? { ...line, status: 'Ignored' as const, ignoredReason: reason, matchedEntryIds: undefined }
              : line,
          );
          return { statementLines, entries: reconciledFlags(s.entries, statementLines) };
        });
      },

      unmatchStatementLine: (lineId) => {
        set((s) => {
          const statementLines = s.statementLines.map((line) =>
            line.id === lineId
              ? { ...line, status: 'Unmatched' as const, matchedEntryIds: undefined, ignoredReason: undefined }
              : line,
          );
          return { statementLines, entries: reconciledFlags(s.entries, statementLines) };
        });
      },

      saveReconciliation: (record) => {
        set((s) => {
          const exists = s.reconciliations.some((r) => r.id === record.id);
          const reconciliations = exists
            ? s.reconciliations.map((r) => (r.id === record.id ? record : r))
            : [...s.reconciliations, record];
          return { reconciliations };
        });
      },

      reopenReconciliation: (id, by, reason, at) => {
        set((s) => ({
          reconciliations: s.reconciliations.map((r) =>
            r.id === id ? { ...r, reopenedBy: by, reopenedAt: at, reopenReason: reason } : r,
          ),
        }));
      },

      saveMonthClosure: (closure) => {
        set((s) => {
          const exists = s.monthClosures.some((c) => c.month === closure.month);
          const monthClosures = exists
            ? s.monthClosures.map((c) => (c.month === closure.month ? closure : c))
            : [...s.monthClosures, closure].sort((a, b) => a.month.localeCompare(b.month));
          // §48.3: the posting rules read `closedMonths`, so the lock is written here.
          const closedMonths =
            closure.state === 'Closed'
              ? [...new Set([...s.closedMonths, closure.month])].sort()
              : s.closedMonths.filter((month) => month !== closure.month);
          return { monthClosures, closedMonths };
        });
      },

      reopenMonth: (month, by, reason, at) => {
        set((s) => ({
          monthClosures: s.monthClosures.map((c) =>
            c.month === month ? { ...c, state: 'In review' as const, reopenedBy: by, reopenedAt: at, reopenReason: reason } : c,
          ),
          closedMonths: s.closedMonths.filter((m) => m !== month),
        }));
      },
    }),
    {
      name: 'medicms-money',
      version: 5,
      partialize: (state) => ({
        accounts: state.accounts,
        entries: state.entries,
        closedDays: state.closedDays,
        pettyCounts: state.pettyCounts,
        closedMonths: state.closedMonths,
        chequebooks: state.chequebooks,
        issuedCheques: state.issuedCheques,
        statementLines: state.statementLines,
        reconciliations: state.reconciliations,
        monthClosures: state.monthClosures,
        chequeDeposits: state.chequeDeposits,
      }),
      // v1 stored the openings only. Add the §13 movement to a book that still
      // holds nothing but its openings; a book with real entries is untouched (§78.1).
      // v3 adds the statement lines, the reconciliations and the month records (§40–§48).
      // v4 adds the petty cash counts (§48.2.3), which no entry records when even.
      migrate: (persisted) => {
        const stored = (persisted ?? {}) as Partial<
          Pick<
            MoneyState,
            | 'accounts'
            | 'entries'
            | 'closedDays'
            | 'pettyCounts'
            | 'closedMonths'
            | 'chequebooks'
            | 'issuedCheques'
            | 'statementLines'
            | 'reconciliations'
            | 'monthClosures'
            | 'chequeDeposits'
          >
        >;
        return {
          accounts: stored.accounts ?? SEED_ACCOUNTS,
          entries: withDemoMoneyEntries(stored.entries ?? SEED_ENTRIES),
          closedDays: stored.closedDays ?? [],
          pettyCounts: stored.pettyCounts ?? [],
          closedMonths: stored.closedMonths ?? [],
          chequebooks: stored.chequebooks ?? [],
          issuedCheques: stored.issuedCheques ?? [],
          statementLines: stored.statementLines ?? [],
          reconciliations: stored.reconciliations ?? [],
          monthClosures: stored.monthClosures ?? [],
          chequeDeposits: stored.chequeDeposits ?? [],
        };
      },
    },
  ),
);
