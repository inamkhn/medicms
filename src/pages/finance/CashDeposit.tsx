// ============================================
// MediCMS Desktop — Finance: Cash deposit to bank (§9, §58)
// After a day is closed, the counter's counted cash is available to deposit.
// The screen lists undeposited cash — each closed day with its counted amount,
// not yet deposited. The Accountant ticks the days, enters the slip number and
// the bank, and the amount defaults to the total ticked. A short deposit needs
// a note; the difference stays as cash in the counter (§9). It posts as a
// counter→bank transfer pair and marks the ticked days with the slip.
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import { formatPKR, formatDate } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { useAuditStore, useAuthStore, useMoneyStore } from '@/stores';
import {
  accountBalance,
  postCashDeposit,
  undepositedDayClosings,
} from '@/lib/finance';

export default function CashDeposit() {
  const navigate = useNavigate();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const closedMonths = useMoneyStore((s) => s.closedMonths);
  const closedDays = useMoneyStore((s) => s.closedDays);

  const counters = accounts.filter((a) => a.type === 'counterCash' && a.status === 'Active');
  const banks = accounts.filter((a) => a.type === 'bank' && a.status === 'Active');

  const [counterId, setCounterId] = useState(counters[0]?.id ?? '');
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [slipNo, setSlipNo] = useState('');
  const [date, setDate] = useState(dayKey());
  const [note, setNote] = useState('');
  const [messages, setMessages] = useState<string[]>([]);

  // The undeposited closed days for the chosen counter, newest first.
  const undeposited = useMemo(
    () => undepositedDayClosings(closedDays.filter((d) => d.accountId === counterId)).slice().reverse(),
    [closedDays, counterId],
  );
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    // Any manual amount edit is dropped: the total of the ticked days is the default (§9).
    setAmount('');
  };

  const [amount, setAmount] = useState('');
  const tickedTotal = undeposited.filter((d) => ticked.has(`${d.date}|${d.accountId}`)).reduce((s, d) => s + d.counted, 0);
  const depositAmount = amount ? (parseInt(amount, 10) || 0) : tickedTotal;

  const submit = () => {
    if (!counterId || !bankId) { setMessages(['Choose both the counter and the bank account (§9).']); return; }
    const selectedKeys = undeposited.filter((d) => ticked.has(`${d.date}|${d.accountId}`)).map((d) => `${d.date}|${d.accountId}`);
    if (!selectedKeys.length) { setMessages(['Tick at least one closed day to deposit (§9).']); return; }
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const result = postCashDeposit(
      { accounts, entries, closedMonths, now: nowISO() },
      {
        fromAccountId: counterId,
        bankAccountId: bankId,
        amount: depositAmount,
        date,
        slipNo: slipNo.trim(),
        daysTotal: tickedTotal,
        note: note.trim() || undefined,
        createdBy: userName,
      },
    );
    if (!result.ok) { setMessages(result.errors); return; }
    const outcome = useMoneyStore.getState().postEntries(result.entries, dayKey());
    if (!outcome.ok) { setMessages(outcome.rejected.flatMap((r) => r.problems)); return; }
    // Carry the slip onto the ticked days so they leave the undeposited list (§9).
    useMoneyStore.getState().markDaysDeposited(selectedKeys, slipNo.trim());
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Cash deposit ${formatPKR(depositAmount)} · slip ${slipNo.trim()} · ${selectedKeys.length} day(s)`,
    });
    navigate('/finance/accounts');
  };

  const counter = counters.find((a) => a.id === counterId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/accounts')}>
          <ArrowLeft size={14} />
        </Button>
        <div>
          <h1 className="text-section font-bold text-slate-900">Cash deposit to bank</h1>
          <p className="text-micro text-slate-500">Tick the closed days, add the slip number. A short deposit needs a note; the rest stays in the counter (§9).</p>
        </div>
      </div>

      {counters.length === 0 || banks.length === 0 ? (
        <Card><CardContent className="py-6 text-center text-slate-500">
          A deposit runs from a counter cash account to a bank account — set both up first (§78.1).
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Undeposited closed days</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Day</TableHead>
                    <TableHead>Counted</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {undeposited.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6">
                      Nothing waiting — every closed day for this counter is deposited (§9).
                    </TableCell></TableRow>
                  )}
                  {undeposited.map((d) => {
                    const key = `${d.date}|${d.accountId}`;
                    return (
                      <TableRow key={key}>
                        <TableCell><Checkbox checked={ticked.has(key)} onCheckedChange={() => toggle(key)} /></TableCell>
                        <TableCell>{formatDate(d.date)}</TableCell>
                        <TableCell className={d.difference !== 0 ? 'text-amber-600' : 'text-slate-500'}>
                          {d.difference === 0 ? 'even' : `${d.difference > 0 ? '+' : ''}${formatPKR(d.difference)}`}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatPKR(d.counted)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Deposit details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>From counter</Label>
                  <Select value={counterId} onValueChange={(v) => { setCounterId(v); setTicked(new Set()); setAmount(''); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{counters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {counter && <p className="text-micro text-slate-400">Cash on hand {formatPKR(accountBalance(entries, counter.id))}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>To bank *</Label>
                  <Select value={bankId} onValueChange={setBankId}>
                    <SelectTrigger><SelectValue placeholder="Choose bank" /></SelectTrigger>
                    <SelectContent>{banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Deposit slip no. *</Label>
                  <Input value={slipNo} onChange={(e) => setSlipNo(e.target.value)} placeholder="e.g. SLIP-0042" />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Amount to deposit</Label>
                <Input num type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(tickedTotal)} />
                <p className="text-micro text-slate-400">
                  Ticked days total {formatPKR(tickedTotal)}.{amount && depositAmount < tickedTotal ? ` Short by ${formatPKR(tickedTotal - depositAmount)} — a note is required (§9).` : ''}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Note</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required only for a short deposit" />
              </div>

              {messages.length > 0 && (
                <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
                  {messages.map((m) => <p key={m}>{m}</p>)}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => navigate('/finance/accounts')}>Cancel</Button>
                <Button onClick={submit} disabled={!slipNo.trim() || ticked.size === 0}>Deposit</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
