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
import { GeneratePayrollWizard } from '@/components/staff/GeneratePayrollWizard';
import { formatPKR } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { can } from '@/lib/permissions';
import { computeRunTotals } from '@/lib/payroll';
import type { PayrollRun, RunCalculationState, RunDisbursementState, RunKind } from '@/lib/payroll';

// ============================================
// PayRuns — STAFF_PAYROLL_DESIGN §52 (/staff/payroll)
// The run register. Every role that holds payroll.summary.view sees the month,
// the two independent states, the staff count and the rupee totals — but never
// another person's named line (§43, §64 integrity 8); the detail screen applies
// the projection that drops lines for non-Admins. Draft totals are derived from
// the run's lines on every render; only an approved run's frozen snapshot is read
// back (§64.9). "Generate payroll" is Admin-only.
// ============================================

const CALC_STATES: readonly RunCalculationState[] = ['Draft', 'Submitted', 'Approved', 'Cancelled', 'Reversed'];
const DISB_STATES: readonly RunDisbursementState[] = ['Unpaid', 'Part paid', 'Paid', 'Pending cheque clearance'];
const KINDS: readonly RunKind[] = ['Standard', 'Supplemental'];

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

function calcText(state: RunCalculationState): string {
  if (state === 'Approved') return 'text-cleared';
  if (state === 'Cancelled' || state === 'Reversed') return 'text-ink-subtle';
  if (state === 'Submitted') return 'text-dues';
  return 'text-ink';
}

interface Row {
  run: PayrollRun;
  staffCount: number;
  gross: number;
  net: number;
  paid: number;
  pending: number;
}

export default function PayRuns() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const runs = usePayrollStore((s) => s.runs);
  const lines = usePayrollStore((s) => s.lines);

  const [year, setYear] = useState<string>('all');
  const [calc, setCalc] = useState<RunCalculationState | 'all'>('all');
  const [disb, setDisb] = useState<RunDisbursementState | 'all'>('all');
  const [kind, setKind] = useState<RunKind | 'all'>('all');
  const [wizardOpen, setWizardOpen] = useState(false);

  const years = Array.from(new Set(runs.map((r) => r.serviceMonth.slice(0, 4)))).sort().reverse();

  const rows: Row[] = runs.map((run) => {
    const runLines = lines.filter((l) => l.runId === run.id);
    // §64.9 an approved run reads its frozen snapshot; a draft is re-derived.
    const totals = run.totals ?? computeRunTotals(runLines);
    return {
      run,
      staffCount: runLines.length,
      gross: totals.gross,
      net: totals.netPayable,
      paid: totals.paid,
      pending: totals.stillPayable,
    };
  });

  const visible = rows
    .filter((r) => year === 'all' || r.run.serviceMonth.startsWith(year))
    .filter((r) => calc === 'all' || r.run.calculationState === calc)
    .filter((r) => disb === 'all' || r.run.disbursementState === disb)
    .filter((r) => kind === 'all' || r.run.kind === kind)
    .sort((a, b) => {
      if (a.run.serviceMonth !== b.run.serviceMonth) return a.run.serviceMonth < b.run.serviceMonth ? 1 : -1;
      if (a.run.kind !== b.run.kind) return a.run.kind === 'Standard' ? -1 : 1;
      return a.run.runNumber < b.run.runNumber ? 1 : -1;
    });

  const canManage = can(role, 'payroll.run.manage');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-ink">Pay runs</h1>
          <p className="text-meta text-ink-muted">A run decides what is owed; it never moves money (§18, §23).</p>
        </div>
        {canManage && <Button size="sm" onClick={() => setWizardOpen(true)}>+ Generate payroll</Button>}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-32" aria-label="Service year"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={calc} onValueChange={(v) => setCalc(v as RunCalculationState | 'all')}>
              <SelectTrigger className="w-36" aria-label="Calculation state"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {CALC_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={disb} onValueChange={(v) => setDisb(v as RunDisbursementState | 'all')}>
              <SelectTrigger className="w-44" aria-label="Disbursement state"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any payout</SelectItem>
                {DISB_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={kind} onValueChange={(v) => setKind(v as RunKind | 'all')}>
              <SelectTrigger className="w-36" aria-label="Run type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {KINDS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-body text-ink-muted">
              No pay runs yet.{canManage ? ' Generate one with + Generate payroll.' : ''}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Service month</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead num>Staff</TableHead>
                  <TableHead num>Gross</TableHead>
                  <TableHead num>Net</TableHead>
                  <TableHead>Payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.run.id} className="cursor-pointer" onClick={() => navigate(`/staff/payroll/${r.run.id}`)}>
                    <TableCell className="num">
                      {r.run.runNumber}
                      {r.run.kind === 'Supplemental' && <span className="ml-1 text-micro text-ink-subtle">suppl.</span>}
                    </TableCell>
                    <TableCell>{monthLabel(r.run.serviceMonth)}</TableCell>
                    <TableCell><span className={calcText(r.run.calculationState)}>{r.run.calculationState}</span></TableCell>
                    <TableCell num>{r.staffCount}</TableCell>
                    <TableCell num>{formatPKR(r.gross)}</TableCell>
                    <TableCell num>{formatPKR(r.net)}</TableCell>
                    <TableCell>
                      {r.run.totals && r.paid > 0
                        ? `${formatPKR(r.paid)} + ${formatPKR(r.pending)} pending`
                        : <span className={r.run.disbursementState === 'Paid' ? 'text-cleared' : 'text-ink-muted'}>{r.run.disbursementState}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {wizardOpen && (
        <GeneratePayrollWizard key="generate-payroll" open onOpenChange={(o) => { if (!o) setWizardOpen(false); }} />
      )}
    </div>
  );
}
