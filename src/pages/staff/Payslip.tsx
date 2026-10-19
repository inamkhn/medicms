import { useNavigate, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PayslipDoc } from '@/components/staff/PayslipDoc';
import type { PayslipDocProps } from '@/components/staff/PayslipDoc';
import { formatDateTime, formatPKR } from '@/lib/utils';
import { INSTITUTE_INFO } from '@/lib/constants';
import { toastError } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { computeLineTotals, derivePayablePositions } from '@/lib/payroll';
import type { EarningComponent } from '@/lib/payroll';

// ============================================
// Payslip — STAFF_PAYROLL_DESIGN §59.1 (/staff/payslip/:lineId, Admin only)
// The one place a named line is turned into an A4 payslip. Route-gated to
// payroll.compensation.view, so only an Admin reaches it; the figures come from
// the frozen approved line re-derived through the calc core, never a stored
// balance. Printing a private payslip is audited (§59.2). Reaching it by typed URL
// as another role fails exactly like a hidden link would (§43).
// ============================================

const FULL_NAMES: readonly string[] = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const COMPONENT_LABEL: Record<EarningComponent, string> = {
  Base: 'Monthly base',
  Session: 'Session earnings',
  Honorarium: 'Honorarium',
  Allowance: 'Allowance',
  Bonus: 'Bonus',
  Reduction: 'Reductions',
  Correction: 'Correction',
};

const ADDITIVE: readonly EarningComponent[] = ['Base', 'Session', 'Honorarium', 'Allowance', 'Bonus', 'Correction'];

export default function Payslip() {
  const { lineId = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const line = usePayrollStore((s) => s.lines.find((l) => l.id === lineId));
  const runs = usePayrollStore((s) => s.runs);
  const staffRecords = usePayrollStore((s) => s.staff);
  const recoveries = usePayrollStore((s) => s.recoveries);
  const advances = usePayrollStore((s) => s.advances);
  const payables = usePayrollStore((s) => s.payables);
  const disbursements = usePayrollStore((s) => s.disbursements);
  const payoutBatches = usePayrollStore((s) => s.payoutBatches);

  if (!line) {
    return (
      <div className="space-y-4">
        <Card><CardContent className="p-6 text-body text-ink-muted">This payroll line is no longer available (§59).</CardContent></Card>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>← Back</Button>
      </div>
    );
  }

  const run = runs.find((r) => r.id === line.runId);
  const staff = staffRecords.find((s) => s.id === line.staffId);
  const totals = computeLineTotals({ items: line.items, recovery: line.recoveries });

  const payable = payables.find((p) => p.payrollLineId === line.id);
  const position = derivePayablePositions(payable ? [payable] : [], disbursements)[0];
  const remaining = position?.stillPayable ?? line.net;
  const pending = position?.pendingCheques ?? 0;

  const lineDisbursements = disbursements.filter((d) => d.payrollLineId === line.id);
  const settledMode = lineDisbursements.length
    ? payoutBatches.find((b) => b.id === lineDisbursements[0].batchId)?.mode
    : undefined;
  const reference = lineDisbursements.find((d) => d.reference)?.reference;
  const paymentLabel = settledMode ? `${settledMode}${reference ? ' · reference ****' : ''}` : undefined;

  const lineRecs = recoveries.filter((r) => r.payrollLineId === line.id);
  const earnings = ADDITIVE
    .map((component) => ({ label: COMPONENT_LABEL[component], amount: totals.breakdown.byComponent[component] }))
    .filter((e) => e.amount > 0);

  const doc: PayslipDocProps = {
    instituteName: INSTITUTE_INFO.name,
    instituteLocation: INSTITUTE_INFO.location,
    serviceMonthLabel: run ? `${FULL_NAMES[Number(run.serviceMonth.split('-')[1]) - 1]} ${run.serviceMonth.split('-')[0]}` : '—',
    runNumber: run?.runNumber ?? '—',
    printedAt: formatDateTime(new Date().toISOString()),
    printedBy: user?.name ?? 'Unknown',
    staffName: staff?.fullName ?? '—',
    staffNo: staff?.staffNo ?? '—',
    designation: staff?.designation ?? '—',
    department: staff?.department,
    earnings,
    reductions: totals.breakdown.reductions,
    gross: totals.gross,
    recoveries: lineRecs.map((r) => ({ label: `Advance ${advances.find((a) => a.id === r.advanceId)?.advanceNo ?? r.advanceId}`, amount: r.amount })),
    net: totals.net,
    paymentLabel,
    remaining,
    pendingCheque: pending > 0,
    zeroPayReason: line.zeroPayReason,
  };

  function print() {
    if (run?.calculationState !== 'Approved') {
      toastError({ title: 'Not an approved run', description: 'A payslip prints only from a frozen approved payroll snapshot (§59.1).' });
      return;
    }
    useAuditStore.getState().addLog({ user: user?.name ?? 'Unknown', action: 'Staff Entry', details: `Printed payslip ${doc.staffNo} · ${doc.runNumber} · ${formatPKR(doc.net)} (§59)` });
    window.print();
  }

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <button className="text-meta text-ink-muted hover:text-ink" onClick={() => navigate(-1)}>← Pay run</button>
            <h1 className="text-title font-semibold text-ink">Payslip — {doc.staffName}</h1>
            <p className="text-meta text-ink-muted">A payslip is not a receipt or a voucher, and not proof a cheque cleared (§59.1).</p>
          </div>
          <Button size="sm" onClick={print}><Printer size={14} className="mr-1.5" /> Print A4</Button>
        </CardContent>
      </Card>

      <div className="print-area">
        <PayslipDoc {...doc} />
      </div>
    </div>
  );
}
