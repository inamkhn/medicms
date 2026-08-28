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
import { getSubCourseDef } from '@/lib/constants';
import { formatPKR, computeFeeTemplateTotal, getFeeWarnings, getTermLabel } from '@/lib/utils';
import { getStudentsWithBalance, MOCK_FEE_TEMPLATES } from '@/lib/mockData';
import { useStudentStore } from '@/stores';
import type { Semester } from '@/types';

export default function AddFeeDemand() {
  const { sno } = useParams<{ sno: string }>();
  const navigate = useNavigate();

  const students = useStudentStore((s) => s.students);
  const student = getStudentsWithBalance(students).find(s => s.sno.toString() === sno);

  // Course system of the student's sub-course
  const subDef = student ? getSubCourseDef(student.program) : null;
  const termNoun = subDef
    ? (subDef.course.system === 'annual' ? 'Year' : subDef.course.system === 'months' ? 'Term' : 'Semester')
    : 'Semester';

  const [semester, setSemester] = useState<Semester>(() => {
    if (subDef && student && subDef.sub.terms.includes(student.semester)) return student.semester;
    return subDef?.sub.terms[0] ?? '1st';
  });
  const [session, setSession] = useState('2018');
  const [narration, setNarration] = useState('This is Next Promote Semester Fees');
  const [updateSemester, setUpdateSemester] = useState(true);
  const [loading, setLoading] = useState(false);

  if (!student) {
    return <div className="p-8 text-center text-slate-400">Student not found (SNO: {sno})</div>;
  }

  // Find matching template
  const template = MOCK_FEE_TEMPLATES.find(
    t => t.program === student.program && t.course === student.course && t.semester === semester
  );

  const total = template ? computeFeeTemplateTotal(template) : 0;

  // Collect warnings
  const warnings: string[] = [];
  if (template) {
    const w1 = getFeeWarnings(semester, 'annualCharges', template.annualCharges, student.course);
    const w2 = getFeeWarnings(semester, 'clinicalCharges', template.clinicalCharges, student.course);
    const w3 = getFeeWarnings(semester, 'diplomaFee', template.diplomaFee, student.course);
    if (w1) warnings.push(w1);
    if (w2) warnings.push(w2);
    if (w3) warnings.push(w3);
  }

  const handleSubmit = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    navigate(`/ledger/${student.sno}`);
  };

  return (
    <div className="w-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Add Fee Demand</h1>
          <p className="text-sm text-slate-500 mt-1">
            {student.name} ({subDef ? `${subDef.course.label} — ${subDef.sub.label}` : student.program} · {student.batch} · SNO: {student.sno})
          </p>
        </div>
      </div>

      {/* Term & Session */}
      <Card>
        <CardHeader>
          <CardTitle>{termNoun} & Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{termNoun}</Label>
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
            </div>
            <div>
              <Label>Session</Label>
              <Input
                value={session}
                onChange={(e) => setSession(e.target.value)}
                placeholder="e.g. 2018"
              />
            </div>
          </div>

          {template && (
            <div className="text-sm text-blue-600 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
              Template loaded: {subDef ? subDef.sub.label : student.program} · {subDef ? getTermLabel(subDef.course.system, semester) : semester} · {student.batch}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fee Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Fee Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {template ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Admission Fee</span>
                <span>{formatPKR(template.admissionFee)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Tuition Fee</span>
                <span>{formatPKR(template.tuitionFee)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>ID Card Fee</span>
                <span>{formatPKR(template.idCardFee)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Annual Charges</span>
                <div className="flex items-center gap-2">
                  <span>{formatPKR(template.annualCharges)}</span>
                  {template.annualCharges > 0 && subDef?.course.system === 'semester' && (
                    <span className="text-xs text-blue-500">✓ Sem 3+</span>
                  )}
                </div>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Security Fee</span>
                <span className="text-slate-400">{formatPKR(template.securityFee)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Enrollment Fee</span>
                <span>{formatPKR(template.enrollmentFee)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Diploma Fee</span>
                <span className="text-slate-400">{formatPKR(template.diplomaFee)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Clinical Charges</span>
                <div className="flex items-center gap-2">
                  <span>{formatPKR(template.clinicalCharges)}</span>
                  {template.clinicalCharges > 0 && subDef?.course.system === 'semester' && (
                    <span className="text-xs text-blue-500">✓ Sem 3</span>
                  )}
                </div>
              </div>
              <div className="flex justify-between font-bold pt-3 border-t border-slate-100">
                <span>TOTAL DEMAND</span>
                <span>{formatPKR(total)}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Computed — not stored in DB</div>
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

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Adding...' : 'Add Demand to Ledger'}
        </Button>
      </div>
    </div>
  );
}
