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
  { to: '/ledger/bulk-demand', label: 'Bulk Demand', icon: Receipt, adminOnly: true },
  { to: '/payments/record', label: 'Payments', icon: CreditCard, shortcut: 'Ctrl+P' },
  { to: '/fee-templates', label: 'Fee Templates', icon: Receipt, adminOnly: true },
];

const OPERATIONS_ITEMS: NavItem[] = [
  { to: '/expenses', label: 'Expenses', icon: FileText, adminOnly: true },
  { to: '/bank', label: 'Bank Account', icon: Building2, adminOnly: true },
];

const REPORTS_ITEMS: NavItem[] = [
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/approvals', label: 'Approvals', icon: History },
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
    <div className="mb-3">
      <div className="px-2 mb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest text-center">
        {title.slice(0,3)}
      </div>
      <div className="px-1.5 space-y-1">
        {visibleItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={`${label}`}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center w-9 h-9 mx-auto rounded-lg transition-colors relative group',
                isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              )
            }
          >
            <Icon size={16} />
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { user } = useAuthStore();
  const initials = user?.name ? user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() : 'U';
  return (
    <aside className="w-20 border-r border-slate-200 bg-[#FAFAFA] flex flex-col py-3 shrink-0">
      <nav className="flex-1 overflow-y-auto">
        <NavSection title="Main" items={MAIN_ITEMS} />
        <div className="mx-3 my-2 h-px bg-slate-200" />
        <NavSection title="Finance" items={FINANCE_ITEMS} />
        <div className="mx-3 my-2 h-px bg-slate-200" />
        <NavSection title="Operations" items={OPERATIONS_ITEMS} />
        <div className="mx-3 my-2 h-px bg-slate-200" />
        <NavSection title="Reports" items={REPORTS_ITEMS} />
        <div className="mx-3 my-2 h-px bg-slate-200" />
        <NavSection title="System" items={SYSTEM_ITEMS} />
      </nav>
      <div className="border-t border-slate-200 pt-3 pb-1 flex flex-col items-center gap-2">
        <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center text-[10px] font-semibold text-slate-600" title={`${user?.name} — ${user?.role}`}>{initials}</div>
        <button onClick={() => useAuthStore.getState().logout()} title="Sign out" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-500 transition-colors">
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
