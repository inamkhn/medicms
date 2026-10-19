import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PayrollLineDrawer } from '@/components/staff/PayrollLineDrawer';
import { formatDateTime, formatDate, formatPKR } from '@/lib/utils';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { useMoneyStore } from '@/stores/moneyStore';
import { can } from '@/lib/permissions';
import {
  computeLineTotals, computeRunTotals, getPayrollRunProjection, resolveEligibility,
} from '@/lib/payroll';
import type { ApprovalContext, DraftBundle, PayrollLine, RunCalculationState } from '@/lib/payroll';

// ============================================
// RunDetail — STAFF_PAYROLL_DESIGN §54 (/staff/payroll/:id)
// The review and lifecycle screen for one run. Its whole purpose is the §20.3
// boundary: the run *decides* what is owed and, on approval, atomically freezes
// the totals and posts cost / payable / recovery records — and pays no one (§23).
// Approval and reversal run through the pure run core, so the numbers here always
// match §65. §54.2's line drawer is read-only (adjustments are supplemental
// corrections, P13); payout planning is §55 (P12). The projection (§43, integrity
// 8) drops every named line for a non-Admin — they see only the aggregate card.
// ============================================

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

function calcText(state: RunCalculationState): string {
  if (state === 'Approved') return 'text-cleared';
  if (state === 'Cancelled' || state === 'Reversed') return 'text-ink-subtle';
  if (state === 'Submitted') return 'text-dues';
  return 'text-ink';
}

interface LineView {
  line: PayrollLine;
  name: string;
  base: number;
  variable: number;
  reductions: number;
  recovery: number;
  net: number;
}

export default function RunDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  const run = usePayrollStore((s) => s.runs.find((r) => r.id === id));
  const allLines = usePayrollStore((s) => s.lines);
  const allRecoveries = usePayrollStore((s) => s.recoveries);
  const staffRecords = usePayrollStore((s) => s.staff);
  const payStructures = usePayrollStore((s) => s.payStructures);
  const workInputs = usePayrollStore((s) => s.workInputs);
  const runs = usePayrollStore((s) => s.runs);
  const closedMonths = useMoneyStore((s) => s.closedMonths);
  const logs = useAuditStore((s) => s.logs);

  const [confirmApprove, setConfirmApprove] = useState(false);
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [search, setSearch] = useState('');
  const [lineId, setLineId] = useState<string | null>(null);

  if (!run) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/staff/payroll')}>← Pay runs</Button>
        <Card><CardContent className="p-6 text-body text-ink-muted">This pay run is no longer available (§19).</CardContent></Card>
      </div>
    );
  }

  const runLines = allLines.filter((l) => l.runId === run.id);
  const runRecs = allRecoveries.filter((r) => runLines.some((l) => l.id === r.payrollLineId));
  const bundle: DraftBundle = { run, lines: runLines, recoveries: runRecs };

  const projection = getPayrollRunProjection(run, runLines, role);
  const canManage = can(role, 'payroll.run.manage');
  const totals = run.totals ?? computeRunTotals(runLines);
  const nameOf = (staffId: string) => staffRecords.find((s) => s.id === staffId)?.fullName ?? '—';

  const lineViews: LineView[] = runLines.map((line) => {
    const { breakdown } = computeLineTotals({ items: line.items, recovery: line.recoveries });
    return {
      line,
      name: nameOf(line.staffId),
      base: breakdown.base,
      variable: breakdown.sessionPay + breakdown.honoraria + breakdown.allowances,
      reductions: breakdown.reductions,
      recovery: line.recoveries,
      net: line.net,
    };
  });
  const query = search.trim().toLowerCase();
  const shownLines = lineViews.filter((lv) => !query || lv.name.toLowerCase().includes(query));

  const exceptions = runLines.filter((l) => l.net < 0 || (l.gross === 0 && !l.zeroPayReason)).length;

  const canSubmit = canManage && run.calculationState === 'Draft';
  const canApprove = canManage && run.calculationState === 'Submitted';
  const canReverse = canManage && run.calculationState === 'Approved';
  const canCancel = canManage && (run.calculationState === 'Draft' || run.calculationState === 'Submitted');
  // §55 payout planning is a separate Admin verb; only an approved, frozen run has a payable.
  const canPlanPayouts = can(role, 'payroll.payout.manage') && run.calculationState === 'Approved';

  function buildApprovalCtx(): ApprovalContext {
    const actor = user?.name ?? 'Unknown';
    const now = new Date().toISOString();
    const { missingStructure } = resolveEligibility(staffRecords, payStructures, run!.serviceMonth);
    const lineStaff = new Set(runLines.map((l) => l.staffId));
    const unverified = new Set(
      workInputs.filter((w) => w.serviceMonth === run!.serviceMonth && w.state === 'Draft' && lineStaff.has(w.staffId)).map((w) => w.staffId),
    );
    const existingApprovedStandardRun = runs.some(
      (r) => r.id !== run!.id && r.serviceMonth === run!.serviceMonth && r.kind === 'Standard' && r.calculationState === 'Approved',
    );
    return {
      actor,
      timestamp: now,
      approvalDate: now.slice(0, 10),
      existingApprovedStandardRun,
      closedMonths,
      missingStructureStaffIds: missingStructure,
      unverifiedInputStaffIds: [...unverified],
    };
  }

  function act(label: string, details: string): void {
    useAuditStore.getState().addLog({ user: user?.name ?? 'Unknown', action: 'Staff Entry', details: `${label} · ${details} (§54)` });
  }

  function refresh(): void {
    const problems = usePayrollStore.getState().regenerateRunDraft(run!.id, user?.name ?? 'Unknown', new Date().toISOString());
    if (problems.length) toastError({ title: 'Recalculated with notes', description: problems[0] });
    else toastSuccess({ title: 'Calculations refreshed', description: run!.runNumber });
    act('Refreshed', run!.runNumber);
  }

  function submit(): void {
    const problems = usePayrollStore.getState().submitRun(run!.id, user?.name ?? 'Unknown', new Date().toISOString());
    if (problems.length) { toastError({ title: 'Cannot submit', description: problems[0] }); return; }
    toastSuccess({ title: 'Submitted for approval', description: run!.runNumber });
    act('Submitted', run!.runNumber);
  }

  function cancel(): void {
    const problems = usePayrollStore.getState().cancelRun(run!.id, cancelReason.trim(), user?.name ?? 'Unknown', new Date().toISOString());
    if (problems.length) { toastError({ title: 'Cannot cancel', description: problems[0] }); return; }
    toastSuccess({ title: 'Run cancelled', description: run!.runNumber });
    act('Cancelled', `${run!.runNumber} · reason: ${cancelReason.trim()}`);
    setCancelMode(false);
    setCancelReason('');
  }

  function approve(): void {
    const outcome = usePayrollStore.getState().approveRun(bundle, buildApprovalCtx());
    if (!outcome.ok) {
      toastError({ title: 'Approval refused', description: outcome.problems[0] ?? 'Preflight failed (§20.3).' });
      return;
    }
    toastSuccess({ title: 'Payroll approved', description: `${run!.runNumber} frozen · cost & payable posted, nobody paid yet (§23)` });
    act('Approved', `${run!.runNumber} · gross ${totals.gross} · net ${totals.netPayable}`);
    setConfirmApprove(false);
  }

  function reverse(): void {
    const actor = user?.name ?? 'Unknown';
    const now = new Date().toISOString();
    const outcome = usePayrollStore.getState().reverseRun(bundle, { actor, timestamp: now, disbursementsExist: false, closedMonths });
    if (!outcome.ok) { toastError({ title: 'Cannot reverse', description: outcome.problems[0] ?? '§20.4' }); return; }
    toastSuccess({ title: 'Run reversed', description: `${run!.runNumber} undone as linked contra records` });
    act('Reversed', run!.runNumber);
  }

  const history = logs.filter((l) => l.details.includes(run.runNumber)).slice(0, 50);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/staff/payroll')}>← Pay runs</Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-title font-semibold text-ink num">{run.runNumber}</h1>
            <span className={calcText(run.calculationState)}>{run.calculationState}</span>
            <span className="text-micro text-ink-subtle">· {run.disbursementState}</span>
          </div>
          <p className="text-meta text-ink-muted">
            {monthLabel(run.serviceMonth)} · {run.kind} · created {formatDate(run.createdAt.slice(0, 10))} by {run.createdBy} · revision {run.revision}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSubmit && <Button variant="outline" size="sm" onClick={refresh}>Refresh calculations</Button>}
          {canSubmit && <Button size="sm" onClick={submit}>Submit</Button>}
          {canApprove && <Button size="sm" onClick={() => setConfirmApprove(true)}>Approve payroll</Button>}
          {canReverse && <Button variant="subtle" size="sm" onClick={reverse}>Reverse run</Button>}
          {canPlanPayouts && <Button variant="outline" size="sm" onClick={() => navigate(`/staff/payroll/${run!.id}/payouts`)}>Plan payouts</Button>}
          {canCancel && !cancelMode && <Button variant="ghost" size="sm" onClick={() => setCancelMode(true)}>Cancel run</Button>}
        </div>
      </div>

      {cancelMode && (
        <div className="flex items-center gap-2">
          <Input aria-label="Cancel reason" className="w-72" placeholder="Reason for cancelling (§20.4)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          <Button variant="destructive" disabled={!cancelReason.trim()} onClick={cancel}>Confirm cancel</Button>
          <Button variant="ghost" onClick={() => { setCancelMode(false); setCancelReason(''); }}>Dismiss</Button>
        </div>
      )}

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Metric label="Gross cost" value={formatPKR(totals.gross)} />
          <Metric label="Advance recovery" value={formatPKR(totals.advanceRecoveries)} />
          <Metric label="Net payable" value={formatPKR(totals.netPayable)} />
          <Metric label="Lines / exceptions" value={`${runLines.length} / ${exceptions}`} />
        </CardContent>
      </Card>

      {projection.privileged ? (
        <Tabs defaultValue="earnings">
          <TabsList>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="recoveries">Recoveries</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <div className="mt-3 space-y-3">
            <TabsContent value="earnings">
              <Card>
                <CardContent className="space-y-3 p-4">
                  <Input aria-label="Search staff" className="w-56" placeholder="Search staff…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  {shownLines.length === 0 ? (
                    <p className="py-4 text-center text-body text-ink-muted">No lines in this run.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead>Pay type</TableHead>
                          <TableHead num>Base</TableHead>
                          <TableHead num>Variable</TableHead>
                          <TableHead num>Reductions</TableHead>
                          <TableHead num>Recovery</TableHead>
                          <TableHead num>Net</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shownLines.map((lv) => (
                          <TableRow key={lv.line.id}>
                            <TableCell>{lv.name}</TableCell>
                            <TableCell>{lv.line.snapshot.type}</TableCell>
                            <TableCell num>{formatPKR(lv.base)}</TableCell>
                            <TableCell num>{formatPKR(lv.variable)}</TableCell>
                            <TableCell num>{formatPKR(lv.reductions)}</TableCell>
                            <TableCell num>{formatPKR(lv.recovery)}</TableCell>
                            <TableCell num>{formatPKR(lv.net)}</TableCell>
                            <TableCell><Button size="sm" variant="link" onClick={() => setLineId(lv.line.id)}>Open</Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="recoveries">
              <Card>
                <CardContent className="p-4">
                  {runRecs.length === 0 ? (
                    <p className="text-body text-ink-muted">No advance recoveries in this run.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead>Advance</TableHead>
                          <TableHead>Selection</TableHead>
                          <TableHead num>Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runRecs.map((r) => {
                          const line = runLines.find((l) => l.id === r.payrollLineId);
                          return (
                            <TableRow key={r.id}>
                              <TableCell>{line ? nameOf(line.staffId) : '—'}</TableCell>
                              <TableCell className="num">{r.advanceId}</TableCell>
                              <TableCell>{r.selection}</TableCell>
                              <TableCell num>{formatPKR(r.amount)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="overview">
              <Card><CardContent className="p-4 text-body text-ink-muted">
                {run.kind === 'Supplemental' && run.referencesRunId
                  ? `Supplemental correcting ${runs.find((r) => r.id === run.referencesRunId)?.runNumber ?? run.referencesRunId} (§19, §20.4).`
                  : `Standard run for ${monthLabel(run.serviceMonth)}. Approving freezes these figures and posts cost and payable only — money moves at payout (§23).`}
                {run.reviewNote && <div className="mt-2 text-ink">Note: {run.reviewNote}</div>}
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="history">
              <Card><CardContent className="p-4">
                {history.length === 0 ? (
                  <p className="text-body text-ink-muted">No recorded actions for this run.</p>
                ) : (
                  <ul className="space-y-2">
                    {history.map((l) => (
                      <li key={l.id} className="border-b border-hairline-soft pb-2 last:border-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-body text-ink">{l.action}</span>
                          <span className="num text-meta text-ink-subtle">{formatDateTime(l.timestamp)}</span>
                        </div>
                        <p className="text-meta text-ink-muted">{l.user} — {l.details}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent></Card>
            </TabsContent>
          </div>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="p-4">
            <p className="text-micro font-semibold uppercase tracking-wide text-ink-subtle">Aggregate summary</p>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Run" value={<span className="num">{run.runNumber}</span>} />
              <Metric label="Staff" value={String(projection.summary.staffCount)} />
              <Metric label="Gross" value={formatPKR(projection.summary.totals?.gross ?? totals.gross)} />
              <Metric label="Net payable" value={formatPKR(projection.summary.totals?.netPayable ?? totals.netPayable)} />
            </div>
            <p className="mt-3 text-meta text-ink-muted">
              Individual salary lines are restricted to Administrators (§43, §64 integrity 8).
            </p>
          </CardContent>
        </Card>
      )}

      {lineId && (
        <PayrollLineDrawer key={lineId} open lineId={lineId} onOpenChange={(o) => { if (!o) setLineId(null); }} />
      )}

      <Dialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve {run.runNumber}?</DialogTitle>
            <DialogDescription>
              Service month {monthLabel(run.serviceMonth)} · {runLines.length} staff · {exceptions} exceptions
            </DialogDescription>
          </DialogHeader>
          <p className="mx-4 rounded-control border border-hairline bg-surface p-3 text-meta text-ink">
            This will freeze the calculation and post {formatPKR(totals.gross)} of payroll cost and {formatPKR(totals.netPayable)} of salary payable. It will NOT pay anyone yet (§54.3).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApprove(false)}>Back to review</Button>
            <Button onClick={approve}>Approve payroll</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-micro uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="num text-section font-semibold text-ink">{value}</p>
    </div>
  );
}
