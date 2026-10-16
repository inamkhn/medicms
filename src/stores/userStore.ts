// ============================================
// User store — Feature 1 §4, §7, §9
// The account registry. This is the only place a password hash is written, so the
// rule "plaintext never lands in storage" has a single chokepoint. Sessions and
// credential *verification* live in authStore; this store owns the records.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppUser, UserRole } from '@/types';
import { hashPassword, randomSalt } from '@/lib/crypto';

/** Five failures then a five-minute account lock (§6). */
export const FAILED_LOGIN_LIMIT = 5;
export const ACCOUNT_LOCK_MINUTES = 5;

export interface CreateUserInput {
  username: string;
  name: string;
  role: UserRole;
  password: string;
  receiptBookId?: string | null;
  /** Admin reset sets this true so the user must choose a new password on next sign-in. */
  mustChangePassword?: boolean;
}

function newId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Usernames are matched case-insensitively and stored normalized. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

interface UserState {
  users: AppUser[];
  hasUsers: () => boolean;
  findByUsername: (username: string) => AppUser | undefined;
  getById: (id: string) => AppUser | undefined;
  createUser: (input: CreateUserInput) => Promise<AppUser>;
  /** Edit profile fields only — never status or password (those have their own verbs). */
  updateUser: (id: string, patch: Partial<Pick<AppUser, 'name' | 'role' | 'receiptBookId'>>) => void;
  setStatus: (id: string, status: 'Active' | 'Disabled') => void;
  /** Admin reset: install a temporary password and force a change next sign-in. */
  resetPassword: (id: string, tempPassword: string) => Promise<void>;
  /** User chooses their own password; clears the mustChange flag. */
  setPassword: (id: string, newPassword: string) => Promise<void>;
  recordSuccess: (id: string) => void;
  /** Increment failures; lock the account once the limit is reached. */
  recordFailure: (id: string) => void;
  isUsernameTaken: (username: string, exceptId?: string) => boolean;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      users: [],

      hasUsers: () => get().users.length > 0,

      findByUsername: (username) => {
        const key = normalizeUsername(username);
        return get().users.find((u) => u.username === key);
      },

      getById: (id) => get().users.find((u) => u.id === id),

      createUser: async (input) => {
        const username = normalizeUsername(input.username);
        const salt = randomSalt();
        const passwordHash = await hashPassword(input.password, salt);
        const user: AppUser = {
          id: newId(),
          username,
          name: input.name.trim(),
          role: input.role,
          status: 'Active',
          passwordHash,
          passwordSalt: salt,
          mustChangePassword: input.mustChangePassword ?? false,
          receiptBookId: input.receiptBookId ?? null,
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
          failedAttempts: 0,
          lockedUntil: null,
        };
        set((s) => ({ users: [...s.users, user] }));
        return user;
      },

      updateUser: (id, patch) =>
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
        })),

      setStatus: (id, status) =>
        set((s) => ({
          users: s.users.map((u) =>
            u.id === id ? { ...u, status, ...(status === 'Active' ? { failedAttempts: 0, lockedUntil: null } : {}) } : u,
          ),
        })),

      resetPassword: async (id, tempPassword) => {
        const salt = randomSalt();
        const passwordHash = await hashPassword(tempPassword, salt);
        set((s) => ({
          users: s.users.map((u) =>
            u.id === id ? { ...u, passwordSalt: salt, passwordHash, mustChangePassword: true } : u,
          ),
        }));
      },

      setPassword: async (id, newPassword) => {
        const salt = randomSalt();
        const passwordHash = await hashPassword(newPassword, salt);
        set((s) => ({
          users: s.users.map((u) =>
            u.id === id ? { ...u, passwordSalt: salt, passwordHash, mustChangePassword: false } : u,
          ),
        }));
      },

      recordSuccess: (id) =>
        set((s) => ({
          users: s.users.map((u) =>
            u.id === id
              ? { ...u, failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() }
              : u,
          ),
        })),

      recordFailure: (id) =>
        set((s) => ({
          users: s.users.map((u) => {
            if (u.id !== id) return u;
            const attempts = u.failedAttempts + 1;
            if (attempts >= FAILED_LOGIN_LIMIT) {
              const until = new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60_000).toISOString();
              // Reset the counter so the next failure cycle after unlock is a fresh five.
              return { ...u, failedAttempts: 0, lockedUntil: until };
            }
            return { ...u, failedAttempts: attempts };
          }),
        })),

      isUsernameTaken: (username, exceptId) => {
        const key = normalizeUsername(username);
        return get().users.some((u) => u.username === key && u.id !== exceptId);
      },
    }),
    { name: 'medicms-users', version: 1 },
  ),
);

/** True while the account is currently locked out of sign-in. */
export function isLockedOut(user: AppUser | undefined, now = Date.now()): boolean {
  if (!user?.lockedUntil) return false;
  return new Date(user.lockedUntil).getTime() > now;
}
