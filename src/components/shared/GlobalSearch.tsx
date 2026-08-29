// ============================================
// MediCMS Desktop v4.0 - Global Search (F3)
// ============================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, User, Receipt, UserPlus, CreditCard, FileText, Building2, History, LayoutDashboard, Users, Settings as SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn, formatDate } from '@/lib/utils';
import { getSubCourseDef } from '@/lib/constants';
import { getStudentsWithBalance } from '@/lib/mockData';
import { useStudentStore, useLedgerStore, useSettingsStore } from '@/stores';

interface SearchResult {
  type: 'student' | 'receipt' | 'action';
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
}

const ACTIONS: { id: string; label: string; subtitle: string; to: string; icon: any; shortcut?: string }[] = [
  { id: 'new-admission', label: 'New Admission', subtitle: 'Add a new student', to: '/admissions/new', icon: UserPlus, shortcut: 'Ctrl+N' },
  { id: 'record-payment', label: 'Record Payment', subtitle: 'Cash / Bank receipt', to: '/payments/record', icon: CreditCard, shortcut: 'Ctrl+P' },
  { id: 'bulk-demand', label: 'Bulk Fee Demand', subtitle: 'Promote batch', to: '/ledger/bulk-demand', icon: FileText },
  { id: 'students', label: 'Go to Students', subtitle: 'List & filters', to: '/students', icon: Users },
  { id: 'reports', label: 'Go to Reports', subtitle: '16 reports', to: '/reports', icon: FileText, shortcut: 'Ctrl+D' },
  { id: 'approvals', label: 'Go to Approvals', subtitle: 'Discount & adjustment queue', to: '/approvals', icon: History },
  { id: 'bank', label: 'Go to Bank', subtitle: 'Account & import', to: '/bank', icon: Building2 },
  { id: 'expenses', label: 'Go to Expenses', subtitle: 'Budget vs actual', to: '/expenses', icon: FileText },
  { id: 'dashboard', label: 'Go to Dashboard', subtitle: 'Live stats', to: '/dashboard', icon: LayoutDashboard },
  { id: 'settings', label: 'Go to Settings', subtitle: 'Receipt books & budgets', to: '/settings', icon: SettingsIcon },
];

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const storeStudents = useStudentStore((s) => s.students);
  const ledgerTransactions = useLedgerStore((s) => s.transactions);
  const showTestRecords = useSettingsStore((s) => s.showTestRecords);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredActions = useMemo(() => {
    if (!query.trim()) return ACTIONS.slice(0, 5);
    const q = query.toLowerCase();
    return ACTIONS.filter(a => `${a.label} ${a.subtitle} ${a.id}`.toLowerCase().includes(q)).slice(0, 5);
  }, [query]);

  useEffect(() => {
    if (!query.trim()) {
      const actionResults: SearchResult[] = filteredActions.map(a => ({
        type: 'action', id: a.id, title: a.label, subtitle: `${a.subtitle}${a.shortcut ? ` · ${a.shortcut}` : ''}`,
      }));
      setResults(actionResults);
      setSelectedIndex(0);
      return;
    }

    const q = query.toLowerCase();
    const students = getStudentsWithBalance(storeStudents).filter(s => {
      if (!showTestRecords && s.isTestRecord) return false;
      const { courseLabel, subLabel } = (() => {
        try { const d = getSubCourseDef(s.program); return { courseLabel: d.course.label, subLabel: d.sub.label }; } catch { return { courseLabel: '', subLabel: '' }; }
      })();
      const haystack = [
        s.name, s.sno.toString(), s.fatherName,
        s.contact ?? '', s.cnic ?? '', s.cnic?.replace(/\D/g,'') ?? '',
        s.address ?? '', s.domicile ?? '', s.emergencyContact ?? '',
        s.gender ?? '', courseLabel, subLabel, s.batch, s.session.toString(),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });

    const receipts = ledgerTransactions.filter(t => 
      t.receiptNo && t.receiptNo.toLowerCase().includes(q)
    );

    const actionResults: SearchResult[] = filteredActions.map(a => ({
      type: 'action', id: a.id, title: a.label, subtitle: `${a.subtitle}${a.shortcut ? ` · ${a.shortcut}` : ''}`,
    }));

    const studentResults: SearchResult[] = students.slice(0, 5).map(s => ({
      type: 'student',
      id: s.sno.toString(),
      title: `${s.name} (SNO:${s.sno})`,
      subtitle: `${getSubCourseDef(s.program).sub.label} · ${getSubCourseDef(s.program).course.label} · ${s.batch}`,
      badge: s.computedBalance > 0 ? `PKR ${s.computedBalance}` : 'Cleared',
      badgeColor: s.computedBalance > 0 ? 'text-amber-500' : 'text-emerald-500',
    }));

    const receiptResults: SearchResult[] = receipts.slice(0, 3).map(t => ({
      type: 'receipt',
      id: t.id,
      title: `Receipt ${t.receiptNo}`,
      subtitle: `PKR ${t.payment} · ${formatDate(t.date)}`,
    }));

    setResults([...actionResults, ...studentResults, ...receiptResults]);
    setSelectedIndex(0);
  }, [query, storeStudents, ledgerTransactions, showTestRecords, filteredActions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  const handleSelect = (result: SearchResult) => {
    if (result.type === 'student') {
      navigate(`/students/${result.id}`);
    } else if (result.type === 'receipt') {
      navigate('/payments/reprint');
    } else if (result.type === 'action') {
      const action = ACTIONS.find(a => a.id === result.id);
      if (action) navigate(action.to);
    }
    onClose();
  };

  const grouped = {
    actions: results.filter(r => r.type === 'action'),
    students: results.filter(r => r.type === 'student'),
    receipts: results.filter(r => r.type === 'receipt'),
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh]">
      <div className="bg-white rounded-xl shadow-2xl shadow-slate-900/10 w-full max-w-[560px] overflow-hidden border border-slate-200">
        {/* Search Input — desktop compact */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-slate-200">
          <Search size={14} className="text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search… (students, receipts)"
            className="flex-1 text-[13px] outline-none text-slate-900 placeholder:text-slate-400 bg-transparent"
          />
          <span className="hidden sm:inline text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">F3 / ⌘K</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-md">
            <X size={14} />
          </button>
        </div>

        {/* Results — grouped */}
        {results.length > 0 && (
          <div className="max-h-[380px] overflow-y-auto py-1">
            {grouped.actions.length > 0 && (
              <div className="px-2 py-1">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 py-1">Actions</div>
                {grouped.actions.map(result => {
                  const idx = results.indexOf(result);
                  const action = ACTIONS.find(a => a.id === result.id);
                  const Icon = action?.icon ?? FileText;
                  return (
                    <button key={`a-${result.id}`} onClick={() => handleSelect(result)} className={cn('w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left rounded-md transition-colors', idx === selectedIndex ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700')}>
                      <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', idx === selectedIndex ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}><Icon size={13} /></div>
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{result.title}</div><div className={cn('text-[11px] truncate', idx === selectedIndex ? 'text-blue-100' : 'text-slate-500')}>{result.subtitle}</div></div>
                      {action?.shortcut && <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', idx === selectedIndex ? 'bg-white/20 text-white border-white/20' : 'bg-slate-50 text-slate-400 border-slate-200')}>{action.shortcut}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {grouped.students.length > 0 && (
              <div className="px-2 py-1">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 py-1">Students</div>
                {grouped.students.map(result => {
                  const idx = results.indexOf(result);
                  return (
                    <button key={`s-${result.id}`} onClick={() => handleSelect(result)} className={cn('w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left rounded-md', idx === selectedIndex ? 'bg-blue-50' : 'hover:bg-slate-50')}>
                      <div className="w-6 h-6 bg-blue-50 rounded-full flex items-center justify-center"><User size={13} className="text-blue-600" /></div>
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-medium text-slate-900 truncate">{result.title}</div><div className="text-[11px] text-slate-500 truncate">{result.subtitle}</div></div>
                      {result.badge && <span className={cn('text-[11px] font-medium', result.badgeColor)}>{result.badge}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {grouped.receipts.length > 0 && (
              <div className="px-2 py-1">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 py-1">Receipts</div>
                {grouped.receipts.map(result => {
                  const idx = results.indexOf(result);
                  return (
                    <button key={`r-${result.id}`} onClick={() => handleSelect(result)} className={cn('w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left rounded-md', idx === selectedIndex ? 'bg-blue-50' : 'hover:bg-slate-50')}>
                      <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center"><Receipt size={13} className="text-slate-500" /></div>
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-medium text-slate-900">{result.title}</div><div className="text-[11px] text-slate-500">{result.subtitle}</div></div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {query && results.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-[13px]">
            No results found for "{query}"
          </div>
        )}
        {!query && results.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-slate-400">Try: <span className="bg-slate-100 px-1 py-0.5 rounded">pay</span> <span className="bg-slate-100 px-1 py-0.5 rounded">adm</span> <span className="bg-slate-100 px-1 py-0.5 rounded">reprint</span></div>
        )}

        {/* Footer — desktop 22px */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#F5F5F7] text-[11px] text-slate-500 border-t border-slate-200">
          <span className="flex items-center gap-3"><span>↑↓ Navigate</span><span>↵ Select</span></span>
          <span>Esc Close · F3 / ⌘K</span>
        </div>
      </div>
    </div>
  );
}
