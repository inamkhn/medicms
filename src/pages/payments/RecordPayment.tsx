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
import { ReceiptDoc, type ReceiptSize } from '@/components/receipts/ReceiptDoc';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { useAuthStore, useStudentStore, useLedgerStore, getNextTxnNo, useAuditStore, useSettingsStore, useReceiptBookStore, useBankStore, getNextBankSno } from '@/stores';
import { FEE_RULES, getSubCourseDef, BANK_INFO } from '@/lib/constants';
import type { StudentWithBalance, LedgerTransaction } from '@/types';

type Step = 'search' | 'confirm' | 'payment' | 'success';

export default function RecordPayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedSno = searchParams.get('sno');
  const { user } = useAuthStore();

  const [step, setStep] = useState<Step>('search');
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentWithBalance | null>(null);
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [discountReason, setDiscountReason] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [narration, setNarration] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Bank' | 'Online' | 'Cheque'>('Cash');
  const [bankRef, setBankRef] = useState('');
  const [loading, setLoading] = useState(false);

  const storeStudents = useStudentStore((s) => s.students);
  const showTestRecords = useSettingsStore(s => s.showTestRecords);
  const allLedger = useLedgerStore(s => s.transactions);
  const receiptBooks = useReceiptBookStore(s => s.books);
  const getNextReceipt = useReceiptBookStore(s => s.getNextReceipt);
  // Allow struckOff with dues (collection), hide test unless setting enabled
  // Live balances from ledger — single source of truth
  const students = useMemo(
    () => getStudentsWithBalanceLive(storeStudents, allLedger).filter(s => (showTestRecords || !s.isTestRecord)),
    [storeStudents, allLedger, showTestRecords]
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
    if (!selectedStudent || paymentAmount <= 0) return;
    if (discountAmount > 0 && !discountReason.trim()) return;
    if (paymentMode === 'Cheque' && !bankRef.trim()) { alert('Cheque number is required'); return; }
    if (!receiptNo.trim()) { alert('Receipt number is required from receipt book'); return; }
    const dup = allLedger.some(t => t.receiptNo && t.receiptNo.toLowerCase() === receiptNo.trim().toLowerCase());
    if (dup) { alert(`Receipt No. ${receiptNo.trim()} already exists`); return; }
    // Validate against receipt book range
    const num = parseInt(receiptNo.replace('#',''),10);
    const book = receiptBooks.find(b => b.isActive && num >= b.start && num <= b.end);
    if (!book) { alert(`Receipt ${receiptNo} not in any active book range (${receiptBooks.map(b=>`${b.bookNo}:${b.start}-${b.end}`).join(', ')})`); return; }
    // Admin-only: direct post with confirm for large over-payment
    if (newBalance < FEE_RULES.creditGuardThreshold) {
      const ok = window.confirm(`Over-payment guard: balance would go to ${formatPKR(newBalance)} (below ${formatPKR(Math.abs(FEE_RULES.creditGuardThreshold))}). Continue?`);
      if (!ok) return;
    }
    setLoading(true);
    const nextTxn = getNextTxnNo(allLedger, selectedStudent.sno);
    const userName = user?.name ?? 'Admin';
    const modeLabel = paymentMode === 'Bank' ? `Bank ${BANK_INFO.name} ${bankRef ? `Ref ${bankRef}` : ''}` : paymentMode;
    const tx: LedgerTransaction = {
      id: `tx-${selectedStudent.sno}-${nextTxn}-${Date.now()}`,
      studentSno: selectedStudent.sno,
      txnNo: nextTxn,
      date: new Date().toISOString().split('T')[0],
      type: 'Pay',
      fees: 0,
      discount: discountAmount,
      payment: paymentAmount,
      receiptNo: receiptNo.trim() || null,
      receivedBy: userName,
      narration: narration.trim() || `${modeLabel}${discountAmount > 0 ? ` Discount: ${discountReason.trim()}` : ''}`,
      createdAt: new Date().toISOString(),
      createdBy: userName,
      synced: false,
    };
    useLedgerStore.getState().addTransaction(tx);
    useReceiptBookStore.getState().useReceipt(receiptNo.trim(), userName);
    // Bank reconciliation — if Bank/Online/Cheque, create deposit
    if (paymentMode !== 'Cash') {
      const bankTxs = useBankStore.getState().transactions;
      const nextSno = getNextBankSno(bankTxs);
      const lastBalance = bankTxs.length ? bankTxs[bankTxs.length - 1].balance : 0;
      useBankStore.getState().addTransaction({
        sno: nextSno,
        date: new Date().toISOString().split('T')[0],
        deposit: paymentAmount,
        withdrawal: 0,
        balance: lastBalance + paymentAmount,
        narration: `Fee from ${selectedStudent.name} (SNO:${selectedStudent.sno}) · Rcpt ${receiptNo.trim()}${bankRef ? ` · ${bankRef}` : ''} · ${modeLabel}`,
        linkedExpenseId: null,
        isPersonal: false,
        synced: false,
      });
    }
    useAuditStore.getState().addLog({ user: userName, action: 'Payment', studentSno: selectedStudent.sno, details: `${formatPKR(paymentAmount)}${discountAmount>0 ? ` + Disc ${formatPKR(discountAmount)} (${discountReason.trim()})` : ''} · ${modeLabel} · Rcpt ${receiptNo.trim() || 'N/A'}` });
    setLoading(false);
    setStep('success');
  };

  // Live balance from ledger (not stale MOCK_BALANCES)
  const liveBalance = useMemo(() => {
    if (!selectedStudent) return 0;
    const txs = allLedger.filter(t => t.studentSno === selectedStudent.sno);
    return txs.reduce((s,t) => s + t.fees + (t.discount < 0 ? -t.discount : 0) - (t.discount > 0 ? t.discount : 0) - t.payment, 0);
  }, [allLedger, selectedStudent]);
  const balance = liveBalance;
  const paymentAmount = parseFloat(amount) || 0;
  const discountAmount = parseFloat(discount) || 0;
  const newBalance = balance - paymentAmount - discountAmount;

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
                <Label>Discount Amount (PKR)</Label>
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0 if no discount"
                />
              </div>

              {parseFloat(discount) > 0 && (
                <div>
                  <Label>Discount Reason *</Label>
                  <Input
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Reason for discount — required"
                  />
                  {!discountReason.trim() && <p className="text-xs text-red-500 mt-1">Required when discount &gt; 0</p>}
                </div>
              )}

              <div>
                <Label>Payment Mode *</Label>
                <Select value={paymentMode} onValueChange={v => setPaymentMode(v as any)}>
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
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-teal-600">
                      <span>Discount</span>
                      <span>- {formatPKR(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-2 border-t border-slate-100">
                    <span>New Balance</span>
                    <span className={newBalance <= 0 ? 'text-green-600' : 'text-amber-600'}>
                      {formatPKR(newBalance)}
                    </span>
                  </div>
                </div>
                {newBalance < FEE_RULES.creditGuardThreshold && (
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
                  disabled={loading || paymentAmount <= 0 || (discountAmount>0 && !discountReason.trim()) || (paymentMode==='Cheque' && !bankRef.trim())}
                >
                  {loading ? 'Saving...' : 'Save Payment'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Success */}
      {step === 'success' && selectedStudent && (
        <SuccessReceipt
          student={selectedStudent}
          paymentAmount={paymentAmount}
          discountAmount={discountAmount}
          discountReason={discountReason}
          receiptNo={receiptNo}
          paymentMode={paymentMode}
          bankRef={bankRef}
          prevBalance={balance}
          newBalance={newBalance}
          onAnother={() => { setStep('search'); setSelectedStudent(null); setAmount(''); setDiscount('0'); setDiscountReason(''); setReceiptNo(''); setNarration(''); setPaymentMode('Cash'); setBankRef(''); }}
          onDone={() => navigate('/students')}
        />
      )}
    </div>
  );
}

function SuccessReceipt(props: {
  student: StudentWithBalance;
  paymentAmount: number;
  discountAmount: number;
  discountReason: string;
  receiptNo: string;
  paymentMode: string;
  bankRef: string;
  prevBalance: number;
  newBalance: number;
  onAnother: () => void;
  onDone: () => void;
}) {
  const { student } = props;
  const paperDefault = useSettingsStore((s) => s.paperSize);
  const [size, setSize] = useState<ReceiptSize>(paperDefault);
  const institute = {
    name: useSettingsStore((s) => s.instituteName),
    address: useSettingsStore((s) => s.instituteAddress),
    phone: useSettingsStore((s) => s.institutePhone),
  };
  const userName = useAuthStore((s) => s.user?.name) ?? 'Admin';
  const subLabel = (() => { try { return getSubCourseDef(student.program).sub.label; } catch { return student.program; } })();
  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="py-6 text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-xl font-bold mb-1">Payment Recorded</h2>
          <div className="text-sm text-slate-600">
            {student.name} (SNO:{student.sno}) · {formatPKR(props.paymentAmount)}
            {props.discountAmount > 0 && <span> + Disc {formatPKR(props.discountAmount)}</span>}
            {' '}· Receipt {props.receiptNo || 'N/A'} · Balance {formatPKR(props.newBalance)}
          </div>
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
          receiptNo={props.receiptNo || 'N/A'}
          date={new Date().toISOString().split('T')[0]}
          payment={props.paymentAmount}
          discount={props.discountAmount}
          discountReason={props.discountReason}
          mode={props.paymentMode}
          bankRef={props.bankRef}
          prevBalance={props.prevBalance}
          newBalance={props.newBalance}
          receivedBy={userName}
        />
      </div>
    </div>
  );
}
