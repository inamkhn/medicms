// ============================================
// MediCMS Desktop v4.0 — Import batch store (students doc §23.7)
//
// One record per confirmed CSV import: which SNOs it admitted and which
// opening-balance entries it posted, so an Admin can undo exactly that import
// from the result page or the import history. Persisted so the history
// survives a reload; the batch is dropped once its undo has run.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ImportBatchRecord } from '@/types';

interface ImportState {
  /** Newest last. */
  batches: ImportBatchRecord[];
  addBatch: (batch: ImportBatchRecord) => void;
  dropBatch: (id: string) => void;
}

export const useImportStore = create<ImportState>()(
  persist(
    (set) => ({
      batches: [],
      addBatch: (batch) => set((state) => ({ batches: [...state.batches, batch] })),
      dropBatch: (id) => set((state) => ({ batches: state.batches.filter((b) => b.id !== id) })),
    }),
    {
      name: 'medicms-imports',
      partialize: (s) => ({ batches: s.batches }),
    },
  ),
);
