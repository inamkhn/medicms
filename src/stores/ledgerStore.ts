// ============================================
// MediCMS Desktop v4.0 — Ledger Store
//
// The student ledger is a list of typed entries (§5), and it is append-only
// (§7.1: "Entries are never edited or deleted. A mistake is fixed with a
// reversal"). So this store has no update: there is `postEntries`, which either
// takes the whole batch or writes nothing. `removeEntries` exists for one
// sanctioned exception — §23.7 undo-import, which removes exactly the entries
// that one import posted and nothing else.
//
// Nothing here does arithmetic. Balance, unpaid charges and the §5 rules all live
// in src/lib/ledger, so a screen cannot disagree with the ledger check.
//
// Persisted so a posted charge or payment survives a reload ("Nothing resets on
// reload"). Version 2 is the typed entry model; a version 0 or 1 store holds the
// old three-column rows and is converted on the way in (§7.10).
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_LEDGER } from '@/lib/mockData';
import { entryProblems, nextEntryNo, withStoredBalances } from '@/lib/ledger';
import { migrateLegacyRows, type LegacyLedgerRow } from '@/lib/ledger';
import type { LedgerEntry } from '@/types';

/** What a batch of posted entries came to (§7.1: the screen shows this, not a throw). */
export interface PostOutcome {
  ok: boolean;
  /** Entries refused with the §5 / §6 / §7 sentences that explain each one. */
  rejected: { id: string; problems: string[] }[];
}

interface LedgerState {
  entries: LedgerEntry[];
  /**
   * Append a finished batch. `today` is the caller's local date, because the pure
   * core never reads a clock (§7.4 needs it to refuse a future-dated payment).
   */
  postEntries: (batch: readonly LedgerEntry[], today: string) => PostOutcome;
  /** §23.7: undo-import removes exactly the entries that import posted. */
  removeEntries: (ids: readonly string[]) => void;
  getByStudent: (sno: number) => LedgerEntry[];
  /** The number the next entry of this student will take (§5). */
  nextEntryNo: (sno: number) => number;
}

export const useLedgerStore = create<LedgerState>()(
  persist(
    (set, get) => ({
      entries: migrateLegacyRows(MOCK_LEDGER),

      postEntries: (batch, today) => {
        const existing = get().entries;
        const known = new Set(existing.map((entry) => entry.id));
        const rejected: PostOutcome['rejected'] = [];

        for (const entry of batch) {
          const problems = entryProblems(entry, {
            today,
            // A batch may link to an entry it is posting alongside itself, so the
            // link check sees the ledger as it will be, not only as it was.
            all: [...existing, ...batch],
          });
          if (known.has(entry.id)) {
            problems.push(`Entry ${entry.id} is already in the ledger — numbers only go forward (§5).`);
          }
          if (problems.length) rejected.push({ id: entry.id, problems });
        }

        if (rejected.length) return { ok: false, rejected };

        const stamped = withStoredBalances(existing, batch);
        set((state) => ({ entries: [...state.entries, ...stamped] }));
        return { ok: true, rejected: [] };
      },

      removeEntries: (ids) => {
        const gone = new Set(ids);
        set((state) => ({ entries: state.entries.filter((entry) => !gone.has(entry.id)) }));
      },

      getByStudent: (sno) => get().entries.filter((entry) => entry.studentSno === sno),

      nextEntryNo: (sno) => nextEntryNo(get().entries, sno),
    }),
    {
      name: 'medicms-ledger',
      version: 2,
      partialize: (state) => ({ entries: state.entries }),
      migrate: (persisted) => {
        const stored = (persisted ?? {}) as {
          transactions?: LegacyLedgerRow[];
          entries?: LedgerEntry[];
        };
        return {
          // v0 and v1 stored rows of `{ fees, discount, payment }`; v2 stores entries.
          entries: stored.entries ?? migrateLegacyRows(stored.transactions ?? []),
        };
      },
    },
  ),
);
