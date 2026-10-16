// ============================================
// MediCMS Desktop v4.0 - Batch Promotion (whole batch to next term)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { COURSES, getCourseDef, getSubCourseDef } from '@/lib/constants';
import { formatPKR, getTermLabel } from '@/lib/utils';
import { todayISO } from '@/lib/txn';
import { getPromotionFee, termIndexOf } from '@/lib/promotion';
import { templateCourseTotal, templateTotalOf } from '@/lib/fee/templateCompat';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { feeChargeEntry } from '@/lib/ledger';
import { useStudentStore, useLedgerStore, useAuditStore, useAuthStore, useFeeTemplateStore } from '@/stores';
import { useAcademicStore } from '@/stores/academicStore';
import { workflowBatches } from '@/lib/academic/workflowBatches';
import { studentsInBatch } from '@/lib/academic/batchMembership';
import { BulkActionPreviewTable } from '@/components/ledger/BulkActionPreviewTable';
import type { CourseCode, ProgramCode, Semester } from '@/types';

export default function BulkFeeDemand() {
  const navigate = useNavigate();
  const students = useStudentStore(s => s.students);
  const [course, setCourse] = useState<CourseCode | ''>('');
  const [program, setProgram] = useState<ProgramCode | ''>('');
  const [batchId, setBatch] = useState<string>('');
  const academic = useAcademicStore();
  const [semester, setSemester] = useState<Semester>('' as Semester);
  const [updateSemester, setUpdateSemester] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; noTemplate: number; excluded: number; failures: { sno: number; name: string; error: string }[] } | null>(null);
  const [error, setError] = useState('');
  const [deselected, setDeselected] = useState<Set<number>>(new Set());

  const courseDef = course ? getCourseDef(course) : null;
  const programOptions = course ? getCourseDef(course).subCourses : [];
  const semesterOptions = program ? getSubCourseDef(program as ProgramCode).sub.terms : [];

  // Active template for the placement being billed — session and batch included,
  // so a batch-specific template is not mistaken for the all-batches one (§7.3).
  const templates = useFeeTemplateStore((s) => s.templates);
  const batchOptions = workflowBatches(academic, { course, program }, 'promotion', students, templates, todayISO());
  const selectedBatch = batchOptions.find(o => o.batch.id === batchId)?.batch;
  const batch = selectedBatch?.name ?? '';
  const session = selectedBatch ? String(selectedBatch.session) : '';
  const findActive = useFeeTemplateStore((s) => s.findActive);
  const template = course && program && semester && selectedBatch
    ? findActive({ course, program, session: Number(session) || 0, batch }) ?? null
    : null;
  // What the term being billed costs under that template, from the engine.
  const templateTermTotal = template ? templateTotalOf(template, termIndexOf(semester)) : 0;


  const ledgerAll = useLedgerStore(s => s.entries);
  const allWithBalance = getStudentsWithBalanceLive(students, ledgerAll);
  const selectedProgram = academic.programs.find(p => p.id === selectedBatch?.programId);
  const batchStudents = selectedBatch
    ? studentsInBatch(selectedBatch, selectedProgram, allWithBalance).filter(s => !s.isTestRecord)
    : [];
  // Spec §3.5: no demands to struck-off students — excluded explicitly, never silently.
  const excludedCount = batchStudents.filter(s => s.struckOff).length;
  const filtered = batchStudents.filter(s => !s.struckOff);
  const termToBill = semester === ('' as Semester) ? null : termIndexOf(semester);

  // No manual memo here: the template total is derived from a store lookup, and a
  // useMemo over it made React Compiler give up on this component entirely
  // (react-hooks/preserve-manual-memoization). The compiler memoizes this map itself.
  const preview = filtered.map(s => {
    // One fee charge per student per term (§5): the term, not the session, is what the
    // entry records, so that is what a second billing would duplicate.
    const hasDemand = termToBill !== null && ledgerAll.some(t => t.studentSno === s.sno && t.type === 'FeeCharge' && t.term === termToBill);
    // The student's own locked figure first; only an unlocked student is priced
    // from the template's charge for this term (§16).
    const fee = getPromotionFee(s, templates) || templateTermTotal;
    const hasFee = fee > 0;
    const status = (!hasFee ? 'no-fee' : hasDemand ? 'duplicate' : 'ready') as 'ready' | 'duplicate' | 'no-fee';
    return { student: s, status, fee, checked: status === 'ready' && !deselected.has(s.sno) };
  });

  const readyCount = preview.filter(p => p.status === 'ready' && p.checked).length;
  const duplicateCount = preview.filter(p => p.status === 'duplicate').length;
  const noTemplateCount = preview.filter(p => p.status === 'no-fee').length;

  const handleCourseChange = (v: CourseCode) => {
    setCourse(v);
    const def = getCourseDef(v);
    setProgram(def.subCourses.length === 1 ? def.subCourses[0].value : '');
    setBatch('');
    setSemester('' as Semester);
    setDeselected(new Set());
  };

  const handleGenerate = async () => {
    setError('');
    if (!course || !program || !selectedBatch || !semester || !session) { setError('Course, program, batch, term and session are required.'); return; }
    const liveBatch = workflowBatches(useAcademicStore.getState(), { course, program }, 'promotion', useStudentStore.getState().students, useFeeTemplateStore.getState().templates, todayISO()).find(o => o.batch.id === batchId);
    if (!liveBatch || liveBatch.batch.name !== batch || liveBatch.batch.session !== Number(session)) { setError('The batch changed. Select a running batch again.'); return; }
    const subLabel = getSubCourseDef(program as ProgramCode).sub.label;
    const termLabel = getTermLabel(courseDef!.system, semester);
    const selected = preview.filter(p => p.status === 'ready' && p.checked);
    if (selected.length === 0) { setError('No eligible students selected (all duplicates, no fee, or deselected).'); return; }
    setLoading(true);
    setProgress({ done: 0, total: selected.length });
    let created = 0, skipped = 0;
    const failures: { sno: number; name: string; error: string }[] = [];
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const date = todayISO();
    const term = termToBill ?? 0;
    // Every charge this run posts shares one action number, so the ledger, the audit
    // trail and a later reversal can speak about one batch act (§5, §18).
    const actionNo = `bulk-${program}-${batch}-${term}-${date}`;
    const updStudent = useStudentStore.getState().updateStudent;
    let done = 0;
    for (const p of preview) {
      if (p.status !== 'ready' || !p.checked) { if (p.status === 'ready') skipped++; continue; }
      const s = p.student;
      try {
        const allNow = useLedgerStore.getState().entries;
        // Re-check duplicate at post time (ledger may have changed)
        const dupNow = allNow.some(e => e.studentSno === s.sno && e.type === 'FeeCharge' && e.term === term);
        if (dupNow) { skipped++; continue; }
        const entry = feeChargeEntry({
          studentSno: s.sno,
          entryNo: useLedgerStore.getState().nextEntryNo(s.sno),
          term,
          // Each student's own locked rate first, so the template's breakdown is
          // attached only where it is the same money (§5: lines must add up).
          amount: p.fee,
          template,
          date,
          createdBy: userName,
          description: `Batch promotion — ${subLabel} ${termLabel} Session ${session}`,
          actionNo,
        });
        const outcome = useLedgerStore.getState().postEntries([entry], date);
        if (!outcome.ok) {
          failures.push({ sno: s.sno, name: s.name, error: outcome.rejected.flatMap(r => r.problems).join(' ') });
          continue;
        }
        if (updateSemester) {
          const patch: Partial<typeof s> = { semester };
          // Backfill locked recurring fee only when the student has none —
          // never overwrite an admission-locked fee with a changed template.
          if (s.baseFeeRecurring == null && p.fee > 0) patch.baseFeeRecurring = p.fee;
          updStudent(s.sno, patch);
        }
        created++;
      } catch (e) {
        failures.push({ sno: s.sno, name: s.name, error: e instanceof Error ? e.message : 'Post failed' });
      }
      done++;
      setProgress({ done, total: selected.length });
      // Yield so the determinate progress repaints instead of hanging the UI
      await new Promise(r => setTimeout(r, 0));
    }
    useAuditStore.getState().addLog({ user: userName, action: 'Fee Demand', details: `Batch promotion ${subLabel} ${termLabel} Session ${session} — ${created} created, ${duplicateCount} duplicate skipped, ${excludedCount} struck-off excluded (${batch})` });
    setLoading(false);
    setProgress(null);
    setResult({ created, skipped, noTemplate: noTemplateCount, excluded: excludedCount, failures });
  };

  if (result) {
    return (
      <Card className="max-w-xl mx-auto">
        <CardContent className="py-10 text-center">
          <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
          <h2 className="text-xl font-bold mt-4">Batch Promotion Completed</h2>
          <p className="text-sm text-slate-500 mt-2">
            {result.created} demands posted successfully · {result.skipped} skipped (deselected or already billed)
            {result.noTemplate ? ` · ${result.noTemplate} no fee` : ''}
            {result.excluded ? ` · ${result.excluded} struck-off excluded` : ''}
          </p>
          {result.failures.length > 0 && (
            <div className="mt-4 text-left bg-red-50 border border-red-100 rounded-xl p-3">
              <div className="text-sm font-medium text-red-700">{result.failures.length} failed — view details:</div>
              <ul className="mt-1 text-xs text-red-600 space-y-1 max-h-32 overflow-auto">
                {result.failures.map(f => (
                  <li key={f.sno}>SNO:{f.sno} {f.name} — {f.error}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-center gap-3 mt-6">
            <Button variant="outline" onClick={() => setResult(null)}>Back</Button>
            <Button onClick={() => navigate('/students')}>Go to Students</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft size={20} /></Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Batch Promotion</h1>
          <p className="text-sm text-slate-500 mt-1">Promote a whole batch to the next term — one template × many students</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Target Batch & Term</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Course *</Label>
              <Select value={course} onValueChange={v => handleCourseChange(v as CourseCode)}>
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent>{COURSES.map(c => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sub-course *</Label>
              <Select value={program} onValueChange={v => { setProgram(v as ProgramCode); setBatch(''); setSemester('' as Semester); setDeselected(new Set()); }} disabled={!course}>
                <SelectTrigger><SelectValue placeholder="Select sub-course" /></SelectTrigger>
                <SelectContent>{programOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Batch * (per program)</Label>
              <Select value={batchId} onValueChange={v => { setBatch(v); setDeselected(new Set()); }} disabled={!program}>
                <SelectTrigger><SelectValue placeholder={program ? 'Select batch' : 'Select program first'} /></SelectTrigger>
                <SelectContent>
                  {batchOptions.map(({ batch: b, displayName }) => (
                    <SelectItem key={b.id} value={b.id}>{displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Term *</Label>
              <Select value={semester} onValueChange={v => { setSemester(v as Semester); setDeselected(new Set()); }} disabled={!program}>
                <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                <SelectContent>{semesterOptions.map(t => <SelectItem key={t} value={t}>{courseDef ? getTermLabel(courseDef.system, t) : t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Session *</Label>
              <p className="text-body text-ink">{session || 'Select a batch'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={updateSemester} onChange={e => setUpdateSemester(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            <span className="text-sm text-slate-700">Update student current {courseDef ? getTermLabel(courseDef.system, semester) || 'term' : 'term'} to target after demand</span>
          </div>
          {program && semester ? (
            <div className="text-sm bg-blue-50 border border-blue-100 rounded-xl p-3">
              Promotion default: locked recurring fee per student
              {template && (
                <span> · Template "{template.name}" v{template.version}: {formatPKR(templateTermTotal)} at this term (course total {formatPKR(templateCourseTotal(template))})</span>
              )}
              {!template && <span className="text-amber-700"> · No Active template for this placement — uses each student's locked fee; students without a locked fee will show as no-fee.</span>}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users size={16} /> Preview — {filtered.length} active students match this filter</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 && batchStudents.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">Select course / sub-course / batch to preview</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs mb-3">
                <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100">{readyCount} ready</Badge>
                {duplicateCount > 0 && <Badge className="bg-amber-50 text-amber-600 border border-amber-100">{duplicateCount} duplicate (already has demand)</Badge>}
                {noTemplateCount > 0 && <Badge className="bg-red-50 text-red-600 border border-red-100">{noTemplateCount} no fee</Badge>}
                {excludedCount > 0 && <span className="text-slate-500 self-center">{excludedCount} struck-off students excluded automatically</span>}
              </div>
              <BulkActionPreviewTable
                rows={preview.map(p => ({
                  key: p.student.sno,
                  title: `${p.student.sno} · ${p.student.name}`,
                  subtitle: p.student.fatherName,
                  term: getTermLabel(getSubCourseDef(p.student.program).sub.terms.includes(p.student.semester) ? getSubCourseDef(p.student.program).course.system : 'semester', p.student.semester),
                  fee: p.fee,
                  status: p.status,
                  checked: p.checked,
                }))}
                onToggle={(key) => {
                  const sno = Number(key);
                  setDeselected(prev => {
                    const next = new Set(prev);
                    if (next.has(sno)) next.delete(sno);
                    else next.add(sno);
                    return next;
                  });
                }}
                onToggleAll={(checked) => {
                  setDeselected(() => {
                    if (checked) return new Set();
                    return new Set(preview.filter(p => p.status === 'ready').map(p => p.student.sno));
                  });
                }}
              />
              {preview.length > 100 && <div className="text-xs text-slate-400 mt-2">Showing 100 of {preview.length}</div>}
            </>
          )}
        </CardContent>
      </Card>

      {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{error}</div>}

      {progress && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
          Posting {progress.done} of {progress.total}…
          <div className="mt-2 h-1.5 rounded-full bg-blue-100 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleGenerate} disabled={loading || readyCount === 0}>
          {loading && progress ? `Posting ${progress.done} of ${progress.total}…` : `Post to ${readyCount} Students`}
        </Button>
      </div>
    </div>
  );
}
