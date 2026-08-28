// ============================================
// MediCMS Desktop v4.0 - New Admission
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, AlertTriangle, CheckCircle2, Upload, X, Image as ImageIcon } from 'lucide-react';
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
import { formatPKR, computeFeeTemplateTotal, getTermLabel, normalizeCNIC, normalizeContact, isValidCNIC, isValidContact, batchToSession } from '@/lib/utils';
import { admissionSchema, type AdmissionFormData } from '@/lib/schemas';
import { MOCK_FEE_TEMPLATES } from '@/lib/mockData';
import { useStudentStore, getNextSno } from '@/stores/studentStore';
import { useAuditStore, useAuthStore } from '@/stores';
import type { ProgramCode, BatchName, CourseCode, Semester, Student } from '@/types';

type Step = 1 | 2 | 3;

export default function NewAdmission() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [success, setSuccess] = useState<Student | null>(null);

  const students = useStudentStore((s) => s.students);
  const addStudent = useStudentStore((s) => s.addStudent);

  const form = useForm<AdmissionFormData>({
    resolver: zodResolver(admissionSchema),
    defaultValues: {
      name: '',
      fatherName: '',
      contact: '',
      cnic: '',
      address: '',
      regDate: new Date().toISOString().split('T')[0],
      photoUrl: null,
      dob: '',
      gender: '',
      domicile: '',
      emergencyContact: '',
      course: '',
      program: '',
      semester: '1st',
      batch: '17th Batch',
      session: 2026,
    },
    mode: 'onChange',
  });
  const formData = form.watch() as AdmissionFormData & { course: CourseCode | ''; program: ProgramCode | ''; batch: BatchName | ''; session: number | '' };
  const isDirty = form.formState.isDirty;

  // Dirty guard — beforeunload + navigation confirm
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty || success) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, success]);

  const confirmIfDirty = () => {
    if (!isDirty || success) return true;
    return window.confirm('You have unsaved admission data. Discard and leave?');
  };

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

  // Next SNO that will be assigned by the store (centralized helper)
  const nextSno = getNextSno(students);

  // --- Validation ---
  const normalizedCnic = normalizeCNIC(formData.cnic);
  const cnicValid = normalizedCnic === null || isValidCNIC(normalizedCnic);
  const contactValid = isValidContact(formData.contact);
  const emergencyValid = isValidContact(formData.emergencyContact);
  const dobValid = !formData.dob || new Date(formData.dob) <= new Date();
  const step1Valid = formData.name.trim() !== '' && formData.fatherName.trim() !== '' && cnicValid && contactValid && emergencyValid && dobValid;
  const step2Valid = formData.course !== '' && formData.program !== '' && formData.batch !== '';

  // --- Real duplicate check against the store ---
  const nameQuery = formData.name.trim().toLowerCase();
  const cnicQuery = normalizeCNIC(formData.cnic);
  const duplicates = students.filter((s) => {
    if (s.isTestRecord) return false;
    if (nameQuery.length >= 3 && s.name.toLowerCase() === nameQuery) return true;
    if (cnicQuery !== null && isValidCNIC(cnicQuery) && s.cnic && s.cnic.replace(/\D/g, '') === cnicQuery.replace(/\D/g, '')) return true;
    return false;
  });

  const handleNext = async () => {
    if (step === 1) {
      const ok = await form.trigger(['name','fatherName','contact','cnic','address','regDate','dob','gender','domicile','emergencyContact']);
      if (ok && step1Valid) setStep(2);
    } else if (step === 2) {
      const ok = await form.trigger(['course','program','batch','semester','session']);
      if (ok && step2Valid) setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };
  const handleCancel = () => {
    if (!confirmIfDirty()) return;
    navigate(-1);
  };

  const handleCourseChange = (code: CourseCode) => {
    const def = getCourseDef(code);
    const sub = def.subCourses.length === 1 ? def.subCourses[0].value : '';
    form.setValue('course', code, { shouldValidate: true });
    form.setValue('program', sub, { shouldValidate: true });
    form.setValue('semester', '1st', { shouldValidate: true });
  };

  const handleProgramChange = (program: ProgramCode) => {
    form.setValue('program', program, { shouldValidate: true });
    form.setValue('semester', '1st', { shouldValidate: true });
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Photo must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => form.setValue('photoUrl', reader.result as string, { shouldDirty: true });
    reader.readAsDataURL(file);
  };

  const handleSubmit = form.handleSubmit((data) => {
    const created = addStudent({
      name: data.name.trim(),
      fatherName: data.fatherName.trim(),
      contact: normalizeContact(data.contact),
      address: data.address?.trim() || null,
      cnic: normalizeCNIC(data.cnic),
      regDate: data.regDate,
      photoUrl: data.photoUrl ?? null,
      dob: data.dob || null,
      gender: (data.gender as any) || null,
      domicile: data.domicile?.trim() || null,
      emergencyContact: normalizeContact(data.emergencyContact),
      course: data.course as CourseCode,
      program: data.program as ProgramCode,
      semester: data.semester as Semester,
      batch: data.batch as BatchName,
      session: typeof data.session === 'number' ? data.session : parseInt(String(data.session),10) || 2026,
    });
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    useAuditStore.getState().addLog({
      user: userName,
      action: 'New Admission',
      studentSno: created.sno,
      details: `${created.name} · ${getSubCourseDef(created.program).sub.label} · ${created.batch}`,
    });
    setSuccess(created);
  });

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
            <Button variant="outline" onClick={() => { setSuccess(null); setStep(1); form.reset(); }}>
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
        <Button variant="ghost" size="icon" type="button" onClick={handleCancel}>
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

      {/* Step 1: Personal Info — Zod + RHF */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" {...form.register('name')} placeholder="Enter full name" className={form.formState.errors.name ? 'border-red-300' : ''} />
              {form.formState.errors.name && <p className="text-xs text-red-500 mt-1">{form.formState.errors.name.message}</p>}
            </div>

            <div>
              <Label htmlFor="fatherName">Father Name *</Label>
              <Input id="fatherName" {...form.register('fatherName')} placeholder="Enter father name" className={form.formState.errors.fatherName ? 'border-red-300' : ''} />
              {form.formState.errors.fatherName && <p className="text-xs text-red-500 mt-1">{form.formState.errors.fatherName.message}</p>}
            </div>

            <div>
              <Label htmlFor="contact">Contact Number</Label>
              <Input id="contact" {...form.register('contact')} placeholder="03XX-XXXXXXX or +92..." className={form.formState.errors.contact ? 'border-red-300' : ''} />
              {form.formState.errors.contact && <p className="text-xs text-red-500 mt-1">{form.formState.errors.contact.message}</p>}
            </div>

            <div>
              <Label htmlFor="cnic">CNIC / B-Form</Label>
              <Input id="cnic" {...form.register('cnic')} placeholder="Optional — leave blank if not available" className={form.formState.errors.cnic ? 'border-red-300' : ''} />
              {form.formState.errors.cnic && <p className="text-xs text-red-500 mt-1">{form.formState.errors.cnic.message}</p>}
              {!form.formState.errors.cnic && formData.cnic && normalizeCNIC(formData.cnic) && (
                <p className="text-xs text-slate-400 mt-1">Formatted: {normalizeCNIC(formData.cnic)!.replace(/\D/g, '').replace(/(\d{5})(\d{7})(\d{1})/, '$1-$2-$3')}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">Do NOT type "nil" or "n/a" — leave blank instead</p>
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <textarea
                id="address"
                {...form.register('address')}
                placeholder="House, Street, Village, Tehsil — e.g. Village Kokarai, Tehsil Kabal, Swat"
                rows={3}
                className="flex min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 focus-visible:border-blue-200"
              />
              {form.formState.errors.address && <p className="text-xs text-red-500 mt-1">{form.formState.errors.address.message}</p>}
              <p className="text-xs text-slate-400 mt-1">Full postal address — shown on ID card & reports</p>
            </div>

            <div>
              <Label htmlFor="regDate">Registration Date</Label>
              <Input id="regDate" type="date" {...form.register('regDate')} />
              {form.formState.errors.regDate && <p className="text-xs text-red-500 mt-1">{form.formState.errors.regDate.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dob">Date of Birth</Label>
                <Input id="dob" type="date" {...form.register('dob')} max={new Date().toISOString().split('T')[0]} className={form.formState.errors.dob ? 'border-red-300' : ''} />
                {form.formState.errors.dob && <p className="text-xs text-red-500 mt-1">{form.formState.errors.dob.message}</p>}
              </div>
              <div>
                <Label>Gender</Label>
                <Controller control={form.control} name="gender" render={({ field }) => (
                  <Select value={field.value || ''} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
                {form.formState.errors.gender && <p className="text-xs text-red-500 mt-1">{form.formState.errors.gender.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="domicile">Domicile (District)</Label>
                <Input id="domicile" {...form.register('domicile')} placeholder="e.g. Swat, Dir, Buner" />
              </div>
              <div>
                <Label htmlFor="emergencyContact">Emergency Contact</Label>
                <Input id="emergencyContact" {...form.register('emergencyContact')} placeholder="+92..." className={form.formState.errors.emergencyContact ? 'border-red-300' : ''} />
                {form.formState.errors.emergencyContact && <p className="text-xs text-red-500 mt-1">{form.formState.errors.emergencyContact.message}</p>}
              </div>
            </div>

            <div>
              <Label>Student Photo (for ID Card)</Label>
              <div className="flex items-start gap-4 mt-2">
                <div className="w-24 h-28 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                  {formData.photoUrl ? (
                    <img src={formData.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={24} className="text-slate-300" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <Upload size={14} />
                    Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  </label>
                  {formData.photoUrl && (
                    <button type="button" onClick={() => form.setValue('photoUrl', null)} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 ml-3">
                      <X size={12} /> Remove
                    </button>
                  )}
                  <p className="text-xs text-slate-400">JPG/PNG, max 2MB. Used on ID card & profile. Optional.</p>
                  {form.formState.errors.photoUrl && <p className="text-xs text-red-500 mt-1">{form.formState.errors.photoUrl.message}</p>}
                </div>
              </div>
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
                onValueChange={(v) => form.setValue('semester', v as Semester, { shouldValidate: true })}
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
                onValueChange={(v) => {
                  form.setValue('batch', v as BatchName, { shouldValidate: true });
                  const autoSession = batchToSession(v);
                  form.setValue('session', autoSession, { shouldValidate: true });
                }}
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
              <p className="text-xs text-slate-400 mt-1">Auto-sets session to {formData.batch ? batchToSession(formData.batch) : '—'} (editable)</p>
            </div>

            <div>
              <Label>Session (Year)</Label>
              <Select
                value={formData.session?.toString()}
                onValueChange={(v) => form.setValue('session', parseInt(v), { shouldValidate: true } as any)}
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
              <p className="text-xs text-slate-400 mt-1">Auto-synced from batch — you can override</p>
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
              <div className="flex gap-4 mb-4">
                {formData.photoUrl && <img src={formData.photoUrl} alt="Student" className="w-20 h-24 rounded-xl object-cover border border-slate-200" />}
                <div className="flex-1 grid grid-cols-2 gap-4 text-sm">
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
                  <span className="text-slate-500">DOB</span>
                  <div className="text-slate-700">{formData.dob || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Gender</span>
                  <div className="text-slate-700">{formData.gender || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Domicile</span>
                  <div className="text-slate-700">{formData.domicile || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Emergency</span>
                  <div className="text-slate-700">{formData.emergencyContact || 'Not entered'}</div>
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
        <Button variant="outline" type="button" onClick={step === 1 ? handleCancel : handleBack}>
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        
        <div className="flex items-center gap-3">
          {step === 1 && !step1Valid && (
            <span className="text-xs text-slate-400">
              {!formData.name.trim() || !formData.fatherName.trim()
                ? 'Name and father name are required'
                : !cnicValid ? 'CNIC must be 13 digits'
                : !contactValid ? 'Contact number invalid'
                : !emergencyValid ? 'Emergency contact invalid'
                : !dobValid ? 'DOB invalid'
                : 'Fix errors above'}
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
