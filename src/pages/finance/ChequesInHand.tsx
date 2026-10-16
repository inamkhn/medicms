// ============================================
// MediCMS Desktop — Finance: Incoming cheques in hand (§8, §17, §18, §58)
// A cheque a student pays with is held, not counted: it sits on the
// cheques-in-hand system account until the bank honours it (§5, §8). This
// register is derived from the money books and never stored — each held payment
// plus what became of it. Clearing it posts the bank money-in (§17 "a cheque
// counts as money in only when it clears"); a bounce stands a reversal against
// the hold (§8, §34). The held total is the §18 figure "money held for others",
// never mistaken for income.
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatPKR, formatDate } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useMoneyStore } from '@/stores';
import {
  chequesInHandTotal,
  incomingChequeRows,
  nextActionNo,
  nextMoneyEntryNo,
  chequeClearedEntry,
  voidPaymentEntry,
  type IncomingChequeRow,
  type IncomingChequeStatus,
  type MoneyAccount,
} from '@/lib/finance';

/** §18: status is a word beside the colour, never colour alone (P4). */
const STATUS_VARIANT: Record<IncomingChequeStatus, BadgeVariant> = {
  'In hand': 'secondary',
  Cleared: 'cleared',
  Bounced: 'struckoff',
};

function StatusBadge({ status }: { status: IncomingChequeStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

// -------------------------------------------
// Clear (§8) — the one action that puts money into the bank
// -------------------------------------------
function ClearChequeDialog({ row, banks, onClose }: { row: IncomingChequeRow; banks: MoneyAccount[]; onClose: () => void }) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [clearDate, setClearDate] = useState(dayKey());
  const [reference, setReference] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const submit = () => {
    const state = useMoneyStore.getState();
    const entry = chequeClearedEntry(
      row.held,
      {
        bankAccountId: bankId,
        date: clearDate,
        reference: reference.trim() || undefined,
        createdBy: useAuthStore.getState().user?.name ?? 'Admin',
      },
      { entryNo: nextMoneyEntryNo(state.entries), actionNo: nextActionNo(state.entries), now: nowISO() },
    );
    const outcome = state.postEntries([entry], dayKey());
    if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); return; }
    useAuditStore.getState().addLog({
      user: useAuthStore.getState().user?.name ?? 'Admin',
      action: 'Finance Entry',
      details: `Cleared incoming cheque ${row.held.reference ?? row.held.linkedDoc ?? ''} dated ${clearDate} · ${formatPKR(row.held.amount)} into bank`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark cheque cleared</DialogTitle>
          <DialogDescription>
            The bank honours it, so {formatPKR(row.held.amount)} becomes money in on the clearing date (§8, §17). The hold stays as history.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {banks.length === 0 ? (
            <p className="text-meta text-red-700">No bank or wallet account is set up to receive the clearing (§78.1).</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Bank account *</Label>
                <Select value={bankId} onValueChange={setBankId}>
                  <SelectTrigger><SelectValue placeholder="Choose bank" /></SelectTrigger>
                  <SelectContent>{banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Clearing date *</Label>
                  <Input type="date" value={clearDate} min={row.held.date} max={dayKey()} onChange={(e) => setClearDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Statement reference</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            </>
          )}
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={banks.length === 0 || !bankId}>Mark cleared</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------
// Bounce (§8) — reverses the hold, needs a reason
// -------------------------------------------
function BounceChequeDialog({ row, onClose }: { row: IncomingChequeRow; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const submit = () => {
    const state = useMoneyStore.getState();
    const entry = voidPaymentEntry(
      row.held,
      {
        date: dayKey(),
        reason: reason.trim(),
        createdBy: useAuthStore.getState().user?.name ?? 'Admin',
      },
      { entryNo: nextMoneyEntryNo(state.entries), actionNo: nextActionNo(state.entries), now: nowISO() },
    );
    const outcome = state.postEntries([entry], dayKey());
    if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); return; }
    useAuditStore.getState().addLog({
      user: useAuthStore.getState().user?.name ?? 'Admin',
      action: 'Finance Entry',
      details: `Bounced incoming cheque ${row.held.reference ?? ''} — ${reason.trim()}`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bounce cheque {row.held.reference ?? ''}</DialogTitle>
          <DialogDescription>
            The bank returned it unpaid. This stands a reversal against the hold, so the money never reaches an account and the receipt nets back out (§8, §34).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
              placeholder="Insufficient funds, signature mismatch, stopped…"
            />
          </div>
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Keep it</Button>
          <Button variant="destructive" onClick={submit} disabled={!reason.trim()}>Bounce cheque</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_FILTERS: (IncomingChequeStatus | 'All')[] = ['All', 'In hand', 'Cleared', 'Bounced'];

export default function ChequesInHand() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canCheque = can(role, 'finance.cheque');

  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);

  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [clearTarget, setClearTarget] = useState<IncomingChequeRow | null>(null);
  const [bounceTarget, setBounceTarget] = useState<IncomingChequeRow | null>(null);

  const banks = accounts.filter((a) => (a.type === 'bank' || a.type === 'wallet') && a.status === 'Active');
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  const allRows = incomingChequeRows(accounts, entries);
  const inHandTotal = chequesInHandTotal(allRows);
  const heldCount = allRows.filter((r) => r.status === 'In hand').length;
  const rows = statusFilter === 'All' ? allRows : allRows.filter((r) => r.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/accounts')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">Cheques in hand</h1>
            <p className="text-micro text-slate-500">Cheques received but not cleared — held, not counted as money in until they reach a bank (§17, §18).</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">In hand</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{heldCount} cheque{heldCount === 1 ? '' : 's'} · {formatPKR(inHandTotal)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Money held for others</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatPKR(inHandTotal)}</div>
          <p className="text-micro text-slate-400 mt-0.5">Never counted as income (§18).</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_FILTERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <span className="ml-auto text-micro text-slate-400">{formatPKR(inHandTotal)} still waiting to clear.</span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Held</TableHead>
                <TableHead>Cheque</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                {canCheque && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canCheque ? 7 : 6} className="text-center text-slate-400 py-6">
                    <Inbox size={16} className="mx-auto mb-1" />No incoming cheques match.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.held.id}>
                  <TableCell className="text-slate-500">{formatDate(r.held.date)}</TableCell>
                  <TableCell className="font-medium text-slate-900">{r.held.reference ?? '—'}</TableCell>
                  <TableCell className="text-slate-600">{r.held.payee ?? '—'}</TableCell>
                  <TableCell className="text-slate-500">{r.held.linkedDoc ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium">{formatPKR(r.held.amount)}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                    {r.status === 'Cleared' && r.cleared && (
                      <div className="text-micro text-slate-400 mt-0.5">Cleared {formatDate(r.cleared.date)} · {accountName(r.cleared.accountId)}</div>
                    )}
                    {r.status === 'Bounced' && r.reversed?.reason && (
                      <div className="text-micro text-slate-400 mt-0.5">{r.reversed.reason}</div>
                    )}
                  </TableCell>
                  {canCheque && (
                    <TableCell className="text-right">
                      {r.status === 'In hand' && (
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setClearTarget(r)}>Mark cleared</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-meta text-red-600" onClick={() => setBounceTarget(r)}>Bounce</Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {clearTarget && <ClearChequeDialog row={clearTarget} banks={banks} onClose={() => setClearTarget(null)} />}
      {bounceTarget && <BounceChequeDialog row={bounceTarget} onClose={() => setBounceTarget(null)} />}
    </div>
  );
}
