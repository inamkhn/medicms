// ============================================
// Auth store — Feature 1 §5, §6, §8
// Owns the *session*: who is signed in, whether the screen is locked, and the
// inactivity budget. It verifies credentials against userStore (which holds the
// hashes) and records every access event in the audit trail. Passwords are never
// stored here; only the current user id and a derived, secret-free `user` copy.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppUser, AuditAction, User } from '@/types';
import { validatePassword, verifyPassword } from '@/lib/crypto';
import { isLockedOut, useUserStore } from './userStore';
import { useAuditStore } from './auditStore';

// The permission helpers live in lib/permissions; re-exported here so the existing
// `import { canWrite } from '@/stores/authStore'` call sites keep compiling.
export { canWrite } from '@/lib/permissions';

export type LoginResult =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; reason: 'incorrect' | 'disabled' | 'locked' };

export const DEFAULT_AUTO_LOCK_MINUTES = 10;
const MIN = 1;
const MAX = 60;

function toSession(u: AppUser): User {
  return { id: u.id, username: u.username, name: u.name, role: u.role };
}

/** One place writes access-audit rows, so the actor's name is always the real one. */
function logAccess(user: string, action: AuditAction, details: string): void {
  useAuditStore.getState().addLog({ user, action, details });
}

interface AuthState {
  userId: string | null;
  user: User | null;
  isLoggedIn: boolean;
  isLocked: boolean;
  autoLockMinutes: number;
  lastActivity: number;

  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  lock: (reason?: 'inactivity' | 'manual') => void;
  unlock: (password: string) => Promise<boolean>;
  changePassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string }>;
  setAutoLockMinutes: (n: number) => void;
  markActivity: () => void;
  /** Re-sync the secret-free session copy after a role/name change in userStore. */
  refreshUser: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      userId: null,
      user: null,
      isLoggedIn: false,
      isLocked: false,
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      lastActivity: Date.now(),

      login: async (username, password) => {
        const userStore = useUserStore.getState();
        const account = userStore.findByUsername(username);

        // Unknown username and wrong password produce the SAME generic result (§5):
        // the message never says which field was wrong. We still audit the attempt.
        if (!account) {
          logAccess(username || '(blank)', 'Failed Sign In', 'No such username');
          return { ok: false, reason: 'incorrect' };
        }

        if (account.status === 'Disabled') {
          return { ok: false, reason: 'disabled' };
        }
        if (isLockedOut(account)) {
          return { ok: false, reason: 'locked' };
        }

        const ok = await verifyPassword(password, account.passwordSalt, account.passwordHash);
        if (!ok) {
          userStore.recordFailure(account.id);
          logAccess(account.username, 'Failed Sign In', `Attempt ${account.failedAttempts + 1} of 5`);
          // A failure that just tripped the limit should surface as locked, not generic.
          const after = useUserStore.getState().getById(account.id);
          return { ok: false, reason: isLockedOut(after) ? 'locked' : 'incorrect' };
        }

        userStore.recordSuccess(account.id);
        const fresh = useUserStore.getState().getById(account.id)!;
        set({
          userId: fresh.id,
          user: toSession(fresh),
          isLoggedIn: true,
          isLocked: false,
          lastActivity: Date.now(),
        });
        logAccess(fresh.username, 'Login', `${fresh.name} (${fresh.role})`);
        return { ok: true, mustChangePassword: fresh.mustChangePassword };
      },

      logout: () => {
        const name = get().user?.username;
        set({ userId: null, user: null, isLoggedIn: false, isLocked: false });
        if (name) logAccess(name, 'Sign Out', 'User signed out');
      },

      lock: (reason = 'manual') => {
        const { isLoggedIn, isLocked, user } = get();
        if (!isLoggedIn || isLocked) return;
        set({ isLocked: true });
        if (user) logAccess(user.username, 'Auto-Lock', reason === 'inactivity' ? 'Timed out' : 'Locked manually');
      },

      unlock: async (password) => {
        const { userId } = get();
        if (!userId) return false;
        const account = useUserStore.getState().getById(userId);
        if (!account) return false;
        const ok = await verifyPassword(password, account.passwordSalt, account.passwordHash);
        if (ok) {
          set({ isLocked: false, lastActivity: Date.now() });
          logAccess(account.username, 'Unlock', 'Screen unlocked');
          return true;
        }
        logAccess(account.username, 'Failed Sign In', 'Unlock attempt');
        return false;
      },

      changePassword: async (current, next) => {
        const { userId } = get();
        if (!userId) return { ok: false, error: 'You are not signed in.' };
        const userStore = useUserStore.getState();
        const account = userStore.getById(userId);
        if (!account) return { ok: false, error: 'Account not found.' };

        const matches = await verifyPassword(current, account.passwordSalt, account.passwordHash);
        if (!matches) return { ok: false, error: 'Your current password is incorrect.' };

        const problem = validatePassword(next, account.username);
        if (problem) return { ok: false, error: problem };

        await userStore.setPassword(account.id, next);
        set({ lastActivity: Date.now() });
        logAccess(account.username, 'Password Change', 'Password updated by user');
        return { ok: true };
      },

      setAutoLockMinutes: (n) => {
        const clamped = Math.min(MAX, Math.max(MIN, Math.round(n)));
        set({ autoLockMinutes: clamped });
      },

      markActivity: () => {
        if (!get().isLocked) set({ lastActivity: Date.now() });
      },

      refreshUser: () => {
        const { userId } = get();
        if (!userId) return;
        const account = useUserStore.getState().getById(userId);
        if (account) set({ user: toSession(account) });
      },
    }),
    {
      name: 'medicms-auth',
      // v1 introduced multi-user accounts. A v0 (admin/admin era) session carries no
      // verifiable AppUser, so it is dropped and the user goes through setup/login.
      version: 1,
      migrate: (persisted) => {
        const base = (persisted ?? {}) as Partial<AuthState>;
        return {
          ...base,
          userId: null,
          user: null,
          isLoggedIn: false,
          isLocked: false,
          lastActivity: Date.now(),
          autoLockMinutes: base.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES,
        };
      },
      // Only the durable identity + preference survives a reload; the transient
      // lock flag and activity clock reset so the app does not open mid-lock.
      partialize: (s) => ({
        userId: s.userId,
        user: s.user,
        isLoggedIn: s.isLoggedIn,
        autoLockMinutes: s.autoLockMinutes,
      }),
    },
  ),
);
