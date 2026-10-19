// ============================================
// MediCMS Desktop — Finance: Issued cheques (§31, §65, §58)
// A cheque the institute writes pays its bill at once but leaves the bank
// balance unchanged until the bank clears it (§31.2). This register tracks each
// one — Issued, Post-dated, Cleared, Cancelled, Stale — and shows the §31.3
// available balance (bank balance minus the cheques not yet cleared) so nobody
// spends money that is already committed. Only clearing posts a money entry.
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { toastError } from '@/lib/toast';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useBillsStore, useMoneyStore, useSettingsStore } from '@/stores';
import { usePayrollStore } from '@/stores/payrollStore';
import {
  availableBalance,
  cancelCheque,
  chequeDisplayStatus,
  clearCheque,
  issueCheque,
  nextActionNo,
  nextChequeNo,
  nextChequebookId,
  nextMoneyEntryNo,
  unclearedIssuedTotal,
  type Chequebook,
  type ChequeDisplayStatus,
  type IssuedCheque,
  type MoneyAccount,
} from '@/lib/finance';

/** §65: the badge colour is paired with the status word, never colour alone (P4). */
const STATUS_VARIANT: Record<ChequeDisplayStatus, BadgeVariant> = {
  Issued: 'secondary',
  'Post-dated': 'default',
  Stale: 'dues',
  Cleared: 'cleared',
  Cancelled: 'struckoff',
};

function StatusBadge({ status }: { status: ChequeDisplayStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

// -------------------------------------------
// New chequebook (§31.1)
// -------------------------------------------
function NewChequebookDialog({ banks, onClose }: { banks: MoneyAccount[]; onClose: () => void }) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [fromNo, setFromNo] = useState('');
  const [toNo, setToNo] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const submit = () => {
    const state = useMoneyStore.getState();
    const book: Chequebook = {
      id: nextChequebookId(state.chequebooks),
      bankAccountId: bankId,
      fromNo: fromNo.trim(),
      toNo: toNo.trim(),
      status: 'Active',
    };
    const errs = state.addChequebook(book);
    if (errs.length) { setProblems(errs); return; }
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const bank = banks.find((b) => b.id === bankId);
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Added chequebook ${book.fromNo}–${book.toNo} on ${bank?.name ?? bankId}` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New chequebook</DialogTitle>
          <DialogDescription>A range of cheque numbers drawn on one bank account (§31.1).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Bank account *</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger><SelectValue placeholder="Choose bank" /></SelectTrigger>
              <SelectContent>{banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From number *</Label>
              <Input value={fromNo} onChange={(e) => setFromNo(e.target.value)} placeholder="004850" />
            </div>
            <div className="space-y-1.5">
              <Label>To number *</Label>
              <Input value={toNo} onChange={(e) => setToNo(e.target.value)} placeholder="004899" />
            </div>
          </div>
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!bankId || !fromNo.trim() || !toNo.trim()}>Add book</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------
// Write a cheque (§31.2) — records it, posts no money
// -------------------------------------------
function NewChequeDialog({
  chequebooks, banks, cheques, onClose,
}: {
  chequebooks: Chequebook[]; banks: MoneyAccount[]; cheques: IssuedCheque[]; onClose: () => void;
}) {
  const activeBooks = chequebooks.filter((b) => b.status === 'Active');
  const [bookId, setBookId] = useState(activeBooks[0]?.id ?? '');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [chequeDate, setChequeDate] = useState(dayKey());
  const [acPayee, setAcPayee] = useState(false);
  const [linkedDoc, setLinkedDoc] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const book = activeBooks.find((b) => b.id === bookId);
  const suggested = book ? nextChequeNo(book, cheques) : undefined;

  const submit = () => {
    const state = useMoneyStore.getState();
    const result = issueCheque(
      {
        accounts: state.accounts,
        entries: state.entries,
        chequebooks: state.chequebooks,
        cheques: state.issuedCheques,
        closedMonths: state.closedMonths,
        today: dayKey(),
        now: nowISO(),
      },
      {
        chequebookId: bookId,
        chequeNo: suggested ?? '',
        payee,
        amount: parseInt(amount, 10) || 0,
        chequeDate,
        issueDate: dayKey(),
        acPayee,
        linkedDoc: linkedDoc.trim() || undefined,
        createdBy: useAuthStore.getState().user?.name ?? 'Admin',
      },
    );
    if (!result.ok) { setProblems(result.errors); return; }
    const errs = state.addIssuedCheque(result.cheque);
    if (errs.length) { setProblems(errs); return; }
    useAuditStore.getState().addLog({ user: useAuthStore.getState().user?.name ?? 'Admin', action: 'Finance Entry', details: `Issued cheque ${result.cheque.chequeNo} for ${formatPKR(result.cheque.amount)} to ${result.cheque.payee}` });
    onClose();
  };

  if (activeBooks.length === 0) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>No chequebook</DialogTitle>
            <DialogDescription>Add a chequebook first — a cheque is written from a numbered range on a bank account (§31.1).</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Write a cheque</DialogTitle>
          <DialogDescription>Pays the bill now; the bank balance changes only when it clears (§31.2).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Chequebook *</Label>
            <Select value={bookId} onValueChange={setBookId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeBooks.map((b) => {
                  const bank = banks.find((x) => x.id === b.bankAccountId);
                  return <SelectItem key={b.id} value={b.id}>{b.fromNo}–{b.toNo} · {bank?.name ?? b.bankAccountId}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cheque number</Label>
              <Input value={suggested ?? ''} readOnly className="bg-slate-50" />
              <p className="text-micro text-slate-400">The next unused number; skipping one is recorded as Spoiled (§31.1).</p>
            </div>
            <div className="space-y-1.5">
              <Label>Cheque date *</Label>
              <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
              <p className="text-micro text-slate-400">A future date makes it post-dated (§31.2).</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Payee *</Label>
            <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="City Teaching Hospital" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input num type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Whole rupees" />
            </div>
            <div className="space-y-1.5">
              <Label>Voucher / bill</Label>
              <Input value={linkedDoc} onChange={(e) => setLinkedDoc(e.target.value)} placeholder="PV-… (optional)" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-body text-slate-700">
            <Checkbox checked={acPayee} onCheckedChange={(v) => setAcPayee(v === true)} />
            A/C payee only (§30)
          </label>
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!payee.trim() || (parseInt(amount, 10) || 0) <= 0}>Write cheque</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** §57.2: when a payroll cheque clears or cancels in this register, the payroll
 * settlement follows it — money has moved (or the commitment is withdrawn) and
 * the staff line's payable position must agree with the bank's books. */
function syncPayrollSettlement(chequeId: string, to: 'Cleared' | 'Cancelled') {
  const payroll = usePayrollStore.getState();
  const disb = payroll.disbursements.find((d) => d.chequeId === chequeId && d.state === 'Posted');
  if (!disb) return;
  const problems = payroll.setDisbursementState(disb.id, to);
  if (problems.length) toastError({ title: 'Payroll settlement not updated', description: problems[0] });
}

// -------------------------------------------
// Mark cleared (§31.2) — the one action that posts a money entry
// -------------------------------------------
function MarkClearedDialog({ cheque, onClose }: { cheque: IssuedCheque; onClose: () => void }) {
  const [clearDate, setClearDate] = useState(dayKey());
  const [reference, setReference] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const submit = () => {
    const state = useMoneyStore.getState();
    const ctx = {
      accounts: state.accounts,
      entries: state.entries,
      chequebooks: state.chequebooks,
      cheques: state.issuedCheques,
      closedMonths: state.closedMonths,
      today: dayKey(),
      now: nowISO(),
    };
    const result = clearCheque(
      ctx,
      { chequeId: cheque.id, clearDate, reference: reference.trim() || undefined, createdBy: useAuthStore.getState().user?.name ?? 'Admin' },
      { entryNo: nextMoneyEntryNo(state.entries), actionNo: nextActionNo(state.entries), now: nowISO() },
    );
    if (!result.ok) { setProblems(result.errors); return; }
    const outcome = state.postEntries(result.entries, dayKey());
    if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); return; }
    state.markChequeCleared(cheque.id, clearDate, result.entries[0].id);
    syncPayrollSettlement(cheque.id, 'Cleared');
    setWarnings(result.warnings);
    useAuditStore.getState().addLog({ user: useAuthStore.getState().user?.name ?? 'Admin', action: 'Finance Entry', details: `Cheque ${cheque.chequeNo} cleared ${clearDate} · ${formatPKR(cheque.amount)}` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark cheque {cheque.chequeNo} cleared</DialogTitle>
          <DialogDescription>This posts {formatPKR(cheque.amount)} out of the bank on the clearing date (§31.2). Normally reconciliation does this.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Clearing date *</Label>
              <Input type="date" value={clearDate} min={cheque.chequeDate} max={dayKey()} onChange={(e) => setClearDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Statement reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          {warnings.length > 0 && warnings.map((w) => <p key={w} className="text-meta text-amber-600">{w}</p>)}
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Mark cleared</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------
// Cancel (§31.2) — reason required, number never reused
// -------------------------------------------
function CancelChequeDialog({ cheque, onClose }: { cheque: IssuedCheque; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const vouchers = useBillsStore((s) => s.vouchers);
  // §65: the cancel shows its effect — a cheque written by a voucher voids it,
  // and the bills that voucher covered go back to unpaid (§34).
  const linked = cheque.linkedDoc ? vouchers.find((v) => v.no === cheque.linkedDoc && !v.voided) : undefined;

  const submit = () => {
    const state = useMoneyStore.getState();
    const result = cancelCheque(
      {
        accounts: state.accounts, entries: state.entries, chequebooks: state.chequebooks,
        cheques: state.issuedCheques, closedMonths: state.closedMonths, today: dayKey(), now: nowISO(),
      },
      { chequeId: cheque.id, reason },
    );
    if (!result.ok) { setProblems(result.errors); return; }
    state.cancelIssuedCheque(cheque.id, reason.trim());
    syncPayrollSettlement(cheque.id, 'Cancelled');
    if (linked) {
      useBillsStore.getState().voidVoucher(linked.no, `Cheque ${cheque.chequeNo} cancelled: ${reason.trim()}`);
    }
    useAuditStore.getState().addLog({ user: useAuthStore.getState().user?.name ?? 'Admin', action: 'Finance Entry', details: `Cancelled cheque ${cheque.chequeNo} — ${reason.trim()}${linked ? ` (voided ${linked.no})` : ''}` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel cheque {cheque.chequeNo}</DialogTitle>
          <DialogDescription>
            It has not been presented, so no money moved. The available balance rises back and the number is never reused (§31.2).
            {linked && <> Voucher {linked.no} is voided and the bills it covered return to unpaid (§34).</>}
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
              placeholder="Superseded, spoiled, payment stopped…"
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
          <Button variant="destructive" onClick={submit} disabled={!reason.trim()}>Cancel cheque</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_FILTERS: (ChequeDisplayStatus | 'All')[] = ['All', 'Issued', 'Post-dated', 'Cleared', 'Cancelled', 'Stale'];

export default function IssuedCheques() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canCheque = can(role, 'finance.cheque');
  const vouchers = useBillsStore((s) => s.vouchers);

  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const chequebooks = useMoneyStore((s) => s.chequebooks);
  const issuedCheques = useMoneyStore((s) => s.issuedCheques);
  const limits = useSettingsStore((s) => s.financeLimits);

  const banks = accounts.filter((a) => a.type === 'bank' && a.status === 'Active');

  const [bankFilter, setBankFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [postDatedOnly, setPostDatedOnly] = useState(false);
  const [bookDialog, setBookDialog] = useState(false);
  const [chequeDialog, setChequeDialog] = useState(false);
  const [clearTarget, setClearTarget] = useState<IssuedCheque | null>(null);
  const [cancelTarget, setCancelTarget] = useState<IssuedCheque | null>(null);

  const today = dayKey();
  const scoped = issuedCheques.filter((c) => bankFilter === 'all' || c.bankAccountId === bankFilter);
  const rows = scoped
    .filter((c) => {
      const d = chequeDisplayStatus(c, today, limits.chequeStaleMonths);
      if (postDatedOnly && d !== 'Post-dated') return false;
      if (statusFilter !== 'All' && d !== statusFilter) return false;
      return true;
    })
    .slice()
    .sort((a, b) => (a.issueDate === b.issueDate ? b.chequeNo.localeCompare(a.chequeNo) : a.issueDate < b.issueDate ? 1 : -1));

  const uncleared = scoped.filter((c) => c.status === 'Issued');
  const staleCount = scoped.filter((c) => chequeDisplayStatus(c, today, limits.chequeStaleMonths) === 'Stale').length;
  const selectedBank = bankFilter !== 'all' ? banks.find((b) => b.id === bankFilter) : undefined;

  const usedInBook = (book: Chequebook) => issuedCheques.filter((c) => c.chequebookId === book.id).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/accounts')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">Issued cheques</h1>
            <p className="text-micro text-slate-500">A cheque pays at once; the bank balance moves only when it clears (§31.2).</p>
          </div>
        </div>
        {canCheque && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setBookDialog(true)}>
              <Plus size={12} className="mr-1.5" /> New chequebook
            </Button>
            <Button size="sm" className="h-7 text-meta" onClick={() => setChequeDialog(true)}>
              <ScrollText size={12} className="mr-1.5" /> New cheque
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Issued, not cleared</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{uncleared.length} cheque{uncleared.length === 1 ? '' : 's'} · {formatPKR(unclearedIssuedTotal(scoped))}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Stale ({limits.chequeStaleMonths}+ months)</div>
          <div className={`text-xl font-bold mt-1 ${staleCount ? 'text-dues' : 'text-slate-900'}`}>{staleCount}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">{selectedBank ? `Available · ${selectedBank.name}` : 'Available (all banks)'}</div>
          <div className="text-xl font-bold text-slate-900 mt-1">
            {selectedBank
              ? formatPKR(availableBalance(entries, issuedCheques, selectedBank.id))
              : formatPKR(banks.reduce((sum, b) => sum + availableBalance(entries, issuedCheques, b.id), 0))}
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <Select value={bankFilter} onValueChange={setBankFilter}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All bank accounts</SelectItem>
                {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_FILTERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-micro text-slate-600">
              <Checkbox checked={postDatedOnly} onCheckedChange={(v) => setPostDatedOnly(v === true)} />
              Post-dated only
            </label>
            <span className="ml-auto text-micro text-slate-400">{formatPKR(unclearedIssuedTotal(scoped))} committed against banks.</span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cheque</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Status</TableHead>
                {canCheque && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={canCheque ? 7 : 6} className="text-center text-slate-400 py-6">No cheques match.</TableCell></TableRow>
              )}
              {rows.map((c) => {
                const d = chequeDisplayStatus(c, today, limits.chequeStaleMonths);
                const bank = banks.find((b) => b.id === c.bankAccountId);
                // §65: the voucher column reaches the PV that wrote the cheque.
                const voucher = c.linkedDoc ? vouchers.find((v) => v.no === c.linkedDoc) : undefined;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-slate-900">
                      {c.chequeNo}
                      <span className="ml-2 text-micro text-slate-400">{bank?.name ?? ''}</span>
                    </TableCell>
                    <TableCell className="text-slate-500">{formatDate(c.chequeDate)}</TableCell>
                    <TableCell className="text-slate-600">{c.payee}{c.acPayee ? ' · A/C payee' : ''}</TableCell>
                    <TableCell className="text-right font-medium">{formatPKR(c.amount)}</TableCell>
                    <TableCell className="text-slate-500">
                      {voucher ? (
                        <button className="text-left text-blue-600 hover:underline" onClick={() => navigate(`/finance/vouchers/${voucher.id}`)}>{voucher.no}</button>
                      ) : (c.linkedDoc ?? '—')}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d} />
                      {d === 'Post-dated' && <div className="text-micro text-slate-400 mt-0.5">Valid from {formatDate(c.chequeDate)}</div>}
                      {c.status === 'Cleared' && c.clearedDate && <div className="text-micro text-slate-400 mt-0.5">Cleared {formatDate(c.clearedDate)}</div>}
                    </TableCell>
                    {canCheque && (
                      <TableCell className="text-right">
                        {c.status === 'Issued' && (
                          <div className="flex justify-end gap-1.5">
                            <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setClearTarget(c)}>Mark cleared</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-meta text-red-600" onClick={() => setCancelTarget(c)}>Cancel</Button>
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

      <Card>
        <CardContent className="py-3">
          <div className="text-sm font-semibold text-slate-800 mb-2">Chequebooks</div>
          {chequebooks.length === 0 ? (
            <p className="text-micro text-slate-400">No chequebooks yet. Add one to write cheques (§31.1).</p>
          ) : (
            <ul className="space-y-1">
              {chequebooks.map((b) => {
                const bank = accounts.find((x) => x.id === b.bankAccountId);
                const total = (Number(b.toNo.replace(/\D/g, '')) || 0) - (Number(b.fromNo.replace(/\D/g, '')) || 0) + 1;
                const used = usedInBook(b);
                return (
                  <li key={b.id} className="flex items-center justify-between text-micro text-slate-600">
                    <span>{b.fromNo}–{b.toNo} · {bank?.name ?? b.bankAccountId}</span>
                    <span>
                      <Badge variant={b.status === 'Active' ? 'cleared' : 'secondary'}>{b.status}</Badge>
                      <span className="ml-2">{used} used · {Math.max(total - used, 0)} left</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {bookDialog && <NewChequebookDialog banks={banks} onClose={() => setBookDialog(false)} />}
      {chequeDialog && <NewChequeDialog chequebooks={chequebooks} banks={banks} cheques={issuedCheques} onClose={() => setChequeDialog(false)} />}
      {clearTarget && <MarkClearedDialog cheque={clearTarget} onClose={() => setClearTarget(null)} />}
      {cancelTarget && <CancelChequeDialog cheque={cancelTarget} onClose={() => setCancelTarget(null)} />}
    </div>
  );
}
