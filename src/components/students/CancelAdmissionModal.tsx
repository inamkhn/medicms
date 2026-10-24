// ============================================
// MediCMS Desktop — Cancel an admission (FEE_TEMPLATES §27.3)
//
// Available to Accountant and Admin within the cancellation window (default 7 days,
// Settings), with an Admin override outside it. The screen prices what the student
// keeps (`suggestRefund`) and lays the ledger effect out before anything is written:
// the unpaid remainder of every charge is reversed, the refunded part comes off the
// charge it was paid to, a Refund entry records the money to return, and the student
// is struck off with "Admission cancelled". Nothing is edited or deleted (§27.1).
// ============================================

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate, formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { toastSuccess } from '@/lib/toast';
import { REASON_MIN_LENGTH, chargeStateOf, entryId, entryProblems } from '@/lib/ledger';
import type { LedgerEntry } from '@/lib/ledger';
import { daysBetween } from '@/lib/fee/ageing';
import { planPreview } from '@/lib/fee/planPreview';
import { termFeesOf } from '@/lib/fee/templateCompat';
import { suggestRefund, type RefundLine } from '@/lib/fee/refund';
import { cancellationReversals, type CancellationCharge } from '@/lib/fee/cancellation';
import { useAuditStore, useAuthStore, useFeeTemplateStore, useLedgerStore, useSettingsStore, useStudentStore } from '@/stores';
import type { StudentWithBalance } from '@/types';

interface Props {
  student: StudentWithBalance;
  onClose: () => void;
}

export function CancelAdmissionModal({ student, onClose }: Props) {
  const { user } = useAuthStore();
  const role = user?.role;
  const isAdmin = role === 'Admin';
  const windowDays = useSettingsStore((s) => s.cancellationWindowDays);
  const templates = useFeeTemplateStore((s) => s.templates);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  const strikeOff = useStudentStore((s) => s.strikeOff);

  const [note, setNote] = useState('');
  // null means "the suggestion" — an Admin's edit is what freezes a number.
  const [refundText, setRefundText] = useState<string | null>(null);
  const [override, setOverride] = useState(false);
  const [error, setError] = useState('');

  const today = dayKey();
  const own = useMemo(
    () => ledgerEntries.filter((e) => e.studentSno === student.sno),
    [ledgerEntries, student.sno],
  );
  const state = useMemo(() => chargeStateOf(own), [own]);

  // The plan the student was admitted on, priced net of their records (§13.3) —
  // the refundable split comes from the template, never guessed.
  const template = templates.find((t) => t.id === student.feeTemplateId);
  const feeTerms = state.charges
    .filter((c) => c.type === 'FeeCharge' && typeof c.term === 'number' && (c.term as number) > 0)
    .map((c) => c.term as number);
  const openingTerm = feeTerms.length ? Math.min(...feeTerms) : 1;
  const priced = template
    ? planPreview(termFeesOf(template).terms, student.planConcessions ?? [], openingTerm)
    : null;
  const refundableIds = new Set((template?.components ?? []).filter((c) => c.refundable).map((c) => c.id));
  const lines: RefundLine[] = priced
    ? priced.opening.lines.map((l) => ({
        name: l.name,
        net: l.net,
        refundable: refundableIds.has(l.componentId),
      }))
    : [];
  const refundableTotal = lines.reduce((sum, l) => sum + (l.refundable ? Math.max(0, l.net) : 0), 0);

  const paymentReceived = own
    .filter((e) => e.type === 'Payment' && !state.reversed.has(e.id))
    .reduce((sum, e) => sum + e.amount, 0);

  const charges: CancellationCharge[] = state.charges.map((c) => {
    const net = Math.max(0, c.billed + c.added - c.cancelled - c.reduced);
    const isOpening = c.type === 'FeeCharge' && c.term === openingTerm && refundableTotal > 0;
    const refundableNet = isOpening ? Math.min(refundableTotal, net) : 0;
    return {
      chargeId: c.entryId,
      label: c.label,
      unpaid: c.unpaid,
      paid: c.paid,
      refundableNet,
      nonRefundableNet: net - refundableNet,
    };
  });

  const suggested = suggestRefund({ paid: paymentReceived, lines });
  const refundAmount = refundText === null
    ? suggested
    : Math.max(0, Math.min(parseInt(refundText, 10) || 0, paymentReceived));
  const reversals = cancellationReversals(charges, refundAmount);
  const totalReversed = reversals.reduce((sum, row) => sum + row.amount, 0);

  const daysSince = daysBetween(student.regDate, today);
  const withinWindow = daysSince >= 0 && daysSince <= windowDays;
  const blockedByWindow = !withinWindow && !isAdmin;
  const noteOk = note.trim().length >= REASON_MIN_LENGTH;
  const ready = !blockedByWindow && noteOk && (withinWindow || override) && !student.struckOff;

  const handleConfirm = () => {
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    setError('');
    if (student.struckOff) {
      setError('This student is already struck off — nothing to cancel.');
      return;
    }
    if (!noteOk) {
      setError(`A cancellation note of at least ${REASON_MIN_LENGTH} characters is required (§27.3).`);
      return;
    }
    const ledger = useLedgerStore.getState();
    const actionNo = `cancel-${student.sno}-${today}`;
    const createdAt = nowISO();
    let cursor = ledger.nextEntryNo(student.sno);
    const batch: LedgerEntry[] = reversals.map((row) => ({
      id: entryId(student.sno, cursor),
      studentSno: student.sno,
      entryNo: cursor++,
      date: today,
      type: 'Reversal',
      amount: row.amount,
      description: `Admission cancelled — reversal of ${row.label}`,
      linkedEntryId: row.chargeId,
      reason: note.trim(),
      createdBy: userName,
      createdAt,
      actionNo,
      balanceAfter: 0,
    }));
    if (refundAmount > 0) {
      batch.push({
        id: entryId(student.sno, cursor),
        studentSno: student.sno,
        entryNo: cursor,
        date: today,
        type: 'Refund',
        amount: refundAmount,
        description: 'Refund — admission cancelled',
        reason: note.trim(),
        approvedBy: userName,
        createdBy: userName,
        createdAt,
        actionNo,
        balanceAfter: 0,
      });
    }

    const problems = batch.flatMap((entry) =>
      entryProblems(entry, { today, all: [...ledger.entries, ...batch] }),
    );
    if (problems.length) {
      setError(problems.join(' '));
      return;
    }
    if (batch.length > 0) {
      const outcome = ledger.postEntries(batch, today);
      if (!outcome.ok) {
        setError(outcome.rejected.flatMap((r) => r.problems).join(' '));
        return;
      }
    }

    strikeOff(student.sno, 'Admission cancelled', note.trim(), today);
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Ledger Reversal',
      studentSno: student.sno,
      details: `Admission cancelled — ${reversals.length} charge reversal(s) ${formatPKR(totalReversed)}${
        refundAmount > 0 ? ` · refund ${formatPKR(refundAmount)} (record the money out in Finance → Refunds)` : ''
      } · ${note.trim()}`,
    });
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Struck Off',
      studentSno: student.sno,
      details: `Admission cancelled — ${note.trim()}${
        withinWindow ? '' : ` · outside the ${windowDays}-day window${isAdmin ? ' (Admin override)' : ''}`
      }`,
    });
    toastSuccess({
      title: 'Admission cancelled',
      description: `${formatPKR(totalReversed)} of dues reversed${refundAmount > 0 ? `, ${formatPKR(refundAmount)} to refund` : ''}. Student struck off.`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cancel admission — {student.name}</DialogTitle>
          <DialogDescription>
            The unpaid charges are reversed, the refunded part comes off the fees it was paid to, and the
            student is struck off with "Admission cancelled". Nothing is edited or deleted (§27.3).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-micro">
            <div>
              <div className="text-ink-muted uppercase tracking-wide">Admitted</div>
              <div className="text-meta font-semibold text-ink">{formatDate(student.regDate)}</div>
            </div>
            <div>
              <div className="text-ink-muted uppercase tracking-wide">Days since</div>
              <div className="text-meta font-semibold text-ink tabular-nums">{daysSince}</div>
            </div>
            <div>
              <div className="text-ink-muted uppercase tracking-wide">Window</div>
              <div className="text-meta font-semibold text-ink tabular-nums">{windowDays} days</div>
            </div>
            <div>
              <div className="text-ink-muted uppercase tracking-wide">Paid</div>
              <div className="text-meta font-semibold text-ink tabular-nums">{formatPKR(paymentReceived)}</div>
            </div>
          </div>

          {!withinWindow && (
            <div className={blockedByWindow
              ? 'rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-meta text-danger'
              : 'rounded-control border border-hairline bg-surface-sunken px-3 py-2 text-meta text-ink-secondary'}
            >
              {blockedByWindow
                ? `Past the ${windowDays}-day cancellation window — only an Admin can cancel now (§27.3).`
                : `Past the ${windowDays}-day window; cancelling needs the Admin override below (§27.3).`}
            </div>
          )}

          {/* What the student was charged and what stands against it. */}
          <div className="rounded-control border border-hairline px-3 py-2 space-y-1">
            <div className="text-micro font-semibold text-ink uppercase tracking-wide">Charges on record</div>
            {state.charges.length === 0 && (
              <p className="text-meta text-ink-secondary">No fee charge was posted — only the strike-off applies.</p>
            )}
            {state.charges.map((c) => {
              const net = Math.max(0, c.billed + c.added - c.cancelled - c.reduced);
              return (
                <div key={c.entryId} className="flex items-baseline justify-between gap-2 text-meta">
                  <span className="text-ink-secondary">{c.label}</span>
                  <span className="text-ink-muted tabular-nums whitespace-nowrap">
                    net {formatPKR(net)} · paid {formatPKR(c.paid)} · unpaid{' '}
                    <strong className={c.unpaid > 0 ? 'text-dues' : 'text-cleared'}>{formatPKR(c.unpaid)}</strong>
                  </span>
                </div>
              );
            })}
            <p className="text-micro text-ink-muted">
              Concessions already sit in the net figures (§13.3). Refundable part of the plan:{' '}
              {template ? formatPKR(refundableTotal) : 'unknown — no fee template on this student'}.
            </p>
          </div>

          {/* §27.3 — the suggested refund, which only an Admin may change. */}
          <div className="rounded-control border border-hairline px-3 py-2 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-meta font-medium text-ink">Refund to return</div>
                <div className="text-micro text-ink-muted">
                  Suggested {formatPKR(suggested)} — paid minus the non-refundable charges (§27.3)
                </div>
              </div>
              <Input
                type="number"
                min={0}
                max={paymentReceived}
                className="w-[130px] text-right tabular-nums"
                value={String(refundAmount)}
                disabled={!isAdmin}
                onChange={(e) => setRefundText(e.target.value)}
              />
            </div>
            {isAdmin && refundAmount !== suggested && (
              <p className="text-micro text-ink-muted">
                Changed from the suggestion — your note below is the reason of record.
              </p>
            )}
            {refundAmount > 0 && (
              <p className="text-micro text-ink-muted">
                Posted as a Refund entry now; record the money paid out in Finance → Refunds (§27.4).
              </p>
            )}
          </div>

          {/* The ledger effect, before anything is written. */}
          <div className="rounded-control border border-hairline px-3 py-2 space-y-1">
            <div className="text-micro font-semibold text-ink uppercase tracking-wide">What will be reversed</div>
            {reversals.length === 0 && (
              <p className="text-meta text-ink-secondary">Nothing is owed — no reversal is needed.</p>
            )}
            {reversals.map((row) => (
              <div key={row.chargeId} className="flex items-baseline justify-between gap-2 text-meta">
                <span className="text-ink-secondary">{row.label}</span>
                <span className="text-ink-muted tabular-nums">reverse {formatPKR(row.amount)}</span>
              </div>
            ))}
            {reversals.length > 0 && (
              <p className="text-micro text-ink-muted">
                Total reversed {formatPKR(totalReversed)}; the balance closes at zero with the refund.
              </p>
            )}
          </div>

          {isAdmin && !withinWindow && (
            <label className="flex items-center gap-2.5 cursor-pointer rounded-control border border-hairline px-3 py-2">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="accent-dues w-4 h-4"
              />
              <span className="text-meta text-ink">Cancel outside the {windowDays}-day window (Admin override)</span>
            </label>
          )}

          <div className="space-y-1.5">
            <Label>Note *</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
              placeholder="Why is the admission being cancelled?"
            />
            <p className="text-micro text-ink-muted">
              At least {REASON_MIN_LENGTH} characters — the note is the reason on every reversal and the audit trail (§5).
            </p>
          </div>

          {error && (
            <div className="rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-meta text-danger">{error}</div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Keep admission</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!ready}>
            Cancel admission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
