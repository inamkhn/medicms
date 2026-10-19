import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StaffSummaryCard } from '@/components/staff/StaffSummaryCard';
import { formatPKR } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useMoneyStore } from '@/stores/moneyStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { can } from '@/lib/permissions';
import {
  computePaymentPosition, monthClosePayrollStatus, payrollHealthChecks, runForMonth, serviceMonthOf,
  workforceCounts, canSeeIndividualPay, getStaffProjection,
} from '@/lib/payroll';
import type { Permission } from '@/lib/permissions';
import type { PayrollRun, ServiceMonth } from '@/lib/payroll';

// ============================================
// StaffOverview — STAFF_PAYROLL_DESIGN §45–§46 (/staff, role-scoped projection)
// The module's landing page. Every figure is derived from the payroll records
// through the report core — the payment position reuses the disbursement core, so
// an uncleared cheque is never shown as paid (§29, §41). The layout is the Admin
// view (§46.1); an Accountant or Viewer gets the same aggregates but none of the
// manage actions and no route they cannot use (§46.2). A not-yet-configured
// institute sees the §45 getting-started checklist instead of a blank chart.
// ============================================

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabel(month: ServiceMonth): string {
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

function calcText(state: PayrollRun['calculationState']): string {
  if (state === 'Approved') return 'text-cleared';
  if (state === 'Cancelled' || state === 'Reversed') return 'text-ink-subtle';
  if (state === 'Submitted') return 'text-dues';
  return 'text-ink';
}

/** §45 the getting-started steps; each ticks when its real condition holds. */
interface SetupStep {
  n: number;
  title: string;
  detail: string;
  done: boolean;
  actionLabel: string;
  actionTo: string;
  actionPerm: Permission;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-meta text-ink-muted">{label}</span>
      <span className={`num text-body font-semibold ${tone ?? 'text-ink'}`}>{value}</span>
    </div>
  );
}

export default function StaffOverview() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  const staff = usePayrollStore((s) => s.staff);
  const payStructures = usePayrollStore((s) => s.payStructures);
  const workInputs = usePayrollStore((s) => s.workInputs);
  const advances = usePayrollStore((s) => s.advances);
  const advanceEvents = usePayrollStore((s) => s.advanceEvents);
  const runs = usePayrollStore((s) => s.runs);
  const lines = usePayrollStore((s) => s.lines);
  const payables = usePayrollStore((s) => s.payables);
  const costPostings = usePayrollStore((s) => s.costPostings);
  const payoutBatches = usePayrollStore((s) => s.payoutBatches);
  const payoutAllocations = usePayrollStore((s) => s.payoutAllocations);
  const disbursements = usePayrollStore((s) => s.disbursements);
  const accounts = useMoneyStore((s) => s.accounts);

  const currentMonth = serviceMonthOf(new Date().toISOString().slice(0, 10));
  const monthOptions = Array.from(new Set([currentMonth, ...runs.map((r) => r.serviceMonth)])).sort().reverse();
  const [month, setMonth] = useState<ServiceMonth>(currentMonth);

  const privileged = canSeeIndividualPay(role);
  const canAct = can(role, 'payroll.run.manage');

  const data = { staff, payStructures, workInputs, runs, lines, payables, costPostings, advances, advanceEvents, payoutBatches, payoutAllocations, disbursements };

  // §45 not configured yet → checklist, not a meaningless empty chart.
  const configured = staff.length > 0 && payStructures.length > 0;
  const workforce = workforceCounts(staff, month);
  const run = runForMonth(runs, month);
  const runPayables = run ? payables.filter((p) => p.runId === run.id) : [];
  const position = computePaymentPosition(runPayables, disbursements, payoutBatches);
  const exceptions = run ? lines.filter((l) => l.runId === run.id && (l.net < 0 || (l.gross === 0 && !l.zeroPayReason))).length : 0;
  const checks = payrollHealthChecks(data, month, currentMonth);
  // §22/§67 what month close asks: the run is approved and frozen — finalized
  // means the cost is decided, not that every rupee has been paid.
  const closeStatus = monthClosePayrollStatus(month, runs);

  const recentRuns = runs
    .filter((r) => r.calculationState !== 'Cancelled')
    .sort((a, b) => (a.serviceMonth !== b.serviceMonth ? (a.serviceMonth < b.serviceMonth ? 1 : -1) : a.runNumber < b.runNumber ? 1 : -1))
    .slice(0, 6);

  const steps: SetupStep[] = [
    { n: 1, title: 'Add staff', detail: 'Create at least one active staff record.', done: staff.length > 0, actionLabel: 'Add staff', actionTo: '/staff/directory', actionPerm: 'staff.manage' },
    { n: 2, title: 'Set pay structures', detail: 'Add an effective salary/rate for staff.', done: payStructures.length > 0, actionLabel: 'Set rates', actionTo: '/staff/directory', actionPerm: 'staff.manage' },
    { n: 3, title: 'Set up Finance accounts', detail: 'Cash and bank opening positions are ready.', done: accounts.some((a) => a.status === 'Active'), actionLabel: 'Open accounts', actionTo: '/finance/accounts', actionPerm: 'finance.view' },
    { n: 4, title: 'Review advances', detail: 'Enter opening outstanding advances.', done: advances.length > 0, actionLabel: 'Review', actionTo: '/staff/advances', actionPerm: 'payroll.advances.view' },
    { n: 5, title: 'Generate first pay run', detail: 'Create a draft for a service month.', done: runs.length > 0, actionLabel: 'New pay run', actionTo: '/staff/payroll', actionPerm: 'payroll.run.manage' },
  ];

  const quickActions: { label: string; to: string; perm: Permission }[] = [
    { label: 'Add staff', to: '/staff/directory', perm: 'staff.manage' },
    { label: 'Work inputs', to: '/staff/work-inputs', perm: 'payroll.inputs.manage' },
    { label: 'Salary advances', to: '/staff/advances', perm: 'payroll.advances.view' },
    { label: 'Generate pay run', to: '/staff/payroll', perm: 'payroll.run.manage' },
    { label: 'Reports', to: '/staff/reports', perm: 'payroll.reports.view' },
    { label: 'Payroll settings', to: '/staff/settings', perm: 'payroll.settings.manage' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-ink">Staff &amp; Payroll</h1>
          <p className="text-meta text-ink-muted">A run decides what is owed; money moves only at payout through Finance (§23).</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onValueChange={(v) => setMonth(v)}>
            <SelectTrigger className="w-44" aria-label="Service month"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          {canAct && <Button size="sm" onClick={() => navigate('/staff/payroll')}>New pay run</Button>}
        </div>
      </div>

      {!configured ? (
        canAct ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="text-section font-semibold text-ink">Get payroll ready</h2>
              {steps.map((step) => (
                <div key={step.n} className="flex items-center justify-between gap-3 border-b border-hairline-soft py-2 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-pill border text-micro ${step.done ? 'border-cleared text-cleared' : 'border-hairline text-ink-subtle'}`}>{step.done ? '✓' : step.n}</span>
                    <div>
                      <p className="text-body font-semibold text-ink">{step.title}</p>
                      <p className="text-meta text-ink-muted">{step.detail}</p>
                    </div>
                  </div>
                  {can(role, step.actionPerm) && !step.done && (
                    <Button size="sm" variant="outline" onClick={() => navigate(step.actionTo)}>{step.actionLabel}</Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="p-6 text-body text-ink-muted">Payroll has not been set up yet. An Admin adds staff and pay structures first (§45).</CardContent></Card>
        )
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <StaffSummaryCard rows={staff.map((s) => getStaffProjection(s, role))} />
            <Card className="print:hidden">
              <CardContent className="p-4">
                <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Payroll status · {monthLabel(month)}</p>
                <Metric label="Run" value={run ? run.calculationState : 'No run'} tone={run ? calcText(run.calculationState) : 'text-ink-muted'} />
                <Metric label="Staff included" value={run ? String(lines.filter((l) => l.runId === run.id).length) : '0'} />
                <Metric label="Left this month" value={String(workforce.leftThisMonth)} tone={workforce.leftThisMonth > 0 ? 'text-dues' : 'text-ink'} />
                <Metric label="Exceptions" value={String(exceptions)} tone={exceptions > 0 ? 'text-dues' : 'text-ink'} />
                <Metric label="Month close" value={closeStatus.finalized ? 'Payroll finalized' : 'Not finalized'} tone={closeStatus.finalized ? 'text-cleared' : 'text-dues'} />
                {closeStatus.reasons.length > 0 && (
                  <p className="pt-1 text-micro text-ink-subtle">{closeStatus.reasons[0]}</p>
                )}
              </CardContent>
            </Card>
            <Card className="print:hidden">
              <CardContent className="p-4">
                <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Approved cost</p>
                {run?.totals ? (
                  <>
                    <Metric label="Gross" value={formatPKR(run.totals.gross)} />
                    <Metric label="Recoveries" value={formatPKR(run.totals.advanceRecoveries)} />
                    <Metric label="Net payable" value={formatPKR(run.totals.netPayable)} />
                  </>
                ) : (
                  <p className="text-body text-ink-muted">Nothing approved for this month yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="print:hidden">
            <CardContent className="p-4">
              <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Payment position</p>
              <div className="grid gap-x-8 md:grid-cols-2">
                <Metric label="Bank paid" value={formatPKR(position.bank)} />
                <Metric label="Cash paid" value={formatPKR(position.cash)} />
                <Metric label="Cheque cleared" value={formatPKR(position.chequeCleared)} />
                <Metric label="Cheque pending" value={formatPKR(position.chequePending)} tone={position.chequePending > 0 ? 'text-dues' : undefined} />
                <Metric label="Cleared money out" value={formatPKR(position.clearedTotal)} />
                <Metric label="To disburse" value={formatPKR(position.toDisburse)} tone={position.toDisburse > 0 ? 'text-dues' : 'text-cleared'} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {can(role, 'payroll.summary.view') && <Button size="sm" variant="subtle" onClick={() => navigate('/staff/payroll')}>Open pay run</Button>}
                {can(role, 'payroll.payout.summary') && <Button size="sm" variant="subtle" onClick={() => navigate('/staff/payouts')}>Open payout batches</Button>}
              </div>
            </CardContent>
          </Card>

          {checks.length > 0 && (
            <Card className="print:hidden">
              <CardContent className="p-4">
                <p className="mb-2 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Needs attention</p>
                <div className="space-y-2">
                  {checks.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3">
                      <span className={`text-body ${c.tone === 'warn' ? 'text-dues' : 'text-ink'}`}>
                        <span className="mr-1.5 font-semibold">{c.tone === 'warn' ? '(!)' : '(i)'}</span>{c.label}
                      </span>
                      {(canAct || c.actionTo === '/staff/payroll' || c.actionTo === '/staff/payouts' || c.actionTo === '/staff/directory') && (
                        <Button size="sm" variant="outline" onClick={() => navigate(c.actionTo)}>{c.actionLabel}</Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="print:hidden">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-section font-semibold text-ink">Recent pay runs</h2>
              {recentRuns.length === 0 ? (
                <p className="py-4 text-center text-body text-ink-muted">No pay runs yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>State</TableHead>
                      {privileged && <TableHead num>Gross</TableHead>}
                      <TableHead num>Net</TableHead>
                      <TableHead num>Disbursed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentRuns.map((r) => {
                      const t = r.totals;
                      return (
                        <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/staff/payroll/${r.id}`)}>
                          <TableCell>{monthLabel(r.serviceMonth)}{r.kind === 'Supplemental' && <span className="ml-1 text-micro text-ink-subtle">suppl.</span>}</TableCell>
                          <TableCell><span className={calcText(r.calculationState)}>{r.calculationState}</span></TableCell>
                          {privileged && <TableCell num>{t ? formatPKR(t.gross) : '—'}</TableCell>}
                          <TableCell num>{t ? formatPKR(t.netPayable) : '—'}</TableCell>
                          <TableCell num>{t ? formatPKR(t.paid) : '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 print:hidden">
            {quickActions.filter((a) => can(role, a.perm)).map((a) => (
              <Button key={a.label} size="sm" variant="ghost" onClick={() => navigate(a.to)}>{a.label}</Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
