// ============================================
// MediCMS Desktop — Void a receipt (FEE_TEMPLATES §27.1, PAYMENTS §27.2)
//
// Nothing in the ledger is edited or deleted: a void is a linked Reversal entry,
// the receipt stays in the register and its number is never reused. The two books
// move together — the student ledger gets the reversal, the money books get the
// matching StudentPaymentReversal (§8, §79.6), and the allocation is released so
// the fee charge shows unpaid again. The screen lays both effects out BEFORE
// anything is written, in the words the ledger check would use.
// ============================================

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { todayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { toastError, toastSuccess } from '@/lib/toast';
import {
  REASON_MIN_LENGTH,
  chargeStateOf,
  entryId,
  entryProblems,
  reversedEntryIds,
} from '@/lib/ledger';
import type { ChargeState } from '@/lib/ledger';
import { releasePreview } from '@/lib/fee/allocation';
import type { PostedCharge } from '@/lib/fee/types';
import {
  moneyEntryProblems,
  nextActionNo,
  nextMoneyEntryNo,
  voidablePaymentEntry,
  voidPaymentEntry,
} from '@/lib/finance';
import { useAuditStore, useAuthStore, useLedgerStore, useMoneyStore } from '@/stores';
import type { LedgerEntry } from '@/types';

/** The charge list as the fee core sees it: open amount plus what is already paid (§25). */
function postedChargesOf(state: ChargeState): PostedCharge[] {
  return state.charges.map((c) => ({
    id: c.entryId,
    term: c.term ?? 0,
    label: c.label,
    amount: Math.max(0, c.billed + c.added - c.cancelled - c.reduced),
    dueDate: c.dueDate,
    allocated: c.paid,
  }));
}

export function VoidReceiptDialog({ payment, onClose }: { payment: LedgerEntry; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const ledgerEntries = useLedgerStore((s) => s.entries);
  const moneyEntries = useMoneyStore((s) => s.entries);
  const accounts = useMoneyStore((s) => s.accounts);
  const closedDays = useMoneyStore((s) => s.closedDays);
  const role = useAuthStore((s) => s.user?.role);

  const own = useMemo(
    () => ledgerEntries.filter((e) => e.studentSno === payment.studentSno),
    [ledgerEntries, payment.studentSno],
  );
  const state = useMemo(() => chargeStateOf(own), [own]);

  // §27.1 — what the void releases, charge by charge, before → after.
  const release = useMemo(
    () => releasePreview(postedChargesOf(state), state.allocations.get(payment.id) ?? []),
    [state, payment.id],
  );
  const placed = release.reduce((sum, row) => sum + row.released, 0);
  const creditPart = Math.max(0, payment.amount - placed);

  // The money side of the same receipt, when the books hold one that can be stood
  // against (§8: only an In of a payment route is voidable, and only once).
  const moneyTarget = useMemo(() => {
    if (!payment.reference) return undefined;
    const original = moneyEntries.find(
      (e) => e.direction === 'In' && e.linkedDoc === payment.reference,
    );
    if (!voidablePaymentEntry(original)) return undefined;
    if (moneyEntries.some((e) => e.kind === 'StudentPaymentReversal' && e.reverses === original.id)) {
      return undefined;
    }
    return original;
  }, [moneyEntries, payment.reference]);
  const moneyAccountName = moneyTarget
    ? accounts.find((a) => a.id === moneyTarget.accountId)?.name ?? moneyTarget.accountId
    : null;

  // §27.1: after the day is closed only an Admin may void.
  const dayClosed = closedDays.some((d) => d.date === payment.date);
  const blockedByClose = dayClosed && role !== 'Admin';

  const reasonOk = reason.trim().length >= REASON_MIN_LENGTH;
  const receiptLabel = payment.reference ?? `entry #${payment.entryNo}`;

  const submit = () => {
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const ledger = useLedgerStore.getState();
    const fresh = ledger.entries.filter((e) => e.studentSno === payment.studentSno);
    if (reversedEntryIds(fresh).has(payment.id)) {
      setError('This receipt is already voided — a number is never reused (§27.1).');
      return;
    }

    const today = todayKey();
    const createdAt = nowISO();
    const entryNo = ledger.nextEntryNo(payment.studentSno);
    const reversal: LedgerEntry = {
      id: entryId(payment.studentSno, entryNo),
      studentSno: payment.studentSno,
      entryNo,
      date: today,
      type: 'Reversal',
      amount: payment.amount,
      description: `Receipt ${receiptLabel} voided — reversal of entry ${payment.entryNo}`,
      reference: payment.reference ?? null,
      linkedEntryId: payment.id,
      reason: reason.trim(),
      createdBy: userName,
      createdAt,
      actionNo: `void-${payment.studentSno}-${entryNo}`,
      balanceAfter: 0,
    };

    const money = useMoneyStore.getState();
    const moneyReversal = moneyTarget
      ? voidPaymentEntry(
          moneyTarget,
          {
            date: today,
            reason: reason.trim(),
            voidReceiptNo: payment.reference ?? undefined,
            createdBy: userName,
          },
          {
            entryNo: nextMoneyEntryNo(money.entries),
            actionNo: nextActionNo(money.entries),
            now: createdAt,
          },
        )
      : null;

    // The core's rules asked before anything is written, so a refusal leaves both
    // books untouched and speaks in the ledger check's own sentences (§5, §7).
    const problems = entryProblems(reversal, { today, all: [...ledger.entries, reversal] });
    if (moneyReversal) {
      problems.push(
        ...moneyEntryProblems(moneyReversal, {
          accounts: money.accounts,
          entries: money.entries,
          closedMonths: money.closedMonths,
        }),
      );
    }
    if (problems.length) {
      setError(problems.join(' '));
      return;
    }

    const outcome = ledger.postEntries([reversal], today);
    if (!outcome.ok) {
      setError(outcome.rejected.flatMap((r) => r.problems).join(' '));
      return;
    }
    if (moneyReversal) {
      const moneyOutcome = money.postEntries([moneyReversal], today);
      if (!moneyOutcome.ok) {
        toastError({
          title: 'The ledger is reversed, but the money reversal was refused',
          description: moneyOutcome.rejected.flatMap((r) => r.problems).join(' '),
        });
      }
    }

    useAuditStore.getState().addLog({
      user: userName,
      action: 'Ledger Reversal',
      studentSno: payment.studentSno,
      details: `Receipt ${receiptLabel} voided — ${formatPKR(payment.amount)}${moneyAccountName ? ` · money reversal on ${moneyAccountName}` : ''}${
        release.length ? ` · released ${release.map((r) => `${r.label} ${formatPKR(r.released)}`).join(', ')}` : ''
      } · reason: ${reason.trim()}`,
    });
    toastSuccess({
      title: `Receipt ${receiptLabel} voided`,
      description: `Reversal entry ${entryNo} posted; ${release.length ? 'the fee charge is unpaid again' : 'the ledger is back to where it was before the payment'}.`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Void receipt {receiptLabel}</DialogTitle>
          <DialogDescription>
            The receipt stays in the register marked VOID and its number is never reused. A linked
            reversal cancels the payment, its allocation is released, and the money books get a
            matching reversal (§27.1).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-micro">
            <div>
              <div className="text-ink-muted uppercase tracking-wide">Receipt</div>
              <div className="text-meta font-semibold text-ink tabular-nums">{receiptLabel}</div>
            </div>
            <div>
              <div className="text-ink-muted uppercase tracking-wide">Date</div>
              <div className="text-meta font-semibold text-ink">{formatDate(payment.date)}</div>
            </div>
            <div>
              <div className="text-ink-muted uppercase tracking-wide">Mode</div>
              <div className="text-meta font-semibold text-ink">{payment.paymentMode ?? '—'}</div>
            </div>
            <div>
              <div className="text-ink-muted uppercase tracking-wide">Amount</div>
              <div className="text-meta font-semibold text-ink tabular-nums">{formatPKR(payment.amount)}</div>
            </div>
          </div>

          <div className="rounded-control border border-hairline px-3 py-2 space-y-1">
            <div className="text-micro font-semibold text-ink uppercase tracking-wide">What reopening means</div>
            {release.length === 0 && (
              <p className="text-meta text-ink-secondary">
                No fee charge was paid by this receipt — it sat as credit. Voiding removes{' '}
                {formatPKR(payment.amount)} of credit.
              </p>
            )}
            {release.map((row) => (
              <div key={row.chargeId} className="flex items-baseline justify-between gap-2 text-meta">
                <span className="text-ink-secondary">{row.label}</span>
                <span className="text-ink-muted tabular-nums whitespace-nowrap">
                  {formatPKR(row.released)} released · unpaid {formatPKR(row.unpaidBefore)} →{' '}
                  <strong className="text-dues">{formatPKR(row.unpaidAfter)}</strong>
                </span>
              </div>
            ))}
            {creditPart > 0 && release.length > 0 && (
              <p className="text-micro text-ink-muted">
                {formatPKR(creditPart)} of the receipt was held as credit; voiding removes it as well.
              </p>
            )}
            <p className="text-micro text-ink-muted">
              {moneyTarget
                ? `Money books: a ${formatPKR(payment.amount)} reversal posts out of ${moneyAccountName} (§8).`
                : 'Money books: no matching money entry was found — only the student ledger is reversed.'}
            </p>
          </div>

          {dayClosed && (
            <div className="rounded-control border border-hairline bg-surface-sunken px-3 py-2 text-meta text-ink-secondary">
              {blockedByClose
                ? `The day ${formatDate(payment.date)} is closed; only an Admin can void after a day close (§27.1).`
                : `The day ${formatDate(payment.date)} has a closing recorded — this void is allowed as an Admin override (§27.1).`}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
              placeholder="Wrong amount entered, wrong student, cheque returned…"
            />
            <p className="text-micro text-ink-muted">
              At least {REASON_MIN_LENGTH} characters — every reversal carries its reason (§5).
            </p>
          </div>

          {error && (
            <div className="rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-meta text-danger">{error}</div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Keep receipt</Button>
          <Button variant="destructive" onClick={submit} disabled={!reasonOk || blockedByClose}>
            Void receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
