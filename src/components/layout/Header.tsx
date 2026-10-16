// ============================================
// MediCMS Desktop v4.0 - Header
// ============================================

import { useState, type CSSProperties } from 'react';
import { Search, LogOut, PanelLeft, KeyRound, Lock, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SyncIndicator } from '@/components/shared/SyncIndicator';
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog';
import { useAuthStore, useUIStore } from '@/stores';
import { INSTITUTE_INFO } from '@/lib/constants';
import { ROLE_LABELS } from '@/types';

// Electron-style window drag regions. WebkitAppRegion is not in React's CSSProperties,
// so it is widened once here rather than cast `as any` at every use site.
type DragStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' };
const DRAG: DragStyle = { WebkitAppRegion: 'drag' };
const NO_DRAG: DragStyle = { WebkitAppRegion: 'no-drag' };

export function Header() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const lock = useAuthStore((s) => s.lock);
  const openSearch = useUIStore((s) => s.openSearch);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const [changeOpen, setChangeOpen] = useState(false);

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur flex items-center justify-between px-4 py-3 shrink-0 select-none" style={DRAG}>
      {/* Logo & Institute Name — drag region */}
      <div className="flex items-center gap-2" style={NO_DRAG}>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleSidebar} title="Toggle sidebar">
          <PanelLeft size={14} />
        </Button>
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
        style={NO_DRAG}
      >
        <Search size={12} className="text-slate-400" />
        <span>Search …</span>
        <kbd className="ml-auto text-[10px] bg-white text-slate-400 px-1.5 py-0 rounded border border-slate-200">⌘K</kbd>
      </button>

      {/* Right Side */}
      <div className="flex items-center gap-3" style={NO_DRAG}>
        <SyncIndicator />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-control py-1 pl-1 pr-1.5 transition-colors duration-120 hover:bg-slate-100"
            >
              <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 text-[10px] font-semibold">
                {initials}
              </div>
              <span className="hidden sm:block text-[11px] text-slate-500">{user ? ROLE_LABELS[user.role] : ''}</span>
              <ChevronDown size={12} className="text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="truncate">{user?.name ?? 'Signed out'}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setChangeOpen(true)}>
              <KeyRound size={14} /> Change password
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => lock('manual')}>
              <Lock size={14} /> Lock now
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => logout()}>
              <LogOut size={14} /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChangePasswordDialog open={changeOpen} onOpenChange={setChangeOpen} />
    </header>
  );
}
