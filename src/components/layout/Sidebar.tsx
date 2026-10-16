// ============================================
// MediCMS Desktop v4.0 - Sidebar Navigation
// ============================================

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserPlus, BookOpen, CreditCard,
  FileText, Receipt, Building2, History, Settings, Database, LogOut, Layers,
  ChevronsLeft, ChevronsRight, ShieldCheck, Landmark, ArrowLeftRight, CalendarCheck, ScrollText, Store, Inbox, Undo2, Wallet
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { can, type Permission } from '@/lib/permissions';
import { useAuthStore, useUIStore } from '@/stores';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  shortcut?: string;
  end?: boolean;
  /** When set, the link is shown only to roles the shared rule set allows. */
  perm?: Permission;
}

const MAIN_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/admissions/new', label: 'New Admission', icon: UserPlus, shortcut: 'Ctrl+N', perm: 'student.admit' },
];

const FINANCE_ITEMS: NavItem[] = [
  { to: '/ledger', label: 'Fee Ledger', icon: BookOpen, end: true },
  { to: '/ledger/bulk-demand', label: 'Batch Promotion', icon: Receipt, perm: 'ledger.adjust' },
  { to: '/payments/record', label: 'Payments', icon: CreditCard, shortcut: 'Ctrl+P', perm: 'payment.record' },
  { to: '/finance/day-close', label: 'Day close', icon: CalendarCheck, perm: 'payment.record' },
  { to: '/fee-templates', label: 'Fee Templates', icon: Receipt, perm: 'feeTemplate.manage' },
];

// The money accounts of the finance core (§58). Counter operators see none of
// it — "the Finance area is split into two groups. Counter operators only see
// the first" — the day close above is theirs and lives in FEES. Pay out sits
// under its own write permission (§57); the register is readable by anyone who
// reads the money books.
const MONEY_ITEMS: NavItem[] = [
  { to: '/finance/bills', label: 'Bills and expenses', icon: Receipt, perm: 'finance.view' },
  { to: '/finance/vendors', label: 'Vendors', icon: Store, perm: 'finance.view' },
  { to: '/finance/pay', label: 'Pay out', icon: CreditCard, perm: 'finance.pay' },
  { to: '/finance/vouchers', label: 'Vouchers', icon: FileText, perm: 'finance.view' },
  { to: '/finance/accounts', label: 'Accounts', icon: Landmark, perm: 'finance.view' },
  { to: '/finance/petty-cash', label: 'Petty cash', icon: Wallet, perm: 'finance.petty' },
  { to: '/finance/transfer', label: 'Transfer', icon: ArrowLeftRight, perm: 'finance.transfer' },
  { to: '/finance/deposit', label: 'Cash deposit', icon: Building2, perm: 'finance.transfer' },
  { to: '/finance/cheques', label: 'Issued cheques', icon: ScrollText, perm: 'finance.view' },
  // §8/§17/§18 money held for others, and §33 money out to a student — the two
  // automatic flows whose entries now have a screen to be created from.
  { to: '/finance/cheques-incoming', label: 'Cheques in hand', icon: Inbox, perm: 'finance.view' },
  { to: '/finance/refunds', label: 'Refunds', icon: Undo2, perm: 'finance.view' },
];

const OPERATIONS_ITEMS: NavItem[] = [
  { to: '/academic', label: 'Academic setup', icon: Layers, perm: 'academic.view' },
];

const REPORTS_ITEMS: NavItem[] = [
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/audit', label: 'Audit Trail', icon: History, perm: 'audit.view' },
];

const SYSTEM_ITEMS: NavItem[] = [
  { to: '/import', label: 'Data Import', icon: Database, perm: 'data.import' },
  { to: '/settings/users', label: 'Users', icon: ShieldCheck, perm: 'user.manage' },
  { to: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage', end: true },
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

  // Filter each section by the shared rule set, then drop empty sections so no
  // stray divider is left where a role cannot navigate (Feature 1 §3).
  const role = user?.role;
  const groups = [
    { title: 'Main', items: MAIN_ITEMS },
    { title: 'Fees', items: FINANCE_ITEMS },
    { title: 'Money', items: MONEY_ITEMS },
    { title: 'Operations', items: OPERATIONS_ITEMS },
    { title: 'Reports', items: REPORTS_ITEMS },
    { title: 'System', items: SYSTEM_ITEMS },
  ]
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || can(role, it.perm)) }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className={cn(
      'border-r border-slate-200 bg-[#FAFAFA] flex flex-col py-3 shrink-0 transition-all duration-200',
      collapsed ? 'w-[68px]' : 'w-60'
    )}>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden">
        {groups.map((g, i) => (
          <div key={g.title}>
            {i > 0 && <div className="mx-3 my-3 h-px bg-slate-200" />}
            <NavSection title={g.title} items={g.items} collapsed={collapsed} />
          </div>
        ))}
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
