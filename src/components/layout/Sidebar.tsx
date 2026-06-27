// ============================================
// MediCMS Desktop v4.0 - Sidebar Navigation
// ============================================

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserPlus, BookOpen, CreditCard,
  FileText, Receipt, Building2, History, Settings, Database, LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  shortcut?: string;
  adminOnly?: boolean;
}

const MAIN_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/admissions/new', label: 'New Admission', icon: UserPlus, shortcut: 'Ctrl+N' },
];

const FINANCE_ITEMS: NavItem[] = [
  { to: '/ledger', label: 'Fee Ledger', icon: BookOpen },
  { to: '/payments/record', label: 'Payments', icon: CreditCard, shortcut: 'Ctrl+P' },
  { to: '/fee-templates', label: 'Fee Templates', icon: Receipt, adminOnly: true },
];

const OPERATIONS_ITEMS: NavItem[] = [
  { to: '/expenses', label: 'Expenses', icon: FileText, adminOnly: true },
  { to: '/bank', label: 'Bank Account', icon: Building2, adminOnly: true },
];

const REPORTS_ITEMS: NavItem[] = [
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/audit', label: 'Audit Trail', icon: History },
];

const SYSTEM_ITEMS: NavItem[] = [
  { to: '/import', label: 'Data Import', icon: Database, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'Admin';
  
  const visibleItems = items.filter(item => !item.adminOnly || isAdmin);
  
  if (visibleItems.length === 0) return null;
  
  return (
    <div className="mb-5">
      <div className="px-5 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
        {title}
      </div>
      <div className="px-3 space-y-0.5">
        {visibleItems.map(({ to, label, icon: Icon, shortcut }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 group relative',
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-500 rounded-r-full" />
                )}
                <div className="flex items-center gap-3">
                  <Icon size={18} className={cn(isActive ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-600')} />
                  <span>{label}</span>
                </div>
                {shortcut && (
                  <span className="text-[11px] text-slate-300">{shortcut}</span>
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
  
  return (
    <aside className="w-64 border-r border-slate-100 bg-white flex flex-col py-5 shrink-0">
      <nav className="flex-1 overflow-y-auto">
        <NavSection title="Main" items={MAIN_ITEMS} />
        <NavSection title="Finance" items={FINANCE_ITEMS} />
        <NavSection title="Operations" items={OPERATIONS_ITEMS} />
        <NavSection title="Reports" items={REPORTS_ITEMS} />
        <NavSection title="System" items={SYSTEM_ITEMS} />
      </nav>
      
      {/* User Info & Logout */}
      <div className="border-t border-slate-100 px-5 py-4 mt-auto">
        <div className="text-sm font-medium text-slate-700">{user?.name}</div>
        <div className="text-xs text-slate-400 mt-0.5">{user?.role} role</div>
        <button
          onClick={() => useAuthStore.getState().logout()}
          className="mt-3 flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </aside>
  );
}
