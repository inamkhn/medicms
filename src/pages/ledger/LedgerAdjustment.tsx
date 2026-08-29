// ============================================
// MediCMS Desktop v4.0 - Ledger Adjustment (Screen 4.4)
// ============================================

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ADJUSTMENT_TYPES } from '@/lib/constants';
import { formatPKR, formatBalanceDisplay } from '@/lib/utils';
import { getStudentsWithBalance } from '@/lib/mockData';
import { useStudentStore, useLedgerStore, getNextTxnNo, useAuditStore, useAuthStore, useApprovalStore } from '@/stores';
import { ADJUSTMENT_APPROVAL_THRESHOLD } from '@/stores/approvalStore';
import type { LedgerTransaction } from '@/types';

export default function LedgerAdjustment() {
  const { sno } = useParams<{ sno: string }>();
  const navigate = useNavigate();

  const storeStudents = useStudentStore(s => s.students);
  const student = getStudentsWithBalance(storeStudents).find(s => s.sno.toString() === sno);
  const [adjType, setAdjType] = useState('');
  const [amount, setAmount] = useState('');
  const [effect, setEffect] = useState<'reduce' | 'increase'>('reduce');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!student) {
    return <div className="p-8 text-center text-slate-400">Student not found (SNO: {sno})</div>;
  }

  const adjAmount = parseFloat(amount) || 0;
  const balanceDisplay = formatBalanceDisplay(student.computedBalance);
  const newBalance = effect === 'reduce'
    ? student.computedBalance - adjAmount
    : student.computedBalance + adjAmount;

  const handleSubmit = async () => {
    if (adjAmount <= 0 || !adjType || !reason.trim()) return;
    const user = useAuthStore.getState().user;
    if (adjAmount > ADJUSTMENT_APPROVAL_THRESHOLD && user?.role !== 'Principal') {
      useApprovalStore.getState().addRequest({
        type: 'Adjustment',
        studentSno: student.sno,
        studentName: student.name,
        amount: adjAmount,
        reason: reason.trim(),
        details: `${ADJUSTMENT_TYPES.find(a=>a.value===adjType)?.label ?? adjType} · ${formatPKR(adjAmount)} ${effect === 'reduce' ? 'reduce' : 'increase'}${reference ? ` · Ref ${reference}` : ''} — ${reason.trim()}`,
        requestedBy: user?.name ?? 'Admin',
        payload: { adjType, adjAmount, effect, reference, reason: reason.trim() },
      });
      alert(`Amount exceeds PKR ${ADJUSTMENT_APPROVAL_THRESHOLD.toLocaleString()} — sent for Principal approval.`);
      return;
    }
    if (adjAmount > ADJUSTMENT_APPROVAL_THRESHOLD && user?.role === 'Principal') {
      const ok = window.confirm(`Amount ${formatPKR(adjAmount)} exceeds threshold — Principal approval. Confirm posting?`);
      if (!ok) return;
    }
    setLoading(true);
    const nextTxn = getNextTxnNo(useLedgerStore.getState().transactions, student.sno);
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const adjLabel = ADJUSTMENT_TYPES.find(a=>a.value===adjType)?.label ?? adjType;
    // reduce balance => discount positive; increase => charge (negative discount)
    const isReduce = effect === 'reduce';
    const tx: LedgerTransaction = {
      id: `tx-${student.sno}-${nextTxn}-${Date.now()}`,
      studentSno: student.sno,
      txnNo: nextTxn,
      date: new Date().toISOString().split('T')[0],
      type: 'Adj',
      fees: 0,
      discount: isReduce ? adjAmount : -adjAmount,
      payment: 0,
      receiptNo: null,
      receivedBy: userName,
      narration: `${adjLabel}${reference ? ` (Ref Txn#${reference})` : ''} — ${reason.trim()}`,
      createdAt: new Date().toISOString(),
      createdBy: userName,
      synced: false,
    };
    useLedgerStore.getState().addTransaction(tx);
    useAuditStore.getState().addLog({ user: userName, action: 'Ledger Adjustment', studentSno: student.sno, details: `${adjLabel} · ${formatPKR(adjAmount)} ${isReduce ? 'reduce' : 'increase'}${reference ? ` · Ref ${reference}` : ''} — ${reason.trim()}` });
    setLoading(false);
    navigate(`/ledger/${student.sno}`);
  };

  return (
    <div className="w-auto space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Ledger Adjustment</h1>
          <p className="text-sm text-slate-500 mt-1">
            {student.name} (SNO: {student.sno})
          </p>
        </div>
      </div>

      {/* Current Balance */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="py-5 flex justify-between items-center">
          <span className="text-blue-600 text-sm font-medium">Current Balance</span>
          <span className={`text-xl font-bold ${balanceDisplay.color}`}>{balanceDisplay.label}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adjustment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Adjustment Type */}
          <div>
            <Label>Adjustment Type *</Label>
            <div className="space-y-2 mt-2">
              {ADJUSTMENT_TYPES.map(at => (
                <label key={at.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="adjType"
                    value={at.value}
                    checked={adjType === at.value}
                    onChange={(e) => setAdjType(e.target.value)}
                    className="accent-blue-500 w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">{at.label}</span>
                </label>
              ))}
            </div>
            {!adjType && <p className="text-xs text-red-500 mt-1">Select adjustment type</p>}
          </div>

          {/* Amount */}
          <div>
            <Label>Adjustment Amount (PKR) *</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Effect */}
          <div>
            <Label>Effect</Label>
            <div className="flex gap-6 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={effect === 'reduce'}
                  onChange={() => setEffect('reduce')}
                  className="accent-emerald-500 w-4 h-4"
                />
                <span className="text-sm text-slate-700">Reduces balance</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={effect === 'increase'}
                  onChange={() => setEffect('increase')}
                  className="accent-red-500 w-4 h-4"
                />
                <span className="text-sm text-slate-700">Increases balance</span>
              </label>
            </div>
          </div>

          {/* Reference */}
          <div>
            <Label>Reference (original wrong ledger row Txn#)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
            />
          </div>

          {/* Reason (mandatory) */}
          <div>
            <Label>Reason * (mandatory)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Credit refund, wrong entry reversal"
            />
            {!reason.trim() && (
              <p className="text-xs text-red-500 mt-1">Reason is required</p>
            )}
          </div>

          {/* Approved by */}
          <div className="text-sm text-slate-500">
            Approved by: <strong className="text-slate-700">Admin Khalid</strong>
            {adjAmount > 5000 && (
              <span className="text-amber-500 ml-2">(Principal required if &gt; 5,000)</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {adjAmount > 0 && (
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="py-5">
            <div className="text-sm text-blue-600 font-medium mb-3">Preview:</div>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>Current balance</span>
                <span>{formatPKR(student.computedBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span>Adjustment ({effect === 'reduce' ? '−' : '+'})</span>
                <span>{formatPKR(adjAmount)}</span>
              </div>
              <div className="flex justify-between font-bold pt-3 border-t border-slate-100">
                <span>After adjustment</span>
                <span className={newBalance <= 0 ? 'text-emerald-500' : 'text-amber-500'}>
                  {formatPKR(newBalance)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading || adjAmount <= 0 || !reason.trim() || !adjType}>
          {loading ? 'Saving...' : 'Save Adjustment Entry'}
        </Button>
      </div>
    </div>
  );
}
