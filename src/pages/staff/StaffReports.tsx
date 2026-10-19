import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { PAYROLL_REPORTS, canSeeIndividualPay, serviceMonthOf } from '@/lib/payroll';
import type { ServiceMonth } from '@/lib/payroll';

// ============================================
// StaffReports — STAFF_PAYROLL_DESIGN §58.1 (/staff/reports, payroll.reports.view)
// The report index. Aggregate reports are listed for anyone holding the view
// verb; the named-compensation block is only offered to a role that passes
// `canSeeIndividualPay` (§43 — a link a role cannot use is not shown, and the
// data wall in `buildPayrollReport` is the second wall behind it). The period
// filters travel to the detail screen on the query string so an export or print
// always reflects the window that was chosen here (§58.2).
// ============================================

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function MonthSelect({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44" aria-label={ariaLabel}><SelectValue placeholder={ariaLabel} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All months</SelectItem>
        {MONTH_LABELS.flatMap((name, i) => {
          const mm = String(i + 1).padStart(2, '0');
          return [2024, 2025, 2026].map((yy) => (
            <SelectItem key={`${yy}-${mm}`} value={`${yy}-${mm}`}>{`${name} ${yy}`}</SelectItem>
          ));
        })}
      </SelectContent>
    </Select>
  );
}

export default function StaffReports() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const privileged = canSeeIndividualPay(role);

  const runs = usePayrollStore((s) => s.runs);
  // Default the window to the most recent service month seen on a run.
  const latest = [...runs.map((r) => r.serviceMonth)].sort().at(-1) ?? serviceMonthOf(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState<ServiceMonth | 'all'>(latest);
  const [to, setTo] = useState<ServiceMonth | 'all'>(latest);

  const query = new URLSearchParams();
  if (from !== 'all') query.set('from', from);
  if (to !== 'all') query.set('to', to);
  const suffix = query.toString() ? `?${query.toString()}` : '';

  const aggregate = PAYROLL_REPORTS.filter((r) => r.audience === 'aggregate');
  const adminReports = PAYROLL_REPORTS.filter((r) => r.audience === 'admin');

  function open(name: string) {
    navigate(`/staff/reports/${name}${suffix}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-ink">Payroll reports</h1>
          <p className="text-meta text-ink-muted">Reports are built from the records at open time and repeat the permission check on export (§58).</p>
        </div>
        <div className="flex items-center gap-2">
          <MonthSelect value={from} onChange={setFrom} ariaLabel="Service month from" />
          <span className="text-meta text-ink-muted">to</span>
          <MonthSelect value={to} onChange={setTo} ariaLabel="Service month to" />
        </div>
      </div>

      <Card className="print:hidden">
        <CardContent className="space-y-2 p-4">
          <p className="text-micro font-semibold uppercase tracking-wide text-ink-subtle">Aggregate reports</p>
          {aggregate.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-3 border-b border-hairline-soft py-2 last:border-0">
              <div>
                <p className="text-body font-semibold text-ink">{r.title}</p>
                <p className="text-meta text-ink-muted">{r.description}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => open(r.name)}>Open</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {privileged && (
        <Card className="print:hidden">
          <CardContent className="space-y-2 p-4">
            <p className="text-micro font-semibold uppercase tracking-wide text-ink-subtle">Admin-only reports</p>
            {adminReports.map((r) => (
              <div key={r.name} className="flex items-center justify-between gap-3 border-b border-hairline-soft py-2 last:border-0">
                <div>
                  <p className="text-body font-semibold text-ink">{r.title}</p>
                  <p className="text-meta text-ink-muted">{r.description}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => open(r.name)}>Open</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
