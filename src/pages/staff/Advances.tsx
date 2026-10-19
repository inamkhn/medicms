import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { NewAdvanceDrawer } from '@/components/staff/NewAdvanceDrawer';
import { AdvanceDetailDrawer } from '@/components/staff/AdvanceDetailDrawer';
import { formatDate, formatPKR } from '@/lib/utils';
import { usePayrollStore } from '@/stores/payrollStore';
import { ADVANCE_STATUSES, advanceSummary } from '@/lib/payroll';
import type { Advance, AdvanceStatus } from '@/lib/payroll';

// ============================================
// Advances — STAFF_PAYROLL_DESIGN §51.1 (/staff/advances)
// Admin only; the table is not exposed through Finance Core aggregate permissions
// (§51.1). Original, Recovered and Outstanding are all derived from the advance's
// event ledger on every render — nothing is stored as a running balance (§17). An
// approved-but-unpaid advance shows 0 outstanding because no money has moved yet
// (§51.2).
// ============================================

interface Row {
  advance: Advance;
  staffName: string;
  original: number;
  recovered: number;
  outstanding: number;
}

function statusText(state: AdvanceStatus): string {
  if (state === 'Recovered') return 'text-cleared';
  if (state === 'Cancelled') return 'text-ink-subtle';
  if (state === 'Approved' || state === 'Pending disbursement') return 'text-dues';
  return 'text-ink';
}

export default function Advances() {
  const staffRecords = usePayrollStore((s) => s.staff);
  const advances = usePayrollStore((s) => s.advances);
  const advanceEvents = usePayrollStore((s) => s.advanceEvents);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdvanceStatus | 'all'>('all');
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const staffName = (id: string) => staffRecords.find((s) => s.id === id)?.fullName ?? '—';

  const rows: Row[] = advances.map((advance) => {
    const summary = advanceSummary(advanceEvents.filter((e) => e.advanceId === advance.id));
    return {
      advance,
      staffName: staffName(advance.staffId),
      original: advance.approvedAmount ?? advance.requestedAmount,
      recovered: summary.recovered,
      outstanding: summary.balance,
    };
  });

  const query = search.trim().toLowerCase();
  const visible = rows
    .filter((r) => statusFilter === 'all' || r.advance.status === statusFilter)
    .filter((r) => !query || `${r.advance.advanceNo} ${r.staffName}`.toLowerCase().includes(query))
    .sort((a, b) => (a.advance.advanceNo < b.advance.advanceNo ? 1 : -1));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-ink">Salary advances</h1>
          <p className="text-meta text-ink-muted">Money-out with a recoverable balance — never salary cost (§13, §16).</p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>+ New advance</Button>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Search staff" className="w-56" placeholder="Search staff or number…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AdvanceStatus | 'all')}>
              <SelectTrigger className="w-40" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {ADVANCE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-body text-ink-muted">No advances match. Record one with + New advance.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead num>Original</TableHead>
                  <TableHead num>Recovered</TableHead>
                  <TableHead num>Outstanding</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.advance.id} className="cursor-pointer" onClick={() => setDetailId(r.advance.id)}>
                    <TableCell className="num">{r.advance.advanceNo}</TableCell>
                    <TableCell>{r.staffName}</TableCell>
                    <TableCell>{formatDate(r.advance.paymentDate ?? r.advance.createdAt.slice(0, 10))}</TableCell>
                    <TableCell num>{formatPKR(r.original)}</TableCell>
                    <TableCell num>{formatPKR(r.recovered)}</TableCell>
                    <TableCell num>{formatPKR(r.outstanding)}</TableCell>
                    <TableCell><span className={statusText(r.advance.status)}>{r.advance.status}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {newOpen && (
        <NewAdvanceDrawer
          key="new-advance"
          open
          staff={staffRecords}
          onOpenChange={(open) => { if (!open) setNewOpen(false); }}
        />
      )}

      {detailId && (
        <AdvanceDetailDrawer
          key={detailId}
          open
          advanceId={detailId}
          onOpenChange={(open) => { if (!open) setDetailId(null); }}
        />
      )}
    </div>
  );
}
