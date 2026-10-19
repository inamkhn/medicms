import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StaffDrawer } from '@/components/staff/StaffDrawer';
import { PayStructureDrawer } from '@/components/staff/PayStructureDrawer';
import { formatDate, formatDateTime, formatCNIC, formatPKR } from '@/lib/utils';
import { can } from '@/lib/permissions';
import { canSeeIndividualPay, getStaffProjection } from '@/lib/payroll';
import type { PublicStaff } from '@/lib/payroll';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { useAcademicStore } from '@/stores/academicStore';
import { useAuditStore } from '@/stores/auditStore';

// ============================================
// StaffProfile — STAFF_PAYROLL_DESIGN §47.2 (/staff/:id)
// The base payload is getStaffProjection(staff, role): for a non-Admin it is a
// PublicStaff with CNIC/bank/notes physically removed, so those cells cannot be
// rendered from it even by accident (§64 integrity 8). The confidential block is
// drawn from the full record only when canSeeIndividualPay(role) — the same verb
// that unlocks every other pay surface — never from a role-name string.
//
// P8 ships the three tabs its data already exists for: Overview, Employment and
// History. The Pay structures / Advances / Payslips tabs are Admin-only and are
// added with their own phases (P9, P10, P13); they are not stubbed here, because
// a tab that loads nothing is dead code.
// ============================================

/** §4 bank account shows last four digits only outside the secure edit drawer (§4). */
function maskAccount(account: string): string {
  const digits = account.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

function Row({ label, value }: { label: string; value?: ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline-soft py-1.5 last:border-0">
      <span className="text-meta text-ink-muted">{label}</span>
      <span className="text-right text-body text-ink">{value}</span>
    </div>
  );
}

export default function StaffProfile() {
  const { id } = useParams<{ id: string }>();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = can(role, 'staff.manage');
  const seesPay = canSeeIndividualPay(role);
  const staffRecords = usePayrollStore((s) => s.staff);
  const payStructures = usePayrollStore((s) => s.payStructures);
  const programs = useAcademicStore((s) => s.programs);
  const logs = useAuditStore((s) => s.logs);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [structureDrawerOpen, setStructureDrawerOpen] = useState(false);

  const staff = id ? staffRecords.find((s) => s.id === id) : undefined;

  if (!staff) {
    return (
      <div className="space-y-4">
        <Link to="/staff/directory" className="inline-flex items-center gap-1 text-meta text-accent hover:underline">
          <ArrowLeft size={13} /> Staff directory
        </Link>
        <Card>
          <CardContent className="p-6 text-body text-ink-muted">
            This staff record does not exist. It may have been entered by an incorrect address.
          </CardContent>
        </Card>
      </div>
    );
  }

  // The on-screen identity is the projection; the confidential extras are the
  // Admin-only full record, read only when the pay verb is held.
  const view = getStaffProjection(staff, role) as PublicStaff;
  const programLabels = staff.programIds
    .map((pid) => programs.find((p) => p.id === pid)?.shortCode ?? pid);

  const history = logs
    .filter((l) => l.details.includes(staff.staffNo))
    .slice(0, 50);

  return (
    <div className="space-y-4">
      <Link to="/staff/directory" className="inline-flex items-center gap-1 text-meta text-accent hover:underline print:hidden">
        <ArrowLeft size={13} /> Staff directory
      </Link>

      {/* §47.2 profile header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-accent-soft text-ui font-semibold text-accent" aria-hidden="true">
            {staff.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-page font-semibold text-ink">{view.fullName}</h1>
              <span className="num text-meta text-ink-muted">{staff.staffNo}</span>
              <span className="inline-flex items-center rounded-pill border border-hairline px-2 py-0.5 text-micro font-medium text-ink-secondary">
                {view.employmentStatus}
              </span>
            </div>
            <p className="mt-0.5 text-meta text-ink-muted">
              {staff.designation} · {staff.staffType} · Joined {formatDate(staff.joiningDate)}
            </p>
          </div>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => setDrawerOpen(true)}>
            Edit staff
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          {seesPay && <TabsTrigger value="structures">Pay structures</TabsTrigger>}
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-0 p-4">
                <h2 className="mb-2 text-section font-semibold text-ink">Contact</h2>
                <Row label="Phone" value={view.phone} />
                <Row label="Email" value={view.email} />
                <Row label="Address" value={view.address} />
                <Row label="Emergency contact" value={view.emergencyContact} />
                <Row label="Father / guardian" value={view.fatherGuardianName} />
                <Row label="Department" value={view.department} />
                <Row label="Assigned programs" value={programLabels.length ? programLabels.join(', ') : '—'} />
              </CardContent>
            </Card>

            {/* Admin-only identity — rendered only when the pay verb is held, so a
                non-Admin never sees a CNIC or bank digit (§64 integrity 8, t48). */}
            {seesPay && (
              <Card>
                <CardContent className="space-y-0 p-4">
                  <h2 className="mb-2 text-section font-semibold text-ink">Confidential (Admin)</h2>
                  <Row label="CNIC" value={staff.cnic ? formatCNIC(staff.cnic) : undefined} />
                  <Row label="Payout preference" value={staff.payoutPreference} />
                  <Row label="Bank" value={staff.bankName} />
                  <Row label="Account holder" value={staff.accountHolder} />
                  <Row label="Account number" value={staff.bankAccount ? maskAccount(staff.bankAccount) : undefined} />
                  <Row label="Notes" value={staff.notes} />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="employment">
          <Card>
            <CardContent className="space-y-0 p-4">
              <h2 className="mb-2 text-section font-semibold text-ink">Employment</h2>
              <Row label="Staff type" value={view.staffType} />
              <Row label="Designation" value={view.designation} />
              <Row label="Employment mode" value={view.employmentMode} />
              <Row label="Status" value={view.employmentStatus} />
              <Row label="Joining date" value={formatDate(staff.joiningDate)} />
              <Row label="Leaving date" value={staff.leavingDate ? formatDate(staff.leavingDate) : undefined} />
              <Row label="On record since" value={formatDateTime(staff.createdAt)} />
              <Row label="Last edited" value={staff.updatedAt ? `${formatDateTime(staff.updatedAt)} · ${staff.updatedBy ?? '—'}` : undefined} />
            </CardContent>
          </Card>
        </TabsContent>

        {seesPay && (
          <TabsContent value="structures">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-section font-semibold text-ink">Pay structures</h2>
                  <Button size="sm" variant="subtle" onClick={() => setStructureDrawerOpen(true)}>+ New structure</Button>
                </div>
                {(() => {
                  const mine = payStructures
                    .filter((p) => p.staffId === staff.id)
                    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
                  if (mine.length === 0) {
                    return <p className="text-body text-ink-muted">No pay structure recorded yet. Saving creates the first revision (§8).</p>;
                  }
                  return (
                    <ul className="space-y-2">
                      {mine.map((p) => {
                        const amount = p.type === 'Fixed monthly' ? formatPKR(p.monthlyBase ?? 0)
                          : p.type === 'Per session' ? `${formatPKR(p.ratePerSession ?? 0)} / session`
                          : p.honorariumFixed !== undefined ? `${formatPKR(p.honorariumFixed)} fixed`
                          : `${formatPKR(p.ratePerSession ?? 0)} / unit`;
                        return (
                          <li key={p.id} className="rounded-control border border-hairline bg-surface p-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-body font-medium text-ink">{p.type} · {amount}</span>
                              <span className="num text-micro text-ink-subtle">v{p.revision}</span>
                            </div>
                            <div className="mt-0.5 text-meta text-ink-muted">
                              {formatDate(p.effectiveFrom)} – {p.effectiveTo ? formatDate(p.effectiveTo) : 'open'} · {p.costCategory ?? '—'}
                            </div>
                            {p.reason && <p className="mt-1 text-meta text-ink-secondary">{p.reason}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
                <p className="text-micro text-ink-subtle">Past structures stay read-only; an approved run snapshots its figures and never changes (§8, §49).</p>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="history">
          <Card>
            <CardContent className="p-4">
              <h2 className="mb-2 text-section font-semibold text-ink">History</h2>
              {history.length === 0 ? (
                <p className="text-body text-ink-muted">No recorded changes for this staff member yet.</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((l) => (
                    <li key={l.id} className="border-b border-hairline-soft pb-2 last:border-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-body text-ink">{l.action}</span>
                        <span className="num text-meta text-ink-subtle">{formatDateTime(l.timestamp)}</span>
                      </div>
                      <p className="text-meta text-ink-muted">{l.user} — {l.details}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {drawerOpen && (
        <StaffDrawer
          key={`edit-${staff.id}`}
          open
          mode="edit"
          staff={staff}
          onOpenChange={(open) => { if (!open) setDrawerOpen(false); }}
        />
      )}

      {structureDrawerOpen && (
        <PayStructureDrawer
          key={`structure-${staff.id}`}
          open
          staff={staff}
          onOpenChange={(open) => { if (!open) setStructureDrawerOpen(false); }}
        />
      )}
    </div>
  );
}
