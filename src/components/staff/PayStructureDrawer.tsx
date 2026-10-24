import { useState, type ReactNode } from 'react';
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
import { cn, formatPKR } from '@/lib/utils';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { useAcademicStore } from '@/stores/academicStore';
import {
  PAY_STRUCTURE_TYPES,
  PAYOUT_MODES,
  SALARY_COST_CATEGORIES,
  defaultCostCategory,
  nextStructureId,
  previewStructure,
  serviceMonthOf,
  structureOverlapProblems,
} from '@/lib/payroll';
import type {
  AllowanceDefault,
  PayStructure,
  PayStructureType,
  SalaryCostCategory,
  Staff,
} from '@/lib/payroll';

// ============================================
// PayStructureDrawer — STAFF_PAYROLL_DESIGN §49
// The Admin-only salary-structure editor. It creates a *new effective-dated
// structure*; a structure an approved run has snapshotted is never rewritten, so
// a change is a fresh row with the next revision number and the old ones stay in
// history (§8, §49.2 "Delete not allowed once referenced"). The arithmetic lives
// in the pure calc/structures cores — this screen only assembles the record and
// shows one illustrative month (§49 preview). No money moves here.
// ============================================

interface Draft {
  type: PayStructureType;
  effectiveFrom: string;
  effectiveTo: string;
  monthlyBase: string;
  ratePerSession: string;
  honorariumMode: 'fixed' | 'perUnit';
  honorariumFixed: string;
  allowanceDefaults: AllowanceDefault[];
  costCategory: SalaryCostCategory;
  programTag: string;
  usualPayoutMode: string;
  referenceBankAccount: string;
  reason: string;
  previewMonth: string;
}

function wholeNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return undefined;
  return n;
}

function draftFor(staff: Staff): Draft {
  return {
    type: 'Fixed monthly',
    effectiveFrom: '',
    effectiveTo: '',
    monthlyBase: '',
    ratePerSession: '',
    honorariumMode: 'fixed',
    honorariumFixed: '',
    allowanceDefaults: [],
    // §8 the editor suggests the category from the staff type but stays editable
    // within the reserved payroll set only — never a free-text salary line.
    costCategory: defaultCostCategory(staff.staffType),
    programTag: '',
    usualPayoutMode: staff.payoutPreference ?? '',
    referenceBankAccount: staff.bankAccount ?? '',
    reason: '',
    previewMonth: serviceMonthOf(new Date().toISOString().slice(0, 10)),
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

export interface PayStructureDrawerProps {
  open: boolean;
  staff: Staff;
  onOpenChange: (open: boolean) => void;
}

export function PayStructureDrawer({ open, staff, onOpenChange }: PayStructureDrawerProps) {
  const user = useAuthStore((s) => s.user);
  const programs = useAcademicStore((s) => s.programs);
  const payStructures = usePayrollStore((s) => s.payStructures);
  const runs = usePayrollStore((s) => s.runs);
  const lines = usePayrollStore((s) => s.lines);

  // Keyed-remount pattern (see StaffDrawer): the container only mounts this while
  // open, so the lazy seed runs once per open and there is no reset-on-open effect.
  const [draft, setDraft] = useState<Draft>(() => draftFor(staff));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [summary, setSummary] = useState<string[]>([]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const siblings = payStructures.filter((p) => p.staffId === staff.id);
  const revision = siblings.reduce((max, p) => Math.max(max, p.revision), 0) + 1;

  // §49.2 "This staff member appears in N approved runs. Past runs will not change."
  const approvedRunIds = new Set(runs.filter((r) => r.calculationState === 'Approved').map((r) => r.id));
  const approvedRunCount = new Set(
    lines.filter((l) => l.staffId === staff.id && approvedRunIds.has(l.runId)).map((l) => l.runId),
  ).size;

  const preview = previewStructure({
    type: draft.type,
    serviceMonth: draft.previewMonth,
    effectiveFrom: draft.effectiveFrom || '1900-01-01',
    effectiveTo: draft.effectiveTo || undefined,
    joiningDate: staff.joiningDate,
    leavingDate: staff.leavingDate,
    monthlyBase: wholeNumber(draft.monthlyBase),
    ratePerSession: wholeNumber(draft.ratePerSession),
    honorariumFixed: draft.honorariumMode === 'fixed' ? wholeNumber(draft.honorariumFixed) : undefined,
    allowanceDefaults: draft.allowanceDefaults,
  });

  function validate(): Partial<Record<string, string>> {
    const e: Partial<Record<string, string>> = {};
    if (!draft.effectiveFrom) e.effectiveFrom = 'An effective-from date is required (§8).';
    if (draft.effectiveTo && draft.effectiveFrom && draft.effectiveTo < draft.effectiveFrom) {
      e.effectiveTo = 'The end date cannot precede the start (§8).';
    }
    if (draft.type === 'Fixed monthly') {
      if (wholeNumber(draft.monthlyBase) === undefined) e.monthlyBase = 'Enter a whole monthly base in rupees (§8).';
    }
    if (draft.type === 'Per session' && wholeNumber(draft.ratePerSession) === undefined) {
      e.ratePerSession = 'A session structure needs a per-session rate (§8).';
    }
    if (draft.type === 'Honorarium') {
      if (draft.honorariumMode === 'fixed' && wholeNumber(draft.honorariumFixed) === undefined) {
        e.honorariumFixed = 'Enter the fixed honorarium for a service month (§8).';
      }
      if (draft.honorariumMode === 'perUnit' && wholeNumber(draft.ratePerSession) === undefined) {
        e.ratePerSession = 'A per-unit honorarium needs a rate per unit (§8).';
      }
    }
    for (const [i, a] of draft.allowanceDefaults.entries()) {
      if (!a.label.trim()) e[`allowance${i}`] = 'Each allowance default needs a label.';
      else if (!Number.isInteger(a.amount) || a.amount < 0) e[`allowance${i}`] = 'An allowance amount is a whole non-negative number of rupees.';
    }
    if (!draft.reason.trim()) e.reason = 'A reason is required to save a pay structure (§49.2).';
    return e;
  }

  function save() {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      setSummary(Object.values(e).filter((x): x is string => Boolean(x)));
      return;
    }
    const overlaps = structureOverlapProblems(siblings, {
      effectiveFrom: draft.effectiveFrom,
      effectiveTo: draft.effectiveTo || undefined,
    });
    if (overlaps.length) {
      setErrors({ effectiveFrom: overlaps[0] });
      setSummary(overlaps);
      return;
    }

    const actor = user?.name ?? 'Unknown';
    const now = new Date().toISOString();
    const structure: PayStructure = {
      id: nextStructureId(payStructures),
      staffId: staff.id,
      type: draft.type,
      monthlyBase: draft.type === 'Fixed monthly' ? wholeNumber(draft.monthlyBase) : undefined,
      ratePerSession:
        draft.type === 'Per session' || (draft.type === 'Honorarium' && draft.honorariumMode === 'perUnit')
          ? wholeNumber(draft.ratePerSession)
          : undefined,
      honorariumFixed: draft.type === 'Honorarium' && draft.honorariumMode === 'fixed' ? wholeNumber(draft.honorariumFixed) : undefined,
      allowanceDefaults: draft.type === 'Fixed monthly' && draft.allowanceDefaults.length ? draft.allowanceDefaults : undefined,
      costCategory: draft.costCategory,
      programTag: draft.programTag || undefined,
      usualPayoutMode: (draft.usualPayoutMode || undefined) as PayStructure['usualPayoutMode'],
      referenceBankAccount: draft.referenceBankAccount.trim() || undefined,
      effectiveFrom: draft.effectiveFrom,
      effectiveTo: draft.effectiveTo || undefined,
      reason: draft.reason.trim(),
      revision,
      approvedBy: actor,
      approvedAt: now,
      createdBy: actor,
      createdAt: now,
    };

    const problems = usePayrollStore.getState().addPayStructure(structure);
    if (problems.length) {
      setSummary(problems);
      toastError({ title: 'Structure not saved', description: problems[0] });
      return;
    }
    // §49.2 audit the change with its reason; bank reference is never echoed.
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Staff Entry',
      details:
        `Pay structure v${revision} for ${staff.staffNo} — ${staff.fullName}: ${draft.type} effective ${draft.effectiveFrom}` +
        (draft.effectiveTo ? `–${draft.effectiveTo}` : '') + ` · reason: ${draft.reason.trim()}`,
    });
    toastSuccess({ title: 'Pay structure saved', description: `${staff.fullName} · revision ${revision}` });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay structure — {staff.fullName}</DialogTitle>
          <DialogDescription>
            Confidential and Admin-only. Saving creates a new effective-dated revision; past runs do not change (§49).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          <div className="flex items-center gap-1.5 text-meta text-ink-muted">
            <Lock size={12} aria-hidden="true" /> {revision > 1 ? `Existing structures stay read-only in history (next revision v${revision}).` : 'First pay structure for this staff member.'}
          </div>

          {summary.length > 0 && (
            <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-meta text-danger" role="alert">
              <ul className="list-disc space-y-0.5 pl-4">
                {summary.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Effective from" required htmlFor="effectiveFrom" error={errors.effectiveFrom}>
              <Input id="effectiveFrom" type="date" value={draft.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} invalid={Boolean(errors.effectiveFrom)} />
            </Field>
            <Field label="Until" htmlFor="effectiveTo" error={errors.effectiveTo} hint="Blank means it runs until replaced (§8).">
              <Input id="effectiveTo" type="date" value={draft.effectiveTo} onChange={(e) => set('effectiveTo', e.target.value)} invalid={Boolean(errors.effectiveTo)} />
            </Field>
          </div>

          <Field label="Pay type" required>
            <div className="flex gap-2">
              {PAY_STRUCTURE_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={draft.type === t ? 'default' : 'outline'}
                  onClick={() => set('type', t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </Field>

          {/* §49.2 changing the type shows only its own fields; values are not silently reused. */}
          {draft.type === 'Fixed monthly' && (
            <div className="space-y-3 rounded-control border border-hairline-soft bg-surface p-3">
              <Field label="Monthly base (PKR)" required htmlFor="monthlyBase" error={errors.monthlyBase}>
                <Input id="monthlyBase" type="number" min={0} step={1} num value={draft.monthlyBase} onChange={(e) => set('monthlyBase', e.target.value)} invalid={Boolean(errors.monthlyBase)} />
              </Field>
              <div className="space-y-2">
                <Label>Default allowances (optional)</Label>
                {draft.allowanceDefaults.map((a, i) => (
                  <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                    <Input
                      aria-label={`Allowance ${i + 1} label`}
                      value={a.label}
                      placeholder="e.g. Responsibility allowance"
                      invalid={Boolean(errors[`allowance${i}`])}
                      onChange={(e) => set('allowanceDefaults', draft.allowanceDefaults.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    />
                    <Input
                      aria-label={`Allowance ${i + 1} amount`}
                      type="number" min={0} step={1} num
                      value={String(a.amount)}
                      onChange={(e) => set('allowanceDefaults', draft.allowanceDefaults.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
                    />
                    <Button type="button" size="icon" variant="ghost" aria-label={`Remove allowance ${i + 1}`} onClick={() => set('allowanceDefaults', draft.allowanceDefaults.filter((_, j) => j !== i))}>
                      <X size={14} />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="subtle" onClick={() => set('allowanceDefaults', [...draft.allowanceDefaults, { label: '', amount: 0, followsBaseProration: false }])}>
                  <Plus size={13} className="mr-1" /> Add allowance
                </Button>
              </div>
            </div>
          )}

          {draft.type === 'Per session' && (
            <Field label="Rate per session (PKR)" required htmlFor="ratePerSession" error={errors.ratePerSession} hint="A verified monthly quantity is required at pay time — the number is not guessed here (§49.2).">
              <Input id="ratePerSession" type="number" min={0} step={1} num value={draft.ratePerSession} onChange={(e) => set('ratePerSession', e.target.value)} invalid={Boolean(errors.ratePerSession)} />
            </Field>
          )}

          {draft.type === 'Honorarium' && (
            <div className="space-y-3 rounded-control border border-hairline-soft bg-surface p-3">
              <Field label="Expressed as">
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={draft.honorariumMode === 'fixed' ? 'default' : 'outline'} onClick={() => set('honorariumMode', 'fixed')}>Fixed per month</Button>
                  <Button type="button" size="sm" variant={draft.honorariumMode === 'perUnit' ? 'default' : 'outline'} onClick={() => set('honorariumMode', 'perUnit')}>Rate × approved units</Button>
                </div>
              </Field>
              {draft.honorariumMode === 'fixed' ? (
                <Field label="Fixed honorarium (PKR)" required htmlFor="honorariumFixed" error={errors.honorariumFixed}>
                  <Input id="honorariumFixed" type="number" min={0} step={1} num value={draft.honorariumFixed} onChange={(e) => set('honorariumFixed', e.target.value)} invalid={Boolean(errors.honorariumFixed)} />
                </Field>
              ) : (
                <Field label="Rate per unit (PKR)" required htmlFor="honorariumRate" error={errors.ratePerSession} hint="Approved units are verified monthly (§8).">
                  <Input id="honorariumRate" type="number" min={0} step={1} num value={draft.ratePerSession} onChange={(e) => set('ratePerSession', e.target.value)} invalid={Boolean(errors.ratePerSession)} />
                </Field>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 border-t border-hairline-soft pt-3">
            <Field label="Staff cost category" htmlFor="costCategory" hint="Suggested from staff type; only reserved payroll categories (§8).">
              <Select value={draft.costCategory} onValueChange={(v) => set('costCategory', v as SalaryCostCategory)}>
                <SelectTrigger id="costCategory"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SALARY_COST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Program tag (optional)" htmlFor="programTag">
              {/* Optional and clearable: a wrong pick must be revertible to "None". */}
              <Select value={draft.programTag || '__none'} onValueChange={(v) => set('programTag', v === '__none' ? '' : v)}>
                <SelectTrigger id="programTag"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {programs.map((p) => <SelectItem key={p.id} value={p.shortCode}>{p.shortCode} — {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Preferred payout" htmlFor="usualPayoutMode">
              <Select value={draft.usualPayoutMode || '__none'} onValueChange={(v) => set('usualPayoutMode', v === '__none' ? '' : v)}>
                <SelectTrigger id="usualPayoutMode"><SelectValue placeholder="Not set" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not set</SelectItem>
                  {PAYOUT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Preview service month" htmlFor="previewMonth">
              <Input id="previewMonth" type="month" value={draft.previewMonth} onChange={(e) => set('previewMonth', e.target.value)} />
            </Field>
          </div>

          {/* §49 illustrative preview — one month of the structure, prorated when short. */}
          <div className="rounded-control border border-hairline bg-surface p-3">
            <div className="mb-1 text-meta font-semibold uppercase tracking-wide text-ink-muted">Preview for {draft.previewMonth}</div>
            <div className="space-y-0.5 text-body">
              <div className="flex justify-between"><span className="text-ink-muted">Base</span><span className="num text-ink">{formatPKR(preview.base)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Allowance</span><span className="num text-ink">{formatPKR(preview.allowance)}</span></div>
              <div className="flex justify-between border-t border-hairline-soft pt-0.5"><span className="text-ink-muted">Illustrative gross</span><span className="num font-semibold text-ink">{formatPKR(preview.illustrativeGross)}</span></div>
            </div>
            <p className="mt-1.5 text-meta text-ink-subtle">{preview.note}</p>
          </div>

          {approvedRunCount > 0 && (
            <p className="text-meta text-dues">This staff member appears in {approvedRunCount} approved run(s). Past runs will not change (§49.2).</p>
          )}

          <Field label="Reason for change" required htmlFor="reason" error={errors.reason} hint="Required to save; audited with old/new values (§49.2).">
            <Input id="reason" value={draft.reason} onChange={(e) => { set('reason', e.target.value); }} invalid={Boolean(errors.reason)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save new structure</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
