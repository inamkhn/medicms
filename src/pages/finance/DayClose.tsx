// ============================================
// MediCMS Desktop — Finance: Close the day (§33, §11)
// At the end of the day the counter staff count the drawer. The screen records
// what the system expected, what was counted and the difference, and — §11 —
// a count difference creates a Cash difference entry so the account always
// equals the physical count. The day is then closed against changes; only an
// Admin reopens it (§33.5, whose reopen screen is F7). It guards on
// payment.record: the counter closes their own day, the Accountant any (§33.2).
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatPKR, formatDate } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { useAuditStore, useAuthStore, useMoneyStore } from '@/stores';
import {
  accountBalance,
  nextActionNo,
  nextMoneyEntryNo,
  postDayClose,
} from '@/lib/finance';

/** The cleared balance of a counter at the end of `date` — expected cash (§33.3). */
function expectedThrough(entries: ReturnType<typeof useMoneyStore.getState>['entries'], accountId: string, date: string): number {
  return accountBalance(entries, accountId, date);
}

export default function DayClose() {
  const navigate = useNavigate();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const closedMonths = useMoneyStore((s) => s.closedMonths);
  const closedDays = useMoneyStore((s) => s.closedDays);

  const counters = accounts.filter((a) => a.type === 'counterCash' && a.status === 'Active');
  const [counterId, setCounterId] = useState(counters[0]?.id ?? '');
  const [date, setDate] = useState(dayKey());
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [messages, setMessages] = useState<string[]>([]);

  // Expected is shown live as the counter and date are chosen. It is the
  // balance through the day BEFORE the counted date — that day's receipts,
  // counted before the next morning's money moves (§33).
  const expected = useMemo(() => {
    if (!counterId) return 0;
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return expectedThrough(entries, counterId, d.toISOString().slice(0, 10));
  }, [counterId, date, entries]);

  const countedNum = parseInt(counted, 10);
  const difference = Number.isFinite(countedNum) ? countedNum - expected : 0;
  const alreadyClosed = closedDays.some((d) => d.date === date && d.accountId === counterId);

  const submit = () => {
    if (!counterId) { setMessages(['Choose the counter whose drawer was counted (§33).']); return; }
    if (!Number.isFinite(countedNum) || countedNum < 0) { setMessages(['Enter the counted cash in whole rupees (§33).']); return; }
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const state = useMoneyStore.getState();
    const out = postDayClose(
      { accounts, entries, closings: closedDays, closedMonths, today: dayKey() },
      { accountId: counterId, date, counted: countedNum, note, createdBy: userName },
      { entryNo: nextMoneyEntryNo(entries), actionNo: nextActionNo(entries), now: nowISO() },
    );
    if (out.errors.length) { setMessages(out.errors); return; }
    // The §11 entry (if any) and the closing record go together, all-or-nothing.
    if (out.entries.length) {
      const posted = state.postEntries(out.entries, dayKey());
      if (!posted.ok) { setMessages(posted.rejected.flatMap((r) => r.problems)); return; }
    }
    if (!state.saveDayClose(out.closing)) { setMessages(['That day is already closed for this counter (§33.5).']); return; }
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Day close ${date} · ${accounts.find((a) => a.id === counterId)?.name ?? counterId} · expected ${formatPKR(expected)}, counted ${formatPKR(countedNum)}${difference ? ` · diff ${formatPKR(difference)}` : ''}`,
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
          <h1 className="text-section font-bold text-slate-900">Close the day</h1>
          <p className="text-micro text-slate-500">Count the drawer; a difference makes a Cash difference entry so the account equals the count (§11).</p>
        </div>
      </div>

      {counters.length === 0 ? (
        <Card><CardContent className="py-6 text-center text-slate-500">
          There is no counter cash account to close — set one up first (§78.1).
        </CardContent></Card>
      ) : (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>Drawer count</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Counter *</Label>
                <Select value={counterId} onValueChange={setCounterId}>
                  <SelectTrigger><SelectValue placeholder="Choose counter" /></SelectTrigger>
                  <SelectContent>{counters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Day *</Label>
                <Input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-control bg-slate-50 border border-slate-100 p-3 text-center">
              <div>
                <div className="text-micro text-slate-500">Expected</div>
                <div className="font-semibold text-slate-900">{formatPKR(expected)}</div>
              </div>
              <div>
                <div className="text-micro text-slate-500">Counted</div>
                <div className="font-semibold text-slate-900">{Number.isFinite(countedNum) ? formatPKR(countedNum) : '—'}</div>
              </div>
              <div>
                <div className="text-micro text-slate-500">Difference</div>
                <div className={`font-semibold ${difference === 0 ? 'text-slate-900' : difference < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {Number.isFinite(countedNum) ? `${difference > 0 ? '+' : ''}${formatPKR(difference)}` : '—'}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Counted cash *</Label>
              <Input num type="text" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="Whole rupees" />
            </div>

            <div className="space-y-1.5">
              <Label>Note {difference !== 0 && <span className="text-red-500">*</span>}</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={difference !== 0 ? 'Why the drawer differs — required (§33.6)' : 'Optional when the count is even'} invalid={difference !== 0 && !note.trim()} />
            </div>

            {alreadyClosed && (
              <p className="text-meta text-amber-600">{formatDate(date)} is already closed for this counter — an Admin reopens it first (§33.5).</p>
            )}
            {messages.length > 0 && (
              <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
                {messages.map((m) => <p key={m}>{m}</p>)}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => navigate('/finance/accounts')}>Cancel</Button>
              <Button onClick={submit} disabled={alreadyClosed || !Number.isFinite(countedNum)}>Close day</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
