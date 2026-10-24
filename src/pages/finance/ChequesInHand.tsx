// ============================================
// MediCMS Desktop — Finance: Incoming cheque register (§34, §35, §36, §58)
// A cheque a student pays with is held, not counted: it sits on the
// cheques-in-hand system account until the bank honours it (§5, §8). Its life
// is Received -> Deposited -> Cleared, or a reversal that returns the dues: a
// Bounced cheque (the bank refused it, optional fine added) or a cheque Returned
// to the student before deposit (§34). This register is derived from the money
// books and never stored — each held payment plus what became of it — so the
// held total is the §18 figure "money held for others", never mistaken for income.
// ============================================

import { useMemo, useState } from 'react';
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
import { addDays, thisMonthKey } from '@/lib/dates';
import { nowISO, todayISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import { entryId, entryProblems } from '@/lib/ledger';
import { toastSuccess } from '@/lib/toast';
import {
  useAuditStore, useAuthStore, useLedgerStore, useMoneyStore, useReceiptBookStore, useStudentStore,
} from '@/stores';
import {
  chequesInHandTotal,
  clearedChequesThisMonth,
  incomingChequeRows,
  nextActionNo,
  nextMoneyEntryNo,
  chequeClearedEntry,
  voidPaymentEntry,
  type IncomingChequeRow,
  type IncomingChequeStatus,
  type MoneyAccount,
} from '@/lib/finance';
import type { LedgerEntry } from '@/types';

/** §34: status is a word beside the colour, never colour alone (P4). */
const STATUS_VARIANT: Record<IncomingChequeStatus, BadgeVariant> = {
  Received: 'secondary',
  Deposited: 'outline',
  Cleared: 'cleared',
  Bounced: 'struckoff',
  Returned: 'danger',
};

function StatusBadge({ status }: { status: IncomingChequeStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

/** Whole days a cheque has been held for, floored at zero. */
function ageDays(fromDate: string, today: string): number {
  const a = new Date(`${fromDate}T12:00:00Z`).getTime();
  const b = new Date(`${today}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

const IN_HAND: ReadonlySet<IncomingChequeStatus> = new Set(['Received', 'Deposited']);

// -------------------------------------------
// Deposit (§34) — sends a Received cheque to the bank, posts no money
// -------------------------------------------
function DepositChequeDialog({ row, banks, onClose }: { row: IncomingChequeRow; banks: MoneyAccount[]; onClose: () => void }) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [date, setDate] = useState(todayISO());
  const [reference, setReference] = useState('');
  const today = todayISO();
  // Post-dated (§34): a cheque is not deposit-able before its own date.
  const earliest = row.held.instrumentDate && row.held.instrumentDate > row.held.date ? row.held.instrumentDate : row.held.date;

  const submit = () => {
    useMoneyStore.getState().markChequeDeposited({
      heldId: row.held.id,
      bankAccountId: bankId,
      date,
      reference: reference.trim() || undefined,
    });
    useAuditStore.getState().addLog({
      user: useAuthStore.getState().user?.name ?? 'Admin',
      action: 'Finance Entry',
      details: `Deposited incoming cheque ${row.held.reference ?? row.held.linkedDoc ?? ''} on ${date} · ${formatPKR(row.held.amount)} — pending clearance`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark cheque deposited</DialogTitle>
          <DialogDescription>
            The cheque goes to the bank for clearing. No money moves yet — it counts only once it clears (§34, §35).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {banks.length === 0 ? (
            <p className="text-meta text-red-700">No bank or wallet account is set up to receive the deposit (§78.1).</p>
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
                  <Label>Deposit date *</Label>
                  <Input type="date" value={date} min={earliest} max={today} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Slip / batch</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={banks.length === 0 || !bankId || date < earliest}>Mark deposited</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------
// Clear (§8, §35) — the one action that puts money into the bank
// -------------------------------------------
function ClearChequeDialog({ row, onClose }: { row: IncomingChequeRow; onClose: () => void }) {
  const today = todayISO();
  const banks = useMoneyStore((s) => s.accounts).filter((a) => (a.type === 'bank' || a.type === 'wallet') && a.status === 'Active');
  // The deposit already named the bank (§34); a wallet fallback keeps it usable.
  const bankId = row.deposit?.bankAccountId ?? banks[0]?.id ?? '';
  const bankName = useMoneyStore((s) => s.accounts).find((a) => a.id === bankId)?.name ?? '—';
  const [clearDate, setClearDate] = useState(today);
  const [reference, setReference] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const earliest = row.deposit?.date ?? row.held.date;

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
    const outcome = state.postEntries([entry], today);
    if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); return; }
    useAuditStore.getState().addLog({
      user: useAuthStore.getState().user?.name ?? 'Admin',
      action: 'Finance Entry',
      details: `Cleared incoming cheque ${row.held.reference ?? row.held.linkedDoc ?? ''} dated ${clearDate} · ${formatPKR(row.held.amount)} into ${bankName}`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark cheque cleared</DialogTitle>
          <DialogDescription>
            The bank honours it, so {formatPKR(row.held.amount)} becomes money in on the clearing date (§8, §35) — into {bankName}. The student's pending cheque flag lifts.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!bankId ? (
            <p className="text-meta text-red-700">No bank or wallet account is set up to receive the clearing (§78.1).</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Clearing date *</Label>
                <Input type="date" value={clearDate} min={earliest} max={today} onChange={(e) => setClearDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Statement reference</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          )}
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!bankId || clearDate < earliest}>Mark cleared</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------
// Bounce (§35, §58) — reverses the hold, optional fine from Settings
// -------------------------------------------
function BounceChequeDialog({ row, onClose }: { row: IncomingChequeRow; onClose: () => void }) {
  const fineDefault = useReceiptBookStore((s) => s.paymentSettings.bounceFine);
  const [reason, setReason] = useState('');
  const [fine, setFine] = useState(String(fineDefault));
  const [problems, setProblems] = useState<string[]>([]);

  const submit = () => {
    const today = todayISO();
    const state = useMoneyStore.getState();
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const sno = row.held.studentSno;

    // Reversal first — dated before the fine so both share the bounce day (§34).
    const reversal = {
      ...voidPaymentEntry(
        row.held,
        { date: today, reason: reason.trim(), createdBy: userName },
        { entryNo: nextMoneyEntryNo(state.entries), actionNo: nextActionNo(state.entries), now: nowISO() },
      ),
      outcome: 'Bounced' as const,
    };

    // §35/§58: the fine is a SpecialCharge on the student's ledger, added only
    // when a fine is set and the student is known. Validate it before posting so
    // a refused fine leaves every book untouched.
    const fineAmount = Math.max(0, Math.round(parseFloat(fine) || 0));
    let fineEntry: LedgerEntry | null = null;
    if (fineAmount > 0 && sno != null) {
      const ledger = useLedgerStore.getState();
      const entryNo = ledger.nextEntryNo(sno);
      fineEntry = {
        id: entryId(sno, entryNo),
        studentSno: sno,
        entryNo,
        date: today,
        type: 'SpecialCharge',
        amount: fineAmount,
        description: `Cheque bounce fine — ${row.held.reference ?? row.held.linkedDoc ?? 'cheque'}`,
        dueDate: addDays(today, 15),
        createdBy: userName,
        createdAt: nowISO(),
        balanceAfter: 0,
      };
      const bumps = entryProblems(fineEntry, { today, all: [...ledger.entries, fineEntry] });
      if (bumps.length) { setProblems(bumps); return; }
    }

    const outcome = state.postEntries([reversal], today);
    if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); return; }
    if (fineEntry) {
      const fineOutcome = useLedgerStore.getState().postEntries([fineEntry], today);
      if (!fineOutcome.ok) { setProblems(fineOutcome.rejected.flatMap((r) => r.problems)); return; }
    }

    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Bounced incoming cheque ${row.held.reference ?? ''} — ${reason.trim()}${fineEntry ? ` · fine ${formatPKR(fineEntry.amount)}` : ''}`,
    });
    toastSuccess({
      title: 'Cheque bounced',
      description: `The payment is reversed and the dues return${fineEntry ? `; a ${formatPKR(fineEntry.amount)} fine was added` : ''}.`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bounce cheque {row.held.reference ?? ''}</DialogTitle>
          <DialogDescription>
            The bank returned it unpaid. This reverses the payment so the dues return, and adds a bounce fine if one is set (§35, §58).
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
          <div className="space-y-1.5">
            <Label>Bounce fine</Label>
            <Input type="number" min={0} value={fine} onChange={(e) => setFine(e.target.value)} />
            <p className="text-micro text-ink-subtle">
              Added as a special charge when above zero (default from Settings, §65){row.held.studentSno == null ? ' — no student linked, so no fine is posted' : ''}.
            </p>
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

// -------------------------------------------
// Return to student (§34, §35) — the bounce reversal without a fine
// -------------------------------------------
function ReturnChequeDialog({ row, onClose }: { row: IncomingChequeRow; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const submit = () => {
    const state = useMoneyStore.getState();
    const reversal = {
      ...voidPaymentEntry(
        row.held,
        { date: todayISO(), reason: reason.trim(), createdBy: useAuthStore.getState().user?.name ?? 'Admin' },
        { entryNo: nextMoneyEntryNo(state.entries), actionNo: nextActionNo(state.entries), now: nowISO() },
      ),
      outcome: 'Returned' as const,
    };
    const outcome = state.postEntries([reversal], todayISO());
    if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); return; }
    useAuditStore.getState().addLog({
      user: useAuthStore.getState().user?.name ?? 'Admin',
      action: 'Finance Entry',
      details: `Returned incoming cheque ${row.held.reference ?? ''} to the student — ${reason.trim()}`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Return cheque to student</DialogTitle>
          <DialogDescription>
            The cheque is handed back before it was deposited. This is the bounce reversal without a fine — the payment is reversed and the dues return (§34, §35).
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
              placeholder="Wrong amount, student took it back…"
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
          <Button variant="destructive" onClick={submit} disabled={!reason.trim()}>Return to student</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------
// The register (§58)
// -------------------------------------------
const STATUS_FILTERS: (IncomingChequeStatus | 'All')[] = ['All', 'Received', 'Deposited', 'Cleared', 'Bounced', 'Returned'];

export default function ChequesInHand() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canCheque = can(role, 'finance.cheque');

  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const deposits = useMoneyStore((s) => s.chequeDeposits);
  const students = useStudentStore((s) => s.students);

  const today = todayISO();
  const month = thisMonthKey();

  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [bankFilter, setBankFilter] = useState<string>('All');
  const [postDatedOnly, setPostDatedOnly] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [depositTarget, setDepositTarget] = useState<IncomingChequeRow | null>(null);
  const [clearTarget, setClearTarget] = useState<IncomingChequeRow | null>(null);
  const [bounceTarget, setBounceTarget] = useState<IncomingChequeRow | null>(null);
  const [returnTarget, setReturnTarget] = useState<IncomingChequeRow | null>(null);

  const banks = accounts.filter((a) => (a.type === 'bank' || a.type === 'wallet') && a.status === 'Active');
  const studentName = (sno?: number, fallback?: string) =>
    (sno != null ? students.find((s) => s.sno === sno)?.name : undefined) ?? fallback ?? '—';

  const allRows = useMemo(() => incomingChequeRows(accounts, entries, deposits), [accounts, entries, deposits]);
  const inHandTotal = chequesInHandTotal(allRows);
  const inHandCount = allRows.filter((r) => IN_HAND.has(r.status)).length;
  const clearedMonth = clearedChequesThisMonth(allRows, month);

  // §34: a cheque is post-dated when the date written on it is still ahead.
  const isPostDated = (r: IncomingChequeRow) => !!r.held.instrumentDate && r.held.instrumentDate > today;
  // Ready to deposit (§58): Received, not post-dated, and held since a prior day.
  const isReadyToDeposit = (r: IncomingChequeRow) => r.status === 'Received' && !isPostDated(r) && r.held.date < today;

  const bankOptions = Array.from(new Set(allRows.map((r) => r.held.instrumentBank).filter((b): b is string => !!b))).sort();

  const rows = allRows.filter((r) => {
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (bankFilter !== 'All' && r.held.instrumentBank !== bankFilter) return false;
    if (postDatedOnly && !isPostDated(r)) return false;
    if (readyOnly && !isReadyToDeposit(r)) return false;
    return true;
  });

  const columns = canCheque ? 9 : 8;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/accounts')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">Cheques</h1>
            <p className="text-micro text-slate-500">Received, deposited, cleared, bounced or returned — a cheque counts as money in only when the bank clears it (§34, §35).</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">In hand</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{inHandCount} cheque{inHandCount === 1 ? '' : 's'} · {formatPKR(inHandTotal)}</div>
          <p className="text-micro text-slate-400 mt-0.5">Not counted as money in until cleared (§18).</p>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Cleared this month</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{clearedMonth.count} cheque{clearedMonth.count === 1 ? '' : 's'} · {formatPKR(clearedMonth.amount)}</div>
          <p className="text-micro text-slate-400 mt-0.5">Counted in the bank on their clearing date (§35).</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_FILTERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={bankFilter} onValueChange={setBankFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All banks</SelectItem>
                {bankOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={postDatedOnly ? 'default' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setPostDatedOnly((v) => !v)}>
              Post-dated only
            </Button>
            <Button variant={readyOnly ? 'default' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setReadyOnly((v) => !v)}>
              Ready to deposit
            </Button>
            <span className="ml-auto text-micro text-slate-400">{formatPKR(inHandTotal)} still waiting to clear.</span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cheque no</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>Cheque date</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                {canCheque && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns} className="text-center text-slate-400 py-6">
                    <Inbox size={16} className="mx-auto mb-1" />No cheques match.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const postDated = isPostDated(r);
                const inHand = IN_HAND.has(r.status);
                return (
                  <TableRow key={r.held.id}>
                    <TableCell className="font-medium text-slate-900">{r.held.reference ?? '—'}</TableCell>
                    <TableCell className="text-slate-600">{r.held.instrumentBank ?? '—'}</TableCell>
                    <TableCell className="text-slate-500">
                      {r.held.instrumentDate ? formatDate(r.held.instrumentDate) : '—'}
                      {postDated && <div className="text-micro text-amber-600">Post-dated</div>}
                    </TableCell>
                    <TableCell className="text-slate-700">{studentName(r.held.studentSno, r.held.payee)}</TableCell>
                    <TableCell className="text-slate-500">{r.held.linkedDoc ?? '—'}</TableCell>
                    <TableCell className="text-slate-500">
                      {formatDate(r.held.date)}
                      {inHand && <div className="text-micro text-slate-400">{ageDays(r.held.date, today)}d held</div>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatPKR(r.held.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                      {r.status === 'Cleared' && r.cleared && (
                        <div className="text-micro text-slate-400 mt-0.5">Cleared {formatDate(r.cleared.date)}</div>
                      )}
                      {r.status === 'Deposited' && r.deposit && (
                        <div className="text-micro text-slate-400 mt-0.5">Deposited {formatDate(r.deposit.date)}</div>
                      )}
                      {(r.status === 'Bounced' || r.status === 'Returned') && r.reversed?.reason && (
                        <div className="text-micro text-slate-400 mt-0.5">{r.reversed.reason}</div>
                      )}
                    </TableCell>
                    {canCheque && (
                      <TableCell className="text-right">
                        {r.status === 'Received' && (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-meta"
                              disabled={postDated}
                              title={postDated && r.held.instrumentDate ? `Can be deposited from ${formatDate(r.held.instrumentDate)}` : undefined}
                              onClick={() => setDepositTarget(r)}
                            >
                              {postDated && r.held.instrumentDate ? `From ${formatDate(r.held.instrumentDate)}` : 'Deposit'}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-meta text-red-600" onClick={() => setReturnTarget(r)}>Return</Button>
                          </div>
                        )}
                        {r.status === 'Deposited' && (
                          <div className="flex justify-end gap-1.5">
                            <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setClearTarget(r)}>Clear</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-meta text-red-600" onClick={() => setBounceTarget(r)}>Bounce</Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {depositTarget && <DepositChequeDialog row={depositTarget} banks={banks} onClose={() => setDepositTarget(null)} />}
      {clearTarget && <ClearChequeDialog row={clearTarget} onClose={() => setClearTarget(null)} />}
      {bounceTarget && <BounceChequeDialog row={bounceTarget} onClose={() => setBounceTarget(null)} />}
      {returnTarget && <ReturnChequeDialog row={returnTarget} onClose={() => setReturnTarget(null)} />}
    </div>
  );
}
