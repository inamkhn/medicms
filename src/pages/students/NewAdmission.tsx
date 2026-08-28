// ============================================
// MediCMS Desktop v4.0 - New Admission
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { COURSES, BATCH_OPTIONS, SESSION_OPTIONS, getCourseDef, getSubCourseDef } from '@/lib/constants';
import { formatPKR, computeFeeTemplateTotal, getTermLabel, isValidCNIC } from '@/lib/utils';
import { MOCK_FEE_TEMPLATES } from '@/lib/mockData';
import { useStudentStore } from '@/stores';
import type { ProgramCode, BatchName, CourseCode, Semester, Student } from '@/types';

type Step = 1 | 2 | 3;

interface FormData {
  name: string;
  fatherName: string;
  contact: string;
  cnic: string;
  address: string;
  regDate: string;
  course: CourseCode | '';
  program: ProgramCode | '';
  semester: Semester;
  batch: BatchName | '';
  session: number | '';
}

export default function NewAdmission() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [success, setSuccess] = useState<Student | null>(null);

  const students = useStudentStore((s) => s.students);
  const addStudent = useStudentStore((s) => s.addStudent);
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    fatherName: '',
    contact: '',
    cnic: '',
    address: '',
    regDate: new Date().toISOString().split('T')[0],
    course: '',
    program: '',
    semester: '1st',
    batch: '17th Batch',
    session: 2026,
  });

  // Derived course / sub-course definitions
  const courseDef = formData.course ? getCourseDef(formData.course) : null;
  const subCourseDef = formData.program ? getSubCourseDef(formData.program).sub : null;

  // Find matching fee template (course + sub-course + term)
  const feeTemplate = MOCK_FEE_TEMPLATES.find(t => 
    t.program === formData.program && 
    t.course === formData.course &&
    t.semester === formData.semester
  );

  const totalFee = feeTemplate ? computeFeeTemplateTotal(feeTemplate) : 0;

  // Next SNO that will be assigned by the store
  const nextSno = Math.max(0, ...students.map((s) => s.sno)) + 1;

  // --- Validation ---
  const cnicValid = formData.cnic.trim() === '' || isValidCNIC(formData.cnic);
  const step1Valid = formData.name.trim() !== '' && formData.fatherName.trim() !== '' && cnicValid;
  const step2Valid = formData.course !== '' && formData.program !== '' && formData.batch !== '';

  // --- Real duplicate check against the store ---
  const nameQuery = formData.name.trim().toLowerCase();
  const cnicQuery = formData.cnic.trim();
  const duplicates = students.filter((s) => {
    if (s.isTestRecord) return false;
    if (nameQuery.length >= 3 && s.name.toLowerCase() === nameQuery) return true;
    if (cnicQuery !== '' && isValidCNIC(cnicQuery) && s.cnic && s.cnic.replace(/\D/g, '') === cnicQuery.replace(/\D/g, '')) return true;
    return false;
  });

  const handleNext = () => {
    if (step === 1 && step1Valid) setStep(2);
    if (step === 2 && step2Valid) setStep(3);
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleCourseChange = (code: CourseCode) => {
    const def = getCourseDef(code);
    // Auto-set sub-course when the course has a single one
    const sub = def.subCourses.length === 1 ? def.subCourses[0].value : '';
    setFormData({ ...formData, course: code, program: sub, semester: '1st' });
  };

  const handleProgramChange = (program: ProgramCode) => {
    setFormData({ ...formData, program, semester: '1st' });
  };

  const handleSubmit = () => {
    if (formData.course === '' || formData.program === '' || formData.batch === '') return;
    const created = addStudent({
      name: formData.name.trim(),
      fatherName: formData.fatherName.trim(),
      contact: formData.contact.trim() || null,
      address: formData.address.trim() || null,
      cnic: formData.cnic.trim() || null,
      regDate: formData.regDate,
      course: formData.course,
      program: formData.program,
      semester: formData.semester,
      batch: formData.batch,
      session: typeof formData.session === 'number' ? formData.session : 2026,
    });
    setSuccess(created);
  };

  // Auto-redirect from the success screen
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => navigate('/students'), 2200);
    return () => clearTimeout(t);
  }, [success, navigate]);

  // Enter key advances / submits the current step
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) handleNext();
    else handleSubmit();
  };

  // --- Success screen ---
  if (success) {
    return (
      <Card className="max-w-xl mx-auto">
        <CardContent className="py-10 text-center">
          <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
          <h2 className="text-xl font-bold text-slate-900 mt-4">Admission Saved</h2>
          <p className="text-sm text-slate-500 mt-2">
            {success.name} · {getSubCourseDef(success.program).sub.label} · {success.batch}
          </p>
          <div className="mt-4">
            <span className="text-xs text-slate-400 uppercase tracking-wide">Assigned SNO</span>
            <div className="inline-block mt-1 px-6 py-2 bg-blue-50 border border-blue-100 rounded-xl text-2xl font-bold text-blue-600">
              {success.sno}
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">Redirecting to Students…</p>
          <div className="flex justify-center gap-3 mt-6">
            <Button variant="outline" onClick={() => { setSuccess(null); setStep(1); setFormData({ ...formData, name: '', fatherName: '', contact: '', cnic: '', address: '', course: '', program: '', semester: '1st' }); }}>
              New Admission
            </Button>
            <Button onClick={() => navigate('/students')}>
              Go to Students
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleFormSubmit} className="w-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" type="button" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">New Admission</h1>
          <p className="text-sm text-slate-500 mt-1">Step {step} of 3</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
              s <= step ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-slate-100'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Personal Info */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter full name"
              />
            </div>

            <div>
              <Label htmlFor="fatherName">Father Name *</Label>
              <Input
                id="fatherName"
                value={formData.fatherName}
                onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                placeholder="Enter father name"
              />
            </div>

            <div>
              <Label htmlFor="contact">Contact Number</Label>
              <Input
                id="contact"
                value={formData.contact}
                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                placeholder="+92..."
              />
            </div>

            <div>
              <Label htmlFor="cnic">CNIC / B-Form</Label>
              <Input
                id="cnic"
                value={formData.cnic}
                onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
                placeholder="Optional — leave blank if not available"
              />
              {!cnicValid && (
                <p className="text-xs text-red-500 mt-1">
                  CNIC must be 13 digits (e.g. 15602-1234567-1)
                </p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                Do NOT type "nil" or "n/a" — leave blank instead
              </p>
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Enter address"
              />
            </div>

            <div>
              <Label htmlFor="regDate">Registration Date</Label>
              <Input
                id="regDate"
                type="date"
                value={formData.regDate}
                onChange={(e) => setFormData({ ...formData, regDate: e.target.value })}
              />
            </div>

            {/* Duplicate Check */}
            {duplicates.length > 0 && (
              <div className="bg-amber-50/80 border border-amber-100 rounded-xl p-3.5 text-sm text-amber-600">
                Possible duplicate found:{' '}
                {duplicates.map((d) => `${d.name} (SNO: ${d.sno})`).join(', ')}{' '}
                — confirm this is a different person
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Course & Program */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Course & Program</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Course *</Label>
              <Select
                value={formData.course}
                onValueChange={(v) => handleCourseChange(v as CourseCode)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {COURSES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {courseDef && (
                <p className="text-xs text-slate-400 mt-1">{courseDef.durationLabel}</p>
              )}
            </div>

            <div>
              <Label>Sub-course *</Label>
              <Select
                value={formData.program}
                onValueChange={(v) => handleProgramChange(v as ProgramCode)}
                disabled={!formData.course}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sub-course" />
                </SelectTrigger>
                <SelectContent>
                  {courseDef?.subCourses.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Semester / Year / Term</Label>
              <Select
                value={formData.semester}
                onValueChange={(v) => setFormData({ ...formData, semester: v as Semester })}
                disabled={!subCourseDef}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {subCourseDef?.terms.map(t => (
                    <SelectItem key={t} value={t}>
                      {courseDef ? getTermLabel(courseDef.system, t) : t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Batch *</Label>
              <Select
                value={formData.batch}
                onValueChange={(v) => setFormData({ ...formData, batch: v as BatchName })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {BATCH_OPTIONS.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Session (Year)</Label>
              <Select
                value={formData.session?.toString()}
                onValueChange={(v) => setFormData({ ...formData, session: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_OPTIONS.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review & Submit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Assigned SNO</span>
                  <div className="font-medium text-blue-600">{nextSno} (auto-assigned)</div>
                </div>
                <div>
                  <span className="text-slate-500">Name</span>
                  <div className="font-medium text-slate-900">{formData.name || '-'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Father</span>
                  <div className="font-medium text-slate-900">{formData.fatherName || '-'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Contact</span>
                  <div className="text-slate-700">{formData.contact || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">CNIC</span>
                  <div className="text-slate-700">{formData.cnic || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Course</span>
                  <div className="font-medium text-slate-900">{courseDef?.label || '-'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Sub-course</span>
                  <div className="font-medium text-slate-900">{subCourseDef?.label || formData.program || '-'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Term</span>
                  <div className="text-slate-700">
                    {courseDef ? getTermLabel(courseDef.system, formData.semester) : formData.semester}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Batch</span>
                  <div className="text-slate-700">{formData.batch}</div>
                </div>
                <div>
                  <span className="text-slate-500">Session</span>
                  <div className="text-slate-700">{formData.session || '-'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Initial Fee Demand */}
          {feeTemplate && (
            <Card>
              <CardHeader>
                <CardTitle>Initial Fee Demand (auto-loaded from template)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Admission Fee</span>
                    <span>{formatPKR(feeTemplate.admissionFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tuition Fee</span>
                    <span>{formatPKR(feeTemplate.tuitionFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ID Card Fee</span>
                    <span>{formatPKR(feeTemplate.idCardFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Enrollment Fee</span>
                    <span>{formatPKR(feeTemplate.enrollmentFee)}</span>
                  </div>
                  {courseDef?.system === 'semester' && (
                    <>
                      <div className="flex justify-between text-slate-400">
                        <span>Annual Charges</span>
                        <span>ⓘ Applies Sem 3+</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Clinical Charges</span>
                        <span>ⓘ Applies Sem 3</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-bold pt-3 border-t border-slate-100">
                    <span>TOTAL DEMAND</span>
                    <span>{formatPKR(totalFee)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Missing template warning */}
          {!feeTemplate && (
            <div className="flex items-center gap-2.5 bg-amber-50/80 border border-amber-100 rounded-xl p-4 text-sm text-amber-600">
              <AlertTriangle size={16} />
              <span>
                No fee template found for {subCourseDef?.label ?? formData.program} ·{' '}
                {courseDef ? getTermLabel(courseDef.system, formData.semester) : formData.semester} —{' '}
                you can add the demand manually from the student's ledger after saving.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" type="button" onClick={step === 1 ? () => navigate(-1) : handleBack}>
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        
        <div className="flex items-center gap-3">
          {step === 1 && !step1Valid && (
            <span className="text-xs text-slate-400">
              {!formData.name.trim() || !formData.fatherName.trim()
                ? 'Name and father name are required'
                : 'CNIC must be 13 digits'}
            </span>
          )}
          {step === 2 && !step2Valid && (
            <span className="text-xs text-slate-400">Course, sub-course and batch are required</span>
          )}
          {step < 3 ? (
            <Button type="submit" disabled={step === 1 ? !step1Valid : !step2Valid}>
              Next: {step === 1 ? 'Course & Program' : 'Review'}
            </Button>
          ) : (
            <Button type="submit">
              Save Admission
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
