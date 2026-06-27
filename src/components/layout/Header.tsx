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
    <header className="h-16 border-b border-slate-100/60 bg-white/80 backdrop-blur-xl flex items-center justify-between px-6 shrink-0">
      {/* Logo & Institute Name */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-200/50">
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <div>
          <span className="font-semibold text-slate-900 text-[15px]">MediCMS Desktop</span>
          <span className="text-sm text-slate-400 ml-2 hidden sm:inline">
            {INSTITUTE_INFO.name}
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <button
        onClick={openSearch}
        className="flex items-center gap-2.5 px-5 py-2.5 bg-slate-100/60 rounded-2xl text-slate-400 text-sm hover:bg-slate-100 transition-all duration-200 min-w-[320px]"
      >
        <Search size={16} className="text-slate-400" />
        <span>Search students, SNO, receipt...</span>
        <kbd className="ml-auto text-[11px] bg-white text-slate-400 px-2 py-0.5 rounded-lg border border-slate-100">F3</kbd>
      </button>

      {/* Right Side */}
      <div className="flex items-center gap-4">
        <SyncIndicator />
        
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-slate-700">{user?.name}</div>
            <div className="text-xs text-slate-400">{user?.role}</div>
          </div>
          
          <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-blue-50 rounded-full flex items-center justify-center text-blue-600 text-xs font-semibold">
            {initials}
          </div>

          <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
            <LogOut size={16} />
          </Button>
        </div>
      </div>
    </header>
  );
}
