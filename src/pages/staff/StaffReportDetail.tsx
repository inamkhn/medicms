import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatPKR } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useAuditStore } from '@/stores/auditStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { toastError } from '@/lib/toast';
import { buildPayrollReport, payrollReportByName, serviceMonthOf } from '@/lib/payroll';
import type { PayrollReportName, ReportColumn, ReportRow } from '@/lib/payroll';

// ============================================
// StaffReportDetail — STAFF_PAYROLL_DESIGN §58.2 (/staff/reports/:name)
// Assembles the payroll records from the stores and hands them to the pure
// report core with the requesting role. The core is the data wall (§43): an
// Admin-only report opened by any other role returns a masked, empty table, so
// the table, the CSV and the print are all built from the same privileged
// decision and none can leak a named rupee. Exports re-run that check at
// file-generation time and a named export/print is audited (§58, §60).
// ============================================

/** Columns that hold a plain count, not a rupee amount. */
const COUNT_KEYS = new Set(['recipients', 'age']);

function cellText(col: ReportColumn, value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'number' && !COUNT_KEYS.has(col.key)) return formatPKR(value);
  return String(value);
}

export default function StaffReportDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { name = '' } = useParams();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  const staff = usePayrollStore((s) => s.staff);
  const payStructures = usePayrollStore((s) => s.payStructures);
  const workInputs = usePayrollStore((s) => s.workInputs);
  const runs = usePayrollStore((s) => s.runs);
  const lines = usePayrollStore((s) => s.lines);
  const payables = usePayrollStore((s) => s.payables);
  const costPostings = usePayrollStore((s) => s.costPostings);
  const advances = usePayrollStore((s) => s.advances);
  const advanceEvents = usePayrollStore((s) => s.advanceEvents);
  const payoutBatches = usePayrollStore((s) => s.payoutBatches);
  const payoutAllocations = usePayrollStore((s) => s.payoutAllocations);
  const disbursements = usePayrollStore((s) => s.disbursements);

  const descriptor = payrollReportByName(name);

  const data = { staff, payStructures, workInputs, runs, lines, payables, costPostings, advances, advanceEvents, payoutBatches, payoutAllocations, disbursements };
  const period = {
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  };
  const table = descriptor
    ? buildPayrollReport(descriptor.name as PayrollReportName, data, role, { period, currentMonth: serviceMonthOf(new Date().toISOString().slice(0, 10)) })
    : undefined;

  if (!descriptor || !table) {
    return (
      <div className="space-y-4">
        <Card><CardContent className="p-6 text-body text-ink-muted">That report does not exist (§58).</CardContent></Card>
        <Button variant="ghost" size="sm" onClick={() => navigate('/staff/reports')}>← All reports</Button>
      </div>
    );
  }

  function exportCSV() {
    if (!table) return;
    if (table.adminOnly && !table.privileged) {
      toastError({ title: 'Not permitted', description: 'This report names individual compensation and is Admin-only (§58, §60).' });
      return;
    }
    if (table.adminOnly && table.privileged) {
      useAuditStore.getState().addLog({ user: user?.name ?? 'Unknown', action: 'Staff Entry', details: `Exported named payroll report ${table.name} (§58, §60)` });
    }
    const header = table.columns.map((c) => c.label);
    const rows = table.rows.map((r: ReportRow) => table.columns.map((c) => r[c.key] ?? ''));
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${table.name}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function print() {
    if (table?.adminOnly && table.privileged) {
      useAuditStore.getState().addLog({ user: user?.name ?? 'Unknown', action: 'Staff Entry', details: `Printed named payroll report ${table.name} (§58, §60)` });
    }
    window.print();
  }

  const showConfidential = table.adminOnly && table.privileged;

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <button className="text-meta text-ink-muted hover:text-ink" onClick={() => navigate('/staff/reports')}>← All reports</button>
            <h1 className="text-title font-semibold text-ink">{table.title}</h1>
            <p className="text-meta text-ink-muted">{descriptor.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportCSV}><Download size={14} className="mr-1.5" /> Export CSV</Button>
            <Button size="sm" onClick={print}><Printer size={14} className="mr-1.5" /> Print</Button>
          </div>
        </CardContent>
      </Card>

      <div className="print-area space-y-3">
        {showConfidential && (
          <p className="text-micro font-semibold uppercase tracking-wide text-ink-subtle">Confidential — Admin only (§58.2)</p>
        )}
        {period.from || period.to ? (
          <p className="text-meta text-ink-muted">Period: {period.from ?? 'start'} → {period.to ?? 'latest'}</p>
        ) : (
          <p className="text-meta text-ink-muted">Period: all service months</p>
        )}

        {table.note && (
          <Card>
            <CardContent className="p-4 text-body text-ink-muted">{table.note}</CardContent>
          </Card>
        )}

        {table.columns.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {table.columns.map((c) => <TableHead key={c.key} num={c.num}>{c.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={table.columns.length} className="py-6 text-center text-body text-ink-muted">Nothing to show for this period.</TableCell>
                    </TableRow>
                  ) : (
                    table.rows.map((r, i) => (
                      <TableRow key={i}>
                        {table.columns.map((c) => (
                          <TableCell key={c.key} num={c.num}>{cellText(c, r[c.key])}</TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
