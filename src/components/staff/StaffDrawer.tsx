import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, isValidCNIC, isValidContact, normalizeCNIC } from '@/lib/utils';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { StaffPatch } from '@/stores/payrollStore';
import { useAcademicStore } from '@/stores/academicStore';
import {
  EMPLOYMENT_MODES,
  EMPLOYMENT_STATUSES,
  PAYOUT_MODES,
  STAFF_TYPES,
} from '@/lib/payroll';
import type { EmploymentMode, EmploymentStatus, PayoutMode, Staff, StaffType } from '@/lib/payroll';

// ============================================
// StaffDrawer — STAFF_PAYROLL_DESIGN §48
// The one place a staff record is created or edited, and it is Admin-only: the
// form carries CNIC and bank detail, which no other screen renders (§64 integrity
// 8). It is a Dialog, not a hand-rolled overlay, so focus trap / Escape / aria-modal
// come from Radix (design system P10). The drawer does no arithmetic and never
// touches money — it only calls the store's guarded addStaff/updateStaff. Bank
// detail is deliberately kept out of the toast and the audit line (§48).
// ============================================

/** Everything the form edits; the store stamps id/number/audit around it. */
interface Draft {
  fullName: string;
  fatherGuardianName: string;
  cnic: string;
  phone: string;
  email: string;
  address: string;
  emergencyContact: string;
  staffType: StaffType;
  designation: string;
  department: string;
  programIds: string[];
  joiningDate: string;
  leavingDate: string;
  employmentStatus: EmploymentStatus;
  employmentMode: EmploymentMode;
  payoutPreference: '' | PayoutMode;
  bankName: string;
  bankAccount: string;
  accountHolder: string;
  notes: string;
}

type FieldErrors = Partial<Record<keyof Draft | 'reason', string>>;

const EMPTY_DRAFT: Draft = {
  fullName: '', fatherGuardianName: '', cnic: '', phone: '', email: '', address: '', emergencyContact: '',
  staffType: 'Teaching', designation: '', department: '', programIds: [], joiningDate: '', leavingDate: '',
  employmentStatus: 'Active', employmentMode: 'Regular', payoutPreference: '',
  bankName: '', bankAccount: '', accountHolder: '', notes: '',
};

function draftFromStaff(s: Staff): Draft {
  return {
    ...EMPTY_DRAFT,
    fullName: s.fullName,
    fatherGuardianName: s.fatherGuardianName ?? '',
    cnic: s.cnic ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    address: s.address ?? '',
    emergencyContact: s.emergencyContact ?? '',
    staffType: s.staffType,
    designation: s.designation,
    department: s.department ?? '',
    programIds: [...s.programIds],
    joiningDate: s.joiningDate,
    leavingDate: s.leavingDate ?? '',
    employmentStatus: s.employmentStatus,
    employmentMode: s.employmentMode,
    payoutPreference: s.payoutPreference ?? '',
    bankName: s.bankName ?? '',
    bankAccount: s.bankAccount ?? '',
    accountHolder: s.accountHolder ?? '',
    notes: s.notes ?? '',
  };
}

/** §48 the field groups that require a reason when they change on an edit. */
function changedCategories(before: Staff, after: Draft): string[] {
  const groups: Record<string, boolean> = {
    identity:
      before.fullName !== after.fullName.trim() ||
      normalizeCNIC(before.cnic) !== normalizeCNIC(after.cnic) ||
      (before.phone ?? '') !== after.phone.trim() ||
      (before.email ?? '') !== after.email.trim() ||
      (before.fatherGuardianName ?? '') !== after.fatherGuardianName.trim(),
    department: (before.department ?? '') !== after.department.trim(),
    employment:
      before.staffType !== after.staffType ||
      before.designation !== after.designation.trim() ||
      before.employmentMode !== after.employmentMode ||
      before.employmentStatus !== after.employmentStatus ||
      before.joiningDate !== after.joiningDate ||
      (before.leavingDate ?? '') !== after.leavingDate,
    bank:
      (before.bankName ?? '') !== after.bankName.trim() ||
      (before.bankAccount ?? '') !== after.bankAccount.trim() ||
      (before.accountHolder ?? '') !== after.accountHolder.trim(),
  };
  return Object.entries(groups).filter(([, changed]) => changed).map(([name]) => name);
}

function toInput(d: Draft) {
  return {
    fullName: d.fullName.trim(),
    fatherGuardianName: d.fatherGuardianName.trim() || undefined,
    cnic: normalizeCNIC(d.cnic) ?? undefined,
    phone: d.phone.trim() || undefined,
    email: d.email.trim() || undefined,
    address: d.address.trim() || undefined,
    emergencyContact: d.emergencyContact.trim() || undefined,
    staffType: d.staffType,
    designation: d.designation.trim(),
    department: d.department.trim() || undefined,
    programIds: d.programIds,
    joiningDate: d.joiningDate,
    leavingDate: d.leavingDate || undefined,
    employmentStatus: d.employmentStatus,
    employmentMode: d.employmentMode,
    payoutPreference: d.payoutPreference || undefined,
    bankName: d.bankName.trim() || undefined,
    bankAccount: d.bankAccount.trim() || undefined,
    accountHolder: d.accountHolder.trim() || undefined,
    notes: d.notes.trim() || undefined,
  };
}

function Field({ label, required, htmlFor, error, hint, children, className }: {
  label: string; required?: boolean; htmlFor?: string; error?: string; hint?: string;
  children: ReactNode; className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-meta text-danger">{error}</p>
      ) : hint ? (
        <p className="text-meta text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export interface StaffDrawerProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** Full record for edit (only an Admin opens this); undefined for create. */
  staff?: Staff;
  onOpenChange: (open: boolean) => void;
}

export function StaffDrawer({ open, mode, staff, onOpenChange }: StaffDrawerProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const programs = useAcademicStore((s) => s.programs);
  const advances = usePayrollStore((s) => s.advances);

  // The container mounts this drawer only while open and keys it by mode + record,
  // so opening (or switching record) remounts a fresh instance and this lazy seed
  // runs once — no reset-on-open effect, no cascading render (react-compiler).
  const [draft, setDraft] = useState<Draft>(() => (staff ? draftFromStaff(staff) : EMPTY_DRAFT));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [summary, setSummary] = useState<string[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // §48 a leaving mark warns (does not block) when the person still has an open advance.
  const openAdvanceCount = staff
    ? advances.filter((a) => a.staffId === staff.id && a.status !== 'Recovered' && a.status !== 'Cancelled').length
    : 0;

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!draft.fullName.trim()) e.fullName = 'A staff record needs a name (§4).';
    if (!draft.designation.trim()) e.designation = 'A designation is required (§4).';
    if (!draft.joiningDate) e.joiningDate = 'A joining date is required (§4).';
    if (draft.cnic.trim() && !isValidCNIC(draft.cnic)) e.cnic = 'Enter all 13 CNIC digits, or leave it blank.';
    if (draft.phone.trim() && !isValidContact(draft.phone)) e.phone = 'Use a valid phone, e.g. 03XXXXXXXXX.';
    if (draft.employmentStatus === 'Left' && !draft.leavingDate) {
      e.leavingDate = 'A "Left" record needs a leaving date (§4).';
    } else if (draft.leavingDate && draft.joiningDate && draft.leavingDate < draft.joiningDate) {
      e.leavingDate = 'Leaving date cannot be before the joining date (§4).';
    }
    if (mode === 'edit' && staff) {
      const changed = changedCategories(staff, draft);
      if (changed.length && !reason.trim()) {
        e.reason = `A reason is required when ${changed.join(', ')} change (§48).`;
      }
    }
    return e;
  }

  function save() {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      setSummary(Object.values(e).filter((x): x is string => Boolean(x)));
      return;
    }
    setErrors({});
    const actor = user?.name ?? 'Unknown';
    const now = new Date().toISOString();
    const store = usePayrollStore.getState();

    if (mode === 'create') {
      // §60 the staff-number prefix is a Settings value read at mint time.
      const staffPrefix = useSettingsStore.getState().payrollSettings.staffPrefix;
      const { staff: created, problems } = store.addStaff(toInput(draft), actor, now, staffPrefix);
      if (!created) {
        setSummary(problems);
        const cnicProblem = problems.find((p) => p.includes('CNIC'));
        if (cnicProblem) setErrors({ cnic: cnicProblem });
        toastError({ title: 'Staff not created', description: problems[0] });
        return;
      }
      useAuditStore.getState().addLog({
        user: actor,
        action: 'Staff Entry',
        details: `Created ${created.staffNo} — ${created.fullName}`,
      });
      setSavedId(created.id);
      toastSuccess({ title: 'Staff saved', description: `${created.staffNo} · ${created.fullName}` });
      return;
    }

    if (!staff) return;
    const patch: StaffPatch = toInput(draft);
    const problems = store.updateStaff(staff.id, patch, actor, now);
    if (problems.length) {
      setSummary(problems);
      toastError({ title: 'Staff not updated', description: problems[0] });
      return;
    }
    // Bank detail is never written to the audit line — only the fact it changed (§48).
    const changed = changedCategories(staff, draft);
    const touchedBank = changed.includes('bank');
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Staff Entry',
      details: `Edited ${staff.staffNo} — ${staff.fullName}${reason.trim() ? ` · reason: ${reason.trim()}` : ''}${touchedBank ? ' · bank detail updated' : ''}`,
    });
    toastSuccess({ title: 'Staff updated', description: `${staff.staffNo} · ${staff.fullName}` });
    onOpenChange(false);
  }

  const activePrograms = programs.filter((p) => p.status === 'Active' && !draft.programIds.includes(p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New staff member' : `Edit ${staff?.fullName ?? 'staff'}`}</DialogTitle>
          <DialogDescription>
            Confidential — this drawer holds CNIC and bank detail and is Admin only (§48).
          </DialogDescription>
        </DialogHeader>

        {savedId ? (
          // §48 after a successful create the ID exists, so offer where to go next.
          <div className="space-y-3 p-4">
            <div className="rounded-control border border-hairline bg-surface p-3 text-body text-ink-secondary">
              Staff saved. What next?
            </div>
            <DialogFooter className="border-0 p-0">
              <Button variant="outline" onClick={() => { setSavedId(null); }}>Add another</Button>
              <Button onClick={() => { onOpenChange(false); navigate(`/staff/${savedId}`); }}>Open profile</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
              {summary.length > 0 && (
                <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-meta text-danger" role="alert">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {summary.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
              )}

              <Field label="Full name" required htmlFor="fullName" error={errors.fullName}>
                <Input id="fullName" value={draft.fullName} onChange={(e) => set('fullName', e.target.value)} invalid={Boolean(errors.fullName)} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Staff type" required htmlFor="staffType" error={errors.staffType}>
                  <Select value={draft.staffType} onValueChange={(v) => set('staffType', v as StaffType)}>
                    <SelectTrigger id="staffType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAFF_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Designation" required htmlFor="designation" error={errors.designation}>
                  <Input id="designation" value={draft.designation} onChange={(e) => set('designation', e.target.value)} invalid={Boolean(errors.designation)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Department" htmlFor="department" error={errors.department}>
                  <Input id="department" value={draft.department} onChange={(e) => set('department', e.target.value)} placeholder="e.g. Nursing" />
                </Field>
                <Field label="Employment mode" required htmlFor="employmentMode" error={errors.employmentMode}>
                  <Select value={draft.employmentMode} onValueChange={(v) => set('employmentMode', v as EmploymentMode)}>
                    <SelectTrigger id="employmentMode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Joining date" required htmlFor="joiningDate" error={errors.joiningDate}>
                  <Input id="joiningDate" type="date" value={draft.joiningDate} onChange={(e) => set('joiningDate', e.target.value)} invalid={Boolean(errors.joiningDate)} />
                </Field>
                <Field label="Status" htmlFor="employmentStatus" error={errors.employmentStatus}>
                  <Select value={draft.employmentStatus} onValueChange={(v) => set('employmentStatus', v as EmploymentStatus)}>
                    <SelectTrigger id="employmentStatus"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Leaving date" htmlFor="leavingDate" error={errors.leavingDate}>
                  <Input id="leavingDate" type="date" value={draft.leavingDate} onChange={(e) => set('leavingDate', e.target.value)} invalid={Boolean(errors.leavingDate)} />
                </Field>
              </div>

              {draft.employmentStatus === 'Left' && openAdvanceCount > 0 && (
                <p className="text-meta text-dues">
                  Warning: this staff still has {openAdvanceCount} outstanding advance(s); settle them before marking as Left (§48).
                </p>
              )}

              <Field label="Associated programs" htmlFor="program" error={errors.programIds} hint="Optional — one record may span several active programs (§4).">
                <div className="flex flex-wrap gap-1.5">
                  {draft.programIds.map((id) => {
                    const p = programs.find((x) => x.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-pill border border-hairline-strong bg-panel px-2 py-0.5 text-micro text-ink-secondary">
                        {p?.shortCode ?? id}
                        <button type="button" aria-label={`Remove ${p?.shortCode ?? id}`} className="cursor-pointer text-ink-subtle hover:text-ink" onClick={() => set('programIds', draft.programIds.filter((x) => x !== id))}>
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                  <Select
                    value=""
                    onValueChange={(id) => { if (id) set('programIds', [...draft.programIds, id]); }}
                    disabled={activePrograms.length === 0}
                  >
                    <SelectTrigger className="w-auto min-w-[140px]" id="program"><Plus size={12} className="mr-1" /><SelectValue placeholder="Add program" /></SelectTrigger>
                    <SelectContent>
                      {activePrograms.map((p) => <SelectItem key={p.id} value={p.id}>{p.shortCode} — {p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3 border-t border-hairline-soft pt-3">
                <Field label="CNIC" htmlFor="cnic" error={errors.cnic} hint="Digits only; duplicate CNIC is blocked (§4 rule 2).">
                  <Input id="cnic" value={draft.cnic} onChange={(e) => set('cnic', e.target.value)} placeholder="42101-1234567-1" invalid={Boolean(errors.cnic)} />
                </Field>
                <Field label="Phone" htmlFor="phone" error={errors.phone}>
                  <Input id="phone" value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="03XXXXXXXXX" invalid={Boolean(errors.phone)} />
                </Field>
                <Field label="Email" htmlFor="email" error={errors.email}>
                  <Input id="email" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />
                </Field>
                <Field label="Father / guardian" htmlFor="father" error={errors.fatherGuardianName}>
                  <Input id="father" value={draft.fatherGuardianName} onChange={(e) => set('fatherGuardianName', e.target.value)} />
                </Field>
                <Field label="Address" htmlFor="address" error={errors.address} className="col-span-2">
                  <Input id="address" value={draft.address} onChange={(e) => set('address', e.target.value)} />
                </Field>
              </div>

              <div className="space-y-3 border-t border-hairline-soft pt-3">
                <div className="flex items-center gap-1.5 text-meta text-ink-muted">
                  <Lock size={12} aria-hidden="true" /> Confidential: Admin access only (§48)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Preferred payout mode" htmlFor="payoutPreference" error={errors.payoutPreference}>
                    <Select value={draft.payoutPreference || undefined} onValueChange={(v) => set('payoutPreference', v as PayoutMode)}>
                      <SelectTrigger id="payoutPreference"><SelectValue placeholder="Not set" /></SelectTrigger>
                      <SelectContent>
                        {PAYOUT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Bank name" htmlFor="bankName" error={errors.bankName}>
                    <Input id="bankName" value={draft.bankName} onChange={(e) => set('bankName', e.target.value)} />
                  </Field>
                  <Field label="Account holder" htmlFor="accountHolder" error={errors.accountHolder}>
                    <Input id="accountHolder" value={draft.accountHolder} onChange={(e) => set('accountHolder', e.target.value)} />
                  </Field>
                  <Field label="Account number" htmlFor="bankAccount" error={errors.bankAccount}>
                    <Input id="bankAccount" value={draft.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} />
                  </Field>
                </div>
              </div>

              <Field label="Notes" htmlFor="notes" error={errors.notes} hint="Sensitive; Admin only (§4).">
                <Input id="notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>

              {mode === 'edit' && (
                <Field label="Reason for change" required htmlFor="reason" error={errors.reason} hint="Required when identity, department, employment, bank detail or status change (§48).">
                  <Input id="reason" value={reason} onChange={(e) => { setReason(e.target.value); setErrors((x) => ({ ...x, reason: undefined })); }} invalid={Boolean(errors.reason)} />
                </Field>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={save}>{mode === 'create' ? 'Save staff' : 'Save changes'}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
