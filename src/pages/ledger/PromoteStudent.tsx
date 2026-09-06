// ============================================
// MediCMS - Promote Student (single)
// Next term + default promotion fee (locked recurring)
// ============================================

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSubCourseDef } from '@/lib/constants';
import { formatPKR, getTermLabel } from '@/lib/utils';
import { getNextTerm, getPromotionFee } from '@/lib/promotion';
import { getStudentsWithBalance } from '@/lib/mockData';
import { useStudentStore, useLedgerStore, getNextTxnNo, useAuditStore, useAuthStore } from '@/stores';
import type { LedgerTransaction } from '@/types';

export default function PromoteStudent() {
  const { sno } = useParams<{ sno: string }>();
  const navigate = useNavigate();
  const students = useStudentStore((s) => s.students);
  const student = getStudentsWithBalance(students).find((s) => s.sno.toString() === sno);

  const [session, setSession] = useState(() => String(student?.session ?? new Date().getFullYear()));
  const [narration, setNarration] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!student) {
    return <div className="p-8 text-center text-slate-400">Student not found (SNO: {sno})</div>;
  }

  const subDef = getSubCourseDef(student.program);
  const nextTerm = getNextTerm(student.program, student.semester);
  const defaultFee = getPromotionFee(student);
  const [amount, setAmount] = useState<string | null>(null);
  const fee = amount === null ? defaultFee : parseFloat(amount) || 0;

  if (!nextTerm) {
    return (
      <div className="w-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold">Promote Student</h1>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-slate-500 text-sm">
            {student.name} is already in the final term ({getTermLabel(subDef.course.system, student.semester)}). No further promotion.
          </CardContent>
        </Card>
      </div>
    );
  }

  const handlePromote = () => {
    setError('');
    if (fee <= 0) {
      setError('Promotion fee must be greater than 0.');
      return;
    }
    const allTx = useLedgerStore.getState().transactions;
    const duplicate = allTx.some(
      (t) =>
        t.studentSno === student.sno &&
        t.type === 'Demand' &&
        t.semester === nextTerm &&
        String(t.session) === String(session)
    );
    if (duplicate) {
      setError(`Demand already exists for ${getTermLabel(subDef.course.system, nextTerm)} — Session ${session}.`);
      return;
    }
    setLoading(true);
    const nextTxn = getNextTxnNo(allTx, student.sno);
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const tx: LedgerTransaction = {
      id: `tx-${student.sno}-${nextTxn}-${Date.now()}`,
      studentSno: student.sno,
      txnNo: nextTxn,
      date: new Date().toISOString().split('T')[0],
      type: 'Demand',
      semester: nextTerm,
      session: parseInt(session, 10) || undefined,
      fees: fee,
      discount: 0,
      payment: 0,
      receiptNo: null,
      receivedBy: null,
      narration: narration.trim() || `Promotion to ${getTermLabel(subDef.course.system, nextTerm)} — default recurring fee`,
      createdAt: new Date().toISOString(),
      createdBy: userName,
      synced: false,
    };
    useLedgerStore.getState().addTransaction(tx);
    useStudentStore.getState().updateStudent(student.sno, { semester: nextTerm, session: parseInt(session, 10) || student.session });
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Fee Demand',
      studentSno: student.sno,
      details: `Promoted to ${getTermLabel(subDef.course.system, nextTerm)} · Session ${session} · ${formatPKR(fee)}`,
    });
    setLoading(false);
    navigate(`/ledger/${student.sno}`);
  };

  return (
    <div className="w-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Promote Student</h1>
          <p className="text-sm text-slate-500">
            {student.name} (SNO: {student.sno}) · {subDef.course.label} — {subDef.sub.label}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {getTermLabel(subDef.course.system, student.semester)} → {getTermLabel(subDef.course.system, nextTerm)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm bg-blue-50 border border-blue-100 rounded-xl p-3">
            Default promotion fee (locked recurring): <strong>{formatPKR(defaultFee)}</strong>
            {typeof student.baseFeeRecurring === 'number' && (
              <span className="text-blue-600"> · locked at admission (full Sem-1 was {formatPKR(student.baseFeeTotal ?? 0)})</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Promotion fee (PKR) *</Label>
              <Input
                type="number"
                value={amount === null ? String(defaultFee) : amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">Editable if needed — defaults to locked recurring fee</p>
            </div>
            <div>
              <Label>Session *</Label>
              <Input value={session} onChange={(e) => setSession(e.target.value)} placeholder="e.g. 2026" />
            </div>
          </div>
          <div>
            <Label>Narration</Label>
            <Input
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Auto-filled — editable"
            />
          </div>
          {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{error}</div>}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handlePromote} disabled={loading || fee <= 0}>
          {loading ? 'Promoting...' : `Promote + Demand ${formatPKR(fee)}`}
        </Button>
      </div>
    </div>
  );
}
