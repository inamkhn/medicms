// ============================================
// MediCMS Desktop v4.0 - Tag Bank Withdrawals as Expenses
// Screen 7.3 - Link untagged bank withdrawals to expenses
// Prevents double-counting: withdrawal = expense, not both
// ============================================

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Link2, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MOCK_BANK } from '@/lib/mockData';
import { MOCK_EXPENSES } from '@/lib/mockData';
import { formatPKR, formatDate } from '@/lib/utils';
import { EXPENSE_CATEGORY_OPTIONS } from '@/lib/constants';

export default function TagBankWithdrawals() {
  const navigate = useNavigate();

  // Find withdrawals not linked to any expense
  const untaggedWithdrawals = useMemo(() => {
    return MOCK_BANK.filter(
      (t) => t.withdrawal > 0 && !t.linkedExpenseId && !t.isPersonal
    );
  }, []);

  // Expenses not linked to any bank transaction
  const unlinkedExpenses = useMemo(() => {
    return MOCK_EXPENSES.filter((e) => !e.bankTransactionId);
  }, []);

  const [selectedBank, setSelectedBank] = useState<number | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<string | null>(null);
  const [tagged, setTagged] = useState<{ bankSno: number; expenseId: string }[]>([]);
  const [markPersonal, setMarkPersonal] = useState<number[]>([]);

  const handleTag = () => {
    if (selectedBank !== null && selectedExpense !== null) {
      setTagged((prev) => [...prev, { bankSno: selectedBank, expenseId: selectedExpense }]);
      setSelectedBank(null);
      setSelectedExpense(null);
    }
  };

  const handleMarkPersonal = (sno: number) => {
    setMarkPersonal((prev) => [...prev, sno]);
  };

  const remainingUntagged = untaggedWithdrawals.filter(
    (t) => !tagged.some((tg) => tg.bankSno === t.sno) && !markPersonal.includes(t.sno)
  );

  const getCategoryLabel = (code: string) =>
    EXPENSE_CATEGORY_OPTIONS.find((c) => c.value === code)?.label ?? code;

  return (
    <div className="w-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/expenses')}>
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tag Bank Withdrawals</h1>
          <p className="text-sm text-slate-500">
            Link untagged bank withdrawals to expense records to prevent double-counting
          </p>
        </div>
      </div>

      {/* Warning Banner */}
      {remainingUntagged.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50/50 border border-amber-100 rounded-xl p-4">
          <AlertTriangle size={20} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-amber-800">
              {remainingUntagged.length} untagged withdrawal{remainingUntagged.length > 1 ? 's' : ''} found
            </div>
            <div className="text-sm text-amber-700 mt-1">
              Each untagged withdrawal appears as "missing money" in your accounts. Either link it to an
              existing expense record or mark it as personal/non-operational.
            </div>
          </div>
        </div>
      )}

      {/* Tagged Summary */}
      {tagged.length > 0 && (
        <Card className="border-emerald-100 bg-emerald-50/50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-green-700">
              <Check size={18} />
              <span className="font-medium">
                {tagged.length} withdrawal{tagged.length > 1 ? 's' : ''} tagged successfully
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Untagged Bank Withdrawals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Untagged Withdrawals</CardTitle>
            <CardDescription>
              Select a bank withdrawal to tag ({remainingUntagged.length} remaining)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {remainingUntagged.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Check size={32} className="mx-auto mb-2" />
                All withdrawals are tagged!
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {remainingUntagged.map((txn) => (
                  <button
                    key={txn.sno}
                    onClick={() => setSelectedBank(txn.sno)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selectedBank === txn.sno
                        ? 'border-blue-500 bg-blue-50/50'
                        : 'border-slate-100/60 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-red-600">
                        {formatPKR(txn.withdrawal)}
                      </span>
                      <span className="text-xs text-slate-400">#{txn.sno}</span>
                    </div>
                    <div className="text-sm text-slate-600 mt-1">{txn.narration}</div>
                    <div className="text-xs text-slate-400 mt-1">{formatDate(txn.date)}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Unlinked Expenses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unlinked Expenses</CardTitle>
            <CardDescription>
              Select an expense to link ({unlinkedExpenses.length} available)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unlinkedExpenses.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                No unlinked expenses found. You can create one from the Add Expense screen.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {unlinkedExpenses.map((exp) => (
                  <button
                    key={exp.id}
                    onClick={() => setSelectedExpense(exp.id)}
                    disabled={tagged.some((t) => t.expenseId === exp.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selectedExpense === exp.id
                        ? 'border-blue-500 bg-blue-50/50'
                        : tagged.some((t) => t.expenseId === exp.id)
                          ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                          : 'border-slate-100/60 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900">
                        {formatPKR(exp.amount)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {getCategoryLabel(exp.category)}
                      </Badge>
                    </div>
                    <div className="text-sm text-slate-600 mt-1">{exp.details}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {formatDate(exp.date)} · {exp.givenBy}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      {selectedBank !== null && selectedExpense !== null && (
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                Link withdrawal <strong>#{selectedBank}</strong> to expense{' '}
                <strong>{selectedExpense}</strong>?
              </div>
              <Button onClick={handleTag}>
                <Link2 size={16} className="mr-1" />
                Tag Together
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mark as Personal */}
      {selectedBank !== null && selectedExpense === null && (
        <Card className="border-slate-100/60">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                No matching expense? This withdrawal might be personal or non-operational.
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  handleMarkPersonal(selectedBank);
                  setSelectedBank(null);
                }}
              >
                Mark as Personal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Table */}
      {tagged.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tagged Pairs</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="pb-2">Bank #</th>
                  <th className="pb-2">Withdrawal</th>
                  <th className="pb-2">Expense</th>
                  <th className="pb-2">Category</th>
                  <th className="pb-2">Narration</th>
                </tr>
              </thead>
              <tbody>
                {tagged.map((tg) => {
                  const bank = MOCK_BANK.find((b) => b.sno === tg.bankSno);
                  const expense = MOCK_EXPENSES.find((e) => e.id === tg.expenseId);
                  return (
                    <tr key={`${tg.bankSno}-${tg.expenseId}`} className="border-b border-slate-100 last:border-0">
                      <td className="py-2">#{tg.bankSno}</td>
                      <td className="py-2 text-red-600 font-medium">
                        {bank ? formatPKR(bank.withdrawal) : '-'}
                      </td>
                      <td className="py-2">{tg.expenseId}</td>
                      <td className="py-2">
                        {expense ? (
                          <Badge variant="outline">{getCategoryLabel(expense.category)}</Badge>
                        ) : '-'}
                      </td>
                      <td className="py-2 text-slate-500">{bank?.narration ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Save */}
      {(tagged.length > 0 || markPersonal.length > 0) && (
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate('/expenses')}>
            Cancel
          </Button>
          <Button onClick={() => navigate('/expenses')}>
            Save {tagged.length + markPersonal.length} Changes
          </Button>
        </div>
      )}
    </div>
  );
}
