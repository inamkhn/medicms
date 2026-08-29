// ============================================
// MediCMS Desktop v4.0 - Add Bank Transaction
// Module 8, Screen 8.2 - Record deposit or withdrawal
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPKR } from '@/lib/utils';
import { useBankStore, getNextBankSno, useAuditStore, useAuthStore } from '@/stores';
import type { BankTransaction } from '@/types';

type TxnType = 'deposit' | 'withdrawal';

export default function AddBankTransaction() {
  const navigate = useNavigate();

  const [txnType, setTxnType] = useState<TxnType>('deposit');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [isPersonal, setIsPersonal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Last balance for preview — live store
  const bankTxs = useBankStore(s => s.transactions);
  const lastBalance = bankTxs.length > 0 ? bankTxs[bankTxs.length - 1].balance : 0;
  const numAmount = parseFloat(amount) || 0;
  const newBalance = txnType === 'deposit' ? lastBalance + numAmount : lastBalance - numAmount;

  const handleSave = () => {
    if (!amount || numAmount <= 0 || !date) return;
    setSaving(true);
    const nextSno = getNextBankSno(bankTxs);
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const tx: BankTransaction = {
      sno: nextSno,
      date,
      deposit: txnType === 'deposit' ? numAmount : 0,
      withdrawal: txnType === 'withdrawal' ? numAmount : 0,
      balance: newBalance,
      narration: narration.trim() || (txnType === 'deposit' ? 'Fee collection' : 'Withdrawal'),
      linkedExpenseId: null,
      isPersonal,
      synced: false,
    };
    useBankStore.getState().addTransaction(tx);
    useAuditStore.getState().addLog({ user: userName, action: 'Bank Entry', details: `${txnType} ${formatPKR(numAmount)} — ${tx.narration}${isPersonal ? ' (Personal)' : ''}` });
    setSaving(false);
    navigate('/bank');
  };

  return (
    <div className="w-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/bank')}>
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add Bank Transaction</h1>
          <p className="text-sm text-slate-500">Record a deposit or withdrawal</p>
        </div>
      </div>

      {/* Transaction Type */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setTxnType('deposit')}
          className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-colors ${
            txnType === 'deposit'
              ? 'border-green-500 bg-green-50/50'
              : 'border-slate-100/60 hover:border-slate-200'
          }`}
        >
          <ArrowDownCircle
            size={24}
            className={txnType === 'deposit' ? 'text-green-600' : 'text-slate-400'}
          />
          <div className="text-left">
            <div className={`font-medium ${txnType === 'deposit' ? 'text-green-700' : 'text-slate-600'}`}>
              Deposit
            </div>
            <div className="text-xs text-slate-500">Money into account</div>
          </div>
        </button>

        <button
          onClick={() => setTxnType('withdrawal')}
          className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-colors ${
            txnType === 'withdrawal'
              ? 'border-red-500 bg-red-50/50'
              : 'border-slate-100/60 hover:border-slate-200'
          }`}
        >
          <ArrowUpCircle
            size={24}
            className={txnType === 'withdrawal' ? 'text-red-600' : 'text-slate-400'}
          />
          <div className="text-left">
            <div className={`font-medium ${txnType === 'withdrawal' ? 'text-red-700' : 'text-slate-600'}`}>
              Withdrawal
            </div>
            <div className="text-xs text-slate-500">Money out of account</div>
          </div>
        </button>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Amount (PKR)</Label>
              <Input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
              />
            </div>
          </div>

          <div>
            <Label>Narration / Description</Label>
            <Input
              placeholder="e.g. Fee collection, Salary payment..."
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={isPersonal}
              onChange={(e) => setIsPersonal(e.target.checked)}
            />
            This is a personal / non-operational transaction
          </label>

          {isPersonal && (
            <div className="flex items-start gap-2 bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
              <Info size={16} className="shrink-0 mt-0.5" />
              <span>
                Personal transactions are excluded from expense matching and operational reports.
                Examples: director's personal withdrawals, transfers to personal accounts.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balance Preview */}
      {numAmount > 0 && (
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="py-4">
            <div className="text-sm font-medium text-blue-800 mb-2">Balance Preview</div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Current Balance</span>
                <div className="font-medium">{formatPKR(lastBalance)}</div>
              </div>
              <div>
                <span className="text-slate-500">
                  {txnType === 'deposit' ? 'Deposit' : 'Withdrawal'}
                </span>
                <div className={`font-medium ${txnType === 'deposit' ? 'text-green-600' : 'text-red-600'}`}>
                  {txnType === 'deposit' ? '+' : '−'}{formatPKR(numAmount)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">New Balance</span>
                <div className={`font-bold ${newBalance < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {formatPKR(newBalance)}
                </div>
              </div>
            </div>
            {newBalance < 0 && (
              <div className="mt-2 text-sm text-red-600">
                Warning: This will result in a negative balance!
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/bank')}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!amount || numAmount <= 0 || !date || saving}
        >
          {saving ? 'Saving...' : `Record ${txnType === 'deposit' ? 'Deposit' : 'Withdrawal'}`}
        </Button>
      </div>
    </div>
  );
}
