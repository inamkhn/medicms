import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatPKR } from '@/lib/utils';
import { usePayrollStore } from '@/stores/payrollStore';
import { computeLineTotals } from '@/lib/payroll';
import type { EarningComponent } from '@/lib/payroll';

// ============================================
// PayrollLineDrawer — STAFF_PAYROLL_DESIGN §54.2 (Admin only)
// Read-only reconstruction of one frozen line: its structure snapshot, the
// earned components, the advance recoveries committed against it and the net.
// Gross/net are re-derived from the line's items through the calc core so the
// drawer always agrees with the approved arithmetic (§65 t52). §54.2's
// "Apply adjustment" writes a *new* itemised line against an approved run — that
// is a supplemental correction (P13), so no edit control lives here.
// ============================================

const COMPONENT_LABEL: Record<EarningComponent, string> = {
  Base: 'Monthly base',
  Session: 'Session earnings',
  Honorarium: 'Honorarium',
  Allowance: 'Allowance',
  Bonus: 'Bonus',
  Reduction: 'Approved reductions',
  Correction: 'Correction',
};

function Row({ label, value, muted }: { label: string; value?: ReactNode; muted?: boolean }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline-soft py-1.5 last:border-0">
      <span className="text-meta text-ink-muted">{label}</span>
      <span className={`text-right text-body ${muted ? 'text-ink-muted' : 'num text-ink'}`}>{value}</span>
    </div>
  );
}

export interface PayrollLineDrawerProps {
  open: boolean;
  lineId: string;
  onOpenChange: (open: boolean) => void;
}

export function PayrollLineDrawer({ open, lineId, onOpenChange }: PayrollLineDrawerProps) {
  const navigate = useNavigate();
  const line = usePayrollStore((s) => s.lines.find((l) => l.id === lineId));
  const staffName = usePayrollStore((s) => s.staff.find((st) => st.id === line?.staffId)?.fullName ?? '—');
  const runState = usePayrollStore((s) => s.runs.find((r) => r.id === line?.runId)?.calculationState);
  const recoveries = usePayrollStore((s) => s.recoveries);
  const advances = usePayrollStore((s) => s.advances);

  if (!line) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payroll line</DialogTitle>
            <DialogDescription>This line is no longer available.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const totals = computeLineTotals({ items: line.items, recovery: line.recoveries });
  const baseItem = line.items.find((i) => i.component === 'Base');
  const lineRecs = recoveries.filter((r) => r.payrollLineId === line.id);
  const advanceNo = (id: string) => advances.find((a) => a.id === id)?.advanceNo ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payroll line — {staffName}</DialogTitle>
          <DialogDescription>
            Structure snapshot v{line.snapshot.revision} · {line.snapshot.type}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
          <Card>
            <CardContent className="p-4">
              <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Earnings</p>
              {line.items.length === 0 ? (
                <p className="text-body text-ink-muted">No earned components this month.</p>
              ) : (
                line.items.map((i) => (
                  <Row
                    key={i.id}
                    label={`${COMPONENT_LABEL[i.component]}${i.reason ? ` — ${i.reason}` : ''}`}
                    value={i.component === 'Reduction' ? `− ${formatPKR(i.amount)}` : formatPKR(i.amount)}
                  />
                ))
              )}
              <Row label="GROSS" value={formatPKR(totals.gross)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Advance recoveries</p>
              {lineRecs.length === 0 ? (
                <p className="text-body text-ink-muted">No advance recovery this run.</p>
              ) : (
                lineRecs.map((r) => (
                  <Row key={r.id} label={`${advanceNo(r.advanceId)} (${r.selection})`} value={formatPKR(r.amount)} />
                ))
              )}
              <Row label="Total recovery" value={formatPKR(line.recoveries)} />
              <div className="mt-1 flex items-baseline justify-between border-t border-hairline pt-1.5">
                <span className="text-body font-semibold text-ink">NET PAYABLE</span>
                <span className="num text-body font-semibold text-ink">{formatPKR(totals.net)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Source</p>
              {baseItem?.eligibleDays !== undefined && baseItem.denominator !== undefined && (
                <Row label="Eligible days" value={`${baseItem.eligibleDays} of ${baseItem.denominator}`} />
              )}
              <Row label="Cost category" value={line.snapshot.costCategory ?? '—'} />
              {line.zeroPayReason && <Row label="Zero-pay reason" value={line.zeroPayReason} muted />}
              {line.overrideReason && <Row label="Override reason" value={line.overrideReason} muted />}
              {totals.problems.length > 0 && (
                <p className="mt-2 text-meta text-danger">{totals.problems[0]}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {runState === 'Approved' && (
            <Button size="sm" onClick={() => { onOpenChange(false); navigate(`/staff/payslip/${line.id}`); }}>
              <Printer size={14} className="mr-1.5" /> Print payslip
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
