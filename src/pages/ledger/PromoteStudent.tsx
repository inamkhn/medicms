// ============================================
// MediCMS - Promote Student (single)
// Next term + default promotion fee (locked recurring)
// ============================================

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SESSION_OPTIONS, getSubCourseDef } from '@/lib/constants';
import { formatPKR, getTermLabel } from '@/lib/utils';
import { todayISO } from '@/lib/txn';
import { getNextTerm, getPromotionFee, termIndexOf } from '@/lib/promotion';
import { termFeesOf, templateTotalOf } from '@/lib/fee/templateCompat';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { entryProblems, feeChargeEntry, postingBlocker } from '@/lib/ledger';
import { confirmDialog } from '@/lib/confirm';
import { toastSuccess } from '@/lib/toast';
import { useStudentStore, useLedgerStore, useAuditStore, useAuthStore, useFeeTemplateStore } from '@/stores';

export default function PromoteStudent() {
  const { sno } = useParams<{ sno: string }>();
  const navigate = useNavigate();
  const students = useStudentStore((s) => s.students);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  const templates = useFeeTemplateStore((s) => s.templates);
  const findActive = useFeeTemplateStore((s) => s.findActive);
  const student = getStudentsWithBalanceLive(students, ledgerEntries).find((s) => s.sno.toString() === sno);

  const [session, setSession] = useState(() => String(student?.session ?? new Date().getFullYear()));
  const [narration, setNarration] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState<string | null>(null);
  // Concurrent-edit guard (§5)
  const [openCount] = useState(() => useLedgerStore.getState().entries.filter(e => e.studentSno === Number(sno)).length);

  if (!student) {
    return <div className="p-8 text-center text-slate-400">Student not found (SNO: {sno})</div>;
  }

  const subDef = getSubCourseDef(student.program);
  const nextTerm = getNextTerm(student.program, student.semester);
  const defaultFee = getPromotionFee(student, templates);
  // What the current template would bill at the target term (§16 preview). The demand
  // still posts the student's locked figure — a template change must not re-price an
  // enrolled student — so these lines are shown as the comparison, not as the total.
  const targetTemplate = findActive(student);
  const targetTerm = nextTerm ? termIndexOf(nextTerm) : null;
  const targetLines = nextTerm && targetTemplate && targetTerm !== null
    ? termFeesOf(targetTemplate).terms.find((t) => t.term === targetTerm)?.lines ?? []
    : [];
  const targetTotal = targetTemplate && targetTerm !== null ? templateTotalOf(targetTemplate, targetTerm) : 0;
  const fee = amount === null ? defaultFee : parseFloat(amount) || 0;

  if (!nextTerm) {
    return (
      <div className="w-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold">Promote Student</h1>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <div className="font-medium text-slate-900">{student.name} has completed {getTermLabel(subDef.course.system, student.semester)} — the final term for {subDef.course.label}.</div>
            <div className="text-sm text-slate-500 mt-1">No further promotion available.</div>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(`/students/${student.sno}`)}>
              Back to Profile
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handlePromote = async () => {
    setError('');
    if (fee <= 0) {
      setError('Promotion fee must be greater than 0.');
      return;
    }
    const all = useLedgerStore.getState().entries;
    if (all.filter(e => e.studentSno === student.sno).length !== openCount) {
      setError("This student's ledger has changed since you opened this page — go back, refresh and review before posting.");
      return;
    }
    // §7.6 blocks a new charge for a struck-off student. §7.7's completed case is the
    // "no further promotion available" screen above: a final-term student has no next
    // term to be billed for.
    const blocker = postingBlocker('FeeCharge', { struckOff: student.struckOff, completed: !nextTerm });
    if (blocker) {
      setError(blocker);
      return;
    }
    const nextTermLabel = getTermLabel(subDef.course.system, nextTerm);
    // One fee charge per student per term (§5) — the term, not the session, is what
    // the entry records and therefore what a second billing would duplicate.
    const duplicate = all.some(
      (e) => e.studentSno === student.sno && e.type === 'FeeCharge' && e.term === targetTerm,
    );
    if (duplicate) {
      setError(`${nextTermLabel} is already billed for this student — Session ${session}.`);
      return;
    }
    // Dual-effect confirmation: ledger write + semester change (spec §3.6)
    const ok = await confirmDialog({
      title: `Promote to ${nextTermLabel}`,
      effect: `${student.name} moves to ${nextTermLabel} and a fee charge of ${formatPKR(fee)} is posted to their ledger with a due date. Entries are append-only — a mistake is corrected with a reversal, not by editing this one (§7.1).`,
      tone: 'money',
      confirmLabel: 'Promote and bill',
    });
    if (!ok) return;
    setLoading(true);
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const date = todayISO();
    const entry = feeChargeEntry({
      studentSno: student.sno,
      entryNo: useLedgerStore.getState().nextEntryNo(student.sno),
      term: termIndexOf(nextTerm),
      amount: fee,
      // The rate is the one locked at admission, so the template's own breakdown is
      // attached only when it happens to be the same money (§5: lines must add up).
      template: targetTemplate ?? null,
      date,
      createdBy: userName,
      description: narration.trim() || `Promotion to ${nextTermLabel} — default recurring fee`,
    });
    const problems = entryProblems(entry, { today: date, all: [...all, entry] });
    if (problems.length) {
      setError(problems.join(' '));
      setLoading(false);
      return;
    }
    const outcome = useLedgerStore.getState().postEntries([entry], date);
    if (!outcome.ok) {
      setError(outcome.rejected.flatMap(r => r.problems).join(' '));
      setLoading(false);
      return;
    }
    useStudentStore.getState().updateStudent(student.sno, { semester: nextTerm, session: parseInt(session, 10) || student.session });
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Fee Demand',
      studentSno: student.sno,
      details: `Promoted to ${nextTermLabel} · Session ${session} · ${formatPKR(fee)}`,
    });
    toastSuccess({ title: `Promoted to ${nextTermLabel}`, description: `${formatPKR(fee)} billed to ${student.name} (entry #${entry.entryNo}).` });
    setLoading(false);
    navigate(`/ledger/${student.sno}?highlight=${entry.id}`);
  };

  return (
    <div className="w-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Promote Student</h1>
          <p className="text-sm text-slate-500">
            {student.name} (SNO: {student.sno}) · {subDef.course.label} — {subDef.sub.label}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {getTermLabel(subDef.course.system, student.semester)} → {getTermLabel(subDef.course.system, nextTerm)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">New charges applied at {getTermLabel(subDef.course.system, nextTerm)}</div>
            <div className="flex items-baseline gap-2">
              <span>Recurring fee (locked rate)</span>
              <span className="flex-1 border-b border-dotted border-slate-300" />
              <span className="tabular-nums">{formatPKR(defaultFee)}</span>
            </div>
            {targetLines.map((line) => (
              <div key={line.componentId} className="flex items-baseline gap-2">
                <span>{line.name}{line.refundable ? ' (refundable)' : ''}</span>
                <span className="flex-1 border-b border-dotted border-slate-300" />
                <span className="tabular-nums">{formatPKR(line.amount)}</span>
              </div>
            ))}
            <div className="flex items-baseline gap-2 font-bold pt-1 border-t border-slate-200">
              <span>New Demand Total</span>
              <span className="flex-1 border-b border-dotted border-slate-300" />
              <span className="tabular-nums">{formatPKR(fee)}</span>
            </div>
            <p className="text-xs text-slate-500">
              This posts this student's admission-locked rate, not the current template (§16).
              {targetTemplate && targetLines.length > 0
                ? ` "${targetTemplate.name}" v${targetTemplate.version} would bill ${formatPKR(targetTotal)} at this term.`
                : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Promotion fee (PKR) *</Label>
              <Input
                type="number"
                value={amount === null ? String(defaultFee) : amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">Override if needed — defaults to locked rate; extras go via Add Charge</p>
            </div>
            <div>
              <Label>Session *</Label>
              <Select value={session} onValueChange={setSession}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SESSION_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Narration</Label>
            <Input
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Auto-filled — editable"
            />
          </div>
          {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{error}</div>}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handlePromote} disabled={loading || fee <= 0}>
          {loading ? 'Promoting...' : `Promote to ${getTermLabel(subDef.course.system, nextTerm)} + Demand ${formatPKR(fee)}`}
        </Button>
      </div>
    </div>
  );
}
