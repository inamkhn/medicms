// ============================================
// MediCMS Desktop v4.0 - Header
// ============================================

import { Search, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncIndicator } from '@/components/shared/SyncIndicator';
import { useAuthStore, useUIStore } from '@/stores';
import { INSTITUTE_INFO } from '@/lib/constants';

export function Header() {
  const { user, logout } = useAuthStore();
  const openSearch = useUIStore((s) => s.openSearch);

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur flex items-center justify-between px-4 py-3 shrink-0 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Logo & Institute Name — drag region */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
          <span className="text-white font-bold text-[11px]">M</span>
        </div>
        <span className="font-semibold text-slate-900 text-[12px] tracking-tight">MediCMS</span>
        <span className="text-[11px] text-slate-400 hidden sm:inline">
          {INSTITUTE_INFO.name}
        </span>
      </div>

      {/* Search Bar — compact */}
      <button
        onClick={openSearch}
        className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-md text-slate-500 text-[12px] hover:bg-slate-200 transition-colors min-w-[260px] justify-center"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <Search size={12} className="text-slate-400" />
        <span>Search …</span>
        <kbd className="ml-auto text-[10px] bg-white text-slate-400 px-1.5 py-0 rounded border border-slate-200">⌘K</kbd>
      </button>

      {/* Right Side */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <SyncIndicator />
        <div className="text-[11px] text-slate-500 hidden sm:block">{user?.role}</div>
        <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 text-[10px] font-semibold">
          {initials}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={logout} title="Sign out">
          <LogOut size={12} />
        </Button>
      </div>
    </header>
  );
}
