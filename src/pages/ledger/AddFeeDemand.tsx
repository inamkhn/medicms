// ============================================
// MediCMS Desktop v4.0 - Add Fee Demand (Screen 4.2)
// ============================================

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
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
import { getSubCourseDef, SESSION_OPTIONS } from '@/lib/constants';
import { formatPKR, getTermLabel } from '@/lib/utils';
import { todayISO } from '@/lib/txn';
import { getPromotionFee, termIndexOf } from '@/lib/promotion';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { HEAD_KEYS, HEAD_LABELS, OTHER_FEES_LABEL, termHeadsOf, templateTotalOf } from '@/lib/fee/templateCompat';
import { entryProblems, feeChargeEntry, postingBlocker } from '@/lib/ledger';
import { toastSuccess } from '@/lib/toast';
import { useStudentStore, useLedgerStore, useAuditStore, useAuthStore, useFeeTemplateStore } from '@/stores';
import type { Semester } from '@/types';

export default function AddFeeDemand() {
  const { sno } = useParams<{ sno: string }>();
  const navigate = useNavigate();

  const students = useStudentStore((s) => s.students);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  const templates = useFeeTemplateStore((s) => s.templates);
  const findActive = useFeeTemplateStore((s) => s.findActive);
  const student = getStudentsWithBalanceLive(students, ledgerEntries).find(s => s.sno.toString() === sno);

  // Course system of the student's sub-course
  const subDef = student ? getSubCourseDef(student.program) : null;
  const termNoun = subDef
    ? (subDef.course.system === 'annual' ? 'Year' : subDef.course.system === 'months' ? 'Term' : 'Semester')
    : 'Semester';

  // Term auto-derived from current semester (spec §3.2); correction toggle unlocks it.
  const [semester, setSemester] = useState<Semester>(() => {
    if (subDef && student && subDef.sub.terms.includes(student.semester)) return student.semester;
    return subDef?.sub.terms[0] ?? '1st';
  });
  const [termUnlocked, setTermUnlocked] = useState(false);
  const [session, setSession] = useState(() => String(student?.session ?? new Date().getFullYear()));
  const [narration, setNarration] = useState('This is Next Promote Semester Fees');
  const [updateSemester, setUpdateSemester] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Concurrent-edit guard (§5): snapshot ledger size at open.
  const [openCount] = useState(() => useLedgerStore.getState().entries.filter(e => e.studentSno === Number(sno)).length);

  if (!student) {
    return <div className="p-8 text-center text-slate-400">Student not found (SNO: {sno})</div>;
  }

  // The Active template for this student's placement; fall back to their locked fee
  const template = findActive(student);
  const term = termIndexOf(semester);
  const heads = template ? termHeadsOf(template, term) : null;

  const lockedFee = getPromotionFee(student, templates);
  // What this term bills comes from the engine, not from adding heads up: a later
  // term simply carries no admission-only components, because those are charged
  // "At admission" (§5.3). No isFirstTerm special case is needed any more.
  const total = template ? templateTotalOf(template, term) : lockedFee;

  // Warnings: a term that bills nothing is almost always a template mistake, and the
  // operator is about to post it, so say so (§19).
  const warnings: string[] = [];
  if (template && total === 0) {
    warnings.push(
      `\u26A0 ${subDef ? getTermLabel(subDef.course.system, semester) : semester} carries no charge in "${template.name}" v${template.version} \u2014 check the components' term ranges before posting.`,
    );
  }

  const handleSubmit = async () => {
    setError('');
    if (!template && lockedFee <= 0) { setError('No fee template or locked admission fee found for this semester — cannot create demand.'); return; }
    const all = useLedgerStore.getState().entries;
    if (all.filter(e => e.studentSno === student.sno).length !== openCount) {
      setError("This student's ledger has changed since you opened this page — go back, refresh and review before posting.");
      return;
    }
    // §7.6: a struck-off student is not billed a new fee charge.
    const blocker = postingBlocker('FeeCharge', { struckOff: student.struckOff, completed: false });
    if (blocker) { setError(blocker); return; }
    const termLabel = getTermLabel(subDef?.course.system ?? 'semester', semester);
    // One fee charge per student per term (§5). The entry carries a term, not a
    // session, so the duplicate check is about the term the money is for.
    const duplicate = all.some(e => e.studentSno === student.sno && e.type === 'FeeCharge' && e.term === term);
    if (duplicate) { setError(`${termLabel} is already billed for this student — a second charge for the same term would bill it twice.`); return; }
    setLoading(true);
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const date = todayISO();
    const entry = feeChargeEntry({
      studentSno: student.sno,
      entryNo: useLedgerStore.getState().nextEntryNo(student.sno),
      term,
      amount: total,
      template: template ?? null,
      date,
      createdBy: userName,
      description: narration.trim() || `${termLabel} fee charge — Session ${session}`,
    });
    const problems = entryProblems(entry, { today: date, all: [...all, entry] });
    if (problems.length) { setError(problems.join(' ')); setLoading(false); return; }
    const outcome = useLedgerStore.getState().postEntries([entry], date);
    if (!outcome.ok) {
      setError(outcome.rejected.flatMap(r => r.problems).join(' '));
      setLoading(false);
      return;
    }
    if (updateSemester) useStudentStore.getState().updateStudent(student.sno, { semester });
    useAuditStore.getState().addLog({ user: userName, action: 'Fee Demand', studentSno: student.sno, details: `${termLabel} · Session ${session} · ${formatPKR(total)}${narration ? ` — ${narration}` : ''}` });
    toastSuccess({ title: `${termLabel} billed`, description: `${formatPKR(total)} charged to ${student.name} (entry #${entry.entryNo}).` });
    setLoading(false);
    navigate(`/ledger/${student.sno}?highlight=${entry.id}`);
  };

  return (
    <div className="w-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Re-bill Fee Demand <span className="text-sm font-normal text-slate-400">(correction only)</span></h1>
          <p className="text-sm text-slate-500 mt-1">
            {student.name} ({subDef ? `${subDef.course.label} — ${subDef.sub.label}` : student.program} · {student.batch} · SNO: {student.sno})
          </p>
        </div>
      </div>

      <div className="text-sm text-amber-700 bg-amber-50/80 border border-amber-100 rounded-xl p-3">
        Normal semester billing uses <button className="underline font-medium" onClick={() => navigate(`/ledger/${student.sno}/promote`)}>Promote to Next Semester</button> (advances term + bills recurring fee). Use this page only to correct a missed or wrong demand.
      </div>

      {/* Term & Session — term auto-derived, correction toggle unlocks */}
      <Card>
        <CardHeader>
          <CardTitle>{termNoun} & Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{termNoun} (auto — current term)</Label>
              {termUnlocked ? (
                <Select value={semester} onValueChange={(v) => setSemester(v as Semester)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {subDef?.sub.terms.map(s => (
                      <SelectItem key={s} value={s}>
                        {subDef ? getTermLabel(subDef.course.system, s) : s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    {subDef ? getTermLabel(subDef.course.system, semester) : semester}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-slate-500">
                <input type="checkbox" checked={termUnlocked} onChange={(e) => setTermUnlocked(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
                Change term (correction only — normal term changes use Promote)
              </label>
            </div>
            <div>
              <Label>Session</Label>
              <Select value={session} onValueChange={setSession}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SESSION_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {template && (
            <div className="text-sm text-blue-600 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
              Template loaded: {template.name} v{template.version} · {subDef ? getTermLabel(subDef.course.system, semester) : semester} · {student.batch}
              <div className="mt-1 text-xs">
                {`Charged ${formatPKR(total)} from ${template.components.length} component(s). Terms that do not fall due this term are left out by the template itself, not by this screen.`}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fee Breakdown — shared receipt-style table; N/A lines show as — */}
      <Card>
        <CardHeader>
          <CardTitle>Fee Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {template && heads ? (
            <div className="space-y-2 text-sm">
              {HEAD_KEYS.map((key) => (
                <BreakdownLine key={key} label={HEAD_LABELS[key]} amount={heads[key]} na={heads[key] === 0} />
              ))}
              {heads.otherFees > 0 && <BreakdownLine label={OTHER_FEES_LABEL} amount={heads.otherFees} />}
              <div className="flex justify-between font-bold pt-3 border-t border-slate-100">
                <span>TOTAL DEMAND</span>
                <span className="tabular-nums">{formatPKR(total)}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Computed from the template's components — not stored in DB</div>
            </div>
          ) : lockedFee > 0 ? (
            <div className="text-sm">
              <div className="flex items-baseline gap-2">
                <span>Locked admission rate</span>
                <span className="flex-1 border-b border-dotted border-slate-300" />
                <span className="tabular-nums font-semibold">{formatPKR(lockedFee)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">No template for this term — using the student's locked fee.</p>
            </div>
          ) : (
            <div className="text-center text-slate-400 py-6 text-sm">
              No fee template found for {subDef ? subDef.sub.label : student.program} · {semester}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-amber-100 bg-amber-50/80">
          <CardContent className="py-5 space-y-2">
            <div className="font-medium text-amber-600 text-sm">Semester Rule Warnings:</div>
            {warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-amber-500">
                <AlertTriangle size={14} />
                <span>{w}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Narration */}
      <Card>
        <CardContent className="py-4 space-y-4">
          <div>
            <Label>Narration</Label>
            <Input
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Auto-filled — editable"
            />
          </div>

          <div>
            <Label className="mb-2 block">Update Student Semester?</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={updateSemester}
                  onChange={() => setUpdateSemester(true)}
                  className="accent-blue-500 w-4 h-4"
                />
                <span className="text-sm text-slate-700">Yes — update student's current {termNoun.toLowerCase()} to {semester}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!updateSemester}
                  onChange={() => setUpdateSemester(false)}
                  className="accent-blue-500 w-4 h-4"
                />
                <span className="text-sm text-slate-700">No — keep as-is</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{error}</div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading || total <= 0}>
          {loading ? 'Posting...' : `Post Demand ${formatPKR(total)}`}
        </Button>
      </div>
    </div>
  );
}

function BreakdownLine({ label, amount, na }: {
  label: string; amount: number; na?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 border-b border-slate-100">
      <span>{label}</span>
      <span className="flex-1 border-b border-dotted border-slate-300" />
      <span className="tabular-nums">{na ? '—' : formatPKR(amount)}</span>
    </div>
  );
}
