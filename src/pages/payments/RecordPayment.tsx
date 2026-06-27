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

import { formatPKR, formatBalanceDisplay } from '@/lib/utils';
import { getStudentsWithBalance } from '@/lib/mockData';
import { useAuthStore } from '@/stores';
import { FEE_RULES } from '@/lib/constants';
import type { StudentWithBalance } from '@/types';

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
  const [loading, setLoading] = useState(false);

  const students = useMemo(() => getStudentsWithBalance().filter(s => !s.isTestRecord && !s.struckOff), []);

  const searchResults = search.length >= 2
    ? students.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.sno.toString().includes(search) ||
        s.fatherName.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 5)
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
  };

  const handleSubmit = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setStep('success');
    setLoading(false);
  };

  const balance = selectedStudent?.computedBalance ?? 0;
  const paymentAmount = parseFloat(amount) || 0;
  const discountAmount = parseFloat(discount) || 0;
  const newBalance = balance - paymentAmount - discountAmount;

  return (
    <div className="w-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Record Cash Payment</h1>
          <p className="text-sm text-slate-500">Ctrl+P shortcut</p>
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
                          {student.program} · {student.batch}
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
                <div><span className="text-slate-500">Program:</span> {selectedStudent.program}</div>
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
                  <Label>Discount Reason</Label>
                  <Input
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Reason for discount"
                  />
                </div>
              )}

              <div>
                <Label>Receipt Number</Label>
                <Input
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  placeholder="From paper receipt book"
                />
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
                    ⚠ Over-payment guard: balance cannot go below {formatPKR(Math.abs(FEE_RULES.creditGuardThreshold))} without Principal approval.
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('confirm')}>
                  ← Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading || paymentAmount <= 0 || newBalance < FEE_RULES.creditGuardThreshold}
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
        <Card>
          <CardContent className="py-8 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-xl font-bold mb-2">Payment Recorded</h2>
            <div className="space-y-1 text-sm text-slate-600 mb-6">
              <div>Student: {selectedStudent.name} (SNO: {selectedStudent.sno})</div>
              <div>Amount Paid: {formatPKR(paymentAmount)}</div>
              {discountAmount > 0 && <div>Discount: {formatPKR(discountAmount)}</div>}
              <div>Receipt: {receiptNo || 'N/A'}</div>
              <div className="font-medium text-green-600">
                New Balance: {formatPKR(newBalance)}
              </div>
            </div>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => { setStep('search'); setSelectedStudent(null); }}>
                Record Another
              </Button>
              <Button variant="outline">
                <Printer size={16} className="mr-1" />
                Print Receipt
              </Button>
              <Button onClick={() => navigate('/students')}>
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
