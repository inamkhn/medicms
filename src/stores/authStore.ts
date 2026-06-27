// ============================================
// MediCMS Desktop v4.0 - Auth Store
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole } from '@/types';

interface AuthState {
  isLoggedIn: boolean;
  user: User | null;
  lastOnlineLogin: string | null;  // For 7-day offline cache validation
  login: (user: User) => void;
  logout: () => void;
  canLoginOffline: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isLoggedIn: false,
      user: null,
      lastOnlineLogin: null,
      
      login: (user) => set({ 
        isLoggedIn: true, 
        user,
        lastOnlineLogin: new Date().toISOString(),
      }),
      
      logout: () => set({ 
        isLoggedIn: false, 
        user: null,
      }),
      
      canLoginOffline: () => {
        const { lastOnlineLogin } = get();
        if (!lastOnlineLogin) return false;
        
        const lastLogin = new Date(lastOnlineLogin);
        const now = new Date();
        const daysDiff = (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
        
        return daysDiff <= 7;  // Valid for 7 days
      },
    }),
    { name: 'medicms-auth' }
  )
);

// --- Role-based access control ---
export function hasPermission(role: UserRole | undefined, module: string): boolean {
  if (!role) return false;
  
  const permissions: Record<UserRole, string[]> = {
    Admin: ['*'],  // Full access
    Principal: ['dashboard', 'students', 'ledger', 'reports', 'audit'],  // Read-only
  };
  
  if (role === 'Admin') return true;
  
  const allowed = permissions[role] || [];
  return allowed.includes(module);
}

export function canWrite(role: UserRole | undefined): boolean {
  return role === 'Admin';
}
