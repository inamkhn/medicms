import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { useMoneyStore } from '@/stores/moneyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  generateRunDraft, monthClosePayrollStatus, nextRunId, nextRunNumber, resolveEligibility, serviceMonthOf,
} from '@/lib/payroll';
import type { PayrollRun, PayrollSettings, RunKind, ServiceMonth } from '@/lib/payroll';

// ============================================
// GeneratePayrollWizard — STAFF_PAYROLL_DESIGN §53 (/staff/payroll → Generate)
// A three-step wizard that never moves money and never silently ignores a
// problem: Step 1 picks the service month and run kind; Step 2 runs the same
// readiness checks the run core will apply at approval (§20.3) and *disables
// Continue* while a structural blocker stands; Step 3 confirms and produces
// exactly one Draft run atomically. The draft writes no cost, no payable and no
// money entry (§53.3, §23) — approval does that later, in the run core.
// ============================================

type Step = 1 | 2 | 3;

interface CheckRow {
  mark: 'ok' | 'warn' | 'info';
  text: string;
  link?: { label: string; to: string };
}

const MARK: Record<CheckRow['mark'], string> = { ok: 'text-cleared', warn: 'text-danger', info: 'text-ink-muted' };
const MARK_GLYPH: Record<CheckRow['mark'], string> = { ok: '[x]', warn: '[!]', info: '[i]' };

function monthLabel(month: ServiceMonth): string {
  const [y, m] = month.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

/** §60 the month the wizard opens on: the previous service month while its
 *  payroll is not yet finalized, else the current one — or the current month
 *  directly when the institute changed the default. */
function defaultGenerationMonth(runs: readonly PayrollRun[], mode: PayrollSettings['generationDefaultMonth']): ServiceMonth {
  const current = serviceMonthOf(new Date().toISOString().slice(0, 10));
  if (mode === 'current month') return current;
  const [y, m] = current.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  return monthClosePayrollStatus(prev, runs).finalized ? current : prev;
}

export interface GeneratePayrollWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GeneratePayrollWizard({ open, onOpenChange }: GeneratePayrollWizardProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const staffRecords = usePayrollStore((s) => s.staff);
  const payStructures = usePayrollStore((s) => s.payStructures);
  const workInputs = usePayrollStore((s) => s.workInputs);
  const advances = usePayrollStore((s) => s.advances);
  const advanceEvents = usePayrollStore((s) => s.advanceEvents);
  const runs = usePayrollStore((s) => s.runs);
  const closedMonths = useMoneyStore((s) => s.closedMonths);
  const payrollSettings = useSettingsStore((s) => s.payrollSettings);

  const [step, setStep] = useState<Step>(1);
  const [month, setMonth] = useState<ServiceMonth>(() => defaultGenerationMonth(runs, payrollSettings.generationDefaultMonth));
  const [kind, setKind] = useState<RunKind>('Standard');
  const [referencesRunId, setReferencesRunId] = useState('');
  const [reason, setReason] = useState('');

  const monthRuns = runs.filter((r) => r.serviceMonth === month && !r.noPayrollReason?.trim());
  const approvedStandard = monthRuns.find((r) => r.kind === 'Standard' && r.calculationState === 'Approved');
  const referenceCandidates = monthRuns.filter((r) => r.calculationState === 'Approved');

  const { eligible, missingStructure } = resolveEligibility(staffRecords, payStructures, month);
  const eligibleIds = new Set(eligible.map((e) => e.staffId));
  const draftInputStaff = new Set(
    workInputs.filter((w) => w.serviceMonth === month && w.state === 'Draft' && eligibleIds.has(w.staffId)).map((w) => w.staffId),
  );
  const activeAdvanceStaff = new Set(
    advances.filter((a) => a.status === 'Active' && eligibleIds.has(a.staffId)).map((a) => a.staffId),
  );

  const duplicateStandard = kind === 'Standard' && approvedStandard !== undefined;
  const closedConflict = closedMonths.includes(month);
  const noEligible = eligible.length === 0;
  const supplementalBlocked = kind === 'Supplemental' && referenceCandidates.length === 0;
  const blockers = missingStructure.length + draftInputStaff.size;

  const canContinue = !duplicateStandard && !closedConflict && !noEligible && !supplementalBlocked && blockers === 0;

  function checks(): CheckRow[] {
    const rows: CheckRow[] = [
      { mark: noEligible ? 'warn' : 'ok', text: `${eligible.length} eligible staff identified` },
      { mark: missingStructure.length ? 'warn' : 'ok', text: missingStructure.length ? `${missingStructure.length} staff have no pay structure this month` : `${eligible.length} valid pay structures` },
      {
        mark: draftInputStaff.size ? 'warn' : 'ok',
        text: draftInputStaff.size ? `${draftInputStaff.size} work inputs not verified` : 'All work inputs verified',
        link: draftInputStaff.size ? { label: 'Open work inputs', to: '/staff/work-inputs' } : undefined,
      },
      { mark: duplicateStandard ? 'warn' : 'ok', text: duplicateStandard ? `An approved standard run already exists (${approvedStandard?.runNumber})` : 'No duplicate standard pay run' },
      { mark: closedConflict ? 'warn' : 'ok', text: closedConflict ? `${month} is a closed month` : 'No closed-month conflict' },
      { mark: 'info', text: `${activeAdvanceStaff.size} staff have active advances scheduled for review` },
    ];
    if (supplementalBlocked) rows.push({ mark: 'warn', text: 'A supplemental run needs an existing approved run to reference' });
    return rows;
  }

  function generateDraft(): void {
    const actor = user?.name ?? 'Unknown';
    const now = new Date().toISOString();
    const runId = nextRunId(runs);
    const runNumber = nextRunNumber(month, runs, payrollSettings.runPrefix);
    const { bundle } = generateRunDraft({
      runId,
      runNumber,
      month,
      kind,
      referencesRunId: kind === 'Supplemental' ? referencesRunId : undefined,
      staff: staffRecords,
      structures: payStructures,
      workInputs,
      advances,
      advanceEvents,
      actor,
      now,
    });
    if (bundle.lines.length === 0) {
      toastError({ title: 'Nothing to generate', description: 'No eligible staff for this service month (§4.8).' });
      return;
    }
    usePayrollStore.getState().saveDraftRun(bundle);
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Staff Entry',
      details: `Generated ${kind.toLowerCase()} draft ${runNumber} for ${month} · ${bundle.lines.length} staff · no money posted (§53.3)`,
    });
    toastSuccess({ title: 'Draft payroll created', description: `${runNumber} — no cost or payment posted yet` });
    onOpenChange(false);
    navigate(`/staff/payroll/${runId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate payroll</DialogTitle>
          <DialogDescription>Step {step} of 3 — {step === 1 ? 'Service period' : step === 2 ? 'Readiness' : 'Confirmation'}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="wp-month">Service month</Label>
                <Input id="wp-month" type="month" value={month} onChange={(e) => setMonth(e.target.value as ServiceMonth)} />
              </div>
              <div className="space-y-1">
                <Label>Run type</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant={kind === 'Standard' ? 'default' : 'outline'} onClick={() => setKind('Standard')}>Standard</Button>
                  <Button size="sm" variant={kind === 'Supplemental' ? 'default' : 'outline'} onClick={() => setKind('Supplemental')}>Supplemental</Button>
                </div>
              </div>
              {kind === 'Supplemental' && (
                <div className="space-y-1">
                  <Label htmlFor="wp-ref">Corrects run</Label>
                  <Select value={referencesRunId} onValueChange={setReferencesRunId}>
                    <SelectTrigger id="wp-ref" className="w-64"><SelectValue placeholder="Select an approved run" /></SelectTrigger>
                    <SelectContent>
                      {referenceCandidates.map((r) => <SelectItem key={r.id} value={r.id}>{r.runNumber}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input aria-label="Supplemental reason" className="w-64" placeholder="Reason for the correction (§19)" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              )}
              <p className="text-meta text-ink-muted">
                Existing payroll: {approvedStandard ? `Approved standard run ${approvedStandard.runNumber}` : `No approved standard run for ${monthLabel(month)}`}
                {' · '}Eligible staff: {eligible.length}
              </p>
            </div>
          )}

          {step === 2 && (
            <ul className="space-y-1.5">
              {checks().map((c, i) => (
                <li key={i} className="flex items-baseline gap-2 text-body">
                  <span className={`num ${MARK[c.mark]}`}>{MARK_GLYPH[c.mark]}</span>
                  <span className="flex-1 text-ink">{c.text}</span>
                  {c.link && (
                    <Button size="sm" variant="link" onClick={() => { onOpenChange(false); navigate(c.link!.to); }}>{c.link.label}</Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {step === 3 && (
            <div className="space-y-2 text-body">
              <div className="flex justify-between"><span className="text-ink-muted">Service month</span><span className="text-ink">{monthLabel(month)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Run type</span><span className="text-ink">{kind}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Employees</span><span className="num text-ink">{eligible.length}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Inputs verified</span><span className="num text-ink">{eligible.length}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Advances to consider</span><span className="num text-ink">{activeAdvanceStaff.size}</span></div>
              <p className="rounded-control border border-hairline bg-surface p-3 text-meta text-ink-muted">
                This creates a DRAFT ONLY. No bank/cash entry, voucher or payroll cost will be posted yet (§53.3).
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => (step === 1 ? onOpenChange(false) : setStep((s) => (s - 1) as Step))}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step === 1 && (
            <Button disabled={noEligible || supplementalBlocked || (kind === 'Supplemental' && (!referencesRunId || !reason.trim()))} onClick={() => setStep(2)}>Continue</Button>
          )}
          {step === 2 && <Button disabled={!canContinue} onClick={() => setStep(3)}>Continue</Button>}
          {step === 3 && (
            <Button
              disabled={duplicateStandard || closedConflict}
              onClick={() => {
                if (duplicateStandard) { toastError({ title: 'Run exists', description: 'Approve a supplemental instead (§19).' }); return; }
                generateDraft();
              }}
            >
              Generate draft
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
