// ============================================
// MediCMS Desktop — Record payment (§12–§22, §51)
//
// One screen, one all-or-nothing save (§18). Everything that decides whether the
// payment may be taken — the date a role may post, the closed day, the duplicate
// warning, the credit, the receipt book — comes from `@/lib/receipts`, so the
// screen renders a verdict instead of inventing rules of its own.
//
// The receipt number is not typed: §25 "the next number is automatic", and the
// number a book issues is derived from what the ledger already holds, so two
// counters can never take the same one.
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Printer, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApproverDialog } from '@/components/finance/ApproverDialog';
import { ReceiptDoc, type ReceiptSize } from '@/components/receipts/ReceiptDoc';

import { formatBalanceDisplay, formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { REASON_MIN_LENGTH, chargeStateOf, entryId, entryProblems, liveBalanceOf } from '@/lib/ledger';
import {
  activeBookFor,
  amountInWords,
  bookGate,
  bookSummaries,
  formatReceiptNo,
  paymentSafety,
  previewAllocation,
  receiptFactsOf,
} from '@/lib/receipts';
import type { PostedCharge } from '@/lib/fee/types';
import { confirmDialog } from '@/lib/confirm';
import { toastError, toastSuccess } from '@/lib/toast';
import { can } from '@/lib/permissions';
import {
  useAuditStore, useAuthStore, useLedgerStore, useMoneyStore, useReceiptBookStore,
  useSettingsStore, useStudentStore,
} from '@/stores';
import {
  moneyEntryProblems,
  nextActionNo,
  nextMoneyEntryNo,
  paymentMoneyEntry,
  resolvePaymentAccount,
} from '@/lib/finance';
import { BANK_INFO, getSubCourseDef } from '@/lib/constants';
import type { LedgerEntry, PaymentMode, StudentWithBalance } from '@/types';

type Step = 'search' | 'confirm' | 'payment' | 'success';

/**
 * What the success screen prints, read back from the ledger after the save (§18
 * "the success screen shows the saved balance, never a recalculation").
 */
interface PostedPayment {
  receiptNo: string;
  date: string;
  payment: number;
  concession: number;
  concessionReason: string;
  mode: PaymentMode;
  bankRef: string;
  prevBalance: number;
  paymentEntryId: string;
}

/** §26 "One line per fee charge paid, with its due date" — from the saved allocation. */
interface ReceiptLine {
  label: string;
  dueDate: string;
  amount: number;
}

/** A posted charge as the preview needs it: net billed, and what is already paid. */
function toPostedCharge(charge: ReturnType<typeof chargeStateOf>['charges'][number]): PostedCharge {
  return {
    id: charge.entryId,
    term: charge.term ?? 1,
    label: charge.label,
    amount: Math.max(0, charge.billed + charge.added - charge.cancelled - charge.reduced),
    dueDate: charge.dueDate,
    allocated: charge.paid,
  };
}

/** Every whole number from `from` to `to` inclusive; empty when `to < from`. */
function numberRange(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
}

export default function RecordPayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedSno = searchParams.get('sno');
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const userName = user?.name ?? 'Admin';
  const today = dayKey();

  const [step, setStep] = useState<Step>(preselectedSno ? 'confirm' : 'search');
  const [search, setSearch] = useState('');
  const [pickedStudent, setPickedStudent] = useState<StudentWithBalance | null>(null);
  /** §12 arriving from the profile: the URL names the student until another is chosen. */
  const [ignorePreselect, setIgnorePreselect] = useState(false);
  const [amount, setAmount] = useState('');
  const [payDate, setPayDate] = useState(today);
  const [dateReason, setDateReason] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [narration, setNarration] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [bankRef, setBankRef] = useState('');
  const [chequeBank, setChequeBank] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [concession, setConcession] = useState('0');
  const [concessionReason, setConcessionReason] = useState('');
  const [concessionChargeId, setConcessionChargeId] = useState('');
  const [approver, setApprover] = useState<string | null>(null);
  const [askApprover, setAskApprover] = useState(false);
  const [slipMatches, setSlipMatches] = useState(true);
  const [slipNumber, setSlipNumber] = useState('');
  const [slipReason, setSlipReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [posted, setPosted] = useState<PostedPayment | null>(null);

  const storeStudents = useStudentStore((s) => s.students);
  const showTestRecords = useSettingsStore((s) => s.showTestRecords);
  const cashWarnAbove = useSettingsStore((s) => s.financeLimits.cashPaymentWarningAbove);
  const allEntries = useLedgerStore((s) => s.entries);
  const closedDays = useMoneyStore((s) => s.closedDays);

  const books = useReceiptBookStore((s) => s.books);
  const bookEvents = useReceiptBookStore((s) => s.events);
  const reprints = useReceiptBookStore((s) => s.reprints);
  const settings = useReceiptBookStore((s) => s.paymentSettings);
  const spoilNumber = useReceiptBookStore((s) => s.spoilNumber);
  const skipNumbers = useReceiptBookStore((s) => s.skipNumbers);

  const students = useMemo(
    () => getStudentsWithBalanceLive(storeStudents, allEntries).filter((s) => showTestRecords || !s.isTestRecord),
    [storeStudents, allEntries, showTestRecords],
  );

  const searchResults = search.length >= 2
    ? students
        .filter((s) => {
          const query = search.toLowerCase();
          const hay = [s.name, s.sno.toString(), s.fatherName, s.contact ?? '', s.cnic ?? '', s.cnic?.replace(/\D/g, '') ?? ''].join(' ').toLowerCase();
          return hay.includes(query);
        })
        .slice(0, 5)
    : [];

  /** The student the screen works on: picked here, or named by the URL it arrived with. */
  const selectedStudent = pickedStudent
    ?? (ignorePreselect
      ? null
      : students.find((s) => s.sno.toString() === preselectedSno) ?? null);

  // ---- Receipt book (§17, §24, §25) --------------------------------------
  const slots = useMemo(
    () =>
      bookSummaries(
        books,
        books.flatMap((book) => receiptFactsOf(allEntries, book, new Map(Object.entries(reprints)))),
        bookEvents,
      ),
    [books, allEntries, reprints, bookEvents],
  );
  const slot = useMemo(() => activeBookFor(slots, user?.id ?? ''), [slots, user?.id]);
  const gate = useMemo(() => bookGate(slot, settings), [slot, settings]);
  const book = slot?.book ?? null;

  // ---- Money and charges -------------------------------------------------
  const balance = useMemo(
    () => (selectedStudent ? liveBalanceOf(selectedStudent.sno, allEntries) : 0),
    [allEntries, selectedStudent],
  );
  const paymentAmount = Math.trunc(Number(amount) || 0);
  const concessionAmount = Math.trunc(Number(concession) || 0);

  const studentEntries = useMemo(
    () => (selectedStudent ? allEntries.filter((entry) => entry.studentSno === selectedStudent.sno) : []),
    [allEntries, selectedStudent],
  );
  const openCharges = useMemo(
    () => chargeStateOf(studentEntries).charges.filter((charge) => charge.unpaid > 0),
    [studentEntries],
  );
  const concessionTarget = openCharges.some((charge) => charge.entryId === concessionChargeId)
    ? concessionChargeId
    : openCharges[0]?.entryId ?? '';

  /**
   * §15 the preview as it will be saved: the concession is posted first, on its own
   * charge (§16), then the payment sweeps the rest oldest first.
   */
  const preview = useMemo(() => {
    const charges = openCharges.map(toPostedCharge).map((charge) =>
      concessionAmount > 0 && charge.id === concessionTarget
        ? { ...charge, allocated: (charge.allocated ?? 0) + concessionAmount }
        : charge,
    );
    return previewAllocation(charges, paymentAmount);
  }, [openCharges, concessionAmount, concessionTarget, paymentAmount]);

  // ---- The §17 verdict ---------------------------------------------------
  const studentFlag = selectedStudent?.struckOff
    ? 'struckOff' as const
    : selectedStudent?.completed
      ? 'completed' as const
      : null;
  const safety = useMemo(
    () =>
      paymentSafety({
        studentSno: selectedStudent?.sno ?? 0,
        amount: Number(amount) || 0,
        date: payDate,
        mode: paymentMode,
        today,
        now: nowISO(),
        role: role ?? 'Counter',
        settings,
        closedDays: closedDays.map((closing) => closing.date),
        entries: studentEntries,
        dues: Math.max(0, balance),
        credit: preview.credit,
        reason: dateReason,
        bookProblem: gate.problem,
        studentFlag,
      }),
    [selectedStudent, amount, payDate, paymentMode, today, role, settings, closedDays, studentEntries, balance, preview.credit, dateReason, gate.problem, studentFlag],
  );

  // ---- Which number this receipt takes (§25) -----------------------------
  const slipValue = Math.trunc(Number(slipNumber) || 0);
  const slipRow = slot?.summary.rows.find((row) => row.number === slipValue);
  const slipValid =
    !slipMatches &&
    gate.nextNumber !== null &&
    slipValue > gate.nextNumber &&
    slipValue <= (book?.to ?? 0) &&
    slipRow?.status === 'Unused';
  const receiptNumber = gate.ok
    ? (slipMatches ? gate.nextNumber ?? 0 : slipValid ? slipValue : 0)
    : 0;
  const receiptNo = book && receiptNumber ? formatReceiptNo(book.prefix, receiptNumber) : '';
  const skippedNumbers =
    slipValid && gate.nextNumber !== null ? numberRange(gate.nextNumber, slipValue - 1) : [];

  const needsApproval = concessionAmount > 0 && !can(role, 'concession.approve');
  const concessionOk = concessionAmount === 0 || concessionReason.trim().length >= REASON_MIN_LENGTH;
  const chequeOk = paymentMode !== 'Cheque' || bankRef.trim().length > 0;
  const canSave =
    !!selectedStudent &&
    paymentAmount > 0 &&
    gate.ok &&
    receiptNo.length > 0 &&
    safety.blockers.length === 0 &&
    concessionOk &&
    chequeOk &&
    (!needsApproval || !!approver) &&
    (safety.confirms.length === 0 || confirmed) &&
    (book?.mode !== 'PrePrinted' || slipMatches || slipValid) &&
    !loading;

  const handleSelectStudent = (student: StudentWithBalance) => {
    setPickedStudent(student);
    setIgnorePreselect(true);
    setSearch('');
    setStep('confirm');
  };

  const resetForm = () => {
    setStep('search');
    setPickedStudent(null);
    setIgnorePreselect(true);
    setPosted(null);
    setAmount('');
    setPayDate(today);
    setDateReason('');
    setPaidBy('');
    setNarration('');
    setPaymentMode('Cash');
    setBankRef('');
    setChequeBank('');
    setChequeDate('');
    setConcession('0');
    setConcessionReason('');
    setConcessionChargeId('');
    setApprover(null);
    setSlipMatches(true);
    setSlipNumber('');
    setSlipReason('');
    setConfirmed(false);
  };

  /** §27.3 a damaged slip: the number is spent, with a reason, and the book moves on. */
  const handleSpoil = () => {
    if (!book || gate.nextNumber === null) return;
    if (slipReason.trim().length < REASON_MIN_LENGTH) {
      toastError(`Give a reason of at least ${REASON_MIN_LENGTH} characters — a spoiled number is money spent (§27.3).`);
      return;
    }
    const label = formatReceiptNo(book.prefix, gate.nextNumber);
    spoilNumber(book.id, gate.nextNumber, slipReason, userName, nowISO());
    setSlipReason('');
    toastSuccess({ title: `${label} marked spoiled`, description: 'The book moves on to the next number.' });
  };

  const handleSubmit = async () => {
    if (!selectedStudent || !book) return;
    const sno = selectedStudent.sno;

    if (safety.blockers.length) {
      toastError({ title: 'This payment cannot be saved', description: safety.blockers.join(' ') });
      return;
    }
    if (!receiptNo) {
      toastError('No receipt number — check the receipt book (§17).');
      return;
    }
    // §20 "Two staff take a payment for the same student at once": the number is
    // re-checked against the register the moment it is used.
    const taken = receiptFactsOf(allEntries, book).some((facts) => facts.reference === receiptNo);
    if (taken) {
      toastError({ title: `Receipt ${receiptNo} has just been used`, description: 'Nothing was saved. The book has moved on — take the payment again.' });
      return;
    }
    // §77 the cash second look is a finance rule of its own, kept beside §17.
    if (paymentMode === 'Cash' && cashWarnAbove > 0 && paymentAmount > cashWarnAbove) {
      const go = await confirmDialog({
        title: 'Large cash payment',
        effect: `${formatPKR(paymentAmount)} in cash on receipt ${receiptNo} — above the ${formatPKR(cashWarnAbove)} warning (§77). Count the drawer again before you take it; the day close will have to reconcile this amount (§33).`,
        tone: 'money',
        confirmLabel: 'Take this cash',
      });
      if (!go) return;
    }

    const createdAt = nowISO();
    const modeLabel = paymentMode === 'Cheque'
      ? `Cheque ${bankRef.trim()}${chequeBank.trim() ? ` · ${chequeBank.trim()}` : ''}`
      : paymentMode === 'Bank'
        ? `Bank ${BANK_INFO.name}${bankRef.trim() ? ` Ref ${bankRef.trim()}` : ''}`
        : paymentMode;

    // One numbering run for the student, so the concession and the payment of this
    // single save sit one after the other and share an action number (§5, §18).
    const firstEntryNo = useLedgerStore.getState().nextEntryNo(sno);
    const actionNo = `pay-${sno}-${firstEntryNo}`;
    const concessionEntryNo = concessionAmount > 0 ? firstEntryNo : null;
    const paymentEntryNo = concessionEntryNo !== null ? firstEntryNo + 1 : firstEntryNo;

    const batch: LedgerEntry[] = [];
    if (concessionEntryNo !== null) {
      batch.push({
        id: entryId(sno, concessionEntryNo),
        studentSno: sno,
        entryNo: concessionEntryNo,
        date: payDate,
        type: 'Concession',
        amount: concessionAmount,
        description: `Concession granted at payment on receipt ${receiptNo}`,
        reason: concessionReason.trim(),
        linkedEntryId: concessionTarget || null,
        createdBy: userName,
        createdAt,
        approvedBy: approver,
        actionNo,
        balanceAfter: 0,
      });
    }
    batch.push({
      id: entryId(sno, paymentEntryNo),
      studentSno: sno,
      entryNo: paymentEntryNo,
      date: payDate,
      type: 'Payment',
      amount: paymentAmount,
      description: narration.trim() || `Fee payment received · ${modeLabel}`,
      reference: receiptNo,
      paymentMode,
      // §5, §18: the allocation is stored, not re-derived — the profile, the
      // statement and a void all read what this payment actually paid off.
      allocations: preview.rows
        .filter((row) => row.allocated > 0)
        .map((row) => ({ chargeId: row.chargeId, amount: row.allocated })),
      createdBy: userName,
      createdAt,
      actionNo,
      balanceAfter: 0,
    });

    const moneyState = useMoneyStore.getState();
    const moneyAccount = resolvePaymentAccount(moneyState.accounts, paymentMode);
    if (!moneyAccount) {
      toastError({ title: 'No money account for this route', description: 'Set up your money accounts first — nothing was saved.' });
      return;
    }
    const moneyEntry = {
      ...paymentMoneyEntry(
        {
          accountId: moneyAccount.id,
          amount: paymentAmount,
          mode: paymentMode,
          // §20 "Payer is not the student — the Paid by name is saved and printed".
          payee: paidBy.trim() ? `${paidBy.trim()} (SNO ${sno})` : `${selectedStudent.name} (SNO ${sno})`,
          receiptNo,
          moneyRef: bankRef.trim() || undefined,
          date: payDate,
          createdBy: userName,
        },
        { entryNo: nextMoneyEntryNo(moneyState.entries), actionNo: nextActionNo(moneyState.entries), now: createdAt },
      ),
      // §32 the cheque's own details ride with the held entry so the register can
      // show them before it clears.
      note: paymentMode === 'Cheque'
        ? `Cheque ${bankRef.trim()} · ${chequeBank.trim() || 'bank not given'}${chequeDate ? ` · dated ${chequeDate}` : ''}`
        : undefined,
      // §32/§34/§58: structured cheque details, so the register can gate a
      // post-dated deposit and post a bounce fine to the right student.
      studentSno: sno,
      instrumentDate: paymentMode === 'Cheque' ? chequeDate || undefined : undefined,
      instrumentBank: paymentMode === 'Cheque' ? chequeBank.trim() || undefined : undefined,
    };
    const moneyProblems = moneyEntryProblems(moneyEntry, {
      accounts: moneyState.accounts,
      entries: moneyState.entries,
      closedMonths: moneyState.closedMonths,
    });

    // The core's own rules are asked before writing, so the screen refuses in the
    // words the ledger check would use rather than inventing its own (§5, §7).
    const problems = batch.flatMap((entry) => entryProblems(entry, { today, all: [...allEntries, ...batch] }));
    if (problems.length || moneyProblems.length) {
      toastError({
        title: problems.length ? 'The ledger would refuse this posting' : 'The money books would refuse this entry',
        description: [...problems, ...moneyProblems].join(' '),
      });
      return;
    }

    setLoading(true);
    // §25 numbers passed over for a slip used out of order stay visible as Skipped.
    if (skippedNumbers.length) {
      skipNumbers(book.id, skippedNumbers, `Slip ${receiptNo} used out of order`, userName, createdAt);
    }
    const outcome = useLedgerStore.getState().postEntries(batch, today);
    if (!outcome.ok) {
      setLoading(false);
      toastError({ title: 'Nothing was saved', description: outcome.rejected.flatMap((r) => r.problems).join(' ') });
      return;
    }
    const moneyOutcome = useMoneyStore.getState().postEntries([moneyEntry], today);
    if (!moneyOutcome.ok) {
      toastError({
        title: `Receipt ${receiptNo} is in the ledger, but the money entry was refused`,
        description: moneyOutcome.rejected.flatMap((r) => r.problems).join(' '),
      });
    }
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Payment',
      studentSno: sno,
      details: `${formatPKR(paymentAmount)}${concessionAmount > 0 ? ` + Concession ${formatPKR(concessionAmount)} (${concessionReason.trim()})` : ''} · ${modeLabel} · Rcpt ${receiptNo}${payDate !== today ? ` · back-dated to ${payDate}: ${dateReason.trim()}` : ''}`,
    });

    setPosted({
      receiptNo,
      date: payDate,
      payment: paymentAmount,
      concession: concessionAmount,
      concessionReason: concessionReason.trim(),
      mode: paymentMode,
      bankRef: [bankRef.trim(), chequeBank.trim(), chequeDate ? `dated ${chequeDate}` : ''].filter(Boolean).join(' · '),
      prevBalance: balance,
      paymentEntryId: entryId(sno, paymentEntryNo),
    });
    toastSuccess({ title: `Receipt ${receiptNo} recorded`, description: `${formatPKR(paymentAmount)} received from ${selectedStudent.name}.` });
    setLoading(false);
    setStep('success');
  };

  const subLabel = (() => {
    if (!selectedStudent) return '';
    try {
      return getSubCourseDef(selectedStudent.program).sub.label;
    } catch {
      return selectedStudent.program;
    }
  })();

  return (
    <div className="w-auto space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} />
        </Button>
        <div>
          <h1 className="text-ui font-bold text-ink">Record Payment</h1>
          <p className="text-meta text-ink-3">Amount, date, mode and the receipt number the book gives.</p>
        </div>
      </div>

      {/* Step: search */}
      {step === 'search' && (
        <Card>
          <CardHeader>
            <CardTitle>Find Student</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SNO, father name, CNIC..."
                className="pl-9"
                autoFocus
              />
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((student) => {
                  const display = formatBalanceDisplay(student.computedBalance);
                  return (
                    <button
                      key={student.sno}
                      onClick={() => handleSelectStudent(student)}
                      className="flex w-full items-center justify-between rounded-control border border-hairline-soft p-3 text-left hover:bg-panel-soft"
                    >
                      <div>
                        <div className="font-medium text-ink">{student.name} (SNO: {student.sno})</div>
                        <div className="text-meta text-ink-3">
                          {getSubCourseDef(student.program).sub.label} · {getSubCourseDef(student.program).course.label} · {student.batch}
                        </div>
                      </div>
                      <span className={display.color}>{display.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step: confirm the student (§12 "similar names") */}
      {step === 'confirm' && selectedStudent && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm Student</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-control bg-panel-soft p-4 text-body">
              <div><span className="text-ink-3">Name:</span> <strong>{selectedStudent.name}</strong></div>
              <div><span className="text-ink-3">SNO:</span> {selectedStudent.sno}</div>
              <div><span className="text-ink-3">Program:</span> {subLabel}</div>
              <div><span className="text-ink-3">Batch:</span> {selectedStudent.batch}</div>
              <div><span className="text-ink-3">Father:</span> {selectedStudent.fatherName}</div>
              <div><span className="text-ink-3">Contact:</span> {selectedStudent.contact || 'N/A'}</div>
              <div className="col-span-2 border-t border-hairline-soft pt-2">
                <span className="text-ink-3">Dues:</span>{' '}
                <span className="num font-bold text-amber-700">{formatPKR(balance)}</span>
              </div>
            </div>
            <p className="text-meta text-ink-3">
              Is this the correct student? Multiple students may have similar names.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setPickedStudent(null); setIgnorePreselect(true); setStep('search'); }}>
                ← Choose Different
              </Button>
              <Button onClick={() => setStep('payment')}>Yes, Continue →</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: payment */}
      {step === 'payment' && selectedStudent && (
        <div className="space-y-4">
          <Card className="border-amber-100 bg-amber-50/50">
            <CardContent className="flex items-center justify-between py-4">
              <span className="text-amber-800">{selectedStudent.name} · SNO {selectedStudent.sno}</span>
              <span className="num text-title font-bold text-amber-800">{formatPKR(balance)}</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Amount received (PKR) *</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Whole rupees"
                    autoFocus
                  />
                  {paymentAmount > 0 && (
                    <p className="mt-1 text-micro text-ink-3">{amountInWords(paymentAmount)}</p>
                  )}
                </div>
                <div>
                  <Label>Payment date *</Label>
                  <Input type="date" value={payDate} max={today} onChange={(e) => setPayDate(e.target.value)} />
                  <p className="mt-1 text-micro text-ink-3">
                    {role === 'Admin'
                      ? 'Any open day, with a reason.'
                      : role === 'Accountant'
                        ? `Today or up to ${settings.backDateDays} days back, with a reason.`
                        : 'Today only.'}
                  </p>
                </div>
              </div>

              {payDate !== today && (
                <div>
                  <Label>Reason for the back-dated date *</Label>
                  <Input
                    value={dateReason}
                    onChange={(e) => setDateReason(e.target.value)}
                    placeholder="For example: slip from Friday's counter"
                  />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Mode *</Label>
                  <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank">Bank transfer — {BANK_INFO.name}</SelectItem>
                      <SelectItem value="Online">Online / Easypaisa / JazzCash</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Paid by</Label>
                  <Input
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    placeholder={selectedStudent.fatherName || selectedStudent.name}
                  />
                </div>
              </div>

              {paymentMode !== 'Cash' && (
                <div className="grid gap-3 rounded-control border border-hairline-soft bg-panel-soft p-3 sm:grid-cols-3">
                  <div>
                    <Label>{paymentMode === 'Cheque' ? 'Cheque number *' : 'Bank / transaction reference'}</Label>
                    <Input
                      value={bankRef}
                      onChange={(e) => setBankRef(e.target.value)}
                      placeholder={paymentMode === 'Cheque' ? 'Cheque number' : 'e.g. TRX123, UTR'}
                    />
                  </div>
                  {paymentMode === 'Cheque' && (
                    <>
                      <div>
                        <Label>Bank</Label>
                        <Input value={chequeBank} onChange={(e) => setChequeBank(e.target.value)} placeholder="Bank on the cheque" />
                      </div>
                      <div>
                        <Label>Cheque date</Label>
                        <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                      </div>
                    </>
                  )}
                  <p className="text-micro text-ink-3 sm:col-span-3">
                    {paymentMode === 'Cheque'
                      ? 'The cheque is held, not banked (§32) — it counts for nothing until it clears. A post-dated cheque is kept until its date.'
                      : `A linked deposit in ${BANK_INFO.name} ${BANK_INFO.accountNo} is created for reconciliation.`}
                  </p>
                </div>
              )}

              <div>
                <Label>Narration</Label>
                <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Optional note on the receipt" />
              </div>
            </CardContent>
          </Card>

          {/* §51.2 the allocation preview — what this payment pays off */}
          <Card>
            <CardHeader>
              <CardTitle>How it is paid off (§15, oldest first)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {openCharges.length === 0 ? (
                <p className="text-body text-ink-3">
                  This student has no open fee charge. The whole amount will be held as credit.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {openCharges.map((charge) => {
                    const row = preview.rows.find((r) => r.chargeId === charge.entryId);
                    const applied = row?.allocated ?? 0;
                    const after = preview.unpaidByCharge[charge.entryId] ?? charge.unpaid;
                    const concessionHere = concessionAmount > 0 && charge.entryId === concessionTarget;
                    return (
                      <div key={charge.entryId} className="flex items-baseline justify-between gap-2 text-body">
                        <span className="text-ink-2">
                          {charge.label} · due {charge.dueDate}
                          {concessionHere && <span className="text-teal-700"> · concession {formatPKR(concessionAmount)}</span>}
                        </span>
                        <span className="num whitespace-nowrap">
                          <span className="text-ink-3">{formatPKR(charge.unpaid)}</span>
                          <span className="text-ink-3"> → </span>
                          <span className="font-medium text-ink">{formatPKR(after)}</span>
                          {applied > 0 && <span className="text-green-700"> (-{formatPKR(applied)})</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-between border-t border-hairline-soft pt-2 text-body">
                <span className="text-ink-3">Placed on charges</span>
                <span className="num">{formatPKR(preview.allocated)}</span>
              </div>
              {preview.credit > 0 && (
                <div className="flex justify-between text-body">
                  <span className="text-ink-3">Left as credit</span>
                  <span className="num font-medium text-teal-700">{formatPKR(preview.credit)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-hairline-soft pt-2 text-body font-bold">
                <span>Balance after</span>
                <span className={`num ${balance - paymentAmount - concessionAmount <= 0 ? 'text-green-700' : 'text-amber-700'}`}>
                  {formatPKR(balance - paymentAmount - concessionAmount)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* §16 concession at payment */}
          <Card>
            <CardHeader>
              <CardTitle>Concession (§16)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Concession amount (PKR)</Label>
                  <Input type="number" value={concession} onChange={(e) => setConcession(e.target.value)} placeholder="0 if none" />
                </div>
                {concessionAmount > 0 && (
                  <div>
                    <Label>Which fee charge is it granted on? *</Label>
                    <Select value={concessionTarget || 'none'} onValueChange={(v) => { if (v !== 'none') setConcessionChargeId(v); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {openCharges.length === 0 && <SelectItem value="none">No open charge — held as credit</SelectItem>}
                        {openCharges.map((charge) => (
                          <SelectItem key={charge.entryId} value={charge.entryId}>
                            {charge.label} · {formatPKR(charge.unpaid)} unpaid · due {charge.dueDate}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {concessionAmount > 0 && (
                <>
                  <div>
                    <Label>Reason *</Label>
                    <Input
                      value={concessionReason}
                      onChange={(e) => setConcessionReason(e.target.value)}
                      placeholder="Reason for the concession — required"
                    />
                    {concessionReason.trim().length < REASON_MIN_LENGTH && (
                      <p className="mt-1 text-micro text-red-600">
                        At least {REASON_MIN_LENGTH} characters — a one-word reason defeats the audit trail (§5).
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between rounded-control border border-hairline-soft px-3 py-2">
                    <span className="text-meta text-ink-2">
                      {needsApproval
                        ? 'A counter operator may only request a concession — an Accountant or Admin must approve it with their own password (§16).'
                        : 'You may approve this concession yourself (§16).'}
                    </span>
                    {needsApproval && (
                      approver
                        ? <span className="text-meta font-medium text-green-700">Approved by {approver}</span>
                        : <Button size="sm" variant="outline" onClick={() => setAskApprover(true)}>Approve…</Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* §17 the verdict */}
          {(safety.blockers.length > 0 || safety.confirms.length > 0 || safety.notices.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Checks (§17)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {safety.blockers.map((message) => (
                  <p key={message} className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
                    {message}
                  </p>
                ))}
                {safety.confirms.map((message) => (
                  <p key={message} className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-meta text-amber-800">
                    {message}
                  </p>
                ))}
                {safety.notices.map((message) => (
                  <p key={message} className="rounded-control bg-panel-soft px-3 py-2 text-meta text-ink-2">
                    {message}
                  </p>
                ))}
                {safety.confirms.length > 0 && (
                  <label className="flex items-center gap-2 pt-1 text-meta text-ink-2">
                    <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />
                    I have checked the warnings above and want to record this payment.
                  </label>
                )}
              </CardContent>
            </Card>
          )}

          {/* §17, §25 the receipt number */}
          <Card>
            <CardHeader>
              <CardTitle>Receipt number</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!gate.ok ? (
                <p className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">{gate.problem}</p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-body text-ink-3">
                      {book?.name} · {book?.prefix}{book?.from}–{book?.to} · {book?.mode === 'PrePrinted' ? 'pre-printed slips' : 'printed by the app'}
                    </span>
                    <span className="num text-title font-bold text-ink">{receiptNo}</span>
                  </div>
                  {gate.warning && (
                    <p className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-meta text-amber-800">{gate.warning}</p>
                  )}
                  <p className="text-micro text-ink-3">
                    The next number is automatic — it cannot be typed (§25).
                  </p>

                  {book?.mode === 'PrePrinted' && (
                    <div className="space-y-2 rounded-control border border-hairline-soft p-3">
                      <p className="text-meta text-ink-2">
                        Next slip: <strong>{gate.nextLabel}</strong>. Write this number on the slip.
                      </p>
                      <label className="flex items-center gap-2 text-meta text-ink-2">
                        <Checkbox checked={slipMatches} onCheckedChange={(value) => setSlipMatches(value === true)} />
                        Slip number matches
                      </label>
                      {!slipMatches && (
                        <>
                          <div>
                            <Label>The slip in hand is numbered</Label>
                            <Input
                              type="number"
                              value={slipNumber}
                              onChange={(e) => setSlipNumber(e.target.value)}
                              placeholder="A later unused number in this book"
                            />
                            {slipNumber && !slipValid && (
                              <p className="mt-1 text-micro text-red-600">
                                Use an unused number above {gate.nextLabel} and inside the book; the ones passed over are marked Skipped (§25).
                              </p>
                            )}
                          </div>
                          <div>
                            <Label>Or mark {gate.nextLabel} spoiled (§27.3)</Label>
                            <div className="flex gap-2">
                              <Input value={slipReason} onChange={(e) => setSlipReason(e.target.value)} placeholder="Why the slip is spoiled — required" />
                              <Button variant="outline" onClick={handleSpoil}>Spoil</Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              <p className="text-micro text-ink-3">Received by: <strong>{userName}</strong></p>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('confirm')}>← Back</Button>
            <Button onClick={handleSubmit} disabled={!canSave}>
              {loading ? 'Saving…' : `Save payment${receiptNo ? ` · ${receiptNo}` : ''}`}
            </Button>
          </div>
        </div>
      )}

      {/* Step: success (§18, §52) */}
      {step === 'success' && selectedStudent && posted && (
        <SuccessReceipt
          posted={posted}
          student={selectedStudent}
          subLabel={subLabel}
          lines={preview.rows.map((row) => ({ label: row.label, dueDate: row.dueDate, amount: row.allocated }))}
          onAnother={resetForm}
          onDone={() => navigate('/students')}
        />
      )}

      {askApprover && (
        <ApproverDialog
          title="Approve the concession"
          blurb={`${formatPKR(concessionAmount)} off for ${selectedStudent?.name ?? ''}. An Accountant or Admin approves it with their own password (§16).`}
          roles={['Admin', 'Accountant']}
          onApprove={(name) => { setApprover(name); setAskApprover(false); }}
          onClose={() => setAskApprover(false)}
        />
      )}
    </div>
  );
}

function SuccessReceipt(props: {
  posted: PostedPayment;
  student: StudentWithBalance;
  subLabel: string;
  lines: ReceiptLine[];
  onAnother: () => void;
  onDone: () => void;
}) {
  const { posted, student, lines } = props;
  const paperDefault = useSettingsStore((s) => s.paperSize);
  const receiptSettings = useReceiptBookStore((s) => s.paymentSettings);
  const [size, setSize] = useState<ReceiptSize>(paperDefault);
  const institute = {
    name: useSettingsStore((s) => s.instituteName),
    address: useSettingsStore((s) => s.instituteAddress),
    phone: useSettingsStore((s) => s.institutePhone),
  };
  // §18 printed from the entry the ledger kept, and from the balance re-derived
  // from the stored list — never from the form's own arithmetic.
  const entry = useLedgerStore((s) => s.entries.find((e) => e.id === posted.paymentEntryId));
  const savedBalance = useLedgerStore((s) => liveBalanceOf(student.sno, s.entries));
  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="py-6 text-center">
          <CheckCircle2 size={40} className="mx-auto mb-3 text-green-600" />
          <h2 className="mb-1 text-section font-bold text-ink">Payment recorded</h2>
          <div className="text-body text-ink-2">
            {student.name} (SNO:{student.sno}) · {formatPKR(entry?.amount ?? posted.payment)}
            {posted.concession > 0 && <span> + concession {formatPKR(posted.concession)}</span>}
            {' '}· Receipt {posted.receiptNo} · Balance {formatPKR(savedBalance)}
          </div>
          {entry && (
            <div className="mt-1 text-micro text-ink-3">Entry #{entry.entryNo} · {entry.date} · posted by {entry.createdBy}</div>
          )}
          <div className="mt-4 flex justify-center gap-2">
            <Button variant={size === '80mm' ? 'default' : 'outline'} size="sm" onClick={() => setSize('80mm')}>80mm</Button>
            <Button variant={size === 'A4' ? 'default' : 'outline'} size="sm" onClick={() => setSize('A4')}>A4</Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer size={14} className="mr-1" /> Print receipt
            </Button>
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={props.onAnother}>Record another</Button>
            <Button onClick={props.onDone}>Done</Button>
          </div>
        </CardContent>
      </Card>
      <div className="print-area">
        <ReceiptDoc
          size={size}
          institute={institute}
          studentName={student.name}
          studentSno={student.sno}
          programLabel={props.subLabel}
          batchLabel={student.batch}
          sessionLabel={String(student.session)}
          receiptNo={posted.receiptNo}
          date={entry?.date ?? posted.date}
          payment={entry?.amount ?? posted.payment}
          discount={posted.concession}
          discountReason={posted.concessionReason}
          mode={posted.mode}
          bankRef={posted.bankRef}
          prevBalance={posted.prevBalance}
          newBalance={savedBalance}
          receivedBy={entry?.createdBy ?? 'Admin'}
          lines={lines}
          // §26 a cheque that has not cleared says so across the receipt.
          mark={posted.mode === 'Cheque' ? 'Cheque subject to clearance' : undefined}
          footer={receiptSettings.receiptFooter || undefined}
          copies={receiptSettings.receiptCopies}
        />
      </div>
    </div>
  );
}
