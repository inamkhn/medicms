// ============================================
// MediCMS Desktop v4.0 - Sidebar Navigation
// ============================================

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserPlus, BookOpen, CreditCard,
  FileText, Receipt, Building2, History, Settings, Database, LogOut, Layers,
  ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useUIStore } from '@/stores';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  shortcut?: string;
  end?: boolean;
}

const MAIN_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/admissions/new', label: 'New Admission', icon: UserPlus, shortcut: 'Ctrl+N' },
];

const FINANCE_ITEMS: NavItem[] = [
  { to: '/ledger', label: 'Fee Ledger', icon: BookOpen, end: true },
  { to: '/ledger/bulk-demand', label: 'Batch Promotion', icon: Receipt },
  { to: '/payments/record', label: 'Payments', icon: CreditCard, shortcut: 'Ctrl+P' },
  { to: '/fee-templates', label: 'Fee Templates', icon: Receipt },
];

const OPERATIONS_ITEMS: NavItem[] = [
  { to: '/expenses', label: 'Expenses', icon: FileText },
  { to: '/bank', label: 'Bank Account', icon: Building2 },
  { to: '/batches', label: 'Batches', icon: Layers },
];

const REPORTS_ITEMS: NavItem[] = [
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/audit', label: 'Audit Trail', icon: History },
];

const SYSTEM_ITEMS: NavItem[] = [
  { to: '/import', label: 'Data Import', icon: Database },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function NavSection({ title, items, collapsed }: { title: string; items: NavItem[]; collapsed: boolean }) {
  const visibleItems = items;
  return (
    <div className="mb-4">
      <div className={cn(
        'mb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest',
        collapsed ? 'text-center px-0' : 'px-3'
      )}>
        {collapsed ? title.slice(0, 3) : title}
      </div>
      <div className={cn('space-y-0.5', collapsed ? 'px-1.5' : 'px-2')}>
        {visibleItems.map(({ to, label, icon: Icon, shortcut, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? `${label}${shortcut ? ` (${shortcut})` : ''}` : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-lg transition-colors group',
                collapsed
                  ? 'justify-center w-9 h-9 mx-auto'
                  : 'gap-2.5 px-3 h-9 text-[13px] font-medium',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )
            }
          >
            <Icon size={16} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left">{label}</span>
                {shortcut && (
                  <kbd className="text-[10px] text-slate-400 font-normal hidden xl:inline">
                    {shortcut}
                  </kbd>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const collapsed = sidebarCollapsed;
  const initials = user?.name ? user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() : 'U';
  return (
    <aside className={cn(
      'border-r border-slate-200 bg-[#FAFAFA] flex flex-col py-3 shrink-0 transition-all duration-200',
      collapsed ? 'w-[68px]' : 'w-60'
    )}>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden">
        <NavSection title="Main" items={MAIN_ITEMS} collapsed={collapsed} />
        <div className="mx-3 my-3 h-px bg-slate-200" />
        <NavSection title="Finance" items={FINANCE_ITEMS} collapsed={collapsed} />
        <div className="mx-3 my-3 h-px bg-slate-200" />
        <NavSection title="Operations" items={OPERATIONS_ITEMS} collapsed={collapsed} />
        <div className="mx-3 my-3 h-px bg-slate-200" />
        <NavSection title="Reports" items={REPORTS_ITEMS} collapsed={collapsed} />
        <div className="mx-3 my-3 h-px bg-slate-200" />
        <NavSection title="System" items={SYSTEM_ITEMS} collapsed={collapsed} />
      </nav>
      <div className="border-t border-slate-200 pt-3 pb-1 px-2 flex flex-col gap-1.5">
        {!collapsed && user && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-100/70">
            <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center text-[10px] font-semibold text-slate-600 shrink-0">{initials}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-slate-800 truncate">{user.name}</div>
              <div className="text-[10px] text-slate-400 truncate">{user.role}</div>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center" title={`${user?.name} — ${user?.role}`}>
            <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center text-[10px] font-semibold text-slate-600">{initials}</div>
          </div>
        )}
        <div className={cn('flex gap-1', collapsed ? 'flex-col items-center' : 'flex-row')}>
          <button
            onClick={() => useAuthStore.getState().logout()}
            title="Sign out"
            className={cn(
              'flex items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-red-500 transition-colors text-[13px] font-medium',
              collapsed ? 'w-8 h-8 justify-center' : 'flex-1 gap-2 px-3 h-9'
            )}
          >
            <LogOut size={14} className="shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
          <button
            onClick={toggleSidebar}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors',
              collapsed ? 'w-8 h-8 justify-center' : 'w-9 h-9 justify-center'
            )}
          >
            {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
