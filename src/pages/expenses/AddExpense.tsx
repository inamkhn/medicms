// ============================================
// MediCMS Desktop v4.0 - Add Expense (Screen 7.2)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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
import { EXPENSE_CATEGORY_OPTIONS } from '@/lib/constants';

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
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!category || !amount) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
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
