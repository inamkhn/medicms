import { useState, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toastSuccess } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  DEFAULT_PAYROLL_SETTINGS,
  RECOVERY_POLICIES,
  nextAdvanceNo,
  nextBatchNo,
  nextRunNumber,
  nextStaffNo,
  serviceMonthOf,
} from '@/lib/payroll';
import type { PayrollSettings, RecoveryPolicy } from '@/lib/payroll';

// ============================================
// StaffPayrollSettings — STAFF_PAYROLL_DESIGN §60 (/staff/settings, Admin only)
// The payroll-owned Settings: the four number prefixes and the three screen
// defaults. Every value is read at create time by the mint or the form that
// owns it — changing a value here never rewrites an approved pay run or any
// historical number (§60 closing line). The rows §60 marks Shared are Finance
// Core's or the login controls' and are shown here as a pointer, not stored
// twice; the calculation rows are fixed by the §7/§65 contract.
// ============================================

/** §60 rows that exist but belong elsewhere — shown so the Admin sees the whole table. */
const SHARED_ROWS: readonly { label: string; owner: string }[] = [
  { label: 'Cheque stale threshold — 6 months', owner: 'Finance Core' },
  { label: 'Cash negative balance — never allowed', owner: 'Finance Core' },
  { label: 'Bank overdraft — warn, do not block', owner: 'Finance Core' },
  { label: 'Staff expense categories — reserved Staff categories', owner: 'Finance Core' },
  { label: 'Approval — Admin only, re-authentication', owner: 'Shared login controls' },
  { label: 'Payroll money/date format — whole PKR, institute-local dates', owner: 'Shared' },
];

/** §60 rows the calculation contract fixes — not changeable in v1. */
const FIXED_ROWS: readonly { label: string; value: string }[] = [
  { label: 'Monthly salary proration', value: 'Calendar days in the service month (§65 t1–t4)' },
  { label: 'Auto-apply recovery', value: 'Suggest schedule; Admin confirms during review (§18, §53)' },
];

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline-soft py-2 last:border-0">
      <div>
        <p className="text-body font-semibold text-ink">{label}</p>
        {hint && <p className="text-meta text-ink-muted">{hint}</p>}
      </div>
      <div className="w-56">{children}</div>
    </div>
  );
}

export default function StaffPayrollSettings() {
  const user = useAuthStore((s) => s.user);
  const payrollSettings = useSettingsStore((s) => s.payrollSettings);
  const setPayrollSettings = useSettingsStore((s) => s.setPayrollSettings);
  const staff = usePayrollStore((s) => s.staff);
  const advances = usePayrollStore((s) => s.advances);
  const runs = usePayrollStore((s) => s.runs);
  const payoutBatches = usePayrollStore((s) => s.payoutBatches);

  const [draft, setDraft] = useState<PayrollSettings>(payrollSettings);

  const changed = (
    draft.staffPrefix !== payrollSettings.staffPrefix
    || draft.runPrefix !== payrollSettings.runPrefix
    || draft.batchPrefix !== payrollSettings.batchPrefix
    || draft.advancePrefix !== payrollSettings.advancePrefix
    || draft.generationDefaultMonth !== payrollSettings.generationDefaultMonth
    || draft.startingRecoveryMonth !== payrollSettings.startingRecoveryMonth
    || draft.recoveryPolicy !== payrollSettings.recoveryPolicy
  );

  // A live preview of the next number each mint would produce under the draft —
  // the Admin sees the effect before saving, against the real records (§60).
  const month = serviceMonthOf(new Date().toISOString().slice(0, 10));
  const previews = [
    { label: 'Staff number', value: nextStaffNo(staff, draft.staffPrefix) },
    { label: 'Pay run number', value: nextRunNumber(month, runs, draft.runPrefix) },
    { label: 'Payout batch number', value: nextBatchNo(month, payoutBatches, draft.batchPrefix) },
    { label: 'Advance number', value: nextAdvanceNo(advances, draft.advancePrefix) },
  ];

  const setPrefix = (key: 'staffPrefix' | 'runPrefix' | 'batchPrefix' | 'advancePrefix', value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function save() {
    setPayrollSettings(draft);
    // The store sanitizes each prefix; read the stored result back into the form.
    setDraft(useSettingsStore.getState().payrollSettings);
    useAuditStore.getState().addLog({
      user: user?.name ?? 'Unknown',
      action: 'Settings Change',
      details: `Payroll settings updated — prefixes ${draft.staffPrefix}/${draft.runPrefix}/${draft.batchPrefix}/${draft.advancePrefix}; approved runs untouched (§60)`,
    });
    toastSuccess({ title: 'Payroll settings saved', description: 'New records use them; approved runs are untouched (§60).' });
  }

  function restoreDefaults() {
    setDraft(DEFAULT_PAYROLL_SETTINGS);
  }

  return (
    <div className="w-auto space-y-4">
      <div>
        <h1 className="text-title font-semibold text-ink">Payroll Settings</h1>
        <p className="text-meta text-ink-muted">
          Changing a Settings value does not silently change already approved pay runs or historical payroll numbers (§60).
        </p>
      </div>

      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Numbering</p>
          <Row label="Staff ID prefix" hint="Mints the next staff number above every one seen (§4)." >
            <Input value={draft.staffPrefix} onChange={(e) => setPrefix('staffPrefix', e.target.value)} placeholder="ST-" />
          </Row>
          <Row label="Payroll run prefix" hint="Forms PAY-YYYY-MM-NN for a service month (§19).">
            <Input value={draft.runPrefix} onChange={(e) => setPrefix('runPrefix', e.target.value)} placeholder="PAY-" />
          </Row>
          <Row label="Payout batch prefix" hint="Forms PB-YYYYMM-### inside one service month (§55).">
            <Input value={draft.batchPrefix} onChange={(e) => setPrefix('batchPrefix', e.target.value)} placeholder="PB-" />
          </Row>
          <Row label="Advance prefix" hint="Mints the next advance number; never reused (§14).">
            <Input value={draft.advancePrefix} onChange={(e) => setPrefix('advancePrefix', e.target.value)} placeholder="ADV-" />
          </Row>
          <div className="flex flex-wrap gap-2 pt-3">
            {previews.map((p) => (
              <span key={p.label} className="rounded-pill border border-hairline px-2 py-1 text-micro text-ink-muted">
                {p.label}: <span className="num font-semibold text-ink">{p.value}</span>
              </span>
            ))}
          </div>
          <p className="pt-1 text-micro text-ink-subtle">
            Changing a prefix never renumbers existing records and never restarts a sequence — the mint keeps the highest number seen (§60).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Pay run defaults</p>
          <Row label="Payroll generation default month" hint="The month the Generate wizard opens on (§53).">
            <Select value={draft.generationDefaultMonth} onValueChange={(v) => setDraft((d) => ({ ...d, generationDefaultMonth: v as PayrollSettings['generationDefaultMonth'] }))}>
              <SelectTrigger aria-label="Generation default month"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="previous unfinalized month">Previous unfinalized service month</SelectItem>
                <SelectItem value="current month">Current month</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Advance defaults</p>
          <Row label="Starting recovery month" hint="The recovery start a new advance form proposes (§14).">
            <Select value={draft.startingRecoveryMonth} onValueChange={(v) => setDraft((d) => ({ ...d, startingRecoveryMonth: v as PayrollSettings['startingRecoveryMonth'] }))}>
              <SelectTrigger aria-label="Starting recovery month"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="next service month">Next service month</SelectItem>
                <SelectItem value="current service month">Current service month</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Salary advance recovery option" hint="The policy a new advance starts with; per-advance changes stay possible (§14).">
            <Select value={draft.recoveryPolicy} onValueChange={(v) => setDraft((d) => ({ ...d, recoveryPolicy: v as RecoveryPolicy }))}>
              <SelectTrigger aria-label="Recovery policy"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECOVERY_POLICIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Fixed by the design contract</p>
          {FIXED_ROWS.map((r) => (
            <div key={r.label} className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline-soft py-2 last:border-0">
              <p className="text-body font-semibold text-ink">{r.label}</p>
              <p className="text-meta text-ink-muted">{r.value}</p>
            </div>
          ))}
          <p className="mb-1 mt-4 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Shared with Finance Core and login controls</p>
          {SHARED_ROWS.map((r) => (
            <div key={r.label} className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline-soft py-2 last:border-0">
              <p className="text-body text-ink">{r.label}</p>
              <p className="text-meta text-ink-subtle">Managed in {r.owner}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={!changed}>Save changes</Button>
        <Button variant="outline" onClick={restoreDefaults} disabled={!changed && JSON.stringify(draft) === JSON.stringify(DEFAULT_PAYROLL_SETTINGS)}>
          Restore defaults
        </Button>
        {changed && <span className="text-meta text-dues">Unsaved changes — nothing applies until saved (§60).</span>}
      </div>
    </div>
  );
}
