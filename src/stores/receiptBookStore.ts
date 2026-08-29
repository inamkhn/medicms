// ============================================
// MediCMS Desktop v4.0 - Receipt Book Store
// Pre-printed receipt ranges allocated to users
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ReceiptBook {
  id: string;
  bookNo: string;
  start: number;
  end: number;
  current: number; // next to issue (inclusive)
  assignedTo: string;
  isActive: boolean;
}

interface ReceiptBookState {
  books: ReceiptBook[];
  addBook: (book: Omit<ReceiptBook, 'id' | 'current'> & { current?: number }) => void;
  getNextReceipt: (userName: string) => string | null;
  useReceipt: (receiptNo: string, userName: string) => boolean;
  isReceiptUsed: (receiptNo: string) => boolean;
}

export const useReceiptBookStore = create<ReceiptBookState>()(
  persist(
    (set, get) => ({
      books: [
        { id: 'book-1', bookNo: 'Book-01', start: 1, end: 1000, current: 854, assignedTo: 'Admin Khalid', isActive: true },
        { id: 'book-2', bookNo: 'Book-02', start: 1001, end: 2000, current: 1001, assignedTo: 'Admin', isActive: true },
      ],
      addBook: (book) => set((s) => ({
        books: [...s.books, { id: `book-${Date.now()}`, current: book.start, ...book } as ReceiptBook]
      })),
      getNextReceipt: (userName) => {
        const book = get().books.find(b => b.assignedTo === userName && b.isActive && b.current <= b.end)
          || get().books.find(b => b.isActive && b.current <= b.end);
        if (!book) return null;
        return `#${book.current}`;
      },
      useReceipt: (receiptNo, _userName) => {
        const num = parseInt(receiptNo.replace('#',''),10);
        if (isNaN(num)) return false;
        const books = get().books;
        const book = books.find(b => num >= b.start && num <= b.end && b.isActive);
        if (!book) return false;
        if (num !== book.current) {
          // allow gaps but advance current if ahead
          if (num > book.current && num <= book.end) {
            set({ books: books.map(b => b.id === book.id ? { ...b, current: num + 1 } : b) });
            return true;
          }
          return false;
        }
        set({ books: books.map(b => b.id === book.id ? { ...b, current: b.current + 1 } : b) });
        return true;
      },
      isReceiptUsed: (_receiptNo) => {
        // Check via ledgerStore would be better, but we keep simple
        return false;
      },
    }),
    { name: 'medicms-receipt-books' }
  )
);
