// ============================================
// MediCMS Desktop v4.0 - Expenses List (Screen 7.1)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Tag, AlertTriangle, Paperclip, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EXPENSE_CATEGORY_OPTIONS } from '@/lib/constants';
import { formatPKR, formatDate } from '@/lib/utils';
import { useExpenseStore, useBankStore, useBudgetStore } from '@/stores';

export default function ExpensesList() {
  const navigate = useNavigate();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const expenses = useExpenseStore(s => s.expenses);
  const bankTxs = useBankStore(s => s.transactions);

  const filteredExpenses = expenses.filter(e => {
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [e.givenBy, e.details, e.category, EXPENSE_CATEGORY_OPTIONS.find(c=>c.value===e.category)?.label ?? '', e.amount.toString(), e.date].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const bankWithdrawals = bankTxs.filter(t => t.withdrawal > 0 && !t.isPersonal).length;

  // Budget vs Actual for current month
  const currentMonth = new Date().toISOString().slice(0,7);
  const budgets = useBudgetStore(s => s.budgets);
  const budgetForCategory = (cat: string) => budgets.find(b => b.category === cat && b.month === currentMonth)?.amount ?? 0;
  const actualForCategory = (cat: string) => expenses.filter(e => e.category === cat && e.date.startsWith(currentMonth)).reduce((s,e)=>s+e.amount,0);
  const totalBudget = budgets.filter(b => b.month === currentMonth).reduce((s,b)=>s+b.amount,0);
  const totalActual = expenses.filter(e => e.date.startsWith(currentMonth)).reduce((s,e)=>s+e.amount,0);

  return (
    <div className="space-y-3">
      {/* Header — compact */}
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-bold text-slate-900">Expenses</h1>
        <Button size="sm" className="h-7 text-[12px]" onClick={() => navigate('/expenses/add')}>
          <Plus size={12} className="mr-1.5" />
          Add Expense
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {EXPENSE_CATEGORY_OPTIONS.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search category, givenBy, details, amount, date..."
          className="w-[260px]"
        />
        <Button variant="outline" size="sm" onClick={() => {
          const header = ['ID','Category','Amount','Date','Time','GivenBy','Details','BankLink'];
          const rows = filteredExpenses.map(e => [e.id, EXPENSE_CATEGORY_OPTIONS.find(c=>c.value===e.category)?.label ?? e.category, e.amount, e.date, e.time, e.givenBy, e.details, e.bankTransactionId ?? 'Petty Cash']);
          const csv = [header, ...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
          const blob = new Blob([csv], { type:'text/csv' }); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`expenses-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
        }}>Export CSV</Button>
      </div>

      {/* Budget vs Actual */}
      <Card className="border-blue-100 bg-blue-50/30">
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2"><TrendingUp size={14} /> Budget vs Actual — {currentMonth} <span className="ml-auto text-xs font-normal text-slate-500">{formatPKR(totalActual)} / {formatPKR(totalBudget)} {totalBudget>0 ? `(${Math.round(totalActual/totalBudget*100)}%)` : ''}</span></CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {EXPENSE_CATEGORY_OPTIONS.slice(0,8).map(cat => {
              const bud = budgetForCategory(cat.value);
              const act = actualForCategory(cat.value);
              if (bud===0 && act===0) return null;
              const pct = bud>0 ? Math.round(act/bud*100) : 0;
              return (
                <div key={cat.value} className="bg-white rounded-lg p-2 border border-slate-100">
                  <div className="font-medium text-slate-700">{cat.label}</div>
                  <div className="flex justify-between mt-1"><span className={act>bud && bud>0 ? 'text-red-600' : 'text-slate-600'}>{formatPKR(act)}</span><span className="text-slate-400">/ {bud ? formatPKR(bud) : '—'}</span></div>
                  {bud>0 && <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${pct>100?'bg-red-500': pct>80?'bg-amber-500':'bg-emerald-500'}`} style={{width: `${Math.min(100,pct)}%`}} /></div>}
                </div>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" className="mt-3 h-7 text-xs" onClick={() => navigate('/settings')}>Manage budgets in Settings →</Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">ID</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Given By</TableHead>
              <TableHead>Bank Link</TableHead>
              <TableHead>Bill</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredExpenses.map(expense => {
              const catLabel = EXPENSE_CATEGORY_OPTIONS.find(c => c.value === expense.category)?.label ?? expense.category;
              return (
                <TableRow key={expense.id}>
                  <TableCell className="font-medium">{expense.id.replace('exp-', '')}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{catLabel}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatPKR(expense.amount)}</TableCell>
                  <TableCell>{formatDate(expense.date)}</TableCell>
                  <TableCell>{expense.givenBy}</TableCell>
                  <TableCell>
                    {expense.bankTransactionId ? (
                      <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100">
                        Bank #{expense.bankTransactionId}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">Petty Cash</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {expense.billUrl ? (
                      <a href={expense.billUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <Paperclip size={12} /> View
                      </a>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredExpenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                  No expenses found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="p-4 border-t border-slate-100 flex justify-between text-sm">
          <span className="text-slate-500">Showing {filteredExpenses.length} records</span>
          <span className="font-medium">Total: {formatPKR(total)}</span>
        </div>
      </Card>

      {/* Warning banner */}
      <Card className="border-amber-100 bg-amber-50/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">
              {expenses.length} expenses recorded vs {bankWithdrawals} bank withdrawals.
              {bankWithdrawals > expenses.length ? ' Many expenses may be in bank narrations only.' : ' Reconciled.'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => navigate('/expenses/tag-from-bank')}
          >
            <Tag size={14} className="mr-1" />
            Tag bank withdrawals as expenses →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
