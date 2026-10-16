// ============================================
// MediCMS Desktop - Directory Preferences
// Feature 3 §22.4 Saved views + §22.5 column chooser.
// Both are per-user and persist across reloads (§32: nothing resets). The store
// itself is user-agnostic; the caller scopes reads/writes by the signed-in user's
// name, exactly like the dashboard scopes figures by role.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** A saved directory view: a named snapshot of the page-address query string,
 *  so reopening it restores every filter, the sort and the page (§22.3). */
export interface SavedView {
  id: string;
  name: string;
  owner: string;
  /** The query string captured from the address, e.g. "status=dues&sort=balance". */
  query: string;
  createdAt: string;
}

interface DirectoryState {
  views: SavedView[];
  /** owner -> ids of columns the user chose to hide (§22.5). */
  hiddenColumns: Record<string, string[]>;

  addView: (owner: string, name: string, query: string) => SavedView;
  removeView: (id: string) => void;
  setHiddenColumns: (owner: string, ids: string[]) => void;
}

export const useDirectoryStore = create<DirectoryState>()(
  persist(
    (set) => ({
      views: [],
      hiddenColumns: {},

      addView: (owner, name, query) => {
        const view: SavedView = {
          id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          owner,
          query,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ views: [...s.views, view] }));
        return view;
      },

      removeView: (id) => set((s) => ({ views: s.views.filter((v) => v.id !== id) })),

      setHiddenColumns: (owner, ids) =>
        set((s) => ({ hiddenColumns: { ...s.hiddenColumns, [owner]: ids } })),
    }),
    { name: 'medicms-directory' }
  )
);
