// ============================================
// MediCMS Desktop v4.0 - Record Payment
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { formatPKR, formatBalanceDisplay } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { ReceiptDoc, type ReceiptSize } from '@/components/receipts/ReceiptDoc';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import {
  REASON_MIN_LENGTH,
  chargeStateOf,
  entryId,
  entryProblems,
  liveBalanceOf,
} from '@/lib/ledger';
import { confirmDialog } from '@/lib/confirm';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAuthStore, useStudentStore, useLedgerStore, useAuditStore, useSettingsStore, useReceiptBookStore, useMoneyStore } from '@/stores';
import {
  moneyEntryProblems,
  nextActionNo,
  nextMoneyEntryNo,
  paymentMoneyEntry,
  resolvePaymentAccount,
} from '@/lib/finance';
import { FEE_RULES, getSubCourseDef, BANK_INFO } from '@/lib/constants';
import type { StudentWithBalance, LedgerEntry, PaymentMode } from '@/types';

type Step = 'search' | 'confirm' | 'payment' | 'success';

/**
 * The figures the success screen prints, read back from the ledger after the save.
 * It is deliberately a snapshot of what was kept and not something the form works
 * out again: the old screen took `balance - payment - discount` from a `balance`
 * that had already been re-derived after the write, so the money went off twice (§1,
 * §18 "shows the saved balance, never a recalculation").
 */
interface PostedPayment {
  receiptNo: string;
  date: string;
  payment: number;
  concession: number;
  concessionReason: string;
  mode: PaymentMode;
  bankRef: string;
  /** Balance before this save — the printed receipt's "previous balance". */
  prevBalance: number;
  /** Id of the Payment entry, so the screen shows the stored row rather than a copy. */
  paymentEntryId: string;
}

export default function RecordPayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedSno = searchParams.get('sno');
  const { user } = useAuthStore();

  const [step, setStep] = useState<Step>('search');
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentWithBalance | null>(null);
  const [amount, setAmount] = useState('');
  const [concession, setConcession] = useState('0');
  const [concessionReason, setConcessionReason] = useState('');
  /** The fee charge the concession is granted on (§16); defaults to the oldest unpaid. */
  const [concessionChargeId, setConcessionChargeId] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [narration, setNarration] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [bankRef, setBankRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [posted, setPosted] = useState<PostedPayment | null>(null);

  const storeStudents = useStudentStore((s) => s.students);
  const showTestRecords = useSettingsStore(s => s.showTestRecords);
  // §77: a soft second-look on large cash takings — a warning, never a block.
  const cashWarnAbove = useSettingsStore(s => s.financeLimits.cashPaymentWarningAbove);
  const allEntries = useLedgerStore(s => s.entries);
  const receiptBooks = useReceiptBookStore(s => s.books);
  const getNextReceipt = useReceiptBookStore(s => s.getNextReceipt);
  // Allow struckOff with dues (collection), hide test unless setting enabled
  // Live balances from the ledger's entries — single source of truth
  const students = useMemo(
    () => getStudentsWithBalanceLive(storeStudents, allEntries).filter(s => (showTestRecords || !s.isTestRecord)),
    [storeStudents, allEntries, showTestRecords]
  );

  const searchResults = search.length >= 2
    ? students.filter(s => {
        const q = search.toLowerCase();
        const hay = [s.name, s.sno.toString(), s.fatherName, s.contact ?? '', s.cnic ?? '', s.cnic?.replace(/\D/g,'') ?? ''].join(' ').toLowerCase();
        return hay.includes(q);
      }).slice(0, 5)
    : [];

  // Pre-select student from URL param
  useEffect(() => {
    if (preselectedSno) {
      const student = students.find(s => s.sno.toString() === preselectedSno);
      if (student) {
        setSelectedStudent(student);
        setStep('confirm');
      }
    }
  }, [preselectedSno, students]);

  const handleSelectStudent = (student: StudentWithBalance) => {
    setSelectedStudent(student);
    setSearch('');
    setStep('confirm');
  };

  const handleConfirm = () => {
    setStep('payment');
    // auto-fill receipt from book
    if (!receiptNo) {
      const next = getNextReceipt(user?.name ?? 'Admin');
      if (next) setReceiptNo(next);
    }
  };

  // Auto-fill receipt when entering payment step or user changes
  useEffect(() => {
    if (step === 'payment' && !receiptNo) {
      const next = getNextReceipt(user?.name ?? 'Admin');
      if (next) setReceiptNo(next);
    }
  }, [step, user, receiptNo, getNextReceipt]);

  const handleSubmit = async () => {
    if (!selectedStudent) return;
    const sno = selectedStudent.sno;
    const userName = user?.name ?? 'Admin';
    // §15 the payment belongs to the LOCAL day it was taken, not the UTC one.
    const today = dayKey();
    const receipt = receiptNo.trim();

    if (paymentAmount <= 0) { toastError('Enter the amount received — a payment of nothing is not a payment (§6).'); return; }
    if (paymentMode === 'Cheque' && !bankRef.trim()) { toastError('Cheque number is required.'); return; }
    if (!receipt) { toastError('Receipt number is required from the receipt book (§17).'); return; }
    // A receipt number is the reference on a Payment entry (§5); a charge has none.
    const dup = allEntries.some((entry) => (entry.reference ?? '').toLowerCase() === receipt.toLowerCase());
    if (dup) {
      toastError({ title: `Receipt No. ${receipt} already exists`, description: 'Nothing was saved — take the next number from the book.' });
      return;
    }
    // Validate against receipt book range
    const num = parseInt(receipt.replace('#',''),10);
    const book = receiptBooks.find(b => b.isActive && num >= b.start && num <= b.end);
    if (!book) {
      toastError({
        title: `Receipt ${receipt} is not in an active book range`,
        description: `${receiptBooks.map(b=>`${b.bookNo}:${b.start}-${b.end}`).join(', ') || 'No book is open'}. Ask an Admin for a new book (§17).`,
      });
      return;
    }
    // Admin-only: direct post with confirm for large over-payment (§17) — the ask
    // states what will happen instead of "Are you sure?", and Escape cannot dodge it.
    if (projectedBalance < FEE_RULES.creditGuardThreshold) {
      const go = await confirmDialog({
        title: 'This payment leaves a credit',
        effect: `${selectedStudent.name} will hold ${formatPKR(-projectedBalance)} as credit — balance ${formatPKR(projectedBalance)}, past the ${formatPKR(Math.abs(FEE_RULES.creditGuardThreshold))} guard. Credit is applied to the next charge that arrives (§25.1).`,
        tone: 'money',
        confirmLabel: 'Record payment',
      });
      if (!go) return;
    }
    // §77: cash above the warning limit gets one deliberate confirmation — the
    // counter keeps moving if the person means it, so this is a second look and
    // not a permission gate (that is what the payout/other-entry limits are for).
    if (paymentMode === 'Cash' && cashWarnAbove > 0 && paymentAmount > cashWarnAbove) {
      const go = await confirmDialog({
        title: 'Large cash payment',
        effect: `${formatPKR(paymentAmount)} in cash on receipt ${receipt} — above the ${formatPKR(cashWarnAbove)} warning (§77). Count the drawer again before you take it; the day close will have to reconcile this amount (§33).`,
        tone: 'money',
        confirmLabel: 'Take this cash',
      });
      if (!go) return;
    }

    const modeLabel = paymentMode === 'Bank' ? `Bank ${BANK_INFO.name} ${bankRef ? `Ref ${bankRef}` : ''}` : paymentMode;
    const createdAt = nowISO();
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
        date: today,
        type: 'Concession',
        amount: concessionAmount,
        description: `Concession granted at payment on receipt ${receipt}`,
        reason: concessionReason.trim(),
        // §16: a concession sits on a fee charge, so it is linked rather than being
        // a smaller payment hidden inside the Pay row.
        linkedEntryId: concessionTarget || null,
        createdBy: userName,
        createdAt,
        actionNo,
        // The store stamps the running balance on the way in (§7.3).
        balanceAfter: 0,
      });
    }
    batch.push({
      id: entryId(sno, paymentEntryNo),
      studentSno: sno,
      entryNo: paymentEntryNo,
      date: today,
      type: 'Payment',
      amount: paymentAmount,
      description: narration.trim() || `Fee payment received · ${modeLabel}`,
      reference: receipt,
      paymentMode,
      createdBy: userName,
      createdAt,
      actionNo,
      balanceAfter: 0,
    });

    // §8: the money side comes by itself — the receipt's route decides the
    // account. Built and asked before anything is written, so a refusal leaves
    // both books untouched.
    const moneyState = useMoneyStore.getState();
    const moneyAccount = resolvePaymentAccount(moneyState.accounts, paymentMode);
    if (!moneyAccount) {
      toastError({ title: 'No money account for this route', description: 'Set up your money accounts first (§78.1) — nothing was saved.' });
      return;
    }
    const moneyEntry = paymentMoneyEntry(
      {
        accountId: moneyAccount.id,
        amount: paymentAmount,
        mode: paymentMode,
        payee: `${selectedStudent.name} (SNO ${sno})`,
        receiptNo: receipt,
        moneyRef: bankRef.trim() || undefined,
        date: today,
        createdBy: userName,
      },
      {
        entryNo: nextMoneyEntryNo(moneyState.entries),
        actionNo: nextActionNo(moneyState.entries),
        now: createdAt,
      },
    );
    const moneyProblems = moneyEntryProblems(moneyEntry, {
      accounts: moneyState.accounts,
      entries: moneyState.entries,
      closedMonths: moneyState.closedMonths,
    });

    // The core's own rules asked before writing, so the screen refuses in the words
    // the ledger check would use rather than inventing its own (§5, §7).
    const problems = batch.flatMap((entry) => entryProblems(entry, { today, all: [...allEntries, ...batch] }));
    if (problems.length || moneyProblems.length) {
      toastError({
        title: problems.length ? 'The ledger would refuse this posting' : 'The money books would refuse this entry',
        description: [...problems, ...moneyProblems].join(' '),
      });
      return;
    }

    setLoading(true);
    const outcome = useLedgerStore.getState().postEntries(batch, today);
    if (!outcome.ok) {
      setLoading(false);
      toastError({ title: 'Nothing was saved', description: outcome.rejected.flatMap((r) => r.problems).join(' ') });
      return;
    }
    useReceiptBookStore.getState().useReceipt(receipt, userName);
    // §8: the money entry replaces the hand-typed bank deposit — cash lands on
    // the counter, bank and online on the account, a cheque is held until it
    // clears. The pre-check above asked the same rules, so a refusal here would
    // mean the books changed between two lines; say so rather than lose it.
    const moneyOutcome = useMoneyStore.getState().postEntries([moneyEntry], today);
    if (!moneyOutcome.ok) {
      toastError({
        title: `Receipt ${receipt} is in the ledger, but the money entry was refused`,
        description: moneyOutcome.rejected.flatMap((r) => r.problems).join(' '),
      });
    }
    useAuditStore.getState().addLog({ user: userName, action: 'Payment', studentSno: sno, details: `${formatPKR(paymentAmount)}${concessionAmount>0 ? ` + Concession ${formatPKR(concessionAmount)} (${concessionReason.trim()})` : ''} · ${modeLabel} · Rcpt ${receipt}` });

    setPosted({
      receiptNo: receipt,
      date: today,
      payment: paymentAmount,
      concession: concessionAmount,
      concessionReason: concessionReason.trim(),
      mode: paymentMode,
      bankRef: bankRef.trim(),
      prevBalance: balance,
      paymentEntryId: entryId(sno, paymentEntryNo),
    });
    toastSuccess({ title: `Receipt ${receipt} recorded`, description: `${formatPKR(paymentAmount)} received from ${selectedStudent.name}.` });
    setLoading(false);
    setStep('success');
  };

  // Live balance from the ledger (not a stale hardcoded balance)
  const balance = useMemo(
    () => (selectedStudent ? liveBalanceOf(selectedStudent.sno, allEntries) : 0),
    [allEntries, selectedStudent],
  );
  const paymentAmount = parseFloat(amount) || 0;
  const concessionAmount = parseFloat(concession) || 0;
  /** A preview of what the save would leave. The figure printed is the stored one. */
  const projectedBalance = balance - paymentAmount - concessionAmount;

  // Fee charges still owing, oldest first — what a concession can be granted on (§16).
  const openCharges = useMemo(() => {
    if (!selectedStudent) return [];
    return chargeStateOf(allEntries.filter((entry) => entry.studentSno === selectedStudent.sno))
      .charges
      .filter((charge) => charge.unpaid > 0);
  }, [allEntries, selectedStudent]);
  // Read through the live list rather than the stored id alone: a charge paid off or
  // reversed between selection and save falls back to the oldest open one.
  const concessionTarget = openCharges.some((charge) => charge.entryId === concessionChargeId)
    ? concessionChargeId
    : openCharges[0]?.entryId ?? '';

  return (
    <div className="w-auto space-y-3">
      {/* Header — compact */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} />
        </Button>
        <div>
          <h1 className="text-[15px] font-bold text-slate-900">Record Payment</h1>
          <p className="text-[11px] text-slate-500">Ctrl+P · Bank/Cash · Receipt book auto</p>
        </div>
      </div>

      {/* Step: Search */}
      {step === 'search' && (
        <Card>
          <CardHeader>
            <CardTitle>Find Student</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SNO, father name..."
                className="pl-9"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((student) => {
                  const balanceDisplay = formatBalanceDisplay(student.computedBalance);
                  return (
                    <button
                      key={student.sno}
                      onClick={() => handleSelectStudent(student)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100/60 hover:bg-slate-50 text-left"
                    >
                      <div>
                        <div className="font-medium">{student.name} (SNO: {student.sno})</div>
                        <div className="text-sm text-slate-500">
                          {getSubCourseDef(student.program).sub.label} · {getSubCourseDef(student.program).course.label} · {student.batch}
                        </div>
                      </div>
                      <span className={balanceDisplay.color}>
                        {balanceDisplay.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && selectedStudent && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm Student</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-slate-500">Name:</span> <strong>{selectedStudent.name}</strong></div>
                <div><span className="text-slate-500">SNO:</span> {selectedStudent.sno}</div>
                <div><span className="text-slate-500">Program:</span> {getSubCourseDef(selectedStudent.program).course.label} — {getSubCourseDef(selectedStudent.program).sub.label}</div>
                <div><span className="text-slate-500">Batch:</span> {selectedStudent.batch}</div>
                <div><span className="text-slate-500">Father:</span> {selectedStudent.fatherName}</div>
                <div><span className="text-slate-500">Contact:</span> {selectedStudent.contact || 'N/A'}</div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-500">Current Dues:</span>{' '}
                <span className="font-bold text-amber-600">{formatPKR(balance)}</span>
              </div>
            </div>

            <p className="text-sm text-slate-500">
              Is this the correct student? Multiple students may have similar names.
            </p>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setSelectedStudent(null); setStep('search'); }}>
                ← Choose Different
              </Button>
              <Button onClick={handleConfirm}>
                Yes, Continue →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Payment Form */}
      {step === 'payment' && selectedStudent && (
        <div className="space-y-4">
          {/* Current Balance */}
          <Card className="border-amber-100 bg-amber-50/50">
            <CardContent className="py-4">
              <div className="flex justify-between items-center">
                <span className="text-amber-700">Current Balance</span>
                <span className="text-2xl font-bold text-amber-700">{formatPKR(balance)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Payment Form */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Payment Amount (PKR) *</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>

              <div>
                <Label>Concession Amount (PKR)</Label>
                <Input
                  type="number"
                  value={concession}
                  onChange={(e) => setConcession(e.target.value)}
                  placeholder="0 if no concession"
                />
              </div>

              {concessionAmount > 0 && (
                <>
                  <div>
                    <Label>Which fee charge is it granted on?</Label>
                    <Select
                      value={concessionTarget || 'none'}
                      onValueChange={(v) => { if (v !== 'none') setConcessionChargeId(v); }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {openCharges.length === 0 && (
                          <SelectItem value="none">No open fee charge — held as credit</SelectItem>
                        )}
                        {openCharges.map((charge) => (
                          <SelectItem key={charge.entryId} value={charge.entryId}>
                            {charge.label} · {formatPKR(charge.unpaid)} unpaid · due {charge.dueDate}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-400 mt-1">
                      §16 — a concession is its own ledger entry against one fee charge, not a payment that was quietly made smaller.
                    </p>
                  </div>
                  <div>
                    <Label>Concession Reason *</Label>
                    <Input
                      value={concessionReason}
                      onChange={(e) => setConcessionReason(e.target.value)}
                      placeholder="Reason for the concession — required"
                    />
                    {concessionReason.trim().length < REASON_MIN_LENGTH && (
                      <p className="text-xs text-red-500 mt-1">
                        At least {REASON_MIN_LENGTH} characters — a one-word reason defeats the audit trail (§5)
                      </p>
                    )}
                  </div>
                </>
              )}

              <div>
                <Label>Payment Mode *</Label>
                <Select value={paymentMode} onValueChange={v => setPaymentMode(v as PaymentMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank">Bank Transfer — {BANK_INFO.name}</SelectItem>
                    <SelectItem value="Online">Online / Easypaisa / JazzCash</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {paymentMode !== 'Cash' && (
                <div>
                  <Label>Bank Ref / Transaction No. {paymentMode === 'Cheque' ? '*' : ''}</Label>
                  <Input value={bankRef} onChange={e=>setBankRef(e.target.value)} placeholder={paymentMode === 'Cheque' ? 'Cheque No. required' : 'e.g. TRX123, UTR'} />
                  <p className="text-xs text-slate-400 mt-1">Creates a linked bank deposit in <strong>{BANK_INFO.name} {BANK_INFO.accountNo}</strong> for reconciliation</p>
                </div>
              )}

              <div>
                <Label>Receipt Number *</Label>
                <Input
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  placeholder="Auto-filled from receipt book — editable if needed"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Book: {receiptBooks.find(b=>b.assignedTo=== (user?.name ?? 'Admin') && b.isActive)?.bookNo ?? receiptBooks.find(b=>b.isActive)?.bookNo ?? '—'} {receiptBooks.find(b=>b.isActive) ? `range ${receiptBooks.find(b=>b.isActive)!.start}-${receiptBooks.find(b=>b.isActive)!.end} next #${receiptBooks.find(b=>b.isActive)!.current}` : ''} · auto-filled, must be unique
                </p>
              </div>

              <div>
                <Label>Narration</Label>
                <Input
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>

              <div className="text-sm text-slate-500">
                Received by: <strong>{user?.name}</strong> (auto-filled)
              </div>

              {/* Live Preview */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-sm text-slate-500 mb-2">Live Preview</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>Current Balance</span>
                    <span>{formatPKR(balance)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Payment</span>
                    <span>- {formatPKR(paymentAmount)}</span>
                  </div>
                  {concessionAmount > 0 && (
                    <div className="flex justify-between text-teal-600">
                      <span>Concession</span>
                      <span>- {formatPKR(concessionAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-2 border-t border-slate-100">
                    <span>Balance after</span>
                    <span className={projectedBalance <= 0 ? 'text-green-600' : 'text-amber-600'}>
                      {formatPKR(projectedBalance)}
                    </span>
                  </div>
                </div>
                {projectedBalance < FEE_RULES.creditGuardThreshold && (
                  <div className="mt-3 p-2 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                    ⚠ Over-payment guard: balance will go below {formatPKR(Math.abs(FEE_RULES.creditGuardThreshold))} — please confirm.
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('confirm')}>
                  ← Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading || paymentAmount <= 0 || (concessionAmount > 0 && concessionReason.trim().length < REASON_MIN_LENGTH) || (paymentMode==='Cheque' && !bankRef.trim())}
                >
                  {loading ? 'Saving...' : 'Save Payment'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Success */}
      {step === 'success' && selectedStudent && posted && (
        <SuccessReceipt
          posted={posted}
          student={selectedStudent}
          onAnother={() => { setStep('search'); setSelectedStudent(null); setPosted(null); setAmount(''); setConcession('0'); setConcessionReason(''); setConcessionChargeId(''); setReceiptNo(''); setNarration(''); setPaymentMode('Cash'); setBankRef(''); }}
          onDone={() => navigate('/students')}
        />
      )}
    </div>
  );
}

function SuccessReceipt(props: {
  posted: PostedPayment;
  student: StudentWithBalance;
  onAnother: () => void;
  onDone: () => void;
}) {
  const { posted, student } = props;
  const paperDefault = useSettingsStore((s) => s.paperSize);
  const [size, setSize] = useState<ReceiptSize>(paperDefault);
  const institute = {
    name: useSettingsStore((s) => s.instituteName),
    address: useSettingsStore((s) => s.instituteAddress),
    phone: useSettingsStore((s) => s.institutePhone),
  };
  // §18: printed from the entry the ledger kept — its own date, amount and author —
  // and from the balance re-derived from the stored list, never from the form's maths.
  const entry = useLedgerStore((s) => s.entries.find((e) => e.id === posted.paymentEntryId));
  const savedBalance = useLedgerStore((s) => liveBalanceOf(student.sno, s.entries));
  const subLabel = (() => { try { return getSubCourseDef(student.program).sub.label; } catch { return student.program; } })();
  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="py-6 text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-xl font-bold mb-1">Payment Recorded</h2>
          <div className="text-sm text-slate-600">
            {student.name} (SNO:{student.sno}) · {formatPKR(entry?.amount ?? posted.payment)}
            {posted.concession > 0 && <span> + Concession {formatPKR(posted.concession)}</span>}
            {' '}· Receipt {posted.receiptNo} · Balance {formatPKR(savedBalance)}
          </div>
          {entry && (
            <div className="text-xs text-slate-400 mt-1">Entry #{entry.entryNo} · {entry.date} · posted by {entry.createdBy}</div>
          )}
          <div className="flex justify-center gap-2 mt-4">
            <Button variant={size === '80mm' ? 'default' : 'outline'} size="sm" onClick={() => setSize('80mm')}>80mm</Button>
            <Button variant={size === 'A4' ? 'default' : 'outline'} size="sm" onClick={() => setSize('A4')}>A4</Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer size={14} className="mr-1" /> Print Receipt
            </Button>
          </div>
          <div className="flex justify-center gap-2 mt-4">
            <Button variant="outline" onClick={props.onAnother}>Record Another</Button>
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
          programLabel={subLabel}
          batchLabel={student.batch}
          sessionLabel={String(student.session)}
          receiptNo={posted.receiptNo}
          // The local day the money was taken, not the UTC date the print happened on.
          date={entry?.date ?? posted.date}
          payment={entry?.amount ?? posted.payment}
          discount={posted.concession}
          discountReason={posted.concessionReason}
          mode={posted.mode}
          bankRef={posted.bankRef}
          prevBalance={posted.prevBalance}
          newBalance={savedBalance}
          receivedBy={entry?.createdBy ?? 'Admin'}
        />
      </div>
    </div>
  );
}
