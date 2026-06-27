// ============================================
// MediCMS Desktop v4.0 - Expenses List (Screen 7.1)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Tag, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
import { MOCK_EXPENSES } from '@/lib/mockData';

export default function ExpensesList() {
  const navigate = useNavigate();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filteredExpenses = MOCK_EXPENSES.filter(e => {
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.givenBy.toLowerCase().includes(q) && !e.details.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
        <Button onClick={() => navigate('/expenses/add')}>
          <Plus size={16} className="mr-1" />
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
          placeholder="Search..."
          className="w-[200px]"
        />
      </div>

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
                </TableRow>
              );
            })}
            {filteredExpenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-500">
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
              Only {MOCK_EXPENSES.length} expenses recorded vs 24 bank withdrawals.
              Many expenses may be in bank narrations only.
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
