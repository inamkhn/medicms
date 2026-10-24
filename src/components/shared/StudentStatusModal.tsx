// ============================================
// MediCMS Desktop v4.0 — Completed / On leave (Students §26.5)
// One overlay for the three §26.5 transitions: mark completed (with a dues
// warning before confirming), put on leave (reason and expected return date are
// required), and return from leave (a reason is required). Every transition is
// written to the audit trail as 'Student Status'; the badge follows the flags.
// ============================================

import { useState } from 'react';
import { GraduationCap, CalendarOff, Undo2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { useAuthStore, useStudentStore, useAuditStore } from '@/stores';
import type { StudentWithBalance } from '@/types';

type Mode = 'complete' | 'leave' | 'return';

interface Props {
  student: StudentWithBalance;
  mode: Mode;
  onClose: () => void;
}

const TITLES: Record<Mode, string> = {
  complete: 'Mark as completed',
  leave: 'Put on leave',
  return: 'Return from leave',
};

export function StudentStatusModal({ student, mode, onClose }: Props) {
  const today = dayKey();
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [error, setError] = useState('');
  const { user } = useAuthStore();
  const markCompleted = useStudentStore((s) => s.markCompleted);
  const putOnLeave = useStudentStore((s) => s.putOnLeave);
  const returnFromLeave = useStudentStore((s) => s.returnFromLeave);

  const dues = student.computedBalance > 0 ? student.computedBalance : 0;

  const confirm = () => {
    const userName = user?.name ?? 'Admin';
    setError('');
    if (mode === 'complete') {
      markCompleted(student.sno, today);
      useAuditStore.getState().addLog({
        user: userName,
        action: 'Student Status',
        studentSno: student.sno,
        details: `Marked completed on ${today}${dues > 0 ? ` — with ${formatPKR(dues)} dues remaining` : ''} (§26.5)`,
      });
    } else if (mode === 'leave') {
      if (!reason.trim()) { setError('A reason is required for leave (§26.5).'); return; }
      if (!returnDate) { setError('An expected return date is required (§26.5).'); return; }
      if (returnDate < today) { setError('The expected return date cannot be in the past (§26.5).'); return; }
      putOnLeave(student.sno, reason.trim(), returnDate, today);
      useAuditStore.getState().addLog({
        user: userName,
        action: 'Student Status',
        studentSno: student.sno,
        details: `On leave from ${today} — ${reason.trim()} · expected return ${returnDate} (§26.5)`,
      });
    } else {
      if (!reason.trim()) { setError('A reason is required to return from leave (§26.5).'); return; }
      returnFromLeave(student.sno);
      useAuditStore.getState().addLog({
        user: userName,
        action: 'Student Status',
        studentSno: student.sno,
        details: `Returned from leave — ${reason.trim()} (§26.5)`,
      });
    }
    onClose();
  };

  const disabled =
    (mode === 'leave' && (!reason.trim() || !returnDate || returnDate < today)) ||
    (mode === 'return' && !reason.trim());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            {mode === 'complete' && <GraduationCap size={18} className="text-cleared" />}
            {mode === 'leave' && <CalendarOff size={18} className="text-dues" />}
            {mode === 'return' && <Undo2 size={18} className="text-cleared" />}
            {TITLES[mode]} — {student.name} (SNO: {student.sno})
          </DialogTitle>
          <DialogDescription>
            {mode === 'complete' && 'The ledger is kept and payments stay allowed; promotion does not (§26.5).'}
            {mode === 'leave' && 'A reason and an expected return date are required while the student is away (§26.5).'}
            {mode === 'return' && 'Returning restores Active status, with a reason on the audit trail (§26.5).'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {mode === 'complete' && (
            <>
              {dues > 0 ? (
                <div className="rounded-card border border-dues/30 bg-dues/5 p-4">
                  <div className="flex items-center gap-2 text-dues">
                    <AlertTriangle size={16} />
                    <span className="text-meta font-medium">This student has dues of {formatPKR(dues)}</span>
                  </div>
                  <p className="text-micro text-ink-muted mt-1.5">
                    Completing keeps the ledger and the debt on record — the student leaves the active
                    counts and the defaulter lists, and payments stay allowed (§26.5).
                  </p>
                </div>
              ) : (
                <div className="rounded-card border border-cleared/30 bg-cleared-soft p-4 text-meta text-ink">
                  {student.name} has no dues. Completing keeps the ledger on record and takes the
                  student out of the active counts (§26.5).
                </div>
              )}
              <p className="text-micro text-ink-muted">
                Payments and statements stay allowed after completion; promotion does not.
              </p>
            </>
          )}

          {mode === 'leave' && (
            <>
              <div>
                <Label>Reason *</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Medical leave — surgery and recovery"
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Expected return date *</Label>
                <Input
                  type="date"
                  value={returnDate}
                  min={today}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="mt-2"
                />
              </div>
              <p className="text-micro text-ink-muted">
                While on leave the student takes no fee charge or promotion; payments stay allowed (§26.5).
              </p>
            </>
          )}

          {mode === 'return' && (
            <>
              <div className="rounded-card border border-hairline bg-hairline-soft p-4 text-meta text-ink">
                {student.name} is on leave
                {student.leaveReason && <> — {student.leaveReason}</>}
                {student.leaveReturnDate && <> · expected return {student.leaveReturnDate}</>}.
                Returning restores Active status (§26.5).
              </div>
              <div>
                <Label>Reason for return *</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Returned — medical leave ended"
                  className="mt-2"
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-meta text-danger">{error}</div>
          )}

          <div className="text-meta text-ink-muted">
            By: <strong className="text-ink">{user?.name ?? 'Admin'}</strong> (auto-filled, locked)
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={disabled}>
            {mode === 'complete' ? 'Mark completed' : mode === 'leave' ? 'Put on leave' : 'Return to Active'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
