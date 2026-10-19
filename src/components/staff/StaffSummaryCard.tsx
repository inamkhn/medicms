import { Card, CardContent } from '@/components/ui/card';
import type { PublicStaff } from '@/lib/payroll';
import type { EmploymentStatus } from '@/lib/payroll';

// ============================================
// StaffSummaryCard — STAFF_PAYROLL_DESIGN §47.1
// Headline counts for the directory. Every figure is *derived* from the records
// the caller already holds (§6.1 restated by §64 integrity 9) — nothing here is
// stored, and nothing here is a rupee: the card shows who works here by status
// only. Salary figures live behind payroll.compensation.view and are never
// computed in a directory component, so this card cannot leak pay to a role that
// holds only staff.directory.view.
// ============================================

const STATUS_ORDER: readonly EmploymentStatus[] = ['Active', 'On leave', 'Left'];

export interface StaffSummaryCardProps {
  rows: readonly PublicStaff[];
}

export function StaffSummaryCard({ rows }: StaffSummaryCardProps) {
  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    count: rows.filter((r) => r.employmentStatus === status).length,
  }));

  return (
    <Card className="print:hidden">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-stat font-semibold tabular-nums text-ink">{rows.length}</span>
          <span className="text-meta text-ink-muted">staff on record</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {byStatus.map(({ status, count }) => (
            <div key={status} className="flex items-baseline gap-1.5">
              <span className="num text-ui font-semibold text-ink-secondary">{count}</span>
              <span className="text-meta text-ink-muted">{status}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
