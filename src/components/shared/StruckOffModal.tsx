// ============================================
// MediCMS Desktop v4.0 - Struck Off Modal (Screen 3.3)
// ============================================

import { useState } from 'react';
import { UserX, Undo2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STRUCK_OFF_REASONS } from '@/lib/constants';
import { formatPKR, formatDate } from '@/lib/utils';
import { dayKey, addDays } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { DEFAULT_TERM_DUE_DAYS, REASON_MIN_LENGTH, entryId, entryProblems } from '@/lib/ledger';
import { useAuthStore, useStudentStore, useAuditStore, useLedgerStore, useSettingsStore } from '@/stores';
import type { LedgerEntry, StudentWithBalance } from '@/types';

interface Props {
  student: StudentWithBalance;
  mode: 'strike' | 'reverse';
  onClose: () => void;
}

export function StruckOffModal({ student, mode, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  // §26.1: the posting date is the local day — never a UTC split — and cannot
  // be in the future.
  const today = dayKey();
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  // §26.2/§27.4: credit left on the student can be refunded as a ledger entry
  // before the strike lands; the money paid out is recorded in Finance.
  const credit = student.computedBalance < 0 ? Math.abs(student.computedBalance) : 0;
  const [refundCredit, setRefundCredit] = useState(false);
  const [refundAmount, setRefundAmount] = useState(String(credit || ''));
  const [refundReason, setRefundReason] = useState('Struck off — unused credit refunded');
  // §26.3/§27.5: an optional re-admission fee, pre-filled from Settings.
  const reAdmissionDefault = useSettingsStore((s) => s.reAdmissionFee);
  const [fee, setFee] = useState(reAdmissionDefault > 0 ? String(reAdmissionDefault) : '');
  const [dueDate, setDueDate] = useState(() => addDays(today, DEFAULT_TERM_DUE_DAYS));
  const { user } = useAuthStore();
  const strikeOff = useStudentStore((s) => s.strikeOff);
  const reverseStrikeOff = useStudentStore((s) => s.reverseStrikeOff);

  const isReverse = mode === 'reverse';
  const isFutureDate = date > today;
  const refundAmt = parseInt(refundAmount, 10) || 0;
  const feeAmount = parseInt(fee, 10) || 0;

  const handleConfirm = () => {
    const userName = user?.name ?? 'Admin';
    setError('');
    if (isReverse) {
      if (!reason.trim()) return;
      if (feeAmount < 0) { setError('The re-admission fee cannot be negative (§26.3).'); return; }
      // §26.3/§27.5: build and check the re-admission charge against the ledger
      // rules first, so a refusal never lands after the reversal.
      let feeEntry: LedgerEntry | null = null;
      if (feeAmount > 0) {
        const ledger = useLedgerStore.getState();
        const entryNo = ledger.nextEntryNo(student.sno);
        feeEntry = {
          id: entryId(student.sno, entryNo),
          studentSno: student.sno,
          entryNo,
          date: today,
          type: 'SpecialCharge',
          amount: Math.round(feeAmount),
          description: 'Re-admission fee',
          dueDate,
          createdBy: userName,
          createdAt: nowISO(),
          balanceAfter: 0,
        };
        const problems = entryProblems(feeEntry, { today, all: [...ledger.entries, feeEntry] });
        if (problems.length) { setError(problems.join(' ')); return; }
      }
      reverseStrikeOff(student.sno);
      useAuditStore.getState().addLog({
        user: userName,
        action: 'Struck Off Reversed',
        studentSno: student.sno,
        details: `Reason: ${reason.trim()} — was: ${student.struckOffReason ?? '—'} on ${student.struckOffDate ?? '—'}${feeEntry ? ` · Re-admission fee ${formatPKR(feeEntry.amount)}` : ''}`,
      });
      if (feeEntry) {
        const outcome = useLedgerStore.getState().postEntries([feeEntry], today);
        if (!outcome.ok) {
          setError(`Reversed — but the re-admission fee was refused: ${outcome.rejected.flatMap((r) => r.problems).join(' ')} Add it from the ledger instead.`);
          return;
        }
        useAuditStore.getState().addLog({ user: userName, action: 'Charge Added', studentSno: student.sno, details: `Re-admission fee · ${formatPKR(feeEntry.amount)} — Special charge` });
      }
    } else {
      if (!reason) return;
      if (reason === 'Other' && !details.trim()) return;
      if (isFutureDate) { setError('The strike-off date cannot be in the future (§26.1).'); return; }
      // §26.2/§27.4: the refund is the student-side half — its ledger entry
      // reduces the credit; Finance → Refunds records the money out.
      let refundEntry: LedgerEntry | null = null;
      if (refundCredit && credit > 0) {
        if (refundAmt <= 0 || refundAmt > credit) { setError(`The refund is 1 to ${formatPKR(credit)} — it cannot exceed the credit (§26.2).`); return; }
        if (refundReason.trim().length < REASON_MIN_LENGTH) { setError(`A refund needs a reason of at least ${REASON_MIN_LENGTH} characters (§5).`); return; }
        const ledger = useLedgerStore.getState();
        const entryNo = ledger.nextEntryNo(student.sno);
        refundEntry = {
          id: entryId(student.sno, entryNo),
          studentSno: student.sno,
          entryNo,
          date,
          type: 'Refund',
          amount: Math.round(refundAmt),
          description: 'Credit refund — struck off',
          reason: refundReason.trim(),
          approvedBy: userName,
          createdBy: userName,
          createdAt: nowISO(),
          balanceAfter: 0,
        };
        const problems = entryProblems(refundEntry, { today, all: [...ledger.entries, refundEntry] });
        if (problems.length) { setError(problems.join(' ')); return; }
        const outcome = ledger.postEntries([refundEntry], today);
        if (!outcome.ok) { setError(outcome.rejected.flatMap((r) => r.problems).join(' ')); return; }
        useAuditStore.getState().addLog({ user: userName, action: 'Fee Refund', studentSno: student.sno, details: `Credit refund ${formatPKR(refundEntry.amount)} — ${refundEntry.reason} · Record the money out in Finance → Refunds (§27.4)` });
      }
      strikeOff(student.sno, reason, details, date);
      useAuditStore.getState().addLog({
        user: userName,
        action: 'Struck Off',
        studentSno: student.sno,
        details: `Reason: ${[reason, details].filter(Boolean).join(' — ')} on ${date}${refundEntry ? ` · Credit refunded ${formatPKR(refundEntry.amount)}` : ''}`,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl shadow-slate-200/50 w-full max-w-lg border border-slate-100/60">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-100/60">
          <div className={`p-2.5 rounded-xl ${isReverse ? 'bg-emerald-50' : 'bg-red-50'}`}>
            {isReverse ? <Undo2 size={20} className="text-emerald-500" /> : <UserX size={20} className="text-red-500" />}
          </div>
          <div>
            <h2 className="font-semibold text-lg text-slate-900">
              {isReverse ? 'Reverse Struck Off' : 'Mark as Struck Off'}
            </h2>
            <p className="text-sm text-slate-500">
              {student.name} (SNO: {student.sno})
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {isReverse ? (
            /* --- Reverse mode --- */
            <>
              <div className="bg-emerald-50/80 border border-emerald-100 rounded-xl p-4">
                <p className="text-sm text-emerald-600">
                  {student.name} is currently struck off
                  {student.struckOffDate && <> on {formatDate(student.struckOffDate)}</>}
                  {student.struckOffReason && <> — {student.struckOffReason}</>}.
                </p>
                <p className="text-sm text-emerald-500 mt-1.5">
                  Reversing will restore the student to Active status and clear the struck-off record.
                </p>
              </div>
              <div>
                <Label>Reason for Reversal *</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Fee cleared — student reinstated by Admin"
                  className="mt-2"
                />
                {!reason.trim() && (
                  <p className="text-xs text-red-500 mt-1">Reason is required for audit trail</p>
                )}
              </div>
              <div className="rounded-card border border-hairline p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-meta font-medium text-ink">Re-admission fee (optional)</div>
                    <div className="text-micro text-ink-muted">Posted as a special charge when the student returns (§26.3)</div>
                  </div>
                  <Input num value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" className="w-[120px] text-right" />
                </div>
                {feeAmount > 0 && (
                  <div className="mt-3">
                    <Label>Fee due date</Label>
                    <Input type="date" value={dueDate} min={today} onChange={(e) => setDueDate(e.target.value)} className="mt-1.5" />
                  </div>
                )}
              </div>
            </>
          ) : (
            /* --- Strike mode --- */
            <>
              {/* Current balance warning — always shown when balance != 0 */}
              {student.computedBalance !== 0 && (
                <div className="bg-amber-50/80 border border-amber-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle size={16} />
                    <span className="text-sm font-medium">
                      {student.computedBalance > 0
                        ? `Current balance: ${formatPKR(student.computedBalance)} outstanding`
                        : `Credit balance: ${formatPKR(Math.abs(student.computedBalance))} — may need a refund`}
                    </span>
                  </div>
                  <p className="text-sm text-amber-500 mt-1.5">
                    {student.computedBalance > 0
                      ? 'This student has an outstanding balance of dues, which will remain on record after strike-off. They will appear in the "Struck Off with Dues" report for collection follow-up.'
                      : 'This student holds a credit balance, which will remain on record after strike-off.'}
                  </p>
                </div>
              )}

              {/* §26.2/§27.4: credit can be refunded before the strike lands */}
              {credit > 0 && (
                <div className="rounded-card border border-hairline bg-hairline-soft p-4 space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={refundCredit}
                      onChange={(e) => setRefundCredit(e.target.checked)}
                      className="accent-dues w-4 h-4"
                    />
                    <span className="text-meta font-medium text-ink">Refund the credit — {formatPKR(credit)}</span>
                  </label>
                  {refundCredit && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Amount (1–{formatPKR(credit)})</Label>
                          <Input num value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="mt-1.5" />
                        </div>
                        <div>
                          <Label>Reason *</Label>
                          <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder={`At least ${REASON_MIN_LENGTH} characters`} className="mt-1.5" />
                        </div>
                      </div>
                      <p className="text-micro text-ink-muted">
                        Posted as a Refund ledger entry now. Record the money paid out in Finance → Refunds with its RF number (§27.4).
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Reason */}
              <div>
                <Label>Reason *</Label>
                <div className="space-y-2.5 mt-3">
                  {STRUCK_OFF_REASONS.map((r) => (
                    <label key={r} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="radio"
                        name="struckOffReason"
                        value={r}
                        checked={reason === r}
                        onChange={(e) => setReason(e.target.value)}
                        className="accent-red-500 w-4 h-4"
                      />
                      <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">{r}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Details — required when reason is Other */}
              <div>
                <Label>Details {reason === 'Other' ? '*' : ''}</Label>
                <Input
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={reason === 'Other' ? 'Required — specify the reason' : 'Additional details (optional)'}
                  className="mt-2"
                />
                {reason === 'Other' && !details.trim() && (
                  <p className="text-xs text-red-500 mt-1">Details are required when reason is Other</p>
                )}
              </div>

              {/* Date */}
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={date}
                  max={today}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-2"
                />
                <p className={isFutureDate ? 'mt-1.5 text-micro text-danger' : 'mt-1.5 text-micro text-ink-muted'}>
                  {isFutureDate
                    ? 'The strike-off date cannot be in the future (§26.1).'
                    : 'Defaults to today (editable) — never a future date (§26.1).'}
                </p>
              </div>
            </>
          )}

          {/* Refusals from the ledger rules or the future-date guard (§26.1) */}
          {error && (
            <div className="rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-meta text-danger">{error}</div>
          )}

          {/* Auto-filled admin */}
          <div className="text-sm text-slate-500">
            By: <strong className="text-slate-700">{user?.name ?? 'Admin'}</strong> (auto-filled, locked)
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 p-5 border-t border-slate-100/60">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {isReverse ? (
            <Button onClick={handleConfirm} disabled={!reason.trim()}>
              Confirm Reverse
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!reason || (reason === 'Other' && !details.trim()) || isFutureDate}
            >
              Strike Off
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
