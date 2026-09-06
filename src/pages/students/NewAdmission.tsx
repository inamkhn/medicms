// ============================================
// MediCMS Desktop v4.0 - New Admission
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2, Upload, X, Image as ImageIcon, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReceiptDoc, type ReceiptSize } from '@/components/receipts/ReceiptDoc';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { COURSES, SESSION_OPTIONS, BANK_INFO, getCourseDef, getSubCourseDef } from '@/lib/constants';
import { formatPKR, getTermLabel, normalizeCNIC, normalizeContact, isValidCNIC, isValidContact } from '@/lib/utils';
import { splitFee } from '@/lib/promotion';
import { admissionSchema, type AdmissionFormData } from '@/lib/schemas';
import { MOCK_FEE_TEMPLATES } from '@/lib/mockData';
import { useStudentStore, getNextSno } from '@/stores/studentStore';
import { useAuditStore, useAuthStore, useLedgerStore, getNextTxnNo, useReceiptBookStore, useBankStore, getNextBankSno, useSettingsStore } from '@/stores';
import { useBatchStore } from '@/stores/batchStore';
import type { LedgerTransaction } from '@/types';
import type { ProgramCode, CourseCode, Semester, Student } from '@/types';

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
  const formData = form.watch() as AdmissionFormData & { course: CourseCode | ''; program: ProgramCode | ''; batch: string | ''; session: number | '' };
  const programBatches = useBatchStore((s) => s.batches).filter(
    (b) => formData.program !== '' && b.program === formData.program && b.isActive
  );
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

  // Custom editable fee — init from template, admin can lower/raise per student
  const [customFee, setCustomFee] = useState({
    admissionFee: 0, tuitionFee: 0, idCardFee: 0, annualCharges: 0,
    securityFee: 0, enrollmentFee: 0, diplomaFee: 0, clinicalCharges: 0,
  });
  const [feeTouched, setFeeTouched] = useState(false);
  const templateKey = feeTemplate ? feeTemplate.id : `none-${formData.course}-${formData.program}-${formData.semester}`;
  useEffect(() => {
    if (feeTemplate) {
      setCustomFee({
        admissionFee: feeTemplate.admissionFee, tuitionFee: feeTemplate.tuitionFee,
        idCardFee: feeTemplate.idCardFee, annualCharges: feeTemplate.annualCharges,
        securityFee: feeTemplate.securityFee, enrollmentFee: feeTemplate.enrollmentFee,
        diplomaFee: feeTemplate.diplomaFee, clinicalCharges: feeTemplate.clinicalCharges,
      });
    } else {
      setCustomFee({
        admissionFee: 0, tuitionFee: 0, idCardFee: 0, annualCharges: 0,
        securityFee: 0, enrollmentFee: 0, diplomaFee: 0, clinicalCharges: 0,
      });
    }
    setFeeTouched(false);
  }, [templateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const feeSplit = splitFee(customFee);
  const totalFee = feeSplit.full;
  const recurringFee = feeSplit.recurring;

  // Optional payment collected at admission (payment receipt only if amount > 0)
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<'Cash' | 'Bank' | 'Online' | 'Cheque'>('Cash');
  const [payRef, setPayRef] = useState('');
  const [payReceipt, setPayReceipt] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successPay, setSuccessPay] = useState<LedgerTransaction | null>(null);
  const [successDemandTotal, setSuccessDemandTotal] = useState(0);
  const defaultPaper = useSettingsStore((s) => s.paperSize);
  const [receiptSize, setReceiptSize] = useState<ReceiptSize>(defaultPaper);
  const receiptBooks = useReceiptBookStore((s) => s.books);
  const getNextReceipt = useReceiptBookStore((s) => s.getNextReceipt);
  const userNameForReceipt = useAuthStore((s) => s.user?.name) ?? 'Admin';
  const payNum = parseFloat(payAmount) || 0;

  useEffect(() => {
    if (step === 3 && payNum <= 0 && !payReceipt) {
      const next = getNextReceipt(userNameForReceipt);
      if (next) setPayReceipt(next);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

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
    form.setValue('batch', '', { shouldValidate: true });
    const batches = useBatchStore.getState().batches.filter((b) => b.program === program && b.isActive);
    if (batches.length === 1) {
      form.setValue('batch', batches[0].name, { shouldValidate: true });
      form.setValue('session', batches[0].session as any, { shouldValidate: true });
    }
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
    if (saving) return;
    setSubmitError('');
    // Edge: payment guards before creating anything
    if (payNum < 0) { setSubmitError('Payment amount cannot be negative.'); return; }
    if (payNum > totalFee) { setSubmitError(`Payment ${formatPKR(payNum)} exceeds Sem-1 demand ${formatPKR(totalFee)} — reduce amount.`); return; }
    if (payNum > 0) {
      if (!payReceipt.trim()) { setSubmitError('Receipt number is required when collecting payment.'); return; }
      const allLedger = useLedgerStore.getState().transactions;
      const dup = allLedger.some((t) => t.receiptNo && t.receiptNo.toLowerCase() === payReceipt.trim().toLowerCase());
      if (dup) { setSubmitError(`Receipt No. ${payReceipt.trim()} already exists.`); return; }
      const num = parseInt(payReceipt.replace('#', ''), 10);
      const book = receiptBooks.find((b) => b.isActive && num >= b.start && num <= b.end);
      if (!book) { setSubmitError(`Receipt ${payReceipt} not in any active book range.`); return; }
      if (payMode === 'Cheque' && !payRef.trim()) { setSubmitError('Cheque number is required.'); return; }
    }
    // Edge: future reg date
    if (data.regDate && new Date(data.regDate) > new Date()) { setSubmitError('Registration date cannot be in the future.'); return; }
    setSaving(true);
    const sessionNum = typeof data.session === 'number' ? data.session : parseInt(String(data.session),10) || 2026;
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
      batch: String(data.batch),
      session: sessionNum,
      // Locked custom fee: same recurring total reused on every promotion
      baseFeeTotal: totalFee || undefined,
      baseFeeRecurring: recurringFee || totalFee || undefined,
      baseFeeBreakup: { ...customFee },
    });
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    // Auto-create Sem-1 demand with the custom fee so ledger starts with dues
    if (totalFee > 0) {
      const allTx = useLedgerStore.getState().transactions;
      const tx: LedgerTransaction = {
        id: `tx-${created.sno}-1-${Date.now()}`,
        studentSno: created.sno,
        txnNo: getNextTxnNo(allTx, created.sno),
        date: data.regDate || new Date().toISOString().split('T')[0],
        type: 'Demand',
        semester: data.semester as Semester,
        session: sessionNum,
        fees: totalFee,
        discount: 0,
        payment: 0,
        receiptNo: null,
        receivedBy: null,
        narration: feeTouched
          ? `Admission fee (custom) — ${getSubCourseDef(created.program).sub.label} ${data.semester}`
          : `Admission fee — ${getSubCourseDef(created.program).sub.label} ${data.semester}`,
        createdAt: new Date().toISOString(),
        createdBy: userName,
        synced: false,
      };
      useLedgerStore.getState().addTransaction(tx);
      useAuditStore.getState().addLog({
        user: userName,
        action: 'Fee Demand',
        studentSno: created.sno,
        details: `Admission demand ${formatPKR(totalFee)} (recurring ${formatPKR(recurringFee)}) · ${created.batch}`,
      });
    }
    // Optional on-the-spot payment → Pay txn + receipt-book consume + bank deposit
    let payTx: LedgerTransaction | null = null;
    if (payNum > 0) {
      const allTx2 = useLedgerStore.getState().transactions;
      payTx = {
        id: `tx-${created.sno}-pay-${Date.now()}`,
        studentSno: created.sno,
        txnNo: getNextTxnNo(allTx2, created.sno),
        date: data.regDate || new Date().toISOString().split('T')[0],
        type: 'Pay',
        fees: 0,
        discount: 0,
        payment: payNum,
        receiptNo: payReceipt.trim(),
        receivedBy: userName,
        narration: payMode === 'Cash' ? 'Admission-time collection' : `${payMode}${payRef ? ` Ref ${payRef.trim()}` : ''} — admission-time collection`,
        createdAt: new Date().toISOString(),
        createdBy: userName,
        synced: false,
      };
      useLedgerStore.getState().addTransaction(payTx);
      useReceiptBookStore.getState().useReceipt(payReceipt.trim(), userName);
      if (payMode !== 'Cash') {
        const bankTxs = useBankStore.getState().transactions;
        const lastBalance = bankTxs.length ? bankTxs[bankTxs.length - 1].balance : 0;
        useBankStore.getState().addTransaction({
          sno: getNextBankSno(bankTxs),
          date: data.regDate || new Date().toISOString().split('T')[0],
          deposit: payNum,
          withdrawal: 0,
          balance: lastBalance + payNum,
          narration: `Admission fee from ${created.name} (SNO:${created.sno}) · Rcpt ${payReceipt.trim()} · ${payMode}`,
          linkedExpenseId: null,
          isPersonal: false,
          synced: false,
        });
      }
      useAuditStore.getState().addLog({
        user: userName,
        action: 'Payment',
        studentSno: created.sno,
        details: `Admission-time ${formatPKR(payNum)} · ${payMode} · Rcpt ${payReceipt.trim()}`,
      });
    }
    useAuditStore.getState().addLog({
      user: userName,
      action: 'New Admission',
      studentSno: created.sno,
      details: `${created.name} · ${getSubCourseDef(created.program).sub.label} · ${created.batch} · Fee ${formatPKR(totalFee)}${payTx ? ` · Paid ${formatPKR(payNum)}` : ''}`,
    });
    setSuccessPay(payTx);
    setSuccessDemandTotal(totalFee);
    setReceiptSize(useSettingsStore.getState().paperSize);
    setSuccess(created);
    setSaving(false);
  });

  // Enter key advances / submits the current step
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) handleNext();
    else handleSubmit();
  };

  // --- Success screen (stays until admin chooses; receipt prints clean) ---
  if (success) {
    const institute = {
      name: useSettingsStore.getState().instituteName,
      address: useSettingsStore.getState().instituteAddress,
      phone: useSettingsStore.getState().institutePhone,
    };
    const subLabel = (() => { try { return getSubCourseDef(success.program).sub.label; } catch { return success.program; } })();
    return (
      <div className="space-y-4">
        <Card className="max-w-xl mx-auto print:hidden">
          <CardContent className="py-8 text-center">
            <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
            <h2 className="text-xl font-bold text-slate-900 mt-3">Admission Saved</h2>
            <p className="text-sm text-slate-500 mt-1">
              {success.name} · {subLabel} · {success.batch} · SNO <strong>{success.sno}</strong>
            </p>
            <p className="text-sm text-slate-600 mt-2">
              Demand {formatPKR(successDemandTotal)}
              {successPay ? <span> · Paid {formatPKR(successPay.payment)} · Balance {formatPKR(successDemandTotal - successPay.payment)}</span> : <span> · No payment collected (dues slip only)</span>}
            </p>
            {successPay && (
              <div className="flex justify-center gap-2 mt-4">
                <Button variant={receiptSize === '80mm' ? 'default' : 'outline'} size="sm" onClick={() => setReceiptSize('80mm')}>80mm</Button>
                <Button variant={receiptSize === 'A4' ? 'default' : 'outline'} size="sm" onClick={() => setReceiptSize('A4')}>A4</Button>
                <Button size="sm" onClick={() => window.print()}>
                  <Printer size={14} className="mr-1" /> Print Receipt
                </Button>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              <Button variant="outline" onClick={() => { setSuccess(null); setSuccessPay(null); setStep(1); form.reset(); setPayAmount(''); setPayRef(''); setPayReceipt(''); }}>
                New Admission
              </Button>
              <Button variant="outline" onClick={() => navigate(`/ledger/${success.sno}`)}>
                View Ledger
              </Button>
              {!successPay && (
                <Button variant="outline" onClick={() => navigate(`/payments/record?sno=${success.sno}`)}>
                  Collect Payment
                </Button>
              )}
              <Button onClick={() => navigate('/students')}>
                Go to Students
              </Button>
            </div>
          </CardContent>
        </Card>
        {successPay && (
          <div className="print-area">
            <ReceiptDoc
              size={receiptSize}
              institute={institute}
              studentName={success.name}
              studentSno={success.sno}
              programLabel={subLabel}
              batchLabel={success.batch}
              sessionLabel={String(success.session)}
              receiptNo={successPay.receiptNo ?? ''}
              date={successPay.date}
              payment={successPay.payment}
              mode={payMode}
              bankRef={payRef}
              demandTotal={successDemandTotal}
              prevBalance={successDemandTotal}
              newBalance={successDemandTotal - successPay.payment}
              receivedBy={successPay.receivedBy ?? 'Admin'}
            />
          </div>
        )}
      </div>
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
              <Label>Batch * (per program)</Label>
              <Select
                value={formData.batch}
                disabled={!formData.program}
                onValueChange={(v) => {
                  form.setValue('batch', v, { shouldValidate: true });
                  const b = programBatches.find((x) => x.name === v);
                  if (b) form.setValue('session', b.session as any, { shouldValidate: true });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={formData.program ? 'Select batch' : 'Select program first'} />
                </SelectTrigger>
                <SelectContent>
                  {programBatches.map((b) => (
                    <SelectItem key={b.id} value={b.name}>{b.name} · {b.session}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                {programBatches.length === 0
                  ? 'No batches for this program yet — add one in Batches page.'
                  : 'Auto-sets session from batch (editable)'}
              </p>
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

          {/* Initial Fee — editable per student */}
          <Card>
            <CardHeader>
              <CardTitle>
                Admission Fee {feeTemplate ? '(from template — editable)' : '(no template — enter manually)'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {([
                  ['admissionFee', 'Admission Fee', 'one-time'],
                  ['tuitionFee', 'Tuition Fee', 'recurring'],
                  ['idCardFee', 'ID Card Fee', 'one-time'],
                  ['enrollmentFee', 'Enrollment Fee', 'one-time'],
                  ['annualCharges', 'Annual Charges', 'recurring'],
                  ['clinicalCharges', 'Clinical Charges', 'recurring'],
                  ['diplomaFee', 'Diploma Fee', 'recurring'],
                  ['securityFee', 'Security Fee', 'one-time'],
                ] as const).map(([key, label, kind]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span>{label} <span className="text-xs text-slate-400">({kind})</span></span>
                    <Input
                      type="number"
                      className="w-[140px] text-right"
                      value={customFee[key]}
                      min={0}
                      onChange={(e) => {
                        setCustomFee({ ...customFee, [key]: parseInt(e.target.value) || 0 });
                        setFeeTouched(true);
                      }}
                    />
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-3 border-t border-slate-100">
                  <span>SEM-1 DEMAND (full)</span>
                  <span>{formatPKR(totalFee)}</span>
                </div>
                <div className="flex justify-between text-sm text-blue-600 pt-1">
                  <span>Locked promotion fee (recurring each semester)</span>
                  <span>{formatPKR(recurringFee)}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Lower any head for concession students — promotions will reuse {formatPKR(recurringFee)} by default.
                  A Sem-1 demand of {formatPKR(totalFee)} is auto-created on save.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Optional payment at admission — receipt only if amount > 0 */}
          <Card>
            <CardHeader>
              <CardTitle>Collect Payment Now? (optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount collected (PKR)</Label>
                  <Input
                    type="number"
                    value={payAmount}
                    min={0}
                    max={totalFee || undefined}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0 = no receipt"
                  />
                </div>
                <div>
                  <Label>Receipt No. {payNum > 0 ? '*' : ''}</Label>
                  <Input
                    value={payReceipt}
                    onChange={(e) => setPayReceipt(e.target.value)}
                    placeholder="Auto from receipt book"
                  />
                </div>
              </div>
              {payNum > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Mode</Label>
                    <Select value={payMode} onValueChange={(v) => setPayMode(v as typeof payMode)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Bank">Bank Transfer — {BANK_INFO.name}</SelectItem>
                        <SelectItem value="Online">Online / Easypaisa / JazzCash</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Bank/Cheque ref {payMode === 'Cheque' ? '*' : ''}</Label>
                    <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={payMode === 'Cheque' ? 'Cheque No. required' : 'TRX / UTR (optional)'} />
                  </div>
                </div>
              )}
              {payNum > 0 && (
                <div className="text-sm bg-slate-50 rounded-xl p-3">
                  Demand {formatPKR(totalFee)} − Paid {formatPKR(payNum)} = <strong>Balance {formatPKR(totalFee - payNum)}</strong>
                </div>
              )}
              {payNum === 0 && (
                <p className="text-xs text-slate-400">Leave 0 to skip receipt — a dues slip (no payment) is still recorded via the Sem-1 demand.</p>
              )}
            </CardContent>
          </Card>
          {submitError && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{submitError}</div>
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
            <Button type="submit" disabled={saving || totalFee <= 0}>
              {saving ? 'Saving...' : 'Save Admission'}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
