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
import { cn, formatPKR } from '@/lib/utils';
import { toastError, toastSuccess } from '@/lib/toast';
import { isCashLike } from '@/lib/finance';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import type { NewAdvance } from '@/stores/payrollStore';
import { useMoneyStore } from '@/stores/moneyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { PAYOUT_MODES, RECOVERY_POLICIES, serviceMonthOf } from '@/lib/payroll';
import type { PayoutMode, RecoveryPolicy, Staff } from '@/lib/payroll';

// ============================================
// NewAdvanceDrawer — STAFF_PAYROLL_DESIGN §51.2
// Records the advance and its recovery policy. §15 is explicit that creating or
// approving moves no money — the balance is rebuilt from later events (§17), so
// this drawer only files the request and, at most, approves it. The Finance
// money-out and the cheque-clearance live with Finance Core integration (P14);
// the payout account is captured *by reference* here exactly as §14 allows.
// ============================================

interface Draft {
  staffId: string;
  requestedAmount: string;
  reason: string;
  recoveryPolicy: RecoveryPolicy;
  fixedRecovery: string;
  startRecoveryMonth: string;
  method: '' | PayoutMode;
  payoutAccountId: string;
  financeReference: string;
}

function nextServiceMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function currentServiceMonth(): string {
  return serviceMonthOf(new Date().toISOString().slice(0, 10));
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

export interface NewAdvanceDrawerProps {
  open: boolean;
  staff: Staff[];
  onOpenChange: (open: boolean) => void;
}

export function NewAdvanceDrawer({ open, staff, onOpenChange }: NewAdvanceDrawerProps) {
  const user = useAuthStore((s) => s.user);
  const accounts = useMoneyStore((s) => s.accounts);
  const existingAdvances = usePayrollStore((s) => s.advances);
  const advanceEvents = usePayrollStore((s) => s.advanceEvents);
  // §60 the recovery rows are Settings defaults — the Admin can still change
  // them per advance here; nothing stored rewrites an existing record.
  const payrollSettings = useSettingsStore((s) => s.payrollSettings);

  const [draft, setDraft] = useState<Draft>(() => ({
    staffId: '', requestedAmount: '', reason: '', recoveryPolicy: payrollSettings.recoveryPolicy,
    fixedRecovery: '',
    startRecoveryMonth: payrollSettings.startingRecoveryMonth === 'current service month' ? currentServiceMonth() : nextServiceMonth(),
    method: '', payoutAccountId: '', financeReference: '',
  }));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [summary, setSummary] = useState<string[]>([]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // §51.2 a staff member with a running balance is shown so the Admin sees the
  // total obligation before adding to it. Balance is derived, never typed.
  const selectedStaff = staff.find((s) => s.id === draft.staffId);
  const existingOutstanding = selectedStaff
    ? advanceEvents
        .filter((e) => existingAdvances.some((a) => a.id === e.advanceId && a.staffId === selectedStaff.id))
        .reduce((sum, e) => sum + (e.kind === 'Disbursed' ? e.amount : e.kind === 'Recovered' ? -e.amount : e.amount), 0)
    : 0;

  const activeAccounts = accounts.filter((a) =>
    a.status === 'Active' &&
    (draft.method === 'Cash' ? isCashLike(a) : draft.method === '' ? true : a.type === 'bank' || a.type === 'wallet'),
  );

  const requested = wholeNumber(draft.requestedAmount) ?? 0;
  const firstRecovery =
    draft.recoveryPolicy === 'Fixed per month' ? (wholeNumber(draft.fixedRecovery) ?? 0)
      : draft.recoveryPolicy === 'Remaining in full' ? requested
      : 0;

  function validate(): Partial<Record<string, string>> {
    const e: Partial<Record<string, string>> = {};
    if (!draft.staffId) e.staffId = 'Select the staff member (§14).';
    if (wholeNumber(draft.requestedAmount) === undefined || requested <= 0) e.requestedAmount = 'A requested advance is a positive whole number of rupees (§14).';
    if (!draft.reason.trim()) e.reason = 'An advance needs a reason (§14).';
    if (!/^\d{4}-\d{2}$/.test(draft.startRecoveryMonth)) e.startRecoveryMonth = 'The recovery start is a service month, YYYY-MM (§14).';
    if (draft.recoveryPolicy === 'Fixed per month' && (wholeNumber(draft.fixedRecovery) === undefined || firstRecovery <= 0)) {
      e.fixedRecovery = 'A fixed-per-month policy needs a positive whole recovery amount (§14).';
    }
    return e;
  }

  /** File the advance as a Draft; approve optionally in the same Admin action. */
  function submit(approve: boolean) {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      setSummary(Object.values(e).filter((x): x is string => Boolean(x)));
      return;
    }
    const actor = user?.name ?? 'Unknown';
    const now = new Date().toISOString();
    const store = usePayrollStore.getState();
    const input: NewAdvance = {
      staffId: draft.staffId,
      requestedAmount: requested,
      reason: draft.reason.trim(),
      method: draft.method || undefined,
      payoutAccountId: draft.payoutAccountId || undefined,
      financeReference: draft.financeReference.trim() || undefined,
      recoveryPolicy: draft.recoveryPolicy,
      fixedRecoveryAmount: draft.recoveryPolicy === 'Fixed per month' ? wholeNumber(draft.fixedRecovery) : undefined,
      startRecoveryMonth: draft.startRecoveryMonth,
    };
    const { advance, problems } = store.addAdvance(input, actor, now, payrollSettings.advancePrefix);
    if (!advance) {
      setSummary(problems);
      toastError({ title: 'Advance not recorded', description: problems[0] });
      return;
    }
    let finalStatus = 'Draft';
    if (approve) {
      const tp = store.transitionAdvance(advance.id, 'Approved', actor, now);
      if (tp.length) {
        setSummary(tp);
        toastError({ title: 'Advance not approved', description: tp[0] });
        return;
      }
      finalStatus = 'Approved';
    }
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Staff Entry',
      details: `${finalStatus === 'Approved' ? 'Approved' : 'Saved draft of'} advance ${advance.advanceNo} — ${formatPKR(requested)} for ${selectedStaff?.fullName ?? selectedStaff?.staffNo ?? 'staff'} · ${draft.recoveryPolicy} (§51)`,
    });
    toastSuccess({
      title: finalStatus === 'Approved' ? 'Advance approved' : 'Advance saved',
      description: `${advance.advanceNo} · ${formatPKR(requested)} · awaiting payment disbursement (§15)`,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New salary advance</DialogTitle>
          <DialogDescription>
            Recording or approving moves no money — the balance is rebuilt from later disbursements and recoveries (§15, §17).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          {summary.length > 0 && (
            <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-meta text-danger" role="alert">
              <ul className="list-disc space-y-0.5 pl-4">{summary.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}

          <Field label="Staff" required htmlFor="advStaff" error={errors.staffId}>
            <Select value={draft.staffId} onValueChange={(v) => set('staffId', v)}>
              <SelectTrigger id="advStaff"><SelectValue placeholder="Select staff…" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName} / {s.staffNo}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {existingOutstanding > 0 && (
            <p className="text-meta text-dues">This staff already has {formatPKR(existingOutstanding)} outstanding across their advances (§51.2 total obligation).</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (PKR)" required htmlFor="advAmount" error={errors.requestedAmount}>
              <Input id="advAmount" type="number" min={0} step={1} num value={draft.requestedAmount} onChange={(e) => set('requestedAmount', e.target.value)} invalid={Boolean(errors.requestedAmount)} />
            </Field>
            <Field label="Start recovery month" required htmlFor="advStart" error={errors.startRecoveryMonth} hint="Defaults to the next service month (§14).">
              <Input id="advStart" type="month" value={draft.startRecoveryMonth} onChange={(e) => set('startRecoveryMonth', e.target.value)} invalid={Boolean(errors.startRecoveryMonth)} />
            </Field>
          </div>

          <Field label="Reason" required htmlFor="advReason" error={errors.reason}>
            <Input id="advReason" value={draft.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. Emergency family expense" invalid={Boolean(errors.reason)} />
          </Field>

          <Field label="Recovery policy" required>
            <div className="flex flex-wrap gap-2">
              {RECOVERY_POLICIES.map((p) => (
                <Button key={p} type="button" size="sm" variant={draft.recoveryPolicy === p ? 'default' : 'outline'} onClick={() => set('recoveryPolicy', p)}>{p}</Button>
              ))}
            </div>
          </Field>

          {draft.recoveryPolicy === 'Fixed per month' && (
            <Field label="Monthly recovery (PKR)" required htmlFor="advFixed" error={errors.fixedRecovery}>
              <Input id="advFixed" type="number" min={0} step={1} num value={draft.fixedRecovery} onChange={(e) => set('fixedRecovery', e.target.value)} invalid={Boolean(errors.fixedRecovery)} />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3 border-t border-hairline-soft pt-3">
            <Field label="Payment mode" htmlFor="advMethod" hint="Set now; the money movement is recorded at payment (P14).">
              {/* Optional at filing (§14): stays controlled and is clearable back to "Not set". */}
              <Select value={draft.method || '__none'} onValueChange={(v) => { set('method', v === '__none' ? '' : (v as PayoutMode)); set('payoutAccountId', ''); }}>
                <SelectTrigger id="advMethod"><SelectValue placeholder="Not set" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not set</SelectItem>
                  {PAYOUT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Money account" htmlFor="advAccount">
              <Select value={draft.payoutAccountId} onValueChange={(v) => set('payoutAccountId', v)} disabled={!draft.method}>
                <SelectTrigger id="advAccount"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reference" htmlFor="advRef" className="col-span-2">
              <Input id="advRef" value={draft.financeReference} onChange={(e) => set('financeReference', e.target.value)} placeholder="Optional note / voucher reference" />
            </Field>
          </div>

          {(() => {
            const balanceAfter = requested - firstRecovery;
            return (
              <div className="rounded-control border border-hairline bg-surface p-3">
                <div className="mb-1 text-meta font-semibold uppercase tracking-wide text-ink-muted">Preview</div>
                <div className="space-y-0.5 text-body">
                  <div className="flex justify-between"><span className="text-ink-muted">Advance to disburse</span><span className="num text-ink">{formatPKR(requested)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-muted">Planned first recovery</span><span className="num text-ink">{draft.recoveryPolicy === 'Manual per run' ? 'chosen per run' : formatPKR(firstRecovery)}</span></div>
                  <div className="flex justify-between border-t border-hairline-soft pt-0.5"><span className="text-ink-muted">Balance after first recovery</span><span className="num font-semibold text-ink">{formatPKR(Math.max(0, balanceAfter))}</span></div>
                </div>
                <p className="mt-1.5 text-meta text-ink-subtle">Approval and payment are separate steps; an approved-but-unpaid advance is not yet outstanding (§51.2).</p>
              </div>
            );
          })()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="subtle" onClick={() => submit(false)}>Save draft</Button>
          <Button onClick={() => submit(true)}>Approve advance</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
