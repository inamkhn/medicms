import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { NewPayoutBatchDialog } from '@/components/staff/NewPayoutBatchDialog';
import type { BatchCandidate } from '@/components/staff/NewPayoutBatchDialog';
import { formatPKR } from '@/lib/utils';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { useMoneyStore } from '@/stores/moneyStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { derivePayablePositions, payoutRunProblems } from '@/lib/payroll';
import type { PayrollPayoutBatch, PayoutBatchState } from '@/lib/payroll';

// ============================================
// PayoutPlanner — STAFF_PAYROLL_DESIGN §55 (/staff/payroll/:id/payouts)
// Turns an APPROVED, frozen run into payout batches. It only ever groups what is
// already owed: paid, pending cheques and still-unplanned are all derived from the
// payables and the disbursement records (§29), never stored, and the cross-batch
// never-overpay ceiling is enforced by the pure core. Authorizing a batch is a
// payroll-side decision; the money itself moves at execution, which is Finance
// Core's job in P14 (§56.2, §57). Individual pay stays Admin-only (§43).
// ============================================

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

function batchText(state: PayoutBatchState): string {
  if (state === 'Executed') return 'text-cleared';
  if (state === 'Cancelled') return 'text-ink-subtle';
  if (state === 'Authorized' || state === 'Part executed') return 'text-dues';
  return 'text-ink';
}

export default function PayoutPlanner() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  const run = usePayrollStore((s) => s.runs.find((r) => r.id === id));
  const staffRecords = usePayrollStore((s) => s.staff);
  const payables = usePayrollStore((s) => s.payables);
  const disbursements = usePayrollStore((s) => s.disbursements);
  const batches = usePayrollStore((s) => s.payoutBatches);
  const allocations = usePayrollStore((s) => s.payoutAllocations);
  const accounts = useMoneyStore((s) => s.accounts);
  const authorizePayoutBatch = usePayrollStore((s) => s.authorizePayoutBatch);
  const cancelPayoutBatch = usePayrollStore((s) => s.cancelPayoutBatch);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PayrollPayoutBatch | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  if (!run) {
    return (
      <div className="space-y-4">
        <h1 className="text-title font-semibold text-ink">Payout planner</h1>
        <Card><CardContent className="p-6 text-body text-ink-muted">This pay run no longer exists (§19).</CardContent></Card>
      </div>
    );
  }

  const runPayables = payables.filter((p) => p.runId === run.id);
  const positions = derivePayablePositions(runPayables, disbursements);

  // §55 what each line already has claimed on live (uncancelled) batches — so the
  // "still unplanned" column and the ceiling agree with what the batches show.
  const liveBatchIds = new Set(batches.filter((b) => b.runId === run.id && b.state !== 'Cancelled').map((b) => b.id));
  const plannedByLine: Record<string, number> = {};
  for (const a of allocations) if (liveBatchIds.has(a.batchId)) plannedByLine[a.payrollLineId] = (plannedByLine[a.payrollLineId] ?? 0) + a.authorizedAmount;

  const nameFor = (staffId: string) => staffRecords.find((s) => s.id === staffId)?.fullName ?? staffId;
  const accountName = (accountId: string) => accounts.find((a) => a.id === accountId)?.name ?? accountId;

  const lineRows = runPayables.map((p) => {
    const pos = positions.find((x) => x.payrollLineId === p.payrollLineId);
    const planned = plannedByLine[p.payrollLineId] ?? 0;
    const stillPayable = pos?.stillPayable ?? p.net;
    return {
      payrollLineId: p.payrollLineId,
      staffName: nameFor(p.staffId),
      approvedNet: p.net,
      paid: pos?.paid ?? 0,
      pending: pos?.pendingCheques ?? 0,
      planned,
      remaining: stillPayable - planned,
    };
  });

  const candidates: BatchCandidate[] = lineRows.filter((r) => r.remaining > 0).map((r) => ({
    payrollLineId: r.payrollLineId, staffName: r.staffName, remaining: r.remaining,
  }));

  const runBatches = batches
    .filter((b) => b.runId === run.id)
    .map((b) => {
      const batchAllocations = allocations.filter((a) => a.batchId === b.id);
      return {
        batch: b,
        recipients: batchAllocations.length,
        total: batchAllocations.reduce((sum, a) => sum + a.authorizedAmount, 0),
      };
    })
    .sort((a, b) => (a.batch.batchNo < b.batch.batchNo ? 1 : -1));

  const approved = run.calculationState === 'Approved' && !!run.totals;
  const gateProblems = payoutRunProblems(run);

  function authorize(batchId: string) {
    const problems = authorizePayoutBatch(batchId, user?.name ?? 'Unknown', new Date().toISOString());
    if (problems.length) {
      toastError({ title: 'Cannot authorize batch', description: problems[0] });
      return;
    }
    useAuditStore.getState().addLog({ user: user?.name ?? 'Unknown', action: 'Staff Entry', details: `Authorized payout batch ${batchId} (§55).` });
    toastSuccess({ title: `Batch ${batchId} authorized`, description: 'Ready to execute. Money moves only when it is paid out (§55).' });
  }

  function confirmCancel() {
    if (!cancelTarget) return;
    const problems = cancelPayoutBatch(cancelTarget.id, cancelReason, user?.name ?? 'Unknown', new Date().toISOString());
    if (problems.length) {
      toastError({ title: 'Cannot cancel batch', description: problems[0] });
      return;
    }
    useAuditStore.getState().addLog({ user: user?.name ?? 'Unknown', action: 'Staff Entry', details: `Cancelled payout batch ${cancelTarget.batchNo} — ${cancelReason} (§56).` });
    toastSuccess({ title: `Batch ${cancelTarget.batchNo} cancelled` });
    setCancelTarget(null);
    setCancelReason('');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button className="text-meta text-ink-muted hover:text-ink" onClick={() => navigate(`/staff/payroll/${run.id}`)}>← {run.runNumber}</button>
          <h1 className="text-title font-semibold text-ink">Payout planner — {monthLabel(run.serviceMonth)}</h1>
          <p className="text-meta text-ink-muted">A payout batch pays an approved run; it never changes what is owed (§23, §55).</p>
        </div>
        {approved && (
          <Button size="sm" onClick={() => setDialogOpen(true)} disabled={candidates.length === 0}>+ New batch</Button>
        )}
      </div>

      {gateProblems.length > 0 && (
        <Card><CardContent className="p-4 text-body text-dues">
          {gateProblems[0]} Payouts appear here only once the run is approved and frozen (§30).
        </CardContent></Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-section font-semibold text-ink">Salary payable by line</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff line</TableHead>
                <TableHead num>Approved net</TableHead>
                <TableHead num>Paid</TableHead>
                <TableHead num>Pending cheque</TableHead>
                <TableHead num>Planned</TableHead>
                <TableHead num>Still unplanned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineRows.map((r) => (
                <TableRow key={r.payrollLineId}>
                  <TableCell>{r.staffName}</TableCell>
                  <TableCell num>{formatPKR(r.approvedNet)}</TableCell>
                  <TableCell num className={r.paid > 0 ? 'text-cleared' : undefined}>{formatPKR(r.paid)}</TableCell>
                  <TableCell num className={r.pending > 0 ? 'text-dues' : undefined}>{formatPKR(r.pending)}</TableCell>
                  <TableCell num>{formatPKR(r.planned)}</TableCell>
                  <TableCell num className={r.remaining > 0 ? 'font-semibold text-ink' : 'text-ink-subtle'}>{formatPKR(r.remaining)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-section font-semibold text-ink">Payout batches</h2>
            {runBatches.length > 0 && (
              <Button size="sm" variant="subtle" onClick={() => navigate('/staff/payouts')}>All payouts</Button>
            )}
          </div>
          {runBatches.length === 0 ? (
            <p className="py-4 text-center text-body text-ink-muted">No batches yet. Create one to group unpaid lines by mode and account (§55).</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead num>Recipients</TableHead>
                  <TableHead num>Authorized total</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runBatches.map(({ batch, recipients, total }) => (
                  <TableRow key={batch.id} className="cursor-pointer" onClick={() => navigate(`/staff/payouts/${batch.id}`)}>
                    <TableCell className="num">{batch.batchNo}</TableCell>
                    <TableCell>{batch.mode}</TableCell>
                    <TableCell>{accountName(batch.accountId)}</TableCell>
                    <TableCell num>{recipients}</TableCell>
                    <TableCell num>{formatPKR(total)}</TableCell>
                    <TableCell><span className={batchText(batch.state)}>{batch.state}</span></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        {(batch.state === 'Prepared' || batch.state === 'Ready') && role && (
                          <Button size="sm" variant="outline" onClick={() => authorize(batch.id)}>Authorize</Button>
                        )}
                        {(batch.state === 'Prepared' || batch.state === 'Ready' || batch.state === 'Authorized') && (
                          <Button size="sm" variant="ghost" onClick={() => { setCancelTarget(batch); setCancelReason(''); }}>Cancel</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <NewPayoutBatchDialog
          key={`new-batch-${run.id}`}
          runId={run.id}
          serviceMonth={run.serviceMonth}
          candidates={candidates}
          open
          onOpenChange={(o) => { if (!o) setDialogOpen(false); }}
        />
      )}

      <Dialog open={cancelTarget !== null} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel batch {cancelTarget?.batchNo}</DialogTitle>
            <DialogDescription>A batch that has not been executed is cancelled with a reason; an executed one is corrected by a linked reversal (§56).</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-meta text-ink-muted" htmlFor="cancel-reason">Reason</label>
            <Input id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is this batch cancelled?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep batch</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={!cancelReason.trim()}>Cancel batch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
