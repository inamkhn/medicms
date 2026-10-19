import { useState, type ReactNode } from 'react';
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
import { cn, formatDateTime, formatPKR } from '@/lib/utils';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import type { WorkInputPatch } from '@/stores/payrollStore';
import {
  WORK_INPUT_TYPES,
  nextWorkInputId,
} from '@/lib/payroll';
import type { PayStructure, ServiceMonth, Staff, WorkInput, WorkInputType } from '@/lib/payroll';

// ============================================
// WorkInputDrawer — STAFF_PAYROLL_DESIGN §50.2
// One Admin's monthly earnings/review line for a staff member. Payroll generation
// trusts only `Verified` inputs (§11 step 6), so the drawer offers two distinct
// acts: Save draft (mutable) and Verify input (stamps actor/date). Any later edit
// of earned content resets a Verified line back to Draft — the store enforces that,
// never this screen — so a revision can never hide behind an old verification
// (§11 rule 6). No money moves and no gross is computed here; a session line shows
// its rate only as context (§50.2).
// ============================================

interface Draft {
  type: WorkInputType;
  units: string;
  amount: string;
  fromDate: string;
  toDate: string;
  note: string;
  reason: string;
}

function draftFrom(existing: WorkInput | undefined): Draft {
  return {
    type: existing?.type ?? 'Session',
    units: existing?.units !== undefined ? String(existing.units) : '',
    amount: existing?.amount !== undefined ? String(existing.amount) : '',
    fromDate: existing?.fromDate ?? '',
    toDate: existing?.toDate ?? '',
    note: existing?.note ?? '',
    reason: '',
  };
}

function wholeNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return undefined;
  return n;
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
      {error ? <p className="text-meta text-danger">{error}</p> : hint ? <p className="text-meta text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

export interface WorkInputDrawerProps {
  open: boolean;
  staff: Staff;
  serviceMonth: ServiceMonth;
  /** The staff's structure for the month; used only to show a session rate (§50.2). */
  structure?: PayStructure;
  /** Present when editing an existing line; absent for a new one (§50.2). */
  existing?: WorkInput;
  onOpenChange: (open: boolean) => void;
}

export function WorkInputDrawer({ open, staff, serviceMonth, structure, existing, onOpenChange }: WorkInputDrawerProps) {
  const user = useAuthStore((s) => s.user);
  const workInputs = usePayrollStore((s) => s.workInputs);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(existing));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [summary, setSummary] = useState<string[]>([]);

  const isEdit = Boolean(existing);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // §50.2 a session/honorarium line shows units × rate as context; the trusted
  // figure comes only once the input is Verified, never from this preview.
  const units = wholeNumber(draft.units);
  const rate = structure?.ratePerSession;
  const sessionEarning = units !== undefined && rate !== undefined ? units * rate : undefined;

  function validate(): Partial<Record<string, string>> {
    const e: Partial<Record<string, string>> = {};
    const needsUnits = draft.type === 'Session' || draft.type === 'Honorarium';
    const needsAmount = draft.type === 'Allowance' || draft.type === 'Bonus' || draft.type === 'Correction';
    const isLeave = draft.type === 'Paid leave' || draft.type === 'Unpaid leave';
    if (needsUnits && units === undefined) e.units = 'Session and honorarium inputs record a whole unit count (§9).';
    if (needsAmount && wholeNumber(draft.amount) === undefined) e.amount = 'This line records a whole positive rupee amount (§9).';
    if (isLeave && (!draft.fromDate || !draft.toDate)) e.fromDate = 'A leave line needs its from and to dates (§9).';
    if (draft.toDate && draft.fromDate && draft.toDate < draft.fromDate) e.toDate = 'The to date cannot precede the from date (§9).';
    // §11 rule 6 a deliberate zero and every revision of a verified line need a reason.
    const isRevision = isEdit && existing?.state === 'Verified';
    const isDeliberateZero = needsUnits && units === 0;
    if ((isRevision || isDeliberateZero) && !draft.reason.trim()) {
      e.reason = isRevision ? 'Revising a verified input needs a reason and re-verification (§11).' : 'A deliberate zero is recorded with a reason (§11).';
    }
    return e;
  }

  /** Persist (new or edit) and return the id, or null when the store refused. */
  function persist(): { id: string; problems: string[] } {
    const actor = user?.name ?? 'Unknown';
    const now = new Date().toISOString();
    const store = usePayrollStore.getState();
    const patch: WorkInputPatch = {
      type: draft.type,
      units: wholeNumber(draft.units),
      amount: wholeNumber(draft.amount),
      fromDate: draft.fromDate || undefined,
      toDate: draft.toDate || undefined,
      note: draft.note.trim() || undefined,
      reason: draft.reason.trim() || undefined,
    };
    if (existing) {
      const problems = store.updateWorkInput(existing.id, patch);
      return { id: existing.id, problems };
    }
    const input: WorkInput = {
      ...patch,
      id: nextWorkInputId(workInputs),
      staffId: staff.id,
      serviceMonth,
      type: draft.type,
      state: 'Draft',
      createdBy: actor,
      createdAt: now,
    };
    const problems = store.addWorkInput(input);
    return { id: input.id, problems };
  }

  function audit(verified: boolean) {
    const actor = user?.name ?? 'Unknown';
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Staff Entry',
      details:
        `${isEdit ? 'Edited' : 'Entered'} ${draft.type.toLowerCase()} work input for ${staff.staffNo} — ${staff.fullName} (${serviceMonth})` +
        (verified ? ' · verified' : ' · draft') +
        (draft.reason.trim() ? ` · reason: ${draft.reason.trim()}` : ''),
    });
  }

  function onSave() {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      setSummary(Object.values(e).filter((x): x is string => Boolean(x)));
      return;
    }
    const { problems } = persist();
    if (problems.length) {
      setSummary(problems);
      toastError({ title: 'Input not saved', description: problems[0] });
      return;
    }
    audit(false);
    toastSuccess({ title: 'Work input saved', description: `${staff.fullName} · ${serviceMonth}` });
    onOpenChange(false);
  }

  function onVerify() {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      setSummary(Object.values(e).filter((x): x is string => Boolean(x)));
      return;
    }
    const { id, problems } = persist();
    if (problems.length) {
      setSummary(problems);
      toastError({ title: 'Input not verified', description: problems[0] });
      return;
    }
    const actor = user?.name ?? 'Unknown';
    const verifyProblems = usePayrollStore.getState().verifyWorkInput(id, actor, new Date().toISOString());
    if (verifyProblems.length) {
      setSummary(verifyProblems);
      toastError({ title: 'Input not verified', description: verifyProblems[0] });
      return;
    }
    audit(true);
    toastSuccess({ title: 'Work input verified', description: `${staff.fullName} · ${serviceMonth}` });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Work input — {staff.fullName}</DialogTitle>
          <DialogDescription>
            {serviceMonth} · {isEdit ? 'Editing an existing line; a verified line resets to Draft on any earned-content change (§11).' : 'Enter the month’s earnings or review line, then Save draft or Verify (§50.2).'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto p-4">
          {structure?.type === 'Per session' && rate !== undefined && (
            <p className="text-meta text-ink-muted">Pay type: Per session · rate {formatPKR(rate)} per verified session (§50.2).</p>
          )}

          {summary.length > 0 && (
            <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-meta text-danger" role="alert">
              <ul className="list-disc space-y-0.5 pl-4">{summary.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}

          <Field label="Input type" required htmlFor="wiType">
            <Select value={draft.type} onValueChange={(v) => set('type', v as WorkInputType)}>
              <SelectTrigger id="wiType"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WORK_INPUT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {(draft.type === 'Session' || draft.type === 'Honorarium') && (
            <Field label="Approved units" required htmlFor="wiUnits" error={errors.units} hint={sessionEarning !== undefined ? `Context: ${formatPKR(sessionEarning)} at the structure rate — verified value is what counts.` : undefined}>
              <Input id="wiUnits" type="number" min={0} step={1} num value={draft.units} onChange={(e) => set('units', e.target.value)} invalid={Boolean(errors.units)} />
            </Field>
          )}

          {(draft.type === 'Allowance' || draft.type === 'Bonus' || draft.type === 'Correction') && (
            <Field label="Amount (PKR)" required htmlFor="wiAmount" error={errors.amount}>
              <Input id="wiAmount" type="number" min={0} step={1} num value={draft.amount} onChange={(e) => set('amount', e.target.value)} invalid={Boolean(errors.amount)} />
            </Field>
          )}

          {(draft.type === 'Paid leave' || draft.type === 'Unpaid leave') && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" required htmlFor="wiFrom" error={errors.fromDate}>
                <Input id="wiFrom" type="date" value={draft.fromDate} onChange={(e) => set('fromDate', e.target.value)} invalid={Boolean(errors.fromDate)} />
              </Field>
              <Field label="To" required htmlFor="wiTo" error={errors.toDate}>
                <Input id="wiTo" type="date" value={draft.toDate} onChange={(e) => set('toDate', e.target.value)} invalid={Boolean(errors.toDate)} />
              </Field>
            </div>
          )}

          <Field label="Proof / note" htmlFor="wiNote" hint="Schedule reference or supporting detail (§50.2).">
            <Input id="wiNote" value={draft.note} onChange={(e) => set('note', e.target.value)} />
          </Field>

          <Field label="Reason" htmlFor="wiReason" error={errors.reason} hint="Required for a deliberate zero or a revision of a verified input (§11).">
            <Input id="wiReason" value={draft.reason} onChange={(e) => set('reason', e.target.value)} invalid={Boolean(errors.reason)} />
          </Field>

          {existing?.state === 'Verified' && (
            <p className="text-meta text-ink-subtle">Currently verified by {existing.verifiedBy ?? '—'} {existing.verifiedAt ? formatDateTime(existing.verifiedAt) : ''} (§11).</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="subtle" onClick={onSave}>Save draft</Button>
          <Button onClick={onVerify}>Verify input</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
