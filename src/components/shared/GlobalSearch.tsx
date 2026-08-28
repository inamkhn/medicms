// ============================================
// MediCMS Desktop v4.0 - Global Search (F3)
// ============================================

import { useState, useEffect, useRef } from 'react';
import { Search, X, User, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn, formatDate } from '@/lib/utils';
import { getSubCourseDef } from '@/lib/constants';
import { getStudentsWithBalance, MOCK_LEDGER } from '@/lib/mockData';
import { useStudentStore } from '@/stores';

interface SearchResult {
  type: 'student' | 'receipt';
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
}

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const storeStudents = useStudentStore((s) => s.students);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase();
    const students = getStudentsWithBalance(storeStudents).filter(s => 
      !s.isTestRecord && (
        s.name.toLowerCase().includes(q) ||
        s.sno.toString().includes(q) ||
        s.fatherName.toLowerCase().includes(q) ||
        (s.contact && s.contact.includes(q))
      )
    );

    const receipts = MOCK_LEDGER.filter(t => 
      t.receiptNo && t.receiptNo.toLowerCase().includes(q)
    );

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

    setResults([...studentResults, ...receiptResults]);
    setSelectedIndex(0);
  }, [query, storeStudents]);

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
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-slate-200/50 w-full max-w-xl overflow-hidden border border-slate-100/60">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100/60">
          <Search size={20} className="text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search students, SNO, receipt number, father name..."
            className="flex-1 text-lg outline-none text-slate-900 placeholder:text-slate-400 bg-transparent"
          />
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors rounded-full p-1 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            {results.map((result, index) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => handleSelect(result)}
                className={cn(
                  'w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors',
                  index === selectedIndex ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                )}
              >
                {result.type === 'student' ? (
                  <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                    <User size={15} className="text-blue-500" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center">
                    <Receipt size={15} className="text-slate-500" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-medium text-slate-900 text-sm">{result.title}</div>
                  <div className="text-xs text-slate-500">{result.subtitle}</div>
                </div>
                {result.badge && (
                  <span className={cn('text-xs font-medium', result.badgeColor)}>
                    {result.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Empty State */}
        {query && results.length === 0 && (
          <div className="p-10 text-center text-slate-400 text-sm">
            No results found for "{query}"
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-50/50 text-xs text-slate-400 border-t border-slate-100/40">
          <span>Esc to close</span>
          <span>Enter to open</span>
        </div>
      </div>
    </div>
  );
}
