import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { WorkInputDrawer } from '@/components/staff/WorkInputDrawer';
import { toastSuccess } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import {
  serviceMonthOf,
  structureActiveOnMonth,
  workRequirement,
} from '@/lib/payroll';
import type { PayStructure, ServiceMonth, Staff, VerificationState, WorkInput } from '@/lib/payroll';

// ============================================
// WorkInputs — STAFF_PAYROLL_DESIGN §50.1 (/staff/work-inputs)
// Admin only: other roles cannot open this page or infer the quantities that
// would reveal compensation (§50.1, §43). Every row is derived, never stored: a
// staff member appears when a pay structure is active for the chosen service
// month, and their status (Missing / Draft / Verified) is read from the work
// inputs filed for that month. Nothing here computes pay — verification only
// marks a line trusted so payroll generation may use it (§11 step 6).
// ============================================

type RowState = 'Missing' | VerificationState;

interface Row {
  staff: Staff;
  structure: PayStructure;
  inputs: WorkInput[];
  state: RowState;
  entered: string;
}

/** Whole-day count a dated leave line spans, inclusive; 0 when undated. */
function leaveDays(input: WorkInput): number {
  if (!input.fromDate || !input.toDate) return 0;
  const from = Date.parse(input.fromDate);
  const to = Date.parse(input.toDate);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

function monthLabel(month: ServiceMonth): string {
  const [y, m] = month.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

export default function WorkInputs() {
  const user = useAuthStore((s) => s.user);
  const staffRecords = usePayrollStore((s) => s.staff);
  const payStructures = usePayrollStore((s) => s.payStructures);
  const workInputs = usePayrollStore((s) => s.workInputs);

  const [month, setMonth] = useState<ServiceMonth>(() => serviceMonthOf(new Date().toISOString().slice(0, 10)));
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<{ staff: Staff; structure?: PayStructure; existing?: WorkInput } | null>(null);

  const rows: Row[] = staffRecords
    .map((staff) => {
      const structure = payStructures.find((p) => p.staffId === staff.id && structureActiveOnMonth(p, month));
      if (!structure) return null;
      const inputs = workInputs.filter((w) => w.staffId === staff.id && w.serviceMonth === month);
      const state: RowState = inputs.length === 0 ? 'Missing' : inputs.some((i) => i.state === 'Draft') ? 'Draft' : 'Verified';
      const requirement = workRequirement(structure.type);
      let entered = '—';
      if (structure.type === 'Fixed monthly') {
        const days = inputs.filter((i) => i.type === 'Unpaid leave').reduce((sum, i) => sum + leaveDays(i), 0);
        entered = `${days} days`;
      } else {
        const units = inputs.reduce((sum, i) => sum + (i.units ?? 0), 0);
        entered = inputs.length ? `${units} ${requirement.needsVerifiedQuantity ? 'units' : 'days'}` : '—';
      }
      return { staff, structure, inputs, state, entered };
    })
    .filter((r): r is Row => r !== null);

  const counts = {
    Missing: rows.filter((r) => r.state === 'Missing').length,
    Draft: rows.filter((r) => r.state === 'Draft').length,
    Verified: rows.filter((r) => r.state === 'Verified').length,
  };

  const query = search.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (missingOnly && r.state !== 'Missing') return false;
    if (query && !`${r.staff.fullName} ${r.staff.staffNo} ${r.staff.designation}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const selectedDraftInputs = workInputs.filter((w) => selected.has(w.staffId) && w.serviceMonth === month && w.state === 'Draft');

  function toggle(staffId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  }

  // §50.1 bulk verify shows the count it acts on and never touches hidden rows.
  function verifySelected() {
    if (selectedDraftInputs.length === 0) return;
    const actor = user?.name ?? 'Unknown';
    const now = new Date().toISOString();
    const store = usePayrollStore.getState();
    for (const input of selectedDraftInputs) store.verifyWorkInput(input.id, actor, now);
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Staff Entry',
      details: `Bulk-verified ${selectedDraftInputs.length} work input(s) for ${monthLabel(month)}`,
    });
    toastSuccess({ title: 'Inputs verified', description: `${selectedDraftInputs.length} line(s) marked verified` });
    setSelected(new Set());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-ink">Work inputs</h1>
          <p className="text-meta text-ink-muted">Monthly earnings and review lines an Admin confirms before payroll uses them (§50).</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-meta text-ink-muted" htmlFor="serviceMonth">Service month</label>
          <Input id="serviceMonth" type="month" className="w-40" value={month} onChange={(e) => { setMonth(e.target.value); setSelected(new Set()); }} />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Search staff"
              className="w-56"
              placeholder="Search staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button size="sm" variant={missingOnly ? 'default' : 'outline'} onClick={() => setMissingOnly((v) => !v)}>Missing only</Button>
            <span className="ml-auto text-meta text-ink-muted">
              Missing {counts.Missing} · Draft {counts.Draft} · Verified {counts.Verified}
            </span>
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-body text-ink-muted">No staff have an active pay structure for {monthLabel(month)}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" aria-label="Select" />
                  <TableHead>Staff</TableHead>
                  <TableHead>Pay type</TableHead>
                  <TableHead>Work required</TableHead>
                  <TableHead>Entered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => {
                  const requirement = workRequirement(r.structure.type);
                  const canSelect = r.state !== 'Verified';
                  return (
                    <TableRow key={r.staff.id}>
                      <TableCell>
                        {canSelect ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.staff.fullName}`}
                            className="h-4 w-4 accent-accent"
                            checked={selected.has(r.staff.id)}
                            onChange={() => toggle(r.staff.id)}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="text-ink">{r.staff.fullName}</div>
                        <div className="num text-micro text-ink-subtle">{r.staff.staffNo}</div>
                      </TableCell>
                      <TableCell>{r.structure.type}</TableCell>
                      <TableCell>{requirement.label}</TableCell>
                      <TableCell num>{r.entered}</TableCell>
                      <TableCell>
                        <span
                          className={
                            r.state === 'Verified'
                              ? 'text-cleared'
                              : r.state === 'Draft'
                                ? 'text-dues'
                                : 'text-danger'
                          }
                        >
                          {r.state}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDrawer({ staff: r.staff, structure: r.structure, existing: r.inputs[0] })}
                        >
                          {r.state === 'Missing' ? 'Enter' : r.state === 'Draft' ? 'Edit' : 'Review'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-end border-t border-hairline-soft pt-3">
            <Button
              size="sm"
              disabled={selectedDraftInputs.length === 0}
              onClick={verifySelected}
            >
              Verify selected{selectedDraftInputs.length > 0 ? ` (${selectedDraftInputs.length})` : ''}
            </Button>
          </div>
        </CardContent>
      </Card>

      {drawer && (
        <WorkInputDrawer
          key={`${drawer.staff.id}-${drawer.existing?.id ?? 'new'}`}
          open
          staff={drawer.staff}
          serviceMonth={month}
          structure={drawer.structure}
          existing={drawer.existing}
          onOpenChange={(open) => { if (!open) setDrawer(null); }}
        />
      )}
    </div>
  );
}
