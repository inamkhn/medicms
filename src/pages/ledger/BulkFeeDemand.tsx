// ============================================
// MediCMS Desktop v4.0 - Bulk Fee Demand (Batch Promote)
// ============================================

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, CheckCircle2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { COURSES, BATCH_OPTIONS, SESSION_OPTIONS, getCourseDef, getSubCourseDef } from '@/lib/constants';
import { formatPKR, computeFeeTemplateTotal, getTermLabel } from '@/lib/utils';
import { MOCK_FEE_TEMPLATES } from '@/lib/mockData';
import { useStudentStore, useLedgerStore, getNextTxnNo, useAuditStore, useAuthStore } from '@/stores';
import { getStudentsWithBalance } from '@/lib/mockData';
import type { CourseCode, ProgramCode, Semester, BatchName } from '@/types';
import type { LedgerTransaction } from '@/types';

export default function BulkFeeDemand() {
  const navigate = useNavigate();
  const students = useStudentStore(s => s.students);
  const [course, setCourse] = useState<CourseCode | ''>('');
  const [program, setProgram] = useState<ProgramCode | ''>('');
  const [batch, setBatch] = useState<BatchName | ''>('');
  const [semester, setSemester] = useState<Semester>('' as Semester);
  const [session, setSession] = useState<string>(String(new Date().getFullYear()));
  const [updateSemester, setUpdateSemester] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; noTemplate: number } | null>(null);
  const [error, setError] = useState('');

  const courseDef = course ? getCourseDef(course) : null;
  const programOptions = course ? getCourseDef(course).subCourses : [];
  const semesterOptions = program ? getSubCourseDef(program as ProgramCode).sub.terms : [];

  const template = course && program && semester ? MOCK_FEE_TEMPLATES.find(t => t.course === course && t.program === program && t.semester === semester) : null;
  const total = template ? computeFeeTemplateTotal(template) : 0;

  const allWithBalance = getStudentsWithBalance(students);
  const filtered = useMemo(() => {
    if (!course || !program || !batch) return [];
    return allWithBalance.filter(s => s.course === course && s.program === program && s.batch === batch && !s.isTestRecord);
  }, [allWithBalance, course, program, batch]);

  const ledgerAll = useLedgerStore(s => s.transactions);
  const preview = useMemo(() => {
    return filtered.map(s => {
      const hasDemand = ledgerAll.some(t => t.studentSno === s.sno && t.type === 'Demand' && t.semester === semester && String(t.session) === String(session));
      const hasTemplate = !!template;
      const status = !hasTemplate ? 'no-template' : hasDemand ? 'duplicate' : 'ready';
      return { student: s, status };
    });
  }, [filtered, ledgerAll, semester, session, template]);

  const readyCount = preview.filter(p => p.status === 'ready').length;
  const duplicateCount = preview.filter(p => p.status === 'duplicate').length;
  const noTemplateCount = preview.filter(p => p.status === 'no-template').length;

  const handleCourseChange = (v: CourseCode) => {
    setCourse(v);
    const def = getCourseDef(v);
    setProgram(def.subCourses.length === 1 ? def.subCourses[0].value : '' as any);
    setSemester('' as Semester);
  };

  const handleGenerate = async () => {
    setError('');
    if (!course || !program || !batch || !semester || !session) { setError('Course, program, batch, term and session are required.'); return; }
    if (!template) { setError('No fee template found for selected term — cannot generate.'); return; }
    if (readyCount === 0) { setError('No eligible students (all duplicates or no template).'); return; }
    setLoading(true);
    let created = 0, skipped = 0;
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const addTx = useLedgerStore.getState().addTransaction;
    const updStudent = useStudentStore.getState().updateStudent;
    // snapshot for getNextTxnNo per student (need fresh per student after each add)
    for (const p of preview) {
      if (p.status !== 'ready') { skipped++; continue; }
      const s = p.student;
      const allTxNow = useLedgerStore.getState().transactions;
      const nextTxn = getNextTxnNo(allTxNow, s.sno);
      const tx: LedgerTransaction = {
        id: `tx-${s.sno}-${nextTxn}-${Date.now()}-${Math.random().toString(36).slice(2,4)}`,
        studentSno: s.sno,
        txnNo: nextTxn,
        date: new Date().toISOString().split('T')[0],
        type: 'Demand',
        semester,
        session: parseInt(session, 10) || undefined,
        fees: total,
        discount: 0,
        payment: 0,
        receiptNo: null,
        receivedBy: null,
        narration: `Bulk demand — ${getSubCourseDef(program as ProgramCode).sub.label} ${getTermLabel(courseDef!.system, semester)} Session ${session}`,
        createdAt: new Date().toISOString(),
        createdBy: userName,
        synced: false,
      };
      addTx(tx);
      if (updateSemester) updStudent(s.sno, { semester });
      created++;
    }
    const subLabel = getSubCourseDef(program as ProgramCode).sub.label;
    useAuditStore.getState().addLog({ user: userName, action: 'Fee Demand', details: `Bulk demand ${subLabel} ${getTermLabel(courseDef!.system, semester)} Session ${session} — ${created} created, ${duplicateCount} duplicate skipped (${batch})` });
    setLoading(false);
    setResult({ created, skipped: duplicateCount, noTemplate: noTemplateCount });
  };

  if (result) {
    return (
      <Card className="max-w-xl mx-auto">
        <CardContent className="py-10 text-center">
          <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
          <h2 className="text-xl font-bold mt-4">Bulk Demand Completed</h2>
          <p className="text-sm text-slate-500 mt-2">{result.created} demands created · {result.skipped} duplicate skipped {result.noTemplate ? `· ${result.noTemplate} no template` : ''}</p>
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
          <h1 className="text-3xl font-bold tracking-tight">Bulk Fee Demand</h1>
          <p className="text-sm text-slate-500 mt-1">Promote a whole batch to next term — one template × many students</p>
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
              <Select value={program} onValueChange={v => { setProgram(v as ProgramCode); setSemester('' as Semester); }} disabled={!course}>
                <SelectTrigger><SelectValue placeholder="Select sub-course" /></SelectTrigger>
                <SelectContent>{programOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Batch *</Label>
              <Select value={batch} onValueChange={v => setBatch(v as BatchName)}>
                <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>{BATCH_OPTIONS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Term *</Label>
              <Select value={semester} onValueChange={v => setSemester(v as Semester)} disabled={!program}>
                <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                <SelectContent>{semesterOptions.map(t => <SelectItem key={t} value={t}>{courseDef ? getTermLabel(courseDef.system, t) : t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Session *</Label>
              <Select value={session} onValueChange={setSession}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SESSION_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={updateSemester} onChange={e => setUpdateSemester(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            <span className="text-sm text-slate-700">Update student current {courseDef ? getTermLabel(courseDef.system, semester) || 'term' : 'term'} to target after demand</span>
          </div>
          {template ? (
            <div className="text-sm bg-blue-50 border border-blue-100 rounded-xl p-3">
              Template: <strong>{getSubCourseDef(program as ProgramCode).sub.label} · {courseDef ? getTermLabel(courseDef.system, semester) : semester}</strong> — Total {formatPKR(total)} (Adm {formatPKR(template.admissionFee)} + Tuit {formatPKR(template.tuitionFee)} + ID {formatPKR(template.idCardFee)} + Ann {formatPKR(template.annualCharges)} + Clin {formatPKR(template.clinicalCharges)} + Enroll {formatPKR(template.enrollmentFee)} + Dipl {formatPKR(template.diplomaFee)})
            </div>
          ) : program && semester ? (
            <div className="text-sm bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-2 text-amber-700"><AlertTriangle size={14} /> No template for this term — cannot generate</div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users size={16} /> Preview — {filtered.length} students in batch</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">Select course / sub-course / batch to preview</div>
          ) : (
            <>
              <div className="flex gap-2 text-xs mb-3">
                <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100">{readyCount} ready</Badge>
                {duplicateCount > 0 && <Badge className="bg-amber-50 text-amber-600 border border-amber-100">{duplicateCount} duplicate (already has demand)</Badge>}
                {noTemplateCount > 0 && <Badge className="bg-red-50 text-red-600 border border-red-100">{noTemplateCount} no template</Badge>}
              </div>
              <div className="max-h-80 overflow-auto border rounded-xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SNO</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Current Term</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.slice(0, 100).map(p => (
                      <TableRow key={p.student.sno}>
                        <TableCell>{p.student.sno}</TableCell>
                        <TableCell>{p.student.name}<div className="text-xs text-slate-500">{p.student.fatherName}</div></TableCell>
                        <TableCell>{getTermLabel(getSubCourseDef(p.student.program).sub.terms.includes(p.student.semester) ? getSubCourseDef(p.student.program).course.system : 'semester', p.student.semester)}</TableCell>
                        <TableCell>
                          {p.status === 'ready' && <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100">Ready</Badge>}
                          {p.status === 'duplicate' && <Badge className="bg-amber-50 text-amber-600 border border-amber-100">Already demanded</Badge>}
                          {p.status === 'no-template' && <Badge className="bg-red-50 text-red-600 border border-red-100">No template</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preview.length > 100 && <div className="text-xs text-slate-400 mt-2">Showing 100 of {preview.length}</div>}
            </>
          )}
        </CardContent>
      </Card>

      {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{error}</div>}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleGenerate} disabled={loading || readyCount === 0 || !template}>
          {loading ? 'Generating...' : `Generate ${readyCount} Demands`}
        </Button>
      </div>
    </div>
  );
}
