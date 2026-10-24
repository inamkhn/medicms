// ============================================
// MediCMS Desktop — Receipt book store (§24, §25, §27, §65)
//
// The state side of Feature 3: the books, the numbers used up without a receipt
// (spoiled, skipped), the reprint audit and the payment settings §65 collects.
// Every decision behind it — what a number's status is, which number comes next,
// what a book may not do — lives in `@/lib/receipts`; this file only keeps the
// rows and refuses to write an invalid book.
//
// A book's `assignedTo` is the user's id (AppUser.receiptBookId is the same pair
// read from the other side), so a rename never breaks the assignment.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  DEFAULT_PAYMENT_SETTINGS,
  bookProblems,
  type BookDraft,
  type PaymentSettings,
  type ReceiptBook,
  type ReceiptEvent,
  type ReceiptEventKind,
} from '@/lib/receipts';

export type { ReceiptBook } from '@/lib/receipts';

interface ReceiptBookState {
  books: ReceiptBook[];
  /** Numbers consumed without a receipt (§27.3 spoiled, §25 skipped). */
  events: ReceiptEvent[];
  /** §27.1 "each reprint is counted" — printed reference → times reprinted. */
  reprints: Record<string, number>;
  /** §65 payment and receipt limits. */
  paymentSettings: PaymentSettings;

  /** §57 create a book. Returns the new id, or null when the draft has problems. */
  addBook: (draft: BookDraft, mode: ReceiptBook['mode'], actor: string, now: string) => string | null;
  /** §24 "Assigned to: One counter or user." An empty id unassigns it. */
  assignBook: (id: string, userId: string) => void;
  /** §57 close a book early, with the reason the register will print. */
  closeBook: (id: string, reason: string, actor: string, now: string) => void;
  /** §27.3 a damaged or wasted number, with a reason. */
  spoilNumber: (bookId: string, number: number, reason: string, actor: string, now: string) => void;
  /** §25 numbers left out of order — they stay visible as Skipped. */
  skipNumbers: (bookId: string, numbers: readonly number[], reason: string, actor: string, now: string) => void;
  /** §27.1 count a reprint and write it to the audit trail. */
  recordReprint: (reference: string) => void;
  /** §65 one payment limit at a time, from the Settings screen. */
  savePaymentSettings: (patch: Partial<PaymentSettings>) => void;
}

function eventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export const useReceiptBookStore = create<ReceiptBookState>()(
  persist(
    (set, get) => {
      const pushEvents = (bookId: string, numbers: readonly number[], kind: ReceiptEventKind, reason: string, actor: string, now: string) => {
        const fresh = numbers.map((number) => ({
          id: eventId(),
          bookId,
          number,
          kind,
          reason: reason.trim(),
          by: actor,
          at: now,
        }));
        set((state) => ({ events: [...state.events, ...fresh] }));
      };

      return {
        books: [],
        events: [],
        reprints: {},
        paymentSettings: DEFAULT_PAYMENT_SETTINGS,

        addBook: (draft, mode, actor, now) => {
          if (bookProblems(draft, get().books).length > 0) return null;
          const id = `book-${Date.now()}`;
          const book: ReceiptBook = {
            id,
            name: draft.name.trim(),
            prefix: draft.prefix.trim(),
            from: draft.from,
            to: draft.to,
            assignedTo: draft.assignedTo,
            mode,
            status: 'Active',
            createdBy: actor,
            createdAt: now,
          };
          set((state) => ({ books: [...state.books, book] }));
          return id;
        },

        assignBook: (id, userId) =>
          set((state) => ({
            books: state.books.map((book) =>
              book.id === id ? { ...book, assignedTo: userId } : book,
            ),
          })),

        closeBook: (id, reason, actor, now) =>
          set((state) => ({
            books: state.books.map((book) =>
              book.id === id
                ? { ...book, status: 'Closed', closedBy: actor, closedAt: now, closeReason: reason.trim() }
                : book,
            ),
          })),

        spoilNumber: (bookId, number, reason, actor, now) =>
          pushEvents(bookId, [number], 'Spoiled', reason, actor, now),

        skipNumbers: (bookId, numbers, reason, actor, now) =>
          pushEvents(bookId, numbers, 'Skipped', reason, actor, now),

        recordReprint: (reference) =>
          set((state) => ({
            reprints: { ...state.reprints, [reference]: (state.reprints[reference] ?? 0) + 1 },
          })),

        savePaymentSettings: (patch) =>
          set((state) => ({ paymentSettings: { ...state.paymentSettings, ...patch } })),
      };
    },
    {
      name: 'medicms-receipt-books',
      // v1 held placeholder ranges with a made-up `current` (§1's stub). Importing
      // them would invent hundreds of unaccounted numbers, which §28 forbids — so
      // they are dropped and an Admin assigns a real Book 1 (§57). Payment limits
      // are new here, so they start at the §65 defaults.
      version: 2,
      migrate: () => ({ books: [], events: [], reprints: {}, paymentSettings: DEFAULT_PAYMENT_SETTINGS }),
    },
  ),
);
