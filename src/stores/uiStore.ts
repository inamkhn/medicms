// ============================================
// MediCMS Desktop v4.0 - UI Store
// ============================================

import { create } from 'zustand';
import type { StudentWithBalance } from '@/types';

interface UIState {
  // Student drawer
  drawerStudent: StudentWithBalance | null;
  drawerOpen: boolean;
  openDrawer: (student: StudentWithBalance) => void;
  closeDrawer: () => void;
  
  // Global search
  searchOpen: boolean;
  searchQuery: string;
  openSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Student drawer
  drawerStudent: null,
  drawerOpen: false,
  openDrawer: (student) => set({ drawerStudent: student, drawerOpen: true }),
  closeDrawer: () => set({ drawerStudent: null, drawerOpen: false }),
  
  // Global search
  searchOpen: false,
  searchQuery: '',
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false, searchQuery: '' }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
