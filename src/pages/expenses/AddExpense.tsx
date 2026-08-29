// ============================================
// MediCMS Desktop v4.0 - Add Expense (Screen 7.2)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EXPENSE_CATEGORY_OPTIONS, BANK_INFO } from '@/lib/constants';
import { useExpenseStore, useBankStore, getNextBankSno, useAuditStore, useAuthStore } from '@/stores';
import { formatPKR } from '@/lib/utils';
import type { Expense, BankTransaction } from '@/types';

export default function AddExpense() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('10:30');
  const [givenBy, setGivenBy] = useState('');
  const [details, setDetails] = useState('');
  const [paidFrom, setPaidFrom] = useState<'petty' | 'bank'>('bank');
  const [bankNarration, setBankNarration] = useState('');
  const [billUrl, setBillUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleBillChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Only images allowed'); return; }
    if (file.size > 3 * 1024 * 1024) { alert('Max 3MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setBillUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!category || !amount) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;
    setLoading(true);
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const expId = `exp-${Date.now()}`;
    let bankTxId: string | null = null;
    if (paidFrom === 'bank') {
      const bankTxs = useBankStore.getState().transactions;
      const nextSno = getNextBankSno(bankTxs);
      const lastBalance = bankTxs.length ? bankTxs[bankTxs.length - 1].balance : 0;
      const bankTx: BankTransaction = {
        sno: nextSno,
        date,
        deposit: 0,
        withdrawal: numAmount,
        balance: lastBalance - numAmount,
        narration: bankNarration.trim() || `${EXPENSE_CATEGORY_OPTIONS.find(c=>c.value===category)?.label ?? category} — ${details.trim() || 'Expense'} · ${givenBy.trim() || userName}`,
        linkedExpenseId: expId,
        isPersonal: false,
        synced: false,
      };
      useBankStore.getState().addTransaction(bankTx);
      bankTxId = String(nextSno);
    }
    const expense: Expense = {
      id: expId,
      category: category as any,
      amount: numAmount,
      date,
      time,
      givenBy: givenBy.trim() || userName,
      details: details.trim() || EXPENSE_CATEGORY_OPTIONS.find(c=>c.value===category)?.label || category,
      bankTransactionId: bankTxId,
      billUrl: billUrl || null,
      synced: false,
    };
    useExpenseStore.getState().addExpense(expense);
    useAuditStore.getState().addLog({ user: userName, action: 'Expense Added', details: `${EXPENSE_CATEGORY_OPTIONS.find(c=>c.value===category)?.label ?? category} ${formatPKR(numAmount)} · ${givenBy.trim() || userName}${bankTxId ? ` · Bank #${bankTxId} ${BANK_INFO.accountNo}` : ' · Petty Cash'} — ${details.trim() || ''}` });
    setLoading(false);
    navigate('/expenses');
  };

  return (
    <div className="w-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">Add Expense</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORY_OPTIONS.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Amount (PKR) *</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <Label>Given By</Label>
              <Input
                value={givenBy}
                onChange={(e) => setGivenBy(e.target.value)}
                placeholder="Director, Admin, M.Sharif..."
              />
            </div>
          </div>

          <div>
            <Label>Details</Label>
            <Input
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Additional details"
            />
          </div>

          <div>
            <Label>Bill / Receipt Photo</Label>
            <div className="flex items-start gap-4 mt-2">
              <div className="w-24 h-28 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                {billUrl ? <img src={billUrl} alt="Bill" className="w-full h-full object-cover" /> : <ImageIcon size={20} className="text-slate-300" />}
              </div>
              <div className="flex-1 space-y-2">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Upload size={14} /> Upload Bill
                  <input type="file" accept="image/*" className="hidden" onChange={handleBillChange} />
                </label>
                {billUrl && <button type="button" onClick={() => setBillUrl(null)} className="inline-flex items-center gap-1 text-xs text-red-500 ml-2"><X size={12} /> Remove</button>}
                <p className="text-xs text-slate-400">JPG/PNG max 3MB — printed on voucher, shown in list</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paid From */}
      <Card>
        <CardHeader>
          <CardTitle>Paid From</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={paidFrom === 'petty'}
                onChange={() => setPaidFrom('petty')}
                className="accent-blue-500"
              />
              <span className="text-sm">Petty Cash (not linked to bank)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={paidFrom === 'bank'}
                onChange={() => setPaidFrom('bank')}
                className="accent-blue-500"
              />
              <span className="text-sm">Bank Account (auto-creates bank withdrawal)</span>
            </label>
          </div>

          {paidFrom === 'bank' && (
            <div className="space-y-3">
              <div>
                <Label>Bank Narration</Label>
                <Input
                  value={bankNarration}
                  onChange={(e) => setBankNarration(e.target.value)}
                  placeholder="Narration for bank record"
                />
              </div>
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
                ⓘ This automatically creates a LINKED bank withdrawal entry.
                You do NOT need to enter it separately in Bank Account.
                This prevents double-counting in reports.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading || !category || !amount}>
          {loading ? 'Saving...' : '💾 Save Expense'}
        </Button>
      </div>
    </div>
  );
}
