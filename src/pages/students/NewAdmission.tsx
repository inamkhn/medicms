// ============================================
// MediCMS Desktop v4.0 - New Admission
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2, Upload, X, Image as ImageIcon, Printer, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReceiptDoc, type ReceiptSize } from '@/components/receipts/ReceiptDoc';
import { StudentIdCard } from '@/components/students/StudentIdCard';
import { FeeBreakdownTable } from '@/components/students/FeeBreakdownTable';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { COURSES, BANK_INFO, getCourseDef, getSubCourseDef } from '@/lib/constants';
import { formatPKR, getTermLabel, normalizeCNIC, normalizeContact, isValidCNIC, isValidContact } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { termIndexOf } from '@/lib/promotion';
import { admissionSchema, type AdmissionFormData } from '@/lib/schemas';
import { legacyPlanFor, templateTotalOf } from '@/lib/fee/templateCompat';
import { findActiveFor } from '@/lib/fee/templateRules';
import { entryId, entryProblems, feeChargeEntry } from '@/lib/ledger';
import { useStudentStore, getNextSno } from '@/stores/studentStore';
import { useAuditStore, useAuthStore, useLedgerStore, useReceiptBookStore, useMoneyStore, useSettingsStore, useFeeTemplateStore } from '@/stores';
import {
  moneyEntryProblems,
  nextActionNo,
  nextMoneyEntryNo,
  paymentMoneyEntry,
  resolvePaymentAccount,
  type MoneyEntry,
} from '@/lib/finance';
import { toastError } from '@/lib/toast';
import { useAcademicStore } from '@/stores/academicStore';
import { workflowBatches } from '@/lib/academic/workflowBatches';
import type { LedgerEntry, PaymentMode } from '@/types';
import type { ProgramCode, CourseCode, Semester, Student } from '@/types';

type Step = 1 | 2 | 3 | 4;

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
      regDate: dayKey(),
      photoUrl: null,
      dob: '',
      gender: '',
      domicile: '',
      emergencyContact: '',
      course: '',
      program: '',
      semester: '1st',
      batch: '',
      session: '',
    },
    mode: 'onBlur',
  });
  const formData = form.watch() as AdmissionFormData & { course: CourseCode | ''; program: ProgramCode | ''; batch: string | ''; session: number | '' };
  const academic = useAcademicStore();
  const [batchId, setBatchId] = useState('');
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

  // The Active template for this placement — course, program, session AND batch
  // (§19). Which term the student joins only decides which term's charge opens their
  // ledger: joining at Term 3 bills Term 3, it does not replay Term 1 (§5.4).
  const templates = useFeeTemplateStore((s) => s.templates);
  const batchOptions = workflowBatches(academic, formData, 'admission', students, templates, dayKey());
  const selectedBatch = batchOptions.find(o => o.batch.id === batchId);
  const startTerm = termIndexOf(formData.semester as Semester);
  const feeTemplate = findActiveFor(templates, {
    course: formData.course as CourseCode,
    program: formData.program as ProgramCode,
    session: Number(formData.session) || 0,
    batch: formData.batch,
  });
  // What the student locks to, derived from that template's components (§7.4).
  const openingPlan = feeTemplate ? legacyPlanFor(feeTemplate, startTerm) : null;

  // Fee lock (spec §4.2 Step 3): template lines are read-only; concession is the only editable input.
  const templateTotal = feeTemplate ? templateTotalOf(feeTemplate, startTerm) : 0;
  const [concession, setConcession] = useState(0);
  const templateKey = feeTemplate ? `${feeTemplate.id}:v${feeTemplate.version}:${startTerm}` : `none-${formData.course}-${formData.program}-${formData.semester}`;
  useEffect(() => {
    setConcession(0);
  }, [templateKey]);

  const totalFee = Math.max(0, templateTotal - concession);
  const recurringFee = Math.max(0, (openingPlan?.baseFeeRecurring ?? 0) - concession);

  // Optional payment collected at admission (payment receipt only if amount > 0)
  const [collectNow, setCollectNow] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<PaymentMode>('Cash');
  const [payRef, setPayRef] = useState('');
  const [payReceipt, setPayReceipt] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successPay, setSuccessPay] = useState<LedgerEntry | null>(null);
  const [successDemandTotal, setSuccessDemandTotal] = useState(0);
  const [printTarget, setPrintTarget] = useState<'receipt' | 'id'>('receipt');
  const defaultPaper = useSettingsStore((s) => s.paperSize);
  const [receiptSize, setReceiptSize] = useState<ReceiptSize>(defaultPaper);
  const receiptBooks = useReceiptBookStore((s) => s.books);
  const getNextReceipt = useReceiptBookStore((s) => s.getNextReceipt);
  const userNameForReceipt = useAuthStore((s) => s.user?.name) ?? 'Admin';
  const payNum = collectNow ? parseFloat(payAmount) || 0 : 0;

  useEffect(() => {
    if (step === 4 && payNum <= 0 && !payReceipt) {
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
  const step2Valid = !!selectedBatch && !selectedBatch.disabled;

  // --- Real duplicate check against the store ---
  const nameQuery = formData.name.trim().toLowerCase();
  const cnicQuery = normalizeCNIC(formData.cnic);
  const cnicDuplicate = cnicQuery !== null && isValidCNIC(cnicQuery)
    ? students.find((s) => !s.isTestRecord && s.cnic && s.cnic.replace(/\D/g, '') === cnicQuery.replace(/\D/g, ''))
    : undefined;
  const duplicates = students.filter((s) => {
    if (s.isTestRecord) return false;
    if (nameQuery.length >= 3 && s.name.toLowerCase() === nameQuery) return true;
    if (cnicDuplicate && s.sno === cnicDuplicate.sno) return true;
    return false;
  });
  const step1Valid = formData.name.trim() !== '' && formData.fatherName.trim() !== '' && cnicValid && contactValid && emergencyValid && dobValid && !cnicDuplicate;

  const [stepBanner, setStepBanner] = useState(false);
  const focusFirstError = (fields: (keyof AdmissionFormData)[]) => {
    for (const f of fields) {
      if (form.formState.errors[f]) { form.setFocus(f); break; }
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      const fields: (keyof AdmissionFormData)[] = ['name','fatherName','contact','cnic','address','regDate','dob','gender','domicile','emergencyContact'];
      const ok = await form.trigger(fields);
      if (ok && step1Valid) { setStepBanner(false); setStep(2); }
      else { setStepBanner(true); focusFirstError(fields); }
    } else if (step === 2) {
      const fields: (keyof AdmissionFormData)[] = ['course','program','batch','semester','session'];
      const ok = await form.trigger(fields);
      if (ok && step2Valid) { setStepBanner(false); setStep(3); }
      else { setStepBanner(true); focusFirstError(fields); }
    } else if (step === 3) {
      if (feeTemplate) { setStepBanner(false); setStep(4); }
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
    setBatchId('');
    form.setValue('batch', '');
    form.setValue('session', '');
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
    setBatchId('');
    form.setValue('session', '');
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
    const currentBatch = workflowBatches(useAcademicStore.getState(), data, 'admission', useStudentStore.getState().students, useFeeTemplateStore.getState().templates, dayKey()).find(o => o.batch.id === batchId);
    if (!currentBatch || currentBatch.disabled || currentBatch.batch.name !== data.batch || currentBatch.batch.session !== Number(data.session)) {
      setSubmitError(currentBatch?.reason ?? 'The academic placement changed. Return to Course & Program and select an available batch.');
      return;
    }
    // Edge: payment guards before creating anything
    if (payNum < 0) { setSubmitError('Payment amount cannot be negative.'); return; }
    if (payNum > totalFee) { setSubmitError(`Payment ${formatPKR(payNum)} exceeds Sem-1 demand ${formatPKR(totalFee)} — reduce amount.`); return; }
    if (payNum > 0) {
      if (!payReceipt.trim()) { setSubmitError('Receipt number is required when collecting payment.'); return; }
      const allLedger = useLedgerStore.getState().entries;
      const dup = allLedger.some((e) => e.type === 'Payment' && e.reference && e.reference.toLowerCase() === payReceipt.trim().toLowerCase());
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
      gender: data.gender || null,
      domicile: data.domicile?.trim() || null,
      emergencyContact: normalizeContact(data.emergencyContact),
      course: data.course as CourseCode,
      program: data.program as ProgramCode,
      semester: data.semester as Semester,
      batch: String(data.batch),
      session: sessionNum,
      // Locked fee: opening charge minus concession; next term's charge reused on promotion
      baseFeeTotal: totalFee || undefined,
      baseFeeRecurring: recurringFee || totalFee || undefined,
      baseFeeBreakup: openingPlan?.baseFeeBreakup,
    });
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const date = data.regDate || dayKey();
    // One numbering run for the new student, so the opening charge, its waiver and the
    // on-the-spot payment sit one after the other and share an action number (§5, §18).
    const firstEntryNo = useLedgerStore.getState().nextEntryNo(created.sno);
    const actionNo = `admission-${created.sno}-${firstEntryNo}`;
    let cursor = firstEntryNo;
    const batch: LedgerEntry[] = [];

    // The opening term becomes a FeeCharge entry carrying the template's itemised lines (§5, §6).
    let chargeEntryId: string | null = null;
    if (templateTotal > 0) {
      const charge = feeChargeEntry({
        studentSno: created.sno,
        entryNo: cursor,
        term: startTerm,
        // Gross template charge; the concession is its own entry below, not a shrunk charge (§7.10).
        amount: templateTotal,
        template: feeTemplate ?? null,
        date,
        createdBy: userName,
        description: `Admission fee — ${getSubCourseDef(created.program).sub.label} ${data.semester}`,
        actionNo,
      });
      chargeEntryId = charge.id;
      batch.push(charge);
      cursor++;
    }
    // A waiver is its own Concession entry linked to the charge, not a smaller charge (§7.10, §16).
    if (concession > 0 && chargeEntryId) {
      batch.push({
        id: entryId(created.sno, cursor),
        studentSno: created.sno,
        entryNo: cursor,
        date,
        type: 'Concession',
        amount: concession,
        description: `Concession granted at admission — ${getSubCourseDef(created.program).sub.label} ${data.semester}`,
        reason: `Fee concession granted at admission for ${created.name}`,
        linkedEntryId: chargeEntryId,
        createdBy: userName,
        createdAt: nowISO(),
        actionNo,
        balanceAfter: 0,
      });
      cursor++;
    }
    // Optional on-the-spot money → a Payment entry (§6), reference holds the receipt number.
    let payEntry: LedgerEntry | null = null;
    if (payNum > 0) {
      payEntry = {
        id: entryId(created.sno, cursor),
        studentSno: created.sno,
        entryNo: cursor,
        date,
        type: 'Payment',
        amount: payNum,
        description: payMode === 'Cash' ? 'Admission-time collection' : `${payMode}${payRef ? ` Ref ${payRef.trim()}` : ''} — admission-time collection`,
        reference: payReceipt.trim(),
        paymentMode: payMode,
        createdBy: userName,
        createdAt: nowISO(),
        actionNo,
        balanceAfter: 0,
      };
      batch.push(payEntry);
    }

    // §8: the money side of the on-the-spot collection — the route decides the
    // account. Built and asked before anything is written, so a refusal leaves
    // both books untouched.
    const today = dayKey();
    const allEntries = useLedgerStore.getState().entries;
    let moneyEntry: MoneyEntry | null = null;
    const moneyProblems: string[] = [];
    if (payNum > 0) {
      const moneyState = useMoneyStore.getState();
      const moneyAccount = resolvePaymentAccount(moneyState.accounts, payMode);
      if (!moneyAccount) {
        setSubmitError('No money account for this route — set up your money accounts first (§78.1).');
        setSaving(false);
        return;
      }
      moneyEntry = paymentMoneyEntry(
        {
          accountId: moneyAccount.id,
          amount: payNum,
          mode: payMode,
          payee: `${created.name} (SNO ${created.sno})`,
          receiptNo: payReceipt.trim(),
          moneyRef: payRef.trim() || undefined,
          date,
          createdBy: userName,
        },
        { entryNo: nextMoneyEntryNo(moneyState.entries), actionNo: nextActionNo(moneyState.entries), now: nowISO() },
      );
      moneyProblems.push(...moneyEntryProblems(moneyEntry, {
        accounts: moneyState.accounts,
        entries: moneyState.entries,
        closedMonths: moneyState.closedMonths,
      }));
    }

    // Ask the core's own rules before writing, so the screen refuses in the ledger's
    // words rather than inventing its own (§5, §7). postEntries then stamps the balance (§7.3).
    const problems = batch.flatMap((entry) => entryProblems(entry, { today, all: [...allEntries, ...batch] }));
    if (problems.length || moneyProblems.length) { setSubmitError([...problems, ...moneyProblems].join(' ')); setSaving(false); return; }
    const outcome = useLedgerStore.getState().postEntries(batch, today);
    if (!outcome.ok) {
      setSubmitError(outcome.rejected.flatMap((r) => r.problems).join(' '));
      setSaving(false);
      return;
    }
    if (templateTotal > 0) {
      useAuditStore.getState().addLog({
        user: userName,
        action: 'Fee Demand',
        studentSno: created.sno,
        details: `Admission demand ${formatPKR(totalFee)} (recurring ${formatPKR(recurringFee)}) · ${created.batch}`,
      });
    }
    // Receipt-book consume + the money entry for the collected cash (§8, §18, §32).
    if (payNum > 0 && payEntry) {
      useReceiptBookStore.getState().useReceipt(payReceipt.trim(), userName);
      // §8: the money entry replaces the hand-typed bank deposit — the
      // pre-check above asked the same rules, so a refusal here would mean the
      // books changed between two lines; say so rather than lose it.
      if (moneyEntry) {
        const moneyOutcome = useMoneyStore.getState().postEntries([moneyEntry], today);
        if (!moneyOutcome.ok) {
          toastError({
            title: 'Admission saved, but the money entry was refused',
            description: moneyOutcome.rejected.flatMap((r) => r.problems).join(' '),
          });
        }
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
      details: `${created.name} · ${getSubCourseDef(created.program).sub.label} · ${created.batch} · Fee ${formatPKR(totalFee)}${payEntry ? ` · Paid ${formatPKR(payNum)}` : ''}`,
    });
    setSuccessPay(payEntry);
    setSuccessDemandTotal(totalFee);
    setReceiptSize(useSettingsStore.getState().paperSize);
    setSuccess(created);
    setSaving(false);
  });

  // Enter key advances / submits the current step
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 4) handleNext();
    else handleConfirmAdmission();
  };

  const handleConfirmAdmission = () => {
    const ok = window.confirm(
      `This will lock semester 1 fees to ${formatPKR(totalFee)} for this student${payNum > 0 ? ` and record ${formatPKR(payNum)} payment` : ''}. Continue?`
    );
    if (ok) handleSubmit();
  };

  // --- Success screen (stays until admin chooses; receipt prints clean) ---
  if (success) {
    const institute = {
      name: useSettingsStore.getState().instituteName,
      address: useSettingsStore.getState().instituteAddress,
      phone: useSettingsStore.getState().institutePhone,
    };
    const subLabel = (() => { try { return getSubCourseDef(success.program).sub.label; } catch { return success.program; } })();
    const courseLabel = (() => { try { return getSubCourseDef(success.program).course.label; } catch { return ''; } })();
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
              {successPay ? <span> · Paid {formatPKR(successPay.amount)} · Balance {formatPKR(successDemandTotal - successPay.amount)}</span> : <span> · No payment collected (dues slip only)</span>}
            </p>
            <div className="flex justify-center gap-2 mt-4">
              {successPay && (
                <>
                  <Button variant={printTarget === 'receipt' ? 'default' : 'outline'} size="sm" onClick={() => setPrintTarget('receipt')}>Receipt</Button>
                  <Button variant={receiptSize === '80mm' ? 'default' : 'outline'} size="sm" onClick={() => setReceiptSize('80mm')}>80mm</Button>
                  <Button variant={receiptSize === 'A4' ? 'default' : 'outline'} size="sm" onClick={() => setReceiptSize('A4')}>A4</Button>
                </>
              )}
              <Button variant={printTarget === 'id' ? 'default' : 'outline'} size="sm" onClick={() => setPrintTarget('id')}>
                <IdCard size={14} className="mr-1" /> ID Card
              </Button>
              <Button size="sm" onClick={() => window.print()}>
                <Printer size={14} className="mr-1" /> Print {successPay && printTarget === 'receipt' ? 'Receipt' : 'ID Card'}
              </Button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              <Button variant="outline" onClick={() => { setSuccess(null); setSuccessPay(null); setPrintTarget('receipt'); setStep(1); form.reset(); setCollectNow(false); setPayAmount(''); setPayRef(''); setPayReceipt(''); setConcession(0); }}>
                Add Another Admission
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
        <div className="print-area">
          {successPay && printTarget === 'receipt' ? (
            <ReceiptDoc
              size={receiptSize}
              institute={institute}
              studentName={success.name}
              studentSno={success.sno}
              programLabel={subLabel}
              batchLabel={success.batch}
              sessionLabel={String(success.session)}
              receiptNo={successPay.reference ?? ''}
              date={successPay.date}
              payment={successPay.amount}
              mode={payMode}
              bankRef={payRef}
              demandTotal={successDemandTotal}
              prevBalance={successDemandTotal}
              newBalance={successDemandTotal - successPay.amount}
              receivedBy={successPay.createdBy ?? 'Admin'}
            />
          ) : (
            <StudentIdCard
              student={success}
              courseLabel={courseLabel}
              programLabel={subLabel}
              instituteName={institute.name}
              instituteLocation={institute.address}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleFormSubmit} className="w-auto space-y-8">
      <div className="text-[12px] text-slate-500">
        <button type="button" className="hover:underline" onClick={() => navigate('/students')}>Students</button>
        <span> / New Admission</span>
      </div>
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" type="button" onClick={handleCancel}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">New Admission</h1>
          <p className="text-sm text-slate-500 mt-1">
            Step {step} of 4 · {step === 1 ? 'Bio' : step === 2 ? 'Academic' : step === 3 ? 'Fees' : 'Confirm'}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
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
            {stepBanner && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                Check the highlighted fields before continuing.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            <div>
              <Label htmlFor="contact">Contact Number</Label>
              <Input id="contact" {...form.register('contact')} placeholder="03XX-XXXXXXX or +92..." className={form.formState.errors.contact ? 'border-red-300' : ''} />
              {form.formState.errors.contact && <p className="text-xs text-red-500 mt-1">{form.formState.errors.contact.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cnic">CNIC / B-Form</Label>
              <Input
                id="cnic"
                {...form.register('cnic')}
                placeholder="XXXXX-XXXXXXX-X — leave blank if not available"
                className={form.formState.errors.cnic ? 'border-red-300' : ''}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
                  const masked = digits.length > 12
                    ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`
                    : digits.length > 5
                      ? `${digits.slice(0, 5)}-${digits.slice(5)}`
                      : digits;
                  form.setValue('cnic', e.target.value.trim() === '' ? '' : masked, { shouldValidate: false });
                }}
              />
              {form.formState.errors.cnic && <p className="text-xs text-red-500 mt-1">{form.formState.errors.cnic.message}</p>}
              <p className="text-xs text-slate-400 mt-1">Do NOT type "nil" or "n/a" — leave blank instead</p>
            </div>
              <div>
                <Label htmlFor="dob">Date of Birth</Label>
                <Input id="dob" type="date" {...form.register('dob')} max={new Date().toISOString().split('T')[0]} className={form.formState.errors.dob ? 'border-red-300' : ''} />
                {form.formState.errors.dob && <p className="text-xs text-red-500 mt-1">{form.formState.errors.dob.message}</p>}
              </div>
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

            {/* Duplicate Check — CNIC match blocks progression */}
            {cnicDuplicate && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-sm text-red-600">
                This CNIC is already registered to SNO [{cnicDuplicate.sno}] —{' '}
                <button type="button" className="underline font-medium" onClick={() => window.open(`#/students/${cnicDuplicate.sno}`, '_blank')}>
                  View student
                </button>
              </div>
            )}
            {!cnicDuplicate && duplicates.length > 0 && (
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
            {stepBanner && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                Check the highlighted fields before continuing.
              </div>
            )}
            <div>
              <Label>Course * (most consequential — all visible)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2" role="radiogroup" aria-label="Course">
                {COURSES.map((c) => {
                  const active = formData.course === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleCourseChange(c.code)}
                      className={`rounded-md border px-3 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#2451B8] ${
                        active ? 'border-[#2451B8] bg-blue-50 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div>{c.label}</div>
                      <div className="text-[11px] font-normal text-slate-500">{c.durationLabel}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {formData.course && (
            <div className="program-reveal">
              <Label>Sub-course *</Label>
              {courseDef && courseDef.subCourses.length > 1 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2" role="radiogroup" aria-label="Sub-course">
                  {courseDef.subCourses.map((s) => {
                    const active = formData.program === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => handleProgramChange(s.value)}
                        className={`rounded-md border px-3 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#2451B8] ${
                          active ? 'border-[#2451B8] bg-blue-50 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
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
              )}
            </div>
            )}

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
              <Label>Batch and session *</Label>
              <Select value={batchId} disabled={!formData.program} onValueChange={(id) => {
                const option = batchOptions.find(o => o.batch.id === id);
                if (!option || option.disabled) return;
                setBatchId(id);
                form.setValue('batch', option.batch.name, { shouldValidate: true, shouldDirty: true });
                form.setValue('session', option.batch.session, { shouldValidate: true, shouldDirty: true });
              }}>
                <SelectTrigger><SelectValue placeholder="Select batch and session" /></SelectTrigger>
                <SelectContent>
                  {batchOptions.map(o => (
                    <SelectItem key={o.batch.id} value={o.batch.id} disabled={o.disabled}>
                      {o.displayName}{o.reason ? ` — ${o.reason}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-meta text-ink-muted mt-1">
                {batchOptions.length ? 'Session follows the selected batch.' : 'No available batches. Check Academic Setup and fee templates.'}
              </p>
              {selectedBatch?.disabled && <p className="text-meta text-danger">{selectedBatch.reason}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Fees · Step 4: Confirm */}
      {(step === 3 || step === 4) && (
        <div className="space-y-4">
          {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Confirm — Review & Submit</CardTitle>
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
          )}

          {step === 3 && (
          <>
          {/* Step 3: Fee Structuring & Locking — receipt-style, concession only */}
          <Card>
            <CardHeader>
              <CardTitle>Fee Structure</CardTitle>
            </CardHeader>
            <CardContent>
              {!feeTemplate || !openingPlan ? (
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
                  No Active fee template for {subCourseDef?.label ?? formData.program} · {formData.batch} · Session {formData.session || '-'} — go back and check the placement, or add the template under Fee Templates first.
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-3">From template “{feeTemplate.name}” v{feeTemplate.version}. This fee structure locks to this student's record and won't change if the institute updates fee templates later.</p>
                  <FeeBreakdownTable
                    lines={openingPlan.baseFeeBreakup}
                    total={templateTotal}
                    totalLabel={courseDef ? `${getTermLabel(courseDef.system, formData.semester as Semester)} charge` : 'Opening term charge'}
                    concession={concession}
                    onConcession={(v) => setConcession(Math.min(v, templateTotal))}
                    recurring={recurringFee}
                    net={totalFee}
                  />
                </>
              )}
            </CardContent>
          </Card>
          </>
          )}

          {step === 4 && (
          <>
          {/* Step 4: optional payment at admission — receipt only if amount > 0 */}
          <Card>
            <CardHeader>
              <CardTitle>Collect payment now?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={collectNow}
                  onChange={(e) => setCollectNow(e.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
                Collect payment now
              </label>
              {collectNow ? (
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
                  <Label>Receipt No.</Label>
                  <Input
                    value={payReceipt}
                    onChange={(e) => setPayReceipt(e.target.value)}
                    placeholder="Auto from receipt book"
                  />
                </div>
              </div>
              ) : null}
              {collectNow && payNum > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Mode</Label>
                    <Select value={payMode} onValueChange={(v) => setPayMode(v as typeof payMode)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Bank">Bank Transfer — {BANK_INFO.name}</SelectItem>
                        <SelectItem value="Online">Online</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Bank/Cheque ref</Label>
                    <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Ref (optional)" />
                  </div>
                </div>
              )}
              {collectNow && payNum > 0 && (
                <div className="text-sm bg-slate-50 rounded-xl p-3">
                  Demand {formatPKR(totalFee)} minus Paid {formatPKR(payNum)} equals Balance {formatPKR(totalFee - payNum)}
                </div>
              )}
              {collectNow && payNum === 0 && (
                <p className="text-xs text-slate-400">Enter an amount to print a payment receipt.</p>
              )}
              {!collectNow && (
                <p className="text-xs text-slate-400">No payment — a dues slip (no payment) is recorded via the Sem-1 demand. You can collect later from Record Payment.</p>
              )}
            </CardContent>
          </Card>
          {submitError && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{submitError}</div>
          )}
          </>
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
          {step < 4 ? (
            <Button type="submit" disabled={step === 1 ? !step1Valid : step === 2 ? !step2Valid : false}>
              Next: {step === 1 ? 'Academic' : step === 2 ? 'Fees' : 'Confirm'}
            </Button>
          ) : (
            <Button type="submit" disabled={saving || totalFee <= 0}>
              {saving ? 'Saving...' : 'Confirm Admission'}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
