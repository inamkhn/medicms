// ============================================
// MediCMS Desktop v4.0 - Change fee plan after admission (FEE design §26)
//
// §26.1: pick the effective term, add/remove concessions, review each term before
// and after, and give a reason. §26.2: a posted charge is never rewritten - every
// already-charged term from the effective term gets an adjustment entry prepared by
// `planChangeAdjustments`; a paid term that becomes overpaid turns the difference
// into credit. The student's own plan and locked figures move with the change.
// ============================================

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FeePlanEditor } from '@/components/students/FeePlanEditor';
import { formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { termIndexOf } from '@/lib/constants';
import { planPreview, planSignature } from '@/lib/fee/planPreview';
import { planChangeAdjustments } from '@/lib/fee/adjustments';
import { termFeesOf, termHeadsOf } from '@/lib/fee/templateCompat';
import type { ConcessionRecord, PostedCharge } from '@/lib/fee/types';
import { REASON_MIN_LENGTH, chargeStateOf, entryId, entryProblems } from '@/lib/ledger';
import type { LedgerEntry } from '@/lib/ledger';
import { useAuditStore, useAuthStore, useFeeTemplateStore, useLedgerStore, useStudentStore } from '@/stores';
import type { StudentWithBalance } from '@/types';

interface Props {
  student: StudentWithBalance;
  onClose: () => void;
}

export function ChangeFeePlanModal({ student, onClose }: Props) {
  const templates = useFeeTemplateStore((s) => s.templates);
  const template = templates.find((t) => t.id === student.feeTemplateId);
  const currentTerm = termIndexOf(student.semester);
  const originalRecords = useMemo(() => student.planConcessions ?? [], [student.planConcessions]);

  const [records, setRecords] = useState<ConcessionRecord[]>(() => [...originalRecords]);
  const [fromTerm, setFromTerm] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { user } = useAuthStore();

  const totalTerms = template?.totalTerms ?? 0;
  const firstTerm = Math.min(currentTerm, totalTerms || currentTerm);
  const effectiveFrom = Math.min(Math.max(parseInt(fromTerm, 10) || firstTerm, firstTerm), totalTerms || firstTerm);

  const termFees = useMemo(() => (template ? termFeesOf(template).terms : []), [template]);
  const before = useMemo(() => planPreview(termFees, originalRecords, effectiveFrom), [termFees, originalRecords, effectiveFrom]);
  const after = useMemo(() => planPreview(termFees, records, effectiveFrom), [termFees, records, effectiveFrom]);

  const changed = planSignature(records) !== planSignature(originalRecords);
  const review = after.terms.map((row, i) => ({
    term: row.term,
    before: before.terms[i]?.net ?? row.net,
    after: row.net,
  }));

  const handleSave = () => {
    if (!template) return;
    const userName = user?.name ?? 'Admin';
    setError('');
    if (!changed) { setError('Nothing changed — add or remove a concession first.'); return; }
    if (reason.trim().length < REASON_MIN_LENGTH) {
      setError(`A reason of at least ${REASON_MIN_LENGTH} characters is required (§26.1).`);
      return;
    }
    const ledger = useLedgerStore.getState();
    const state = chargeStateOf(ledger.entries.filter((e) => e.studentSno === student.sno));
    // §26.2: what each billed term owes right now — the charge less everything
    // already attached to it — and what has actually been paid against it.
    const posted: PostedCharge[] = state.charges
      .filter((c) => c.type === 'FeeCharge' && typeof c.term === 'number' && c.term > 0)
      .map((c) => ({
        id: c.entryId,
        term: c.term as number,
        label: c.label,
        amount: Math.max(0, c.billed + c.added - c.cancelled - c.reduced),
        dueDate: c.dueDate,
        allocated: c.paid,
      }));
    const result = planChangeAdjustments(
      posted,
      after.terms.map((t) => ({ term: t.term, total: t.net })),
      effectiveFrom,
      reason.trim(),
    );
    const today = dayKey();
    const actionNo = `plan-change-${student.sno}-${today}`;
    let cursor = ledger.nextEntryNo(student.sno);
    const batch: LedgerEntry[] = result.adjustments.map((adjustment) => {
      const charge = state.charges.find((c) => c.entryId === adjustment.chargeId);
      const entry: LedgerEntry = {
        id: entryId(student.sno, cursor),
        studentSno: student.sno,
        entryNo: cursor,
        date: today,
        type: adjustment.amount > 0 ? 'AdjustmentAdd' : 'AdjustmentReduce',
        amount: Math.abs(adjustment.amount),
        description: `Fee plan change — ${charge?.label ?? `Term ${adjustment.term}`}`,
        term: adjustment.term,
        dueDate: adjustment.amount > 0 ? charge?.dueDate ?? null : null,
        linkedEntryId: adjustment.chargeId,
        reason: reason.trim(),
        createdBy: userName,
        createdAt: nowISO(),
        actionNo,
        balanceAfter: 0,
      };
      cursor += 1;
      return entry;
    });
    for (const entry of batch) {
      const problems = entryProblems(entry, { today, all: [...ledger.entries, ...batch] });
      if (problems.length) { setError(problems.join(' ')); return; }
    }
    setSaving(true);
    if (batch.length > 0) {
      const outcome = ledger.postEntries(batch, today);
      if (!outcome.ok) {
        setSaving(false);
        setError(outcome.rejected.flatMap((r) => r.problems).join(' '));
        return;
      }
    }
    // The plan and the locked figures travel with the student (§15.2, §26.2).
    const current = planPreview(termFees, records, firstTerm);
    useStudentStore.getState().updateStudent(student.sno, {
      planConcessions: records.length ? records : undefined,
      baseFeeTotal: current.opening.net || undefined,
      baseFeeRecurring: (current.terms.length > 1 ? current.terms[1].net : current.opening.net) || undefined,
      baseFeeBreakup: termHeadsOf(template, firstTerm),
    });
    const shown = result.adjustments
      .map((a) => `${a.amount > 0 ? '+' : '-'}${formatPKR(Math.abs(a.amount))} on Term ${a.term}`)
      .join(', ');
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Ledger Adjustment',
      studentSno: student.sno,
      details: `Fee plan change (template “${template.name}” v${template.version}) effective from Term ${effectiveFrom}: ${originalRecords.length} → ${records.length} record(s) · reason: ${reason.trim()}${shown ? ` · adjustments: ${shown}` : ' · no billed term changed'}`,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Change fee plan</DialogTitle>
          <DialogDescription>
            {student.name} · SNO {student.sno}. Posted charges are never rewritten — each already-charged
            term from the effective term gets a visible adjustment entry you confirm here (§26.2).
          </DialogDescription>
        </DialogHeader>

        {!template ? (
          <>
            <DialogBody>
              <p className="text-body text-ink-muted">
                This student has no saved fee template link, so there is no plan to edit here. Use a
                ledger adjustment instead.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogBody className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Effective from</Label>
                  <Select value={fromTerm || String(firstTerm)} onValueChange={setFromTerm}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {termFees
                        .filter((t) => t.term >= firstTerm && t.term <= template.totalTerms)
                        .map((t) => <SelectItem key={t.term} value={String(t.term)}>Term {t.term}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-meta text-ink-subtle mt-1">Terms before {firstTerm} are history — the change never reaches back past the current term.</p>
                </div>
                <div>
                  <Label>Reason *</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why the plan changes (10+ characters, written to the ledger)"
                    className={reason.length > 0 && reason.trim().length < REASON_MIN_LENGTH ? 'border-danger/50' : ''}
                  />
                </div>
              </div>

              <FeePlanEditor
                key={`plan-${effectiveFrom}`}
                lines={after.opening.lines}
                templateTotal={after.opening.template}
                totalConcession={after.opening.concession}
                netTotal={after.opening.net}
                warnings={after.opening.warnings}
                records={records}
                preview={after.terms}
                startTerm={effectiveFrom}
                totalTerms={template.totalTerms}
                termLabel={(term) => `Term ${term}`}
                onAdd={(record) => setRecords((prev) => [...prev, record])}
                onRemove={(id) => setRecords((prev) => prev.filter((r) => r.id !== id))}
              />

              {/* §26.1 step 3: each term before and after, so nothing saves unseen */}
              <div>
                <h4 className="text-sm font-semibold text-ink mb-1">Review — each term before and after</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-meta text-ink-subtle">
                      <th className="py-1 font-medium">Term</th>
                      <th className="py-1 text-right font-medium">Before</th>
                      <th className="py-1 text-right font-medium">After</th>
                      <th className="py-1 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.map((row) => (
                      <tr key={row.term} className="border-t border-dotted border-hairline">
                        <td className="py-1.5 text-ink-secondary">Term {row.term}</td>
                        <td className="py-1.5 text-right tabular-nums text-ink-muted">{formatPKR(row.before)}</td>
                        <td className="py-1.5 text-right tabular-nums text-ink">{formatPKR(row.after)}</td>
                        <td className={`py-1.5 text-right tabular-nums ${row.after < row.before ? 'text-credit' : row.after > row.before ? 'text-dues' : 'text-ink-subtle'}`}>
                          {row.after === row.before ? '—' : `${row.after > row.before ? '+' : '-'}${formatPKR(Math.abs(row.after - row.before))}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-meta text-ink-subtle mt-1">
                  Billed terms get the change as adjustment entries; unbilled terms simply use the new figure (§26.2).
                </p>
              </div>

              {error && <div className="rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-meta text-danger">{error}</div>}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !changed || reason.trim().length < REASON_MIN_LENGTH}>
                {saving ? 'Saving...' : 'Save plan change'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
