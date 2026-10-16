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
import type { DayClosing, MoneyAccount, MoneyEntry } from '@/lib/finance';
import type { Chequebook, IssuedCheque } from '@/lib/finance';
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

interface MoneyState {
  accounts: MoneyAccount[];
  entries: MoneyEntry[];
  /**
   * §33.5: the day closings of the day book, kept beside the money books —
   * every day keeps its own closing. (Re-opened days replace their record
   * when the reopen arrives, F7.)
   */
  closedDays: DayClosing[];
  /** `YYYY-MM` keys, in the order they were closed (§51). */
  closedMonths: string[];
  /** §31.1: the chequebooks, each a number range drawn on one bank account. */
  chequebooks: Chequebook[];
  /**
   * §31.2: the issued-cheque register. A cheque is a record, not a money entry
   * — only a cleared one has posted money out (§31.3 available balance).
   */
  issuedCheques: IssuedCheque[];
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
}

export const useMoneyStore = create<MoneyState>()(
  persist(
    (set, get) => ({
      accounts: SEED_ACCOUNTS,
      entries: SEED_ALL_ENTRIES,
      closedDays: [],
      closedMonths: [],
      chequebooks: [],
      issuedCheques: [],

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
    }),
    {
      name: 'medicms-money',
      version: 2,
      partialize: (state) => ({
        accounts: state.accounts,
        entries: state.entries,
        closedDays: state.closedDays,
        closedMonths: state.closedMonths,
        chequebooks: state.chequebooks,
        issuedCheques: state.issuedCheques,
      }),
      // v1 stored the openings only. Add the §13 movement to a book that still
      // holds nothing but its openings; a book with real entries is untouched (§78.1).
      migrate: (persisted) => {
        const stored = (persisted ?? {}) as Partial<Pick<MoneyState, 'accounts' | 'entries' | 'closedDays' | 'closedMonths' | 'chequebooks' | 'issuedCheques'>>;
        return {
          accounts: stored.accounts ?? SEED_ACCOUNTS,
          entries: withDemoMoneyEntries(stored.entries ?? SEED_ENTRIES),
          closedDays: stored.closedDays ?? [],
          closedMonths: stored.closedMonths ?? [],
          chequebooks: stored.chequebooks ?? [],
          issuedCheques: stored.issuedCheques ?? [],
        };
      },
    },
  ),
);
