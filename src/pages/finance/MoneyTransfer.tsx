// ============================================
// MediCMS Desktop — Finance: Transfer between accounts (§9, §58)
// A transfer moves money from one account to another; both sides are created
// together under one action number and neither is income or expense (§9). This
// screen is the "simple transfer" — petty-cash top-ups, bank-to-bank, wallet
// funding. The cash deposit is the same idea with a slip and a list of closed
// days, and lives on its own screen.
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { useAuditStore, useAuthStore, useMoneyStore } from '@/stores';
import {
  ACCOUNT_TYPE_LABELS,
  accountBalance,
  isSystemAccount,
  postTransfer,
  spendCheck,
} from '@/lib/finance';

export default function MoneyTransfer() {
  const navigate = useNavigate();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const closedMonths = useMoneyStore((s) => s.closedMonths);

  // Only hand-moveable accounts: system ones (§5) and Closed ones (§6.4) are out.
  const movable = accounts.filter((a) => a.status === 'Active' && !isSystemAccount(a));

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dayKey());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [messages, setMessages] = useState<string[]>([]);

  const from = movable.find((a) => a.id === fromId);
  const to = movable.find((a) => a.id === toId);
  const amt = parseInt(amount, 10) || 0;

  // A live overdraft hint (§6.3) — the pure postTransfer still has the final say.
  const preview = from && amt > 0 ? spendCheck(accounts, entries, from.id, amt) : {};

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const submit = () => {
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const result = postTransfer(
      { accounts, entries, closedMonths, now: nowISO() },
      {
        fromAccountId: fromId,
        toAccountId: toId,
        amount: amt,
        date,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        createdBy: userName,
      },
    );
    if (!result.ok) { setMessages(result.errors); return; }
    // The pair is one action; the store appends it all-or-nothing (§9, §7.1).
    const outcome = useMoneyStore.getState().postEntries(result.entries, dayKey());
    if (!outcome.ok) { setMessages(outcome.rejected.flatMap((r) => r.problems)); return; }
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Transfer ${formatPKR(amt)} · ${from?.name ?? fromId} → ${to?.name ?? toId}${reference.trim() ? ` · ${reference.trim()}` : ''}`,
    });
    navigate('/finance/accounts');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/accounts')}>
          <ArrowLeft size={14} />
        </Button>
        <div>
          <h1 className="text-section font-bold text-slate-900">Transfer between accounts</h1>
          <p className="text-micro text-slate-500">Both sides are created together — this is never income or expense (§9).</p>
        </div>
      </div>

      <Card className="max-w-xl">
        <CardHeader><CardTitle>Move money</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1.5">
              <Label>From *</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  {movable.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {ACCOUNT_TYPE_LABELS[a.type]}</SelectItem>)}
                </SelectContent>
              </Select>
              {from && <p className="text-micro text-slate-400">Balance {formatPKR(accountBalance(entries, from.id))}</p>}
            </div>
            <Button variant="outline" size="icon" className="mb-0.5 h-8 w-8" onClick={swap} title="Swap">
              <ArrowRight size={14} />
            </Button>
            <div className="space-y-1.5">
              <Label>To *</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  {movable.filter((a) => a.id !== fromId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {ACCOUNT_TYPE_LABELS[a.type]}</SelectItem>)}
                </SelectContent>
              </Select>
              {to && <p className="text-micro text-slate-400">Balance {formatPKR(accountBalance(entries, to.id))}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input num type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Whole rupees" invalid={!!preview.problem} />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {preview.problem && <p className="text-meta text-danger">{preview.problem}</p>}
          {preview.warning && <p className="text-meta text-amber-600">{preview.warning}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Slip, transfer no…" />
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          {messages.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {messages.map((m) => <p key={m}>{m}</p>)}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => navigate('/finance/accounts')}>Cancel</Button>
            <Button onClick={submit} disabled={!fromId || !toId || amt <= 0}>Transfer</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
