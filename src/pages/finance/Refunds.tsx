// ============================================
// MediCMS Desktop — Finance: Refunds (§8, §33, §79.7)
// A refund is money out to a student, categorised "Student refunds", paid with
// its own refund number (§33). The refund is started on the student side; here
// Finance records the payment — a numbered refund and its money-out entry in the
// chosen account, never retyped (§8, §79.7). It is not a cost: it returns money
// the student had already paid, so it sits outside the bill categories.
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { useAuditStore, useAuthStore, useLedgerStore, useMoneyStore, useSettingsStore, useStudentStore } from '@/stores';
import {
  ACCOUNT_TYPE_LABELS,
  nextActionNo,
  nextMoneyEntryNo,
  nextRefundNo,
  refundMoneyEntry,
  refundRows,
  type MoneyAccount,
} from '@/lib/finance';

// -------------------------------------------
// Pay a refund (§33) — money out, category "Student refunds"
// -------------------------------------------
function NewRefundDialog({ accounts, onClose }: { accounts: MoneyAccount[]; onClose: () => void }) {
  const storeStudents = useStudentStore((s) => s.students);
  const allEntries = useLedgerStore((s) => s.entries);
  const showTest = useSettingsStore((s) => s.showTestRecords);
  const students = useMemo(
    () => getStudentsWithBalanceLive(storeStudents, allEntries).filter((s) => showTest || !s.isTestRecord),
    [storeStudents, allEntries, showTest],
  );

  const [search, setSearch] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(dayKey());
  const [problems, setProblems] = useState<string[]>([]);

  const payable = accounts.filter((a) => a.status === 'Active' && a.type !== 'chequesInHand' && a.type !== 'issuedCheques');
  const chosen = payable.find((a) => a.id === accountId);

  const matches = search.trim().length >= 2
    ? students.filter((s) => `${s.name} ${s.sno}`.toLowerCase().includes(search.toLowerCase())).slice(0, 5)
    : [];

  const submit = () => {
    const state = useMoneyStore.getState();
    const amt = parseInt(amount, 10) || 0;
    const entry = refundMoneyEntry(
      {
        accountId,
        amount: amt,
        payee: payee.trim(),
        refundNo: nextRefundNo(state.entries),
        date,
        createdBy: useAuthStore.getState().user?.name ?? 'Admin',
      },
      { entryNo: nextMoneyEntryNo(state.entries), actionNo: nextActionNo(state.entries), now: nowISO() },
    );
    const outcome = state.postEntries([entry], dayKey());
    if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); return; }
    useAuditStore.getState().addLog({
      user: useAuthStore.getState().user?.name ?? 'Admin',
      action: 'Finance Entry',
      details: `Refund ${entry.linkedDoc} ${formatPKR(amt)} to ${payee.trim()} from ${chosen?.name ?? accountId}`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pay a refund</DialogTitle>
          <DialogDescription>Money out to a student under "Student refunds", with its own refund number (§33, §79.7). The refund itself is raised on the student side.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Student *</Label>
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPayee(e.target.value); }} placeholder="Search name or SNO…" />
            {matches.length > 0 && (
              <div className="space-y-1">
                {matches.map((s) => (
                  <button
                    key={s.sno}
                    type="button"
                    onClick={() => { setPayee(`${s.name} (SNO ${s.sno})`); setSearch(''); }}
                    className="block w-full rounded-control border border-hairline bg-panel px-2.5 py-1.5 text-left text-meta hover:bg-hairline-soft"
                  >
                    {s.name} (SNO {s.sno}) · {s.computedBalance < 0 ? `${formatPKR(-s.computedBalance)} credit` : formatPKR(s.computedBalance)} due
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input num type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Whole rupees" />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Paid from *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
              <SelectContent>
                {payable.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {ACCOUNT_TYPE_LABELS[a.type]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!payee.trim() || (parseInt(amount, 10) || 0) <= 0 || !accountId}>Pay refund</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Refunds() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canPay = can(role, 'finance.pay');

  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const [dialog, setDialog] = useState(false);

  // A refund may only be paid through a real account, exactly as money in picks one (§8).
  const payable = accounts.filter((a) => a.status === 'Active' && a.type !== 'chequesInHand' && a.type !== 'issuedCheques');
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  const rows = refundRows(entries);
  const total = rows.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/accounts')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">Refunds</h1>
            <p className="text-micro text-slate-500">Money out to a student under "Student refunds" — a refund is never a cost (§33).</p>
          </div>
        </div>
        {canPay && (
          <Button size="sm" className="h-7 text-meta" onClick={() => setDialog(true)}>
            <Plus size={12} className="mr-1.5" /> New refund
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Refunds paid</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{rows.length} · {formatPKR(total)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">This month</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatPKR(rows.filter((e) => e.date.startsWith(dayKey().slice(0, 7))).reduce((sum, e) => sum + e.amount, 0))}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Refund</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Paid from</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                    <Undo2 size={16} className="mx-auto mb-1" />No refunds paid yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium text-slate-900">{e.linkedDoc ?? '—'}</TableCell>
                  <TableCell className="text-slate-500">{formatDate(e.date)}</TableCell>
                  <TableCell className="text-slate-600">{e.payee ?? '—'}</TableCell>
                  <TableCell className="text-slate-500">{accountName(e.accountId)}</TableCell>
                  <TableCell className="text-right font-medium">{formatPKR(e.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dialog && <NewRefundDialog accounts={payable} onClose={() => setDialog(false)} />}
    </div>
  );
}
