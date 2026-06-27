// ============================================
// MediCMS Desktop v4.0 - Bank Account
// Module 8, Screen 8.1 - Bank ledger with deposit/withdrawal tracking
// ============================================

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, Link2, User, Building2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import { MOCK_BANK } from '@/lib/mockData';
import { formatPKR, formatDate } from '@/lib/utils';
import { BANK_INFO } from '@/lib/constants';

export default function BankAccount() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showPersonal, setShowPersonal] = useState(false);

  const filtered = useMemo(() => {
    let data = MOCK_BANK;
    if (!showPersonal) {
      data = data.filter((t) => !t.isPersonal);
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (t) =>
          t.narration.toLowerCase().includes(q) ||
          t.sno.toString().includes(q) ||
          t.date.includes(q)
      );
    }
    return data;
  }, [search, showPersonal]);

  // Summary calculations
  const totalDeposits = filtered.reduce((sum, t) => sum + t.deposit, 0);
  const totalWithdrawals = filtered.reduce((sum, t) => sum + t.withdrawal, 0);
  const currentBalance = filtered.length > 0 ? filtered[filtered.length - 1].balance : 0;
  const untaggedCount = filtered.filter(
    (t) => t.withdrawal > 0 && !t.linkedExpenseId && !t.isPersonal
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Bank Account</h1>
            <p className="text-sm text-slate-500">
              {BANK_INFO.name} — {BANK_INFO.branch} · A/C {BANK_INFO.accountNo}
            </p>
          </div>
        </div>
        <Button onClick={() => navigate('/bank/add')}>
          <Plus size={16} className="mr-1" />
          Add Transaction
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Current Balance</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{formatPKR(currentBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Total Deposits</div>
            <div className="text-xl font-bold text-green-600 mt-1">{formatPKR(totalDeposits)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Total Withdrawals</div>
            <div className="text-xl font-bold text-red-600 mt-1">{formatPKR(totalWithdrawals)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Untagged Withdrawals</div>
            <div className={`text-xl font-bold mt-1 ${untaggedCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {untaggedCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Untagged Warning */}
      {untaggedCount > 0 && (
        <div className="flex items-center justify-between bg-amber-50/50 border border-amber-100 rounded-xl p-3">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle size={16} />
            <span className="text-sm">
              {untaggedCount} withdrawal{untaggedCount > 1 ? 's' : ''} not linked to any expense — may cause double-counting
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/expenses/tag-from-bank')}>
            Tag Now
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search by narration, #, or date..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showPersonal}
            onChange={(e) => setShowPersonal(e.target.checked)}
          />
          Show personal transactions
        </label>
      </div>

      {/* Bank Ledger Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead className="text-right">Deposit</TableHead>
                <TableHead className="text-right">Withdrawal</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((txn) => (
                <TableRow key={txn.sno} className={txn.isPersonal ? 'bg-slate-50/50' : ''}>
                  <TableCell className="font-medium text-slate-500">{txn.sno}</TableCell>
                  <TableCell>{formatDate(txn.date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {txn.isPersonal && <User size={14} className="text-slate-400" />}
                      {txn.narration}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {txn.deposit > 0 ? (
                      <span className="text-green-600 font-medium">{formatPKR(txn.deposit)}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {txn.withdrawal > 0 ? (
                      <span className="text-red-600 font-medium">{formatPKR(txn.withdrawal)}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatPKR(txn.balance)}</TableCell>
                  <TableCell>
                    {txn.isPersonal ? (
                      <Badge variant="outline" className="text-slate-500 border-slate-100">
                        <User size={12} className="mr-1" />
                        Personal
                      </Badge>
                    ) : txn.withdrawal > 0 && txn.linkedExpenseId ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-100 bg-emerald-50">
                        <Link2 size={12} className="mr-1" />
                        Tagged
                      </Badge>
                    ) : txn.withdrawal > 0 ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-100 bg-amber-50">
                        <AlertTriangle size={12} className="mr-1" />
                        Untagged
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-blue-600 border-blue-100 bg-blue-50">
                        <Building2 size={12} className="mr-1" />
                        Deposit
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
