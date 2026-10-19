import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortHead,
} from '@/components/ui/table';
import type { EmploymentStatus, PublicStaff } from '@/lib/payroll';

// ============================================
// StaffDirectoryTable — STAFF_PAYROLL_DESIGN §47.1
// The directory list. It renders a projection only: every row it is handed is a
// `PublicStaff` (getStaffProjection has already stripped CNIC/bank/notes for a
// non-Admin), so a salary-bearing or identity-bearing cell simply cannot be
// built from these props (§64 integrity 8). The table owns no filtering, sorting
// or paging state — the page does, so the address stays the source of truth.
// Row actions are Open for every permitted viewer; Edit appears only for a role
// that holds staff.manage (Admin) — and the route/guard is what really refuses,
// not this button's presence (§2 "hiding a button is never the only protection").
// ============================================

export type StaffSortKey = 'staffNo' | 'name' | 'type' | 'designation' | 'department' | 'joined' | 'status';

/** Status reads as text + a neutral weight, never colour alone (P4), and survives print (P8). */
function StatusLabel({ status }: { status: EmploymentStatus }) {
  return (
    <span
      className={
        status === 'Left'
          ? 'inline-flex items-center rounded-pill border border-hairline-strong px-2 py-0.5 text-micro font-medium whitespace-nowrap text-ink-muted'
          : 'inline-flex items-center rounded-pill border border-hairline px-2 py-0.5 text-micro font-medium whitespace-nowrap text-ink-secondary'
      }
    >
      {status}
    </span>
  );
}

export interface StaffDirectoryTableProps {
  rows: readonly PublicStaff[];
  canManage: boolean;
  sortKey: StaffSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: StaffSortKey) => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
}

export function StaffDirectoryTable({ rows, canManage, sortKey, sortDir, onSort, onOpen, onEdit }: StaffDirectoryTableProps) {
  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableSortHead label="Staff #" sortKey="staffNo" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <TableSortHead label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <TableSortHead label="Type" sortKey="type" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <TableSortHead label="Designation" sortKey="designation" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <TableSortHead label="Department" sortKey="department" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <TableSortHead label="Joined" sortKey="joined" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <TableSortHead label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-body text-ink-muted">
                No staff match these filters.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => onOpen(row.id)}>
                <TableCell className="num font-medium text-ink">{row.staffNo}</TableCell>
                <TableCell className="text-ink">{row.fullName}</TableCell>
                <TableCell className="text-ink-secondary">{row.staffType}</TableCell>
                <TableCell className="text-ink-secondary">{row.designation}</TableCell>
                <TableCell className="text-ink-secondary">{row.department ?? '—'}</TableCell>
                <TableCell className="num whitespace-nowrap text-ink-secondary">{formatDate(row.joiningDate)}</TableCell>
                <TableCell><StatusLabel status={row.employmentStatus} /></TableCell>
                <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onOpen(row.id)}>Open</Button>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => onEdit(row.id)}>Edit</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
