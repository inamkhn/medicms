import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

// ============================================
// Auto-lock — Feature 1 §6
// "Auto-lock after inactivity (10 minutes, Admin can change 1–60)." Activity is
// refreshed on real input events, throttled so mousemove does not hammer the store;
// a slow interval then compares the idle gap and locks. Kept as a hook so it can be
// mounted once in the shell and torn down with it.
// ============================================

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
const THROTTLE_MS = 5000;
const CHECK_MS = 15_000;

export function useAutoLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const mark = useAuthStore.getState().markActivity;
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < THROTTLE_MS) return;
      last = now;
      mark();
    };
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const { isLocked, lastActivity, autoLockMinutes, lock } = useAuthStore.getState();
      if (isLocked) return;
      if (Date.now() - lastActivity > autoLockMinutes * 60_000) lock('inactivity');
    }, CHECK_MS);
    return () => window.clearInterval(id);
  }, [enabled]);
}
