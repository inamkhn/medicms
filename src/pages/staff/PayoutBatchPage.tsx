import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime, formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { useMoneyStore } from '@/stores/moneyStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { can } from '@/lib/permissions';
import {
  availableBalance, accountBalance, chequeDisplayStatus, issueCheque,
  nextActionNo, nextChequeNo, nextMoneyEntryNo,
} from '@/lib/finance';
import type { MoneyAccount } from '@/lib/finance';
import { buildBatchExecution, getPayoutBatchProjection } from '@/lib/payroll';
import type {
  PayrollDisbursement, PayrollPayoutAllocation, PayrollPayoutBatch, PayoutBatchState, PayrollRun,
} from '@/lib/payroll';

// ============================================
// PayoutBatchPage — STAFF_PAYROLL_DESIGN §56 / §57 (/staff/payouts/:id)
// One batch, shown two ways by the projection (§43, integrity 8): an Admin who
// holds compensation.view sees the named recipients; the Accountant gets the
// same batch as an aggregate execution reference — how many and how much, never
// who (§27). Authorizing is Admin-only and pays no one. Execution moves real
// money *through Finance Core*: the screen builds the posting with the pure
// `buildBatchExecution` (§56.2/§57.1), posts it via `moneyStore.postEntries`,
// and only then settles the payroll side — a failed save posts nothing
// ("Nothing was saved", §56.2). Cheque batches settle per cheque through the
// issued-cheque register (§57.2); issuing records a commitment, not money out.
// ============================================

function batchText(state: PayoutBatchState): string {
  if (state === 'Executed') return 'text-cleared';
  if (state === 'Cancelled') return 'text-ink-subtle';
  if (state === 'Authorized' || state === 'Part executed') return 'text-dues';
  return 'text-ink';
}

/** The cleared/committed balance of the payout account, §31.3 for banks. */
function availableOf(entries: Parameters<typeof accountBalance>[0], cheques: Parameters<typeof availableBalance>[1], account?: MoneyAccount): number {
  if (!account) return 0;
  return account.type === 'bank' ? availableBalance(entries, cheques, account.id) : accountBalance(entries, account.id);
}

// -------------------------------------------
// §56.2 / §57.1 — confirm the external bank or cash execution
// -------------------------------------------
function ExecuteDialog({
  batch, run, allocations, authorizedTotal, available, actor, onClose,
}: {
  batch: PayrollPayoutBatch;
  run: PayrollRun;
  allocations: readonly PayrollPayoutAllocation[];
  authorizedTotal: number;
  available: number;
  actor: string;
  onClose: () => void;
}) {
  const [reference, setReference] = useState('');
  const [execDate, setExecDate] = useState(dayKey());
  const [entered, setEntered] = useState('');
  const [packets, setPackets] = useState(false);
  const [acks, setAcks] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const isCash = batch.mode === 'Cash';

  function submit() {
    const m = useMoneyStore.getState();
    const p = usePayrollStore.getState();
    const liveBatch = p.payoutBatches.find((b) => b.id === batch.id);
    if (!liveBatch) { setProblems(['Nothing was saved — this payout batch no longer exists (§56.2).']); return; }
    const liveAccount = m.accounts.find((a) => a.id === batch.accountId);
    const trimmed = reference.trim();
    const dup = p.payoutBatches.some((b) => b.id !== batch.id && b.state === 'Executed' && b.externalReference === trimmed) ? trimmed : undefined;
    const result = buildBatchExecution({
      batch: liveBatch,
      run,
      allocations,
      authorizedTotal,
      enteredTotal: parseInt(entered.replace(/,/g, ''), 10) || 0,
      reference,
      executionDate: execDate,
      today: dayKey(),
      account: liveAccount,
      accountAvailable: availableOf(m.entries, m.issuedCheques, liveAccount),
      alreadyExecutedReference: dup,
      packetsPrepared: packets,
      acknowledgementsComplete: acks,
      series: { entryNo: nextMoneyEntryNo(m.entries), actionNo: nextActionNo(m.entries), now: nowISO() },
      actor,
    });
    if (!result.ok || !result.moneyEntry) {
      setProblems(['Nothing was saved (§56.2).', ...result.problems]);
      return;
    }
    const post = m.postEntries([result.moneyEntry], dayKey());
    if (!post.ok) {
      setProblems(['Nothing was saved (§56.2).', ...post.rejected.flatMap((r) => r.problems)]);
      return;
    }
    const applied = p.applyExecution(batch.id, result.disbursements, result.batchPatch ?? {});
    if (applied.length) {
      setProblems([`The Finance entry posted (${result.moneyEntry.id}) but the batch settlement failed — tell an Admin at once (§56.2).`, ...applied]);
      return;
    }
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Finance Entry',
      details: `Executed payout batch ${batch.batchNo} — ${formatPKR(authorizedTotal)} out of ${liveAccount?.name ?? batch.accountId}, reference ${trimmed} (§56.2)`,
    });
    toastSuccess({
      title: 'Payout posted',
      description: result.warnings.length ? result.warnings.join(' ') : `${formatPKR(authorizedTotal)} recorded out of ${liveAccount?.name ?? batch.accountId}.`,
    });
    onClose();
  }

  const expectedAfter = available - authorizedTotal;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm external execution — {batch.batchNo}</DialogTitle>
          <DialogDescription>
            This records the approved batch total. You cannot change individual payouts (§56.2).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="exec-ref">{isCash ? 'Voucher narration *' : 'Bank reference *'}</Label>
            <Input id="exec-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={isCash ? 'Payroll cash batch' : 'BANK-BULK-2941'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exec-date">{isCash ? 'Cash handover date *' : 'Execution date *'}</Label>
              <Input id="exec-date" type="date" value={execDate} max={dayKey()} onChange={(e) => setExecDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exec-total">Amount moved *</Label>
              <Input id="exec-total" inputMode="numeric" value={entered} onChange={(e) => setEntered(e.target.value)} placeholder={formatPKR(authorizedTotal)} />
            </div>
          </div>
          {isCash && (
            <div className="space-y-2 rounded-control border border-hairline bg-surface p-3">
              <p className="text-meta text-ink-muted">
                Available {formatPKR(available)} · Expected balance after {formatPKR(expectedAfter)} (§57.1)
              </p>
              <label className="flex items-center gap-2 text-body text-ink">
                <Checkbox checked={packets} onCheckedChange={(v) => setPackets(v === true)} aria-label="Cash packets prepared" />
                Cash packets/receipts prepared by Admin
              </label>
              <label className="flex items-center gap-2 text-body text-ink">
                <Checkbox checked={acks} onCheckedChange={(v) => setAcks(v === true)} aria-label="Staff acknowledgements completed" />
                Staff acknowledgements completed (Admin)
              </label>
              {(!packets || !acks) && (
                <p className="text-micro text-ink-subtle">
                  Without both confirmations the money still moves but the batch stays Part executed with the exception mapped privately by an Admin (§57.1).
                </p>
              )}
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
          <Button onClick={submit} disabled={!reference.trim() || !entered.trim()}>Confirm external execution</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------
// §57.2 — write one payroll cheque (Admin-only named detail)
// -------------------------------------------
function IssueChequeDialog({
  batch, allocation, run, payeeName, actor, onClose,
}: {
  batch: PayrollPayoutBatch;
  allocation: PayrollPayoutAllocation;
  run: PayrollRun | undefined;
  payeeName: string;
  actor: string;
  onClose: () => void;
}) {
  const books = useMoneyStore((s) => s.chequebooks);
  const cheques = useMoneyStore((s) => s.issuedCheques);
  const activeBooks = books.filter((b) => b.status === 'Active' && b.bankAccountId === batch.accountId);
  const [bookId, setBookId] = useState(activeBooks[0]?.id ?? '');
  const [chequeDate, setChequeDate] = useState(dayKey());
  const [acPayee, setAcPayee] = useState(true);
  const [problems, setProblems] = useState<string[]>([]);
  const book = activeBooks.find((b) => b.id === bookId);
  const suggested = book ? nextChequeNo(book, cheques) : undefined;

  function submit() {
    const m = useMoneyStore.getState();
    const p = usePayrollStore.getState();
    // The register records the cheque restricted — the payee name stays on this
    // Admin-only screen and on the physical cheque, never in Finance's books (§57.2).
    const res = issueCheque(
      {
        accounts: m.accounts, entries: m.entries, chequebooks: m.chequebooks,
        cheques: m.issuedCheques, closedMonths: m.closedMonths, today: dayKey(), now: nowISO(),
      },
      {
        chequebookId: bookId,
        chequeNo: suggested ?? '',
        payee: 'Payroll — restricted',
        amount: allocation.authorizedAmount,
        chequeDate,
        issueDate: dayKey(),
        acPayee,
        linkedDoc: batch.batchNo,
        createdBy: actor,
      },
    );
    if (!res.ok) { setProblems(res.errors); return; }
    const errs = m.addIssuedCheque(res.cheque);
    if (errs.length) { setProblems(errs); return; }
    const settled = p.disbursements
      .filter((d) => d.batchId === batch.id && (d.state === 'Posted' || d.state === 'Cleared'))
      .map((d) => d.payrollLineId);
    const allSettled = p.payoutAllocations
      .filter((a) => a.batchId === batch.id)
      .every((a) => a.payrollLineId === allocation.payrollLineId || settled.includes(a.payrollLineId));
    const disbursement: PayrollDisbursement = {
      id: `${batch.batchNo}~${allocation.payrollLineId}`,
      batchId: batch.id,
      allocationId: allocation.id,
      payrollLineId: allocation.payrollLineId,
      direction: 'Out',
      amount: allocation.authorizedAmount,
      chequeId: res.cheque.id,
      actualDate: dayKey(),
      state: 'Posted',
      reference: res.cheque.chequeNo,
    };
    const applied = p.applyExecution(batch.id, [disbursement], allSettled ? { state: 'Executed', executionDate: dayKey() } : { state: 'Part executed' });
    if (applied.length) {
      setProblems([`Cheque ${res.cheque.chequeNo} was recorded but the batch settlement failed — tell an Admin at once (§57.2).`, ...applied]);
      return;
    }
    useAuditStore.getState().addLog({ user: actor, action: 'Finance Entry', details: `Issued payroll cheque ${res.cheque.chequeNo} (${formatPKR(allocation.authorizedAmount)}) for batch ${batch.batchNo} (§57.2)` });
    toastSuccess({ title: `Cheque ${res.cheque.chequeNo} issued`, description: 'Bank book unchanged at issue; the available balance decreases (§57.2).' });
    onClose();
  }

  if (activeBooks.length === 0) {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>No chequebook on this bank</DialogTitle>
            <DialogDescription>Add a chequebook in Finance first — a cheque is written from a numbered range on a bank account (§31.1).</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Payroll cheque — {payeeName} (restricted)</DialogTitle>
          <DialogDescription>
            Bank book unchanged at issue; available balance decreases by {formatPKR(allocation.authorizedAmount)} (§57.2).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cheque-book">Bank / chequebook *</Label>
            <Select value={bookId} onValueChange={setBookId}>
              <SelectTrigger id="cheque-book"><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeBooks.map((b) => <SelectItem key={b.id} value={b.id}>{b.fromNo}–{b.toNo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Next number</Label>
              <p className="num text-body font-semibold text-ink">{suggested ?? 'book full'}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cheque-date">Cheque date</Label>
              <Input id="cheque-date" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-body text-ink">
            <Checkbox checked={acPayee} onCheckedChange={(v) => setAcPayee(v === true)} aria-label="A/C payee only" />
            A/C payee only
          </label>
          <p className="text-meta text-ink-muted">
            Payee: {payeeName} — the Finance register records this cheque as "Payroll — restricted"; the name stays here (§57.2).{run ? ` Run ${run.runNumber}.` : ''}
          </p>
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!suggested}>Issue cheque</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------
// The page
// -------------------------------------------
export default function PayoutBatchPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  const batch = usePayrollStore((s) => s.payoutBatches.find((b) => b.id === id));
  const allocations = usePayrollStore((s) => s.payoutAllocations);
  const lines = usePayrollStore((s) => s.lines);
  const staffRecords = usePayrollStore((s) => s.staff);
  const payables = usePayrollStore((s) => s.payables);
  const runs = usePayrollStore((s) => s.runs);
  const disbursements = usePayrollStore((s) => s.disbursements);
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const issuedCheques = useMoneyStore((s) => s.issuedCheques);
  const authorizePayoutBatch = usePayrollStore((s) => s.authorizePayoutBatch);
  const cancelPayoutBatch = usePayrollStore((s) => s.cancelPayoutBatch);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [execOpen, setExecOpen] = useState(false);
  const [issueFor, setIssueFor] = useState<PayrollPayoutAllocation | null>(null);
  const [csvWarn, setCsvWarn] = useState(false);

  if (!batch) {
    return (
      <div className="space-y-4">
        <h1 className="text-title font-semibold text-ink">Payout batch</h1>
        <Card><CardContent className="p-6 text-body text-ink-muted">This payout batch no longer exists (§55).</CardContent></Card>
      </div>
    );
  }

  const batchAllocations = allocations.filter((a) => a.batchId === batch.id);
  const authorizedTotal = batchAllocations.reduce((sum, a) => sum + a.authorizedAmount, 0);
  const run = runs.find((r) => r.id === batch.runId);
  const account = accounts.find((a) => a.id === batch.accountId);
  const accountName = account?.name ?? batch.accountId;
  const canManage = can(role, 'payroll.payout.manage');
  const canExecute = canManage || can(role, 'payroll.payout.summary');
  const projection = getPayoutBatchProjection(batch, batchAllocations, role);

  const settledLines = disbursements.filter((d) => d.batchId === batch.id && (d.state === 'Posted' || d.state === 'Cleared'));
  const available = availableOf(entries, issuedCheques, account);
  const executed = batch.state === 'Executed' || batch.state === 'Part executed';

  function nameForLine(lineId: string): string {
    const payable = payables.find((p) => p.payrollLineId === lineId);
    return payable ? (staffRecords.find((s) => s.id === payable.staffId)?.fullName ?? payable.staffId) : lineId;
  }

  function authorize() {
    const problems = authorizePayoutBatch(batch!.id, user?.name ?? 'Unknown', new Date().toISOString());
    if (problems.length) {
      toastError({ title: 'Cannot authorize batch', description: problems[0] });
      return;
    }
    useAuditStore.getState().addLog({ user: user?.name ?? 'Unknown', action: 'Staff Entry', details: `Authorized payout batch ${batch!.batchNo} (§55).` });
    toastSuccess({ title: `Batch ${batch!.batchNo} authorized`, description: 'Ready to execute. Money moves only at payout (§55).' });
  }

  function confirmCancel() {
    const problems = cancelPayoutBatch(batch!.id, cancelReason, user?.name ?? 'Unknown', new Date().toISOString());
    if (problems.length) {
      toastError({ title: 'Cannot cancel batch', description: problems[0] });
      return;
    }
    useAuditStore.getState().addLog({ user: user?.name ?? 'Unknown', action: 'Staff Entry', details: `Cancelled payout batch ${batch!.batchNo} — ${cancelReason} (§56).` });
    toastSuccess({ title: `Batch ${batch!.batchNo} cancelled` });
    setCancelOpen(false);
    setCancelReason('');
  }

  // §56 the Admin-only bank instruction CSV — recipient name, bank details,
  // approved amount and batch/reference. Audited, with a confidential warning.
  function exportBankCsv() {
    if (!batch || !projection.privileged) return;
    const header = 'staff_no,name,bank,bank_account,holder,amount,batch,run';
    const rows = projection.allocations.map((a) => {
      const payable = payables.find((p) => p.payrollLineId === a.payrollLineId);
      const st = payable ? staffRecords.find((s) => s.id === payable.staffId) : undefined;
      return [
        st?.staffNo ?? '', st?.fullName ?? a.payrollLineId, st?.bankName ?? '', st?.bankAccount ?? '',
        st?.accountHolder ?? '', a.authorizedAmount, batch!.batchNo, run?.runNumber ?? '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${batch.batchNo}-bank-instruction.csv`;
    link.click();
    URL.revokeObjectURL(url);
    useAuditStore.getState().addLog({ user: user?.name ?? 'Unknown', action: 'Staff Entry', details: `Exported confidential bank instruction CSV for ${batch.batchNo} (§56)` });
    toastSuccess({ title: 'Bank instruction CSV exported', description: 'Confidential payroll data — handle accordingly (§56).' });
    setCsvWarn(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button className="text-meta text-ink-muted hover:text-ink" onClick={() => navigate('/staff/payouts')}>← Payouts</button>
          <h1 className="text-title font-semibold text-ink">Batch {batch.batchNo}</h1>
          <p className="text-meta text-ink-muted">
            {batch.mode} · {accountName}{run ? ` · ${run.runNumber}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-body font-semibold ${batchText(batch.state)}`}>{batch.state}</span>
          {canManage && (batch.state === 'Prepared' || batch.state === 'Ready') && (
            <Button size="sm" onClick={authorize}>Authorize</Button>
          )}
          {canExecute && batch.state === 'Authorized' && batch.mode !== 'Cheque' && (
            <Button size="sm" onClick={() => setExecOpen(true)}>Confirm external execution</Button>
          )}
          {canManage && (batch.state === 'Prepared' || batch.state === 'Ready' || batch.state === 'Authorized') && (
            <Button size="sm" variant="outline" onClick={() => { setCancelOpen(true); setCancelReason(''); }}>Cancel batch</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-meta text-ink-muted">Recipients</p>
          <p className="num text-section font-semibold text-ink">{projection.privileged ? batchAllocations.length : projection.aggregate.recipientCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-meta text-ink-muted">Authorized total</p>
          <p className="num text-section font-semibold text-ink">{formatPKR(projection.privileged ? authorizedTotal : projection.aggregate.authorizedTotal)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-meta text-ink-muted">{batch.mode === 'Cash' ? 'Cash available' : 'Account available'}</p>
          <p className="num text-section font-semibold text-ink">{formatPKR(available)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-meta text-ink-muted">Settled so far</p>
          <p className="num text-section font-semibold text-ink">{formatPKR(settledLines.reduce((sum, d) => sum + d.amount, 0))}</p>
        </CardContent></Card>
      </div>

      {projection.privileged ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-section font-semibold text-ink">Named recipients</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Payroll line</TableHead>
                  <TableHead num>Authorized</TableHead>
                  <TableHead>Settlement</TableHead>
                  {batch.mode === 'Cheque' && canManage && batch.state === 'Authorized' && <TableHead num>Issue</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {projection.allocations.map((a) => {
                  const line = lines.find((l) => l.id === a.payrollLineId);
                  const staffName = nameForLine(a.payrollLineId);
                  const d = settledLines.find((x) => x.payrollLineId === a.payrollLineId);
                  const cheque = d?.chequeId ? issuedCheques.find((c) => c.id === d.chequeId) : undefined;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>{staffName}</TableCell>
                      <TableCell className="num">{line ? line.id : a.payrollLineId}</TableCell>
                      <TableCell num>{formatPKR(a.authorizedAmount)}</TableCell>
                      <TableCell>
                        {cheque
                          ? <span className="num">{cheque.chequeNo} · {chequeDisplayStatus(cheque, dayKey())}</span>
                          : d ? <span className="text-cleared">Settled</span> : <span className="text-ink-muted">Unsettled</span>}
                      </TableCell>
                      {batch.mode === 'Cheque' && canManage && batch.state === 'Authorized' && (
                        <TableCell num>
                          {!d && <Button size="sm" variant="outline" onClick={() => setIssueFor(a)}>Issue cheque</Button>}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {batch.authorizedBy && (
              <p className="text-micro text-ink-subtle">Authorized by {batch.authorizedBy}{batch.authorizedAt ? ` · ${formatDateTime(batch.authorizedAt)}` : ''} (§55).</p>
            )}
            {batch.mode === 'Bank transfer' && canManage && !executed && (
              <div className="space-y-2">
                {csvWarn ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-meta text-amber-900">
                    <span>Confidential named salary data leaves this device (§56, §60).</span>
                    <Button size="sm" onClick={exportBankCsv}>Confirm export</Button>
                    <Button size="sm" variant="outline" onClick={() => setCsvWarn(false)}>Cancel</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setCsvWarn(true)}>Export confidential CSV</Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className="text-section font-semibold text-ink">Aggregate execution</h2>
            <p className="text-body text-ink">
              {projection.aggregate.recipientCount} recipient(s) totalling {formatPKR(projection.aggregate.authorizedTotal)}.
            </p>
            <p className="text-meta text-ink-muted">
              Individual names and amounts are Admin-only (§27, §43). Confirm the total against the bank output; a differing amount is held for an Admin, never split proportionally (§27).
            </p>
            {batch.mode === 'Cheque' && (
              <p className="text-meta text-ink-muted">
                Payroll cheques appear in the Finance issued-cheque register as "Payroll — restricted"; match them to a statement line and mark them Cleared there (§57.2).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {executed && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className="text-section font-semibold text-ink">Aggregate confirmation — {batch.batchNo}</h2>
            <p className="text-body text-ink">
              {batch.mode === 'Cheque'
                ? `${settledLines.length} cheque(s) issued totalling ${formatPKR(settledLines.reduce((sum, d) => sum + d.amount, 0))}.`
                : `${formatPKR(settledLines.reduce((sum, d) => sum + d.amount, 0))} posted out of ${accountName} on ${batch.executionDate ?? '—'}${batch.externalReference ? `, reference ${batch.externalReference}` : ''}.`}
            </p>
            {batch.state === 'Part executed' && (
              <p className="text-meta text-dues">
                {batch.mode === 'Cash'
                  ? 'The hand-over is not fully acknowledged — the batch stays Part executed until an Admin confirms or maps the exception (§57.1).'
                  : 'Not every recipient has settled — the batch stays Part executed while cheques are outstanding (§57.2).'}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Button size="sm" variant="outline" onClick={() => navigate(`/finance/accounts/${batch.accountId}`)}>Open Finance entry</Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>Print aggregate confirmation</Button>
            </div>
            {batch.financeActionId && <p className="text-micro text-ink-subtle">Action {batch.financeActionId} · settled in {settledLines.length} staff line(s) (§56.2).</p>}
          </CardContent>
        </Card>
      )}

      {execOpen && run && account && (
        <ExecuteDialog
          batch={batch}
          run={run}
          allocations={batchAllocations}
          authorizedTotal={authorizedTotal}
          available={available}
          actor={user?.name ?? 'Unknown'}
          onClose={() => setExecOpen(false)}
        />
      )}

      {issueFor && (
        <IssueChequeDialog
          batch={batch}
          allocation={issueFor}
          run={run}
          payeeName={nameForLine(issueFor.payrollLineId)}
          actor={user?.name ?? 'Unknown'}
          onClose={() => setIssueFor(null)}
        />
      )}

      <Dialog open={cancelOpen} onOpenChange={(o) => { if (!o) setCancelOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel batch {batch.batchNo}</DialogTitle>
            <DialogDescription>An unexecuted batch is cancelled with a reason; once money has moved it is corrected by a linked reversal (§56).</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-meta text-ink-muted" htmlFor="cancel-reason">Reason</label>
            <Input id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is this batch cancelled?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep batch</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={!cancelReason.trim()}>Cancel batch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
