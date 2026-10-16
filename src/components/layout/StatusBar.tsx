// Shell StatusBar (spec §3): sync state · counter/user · shortcuts.

import { useAuthStore, useSyncStore } from '@/stores';
import { getSyncIndicator } from '@/stores/syncStore';

export function StatusBar() {
  const { status, pendingCount, lastSync } = useSyncStore();
  const user = useAuthStore((s) => s.user);
  const { dot, label } = getSyncIndicator(status);
  return (
    <footer className="print:hidden flex items-center gap-4 px-4 h-7 text-[11px] text-slate-500 bg-white border-t border-slate-200">
      <span className="inline-flex items-center gap-1.5">
        <span>{dot}</span>
        <span>{label}</span>
        {pendingCount > 0 && <span>· {pendingCount} pending</span>}
      </span>
      {lastSync && <span className="hidden sm:inline">Last sync {new Date(lastSync).toLocaleString()}</span>}
      <span className="flex-1" />
      <span className="hidden md:inline">{user ? `${user.name} · ${user.role}` : 'Not signed in'}</span>
      <span className="hidden lg:inline">F3 search · Ctrl+N admission · Ctrl+P payment · Esc close</span>
    </footer>
  );
}
