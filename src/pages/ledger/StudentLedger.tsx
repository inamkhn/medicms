// ============================================
// MediCMS Desktop v4.0 - Student Fee Ledger (Screen 4.1)
// ============================================

import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, CreditCard, Scale, SlidersHorizontal, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatPKR, formatDate, formatBalanceDisplay } from '@/lib/utils';
import { getSubCourseDef } from '@/lib/constants';
import { getStudentsWithBalance } from '@/lib/mockData';
import { canWrite } from '@/stores/authStore';
import { useAuthStore, useStudentStore, useLedgerStore } from '@/stores';
import type { TransactionType } from '@/types';

const TYPE_COLORS: Record<TransactionType, string> = {
  Demand: 'bg-blue-50 text-blue-600 border border-blue-100',
  Pay: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  Disc: 'bg-teal-50 text-teal-600 border border-teal-100',
  Exam: 'bg-amber-50 text-amber-600 border border-amber-100',
  CT: 'bg-purple-50 text-purple-600 border border-purple-100',
  Adj: 'bg-slate-50 text-slate-600 border border-slate-100',
  Refund: 'bg-pink-50 text-pink-600 border border-pink-100',
};

export default function StudentLedger() {
  const { sno } = useParams<{ sno: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canEdit = canWrite(user?.role);

  const students = useStudentStore((s) => s.students);
  const allStudents = getStudentsWithBalance(students);
  const student = allStudents.find(s => s.sno.toString() === sno);

  if (!student) {
    return <div className="p-8 text-center text-slate-400">Student not found (SNO: {sno})</div>;
  }

  // Get transactions for this student (live store — stable selector + memo filter)
  const allTransactions = useLedgerStore((s) => s.transactions);
  const transactions = useMemo(() => allTransactions.filter(t => t.studentSno === student.sno), [allTransactions, student.sno]);

  // Compute running balance (fees + charges - discount - payment)
  // Charges are stored as negative discount in Exam/CT transactions
  let runningBalance = 0;
  const rowsWithBalance = transactions.map(t => {
    const charge = t.discount < 0 ? Math.abs(t.discount) : 0;
    const discountOnly = t.discount > 0 ? t.discount : 0;
    runningBalance += t.fees + charge - discountOnly - t.payment;
    return { ...t, runningBalance, charge };
  });

  const totalDemanded = transactions.reduce((s, t) => s + t.fees, 0);
  const totalDiscount = transactions.reduce((s, t) => s + (t.discount > 0 ? t.discount : 0), 0);
  const totalPaid = transactions.reduce((s, t) => s + t.payment, 0);
  const totalCharges = transactions.reduce((s, t) => s + (t.discount < 0 ? Math.abs(t.discount) : 0), 0);
  const balanceDisplay = formatBalanceDisplay(student.computedBalance);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Fee Ledger</h1>
          <p className="text-sm text-slate-500 mt-1">
            {student.name} (SNO: {student.sno}) · {getSubCourseDef(student.program).course.label} — {getSubCourseDef(student.program).sub.label} · {student.batch} · Session: {student.session}
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Printer size={14} className="mr-2" />
          Print Statement
        </Button>
      </div>

      {/* Balance Summary */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Live Balance</span>
              <div className={`text-xl font-bold ${balanceDisplay.color}`}>{balanceDisplay.label}</div>
            </div>
            <div>
              <span className="text-slate-500">Total Demanded</span>
              <div className="font-semibold text-slate-900">{formatPKR(totalDemanded)}</div>
            </div>
            <div>
              <span className="text-slate-500">Discounts</span>
              <div className="font-semibold text-teal-500">{formatPKR(totalDiscount)}</div>
            </div>
            <div>
              <span className="text-slate-500">Total Paid</span>
              <div className="font-semibold text-emerald-500">{formatPKR(totalPaid)}</div>
            </div>
            <div>
              <span className="text-slate-500">Charges</span>
              <div className="font-semibold text-purple-500">{formatPKR(totalCharges)}</div>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-3">
            Computed from ledger — SUM of all rows. Never from Dues column.
          </div>
        </CardContent>
      </Card>

      {/* Ledger Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Txn</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Fees</TableHead>
              <TableHead className="text-right">Charges</TableHead>
              <TableHead className="text-right">Disc/Adj</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsWithBalance.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-400 text-sm">
                  No ledger transactions found for this student
                </TableCell>
              </TableRow>
            )}
            {rowsWithBalance.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.txnNo}</TableCell>
                <TableCell>{formatDate(t.date)}</TableCell>
                <TableCell>
                  <Badge className={TYPE_COLORS[t.type]}>{t.type}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {t.fees > 0 ? formatPKR(t.fees) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {t.charge > 0 ? <span className="text-purple-500">{formatPKR(t.charge)}</span> : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {t.discount > 0 ? <span className="text-teal-600">{formatPKR(t.discount)}</span> : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {t.payment > 0 ? <span className="text-emerald-500">{formatPKR(t.payment)}</span> : '—'}
                </TableCell>
                <TableCell className="text-right font-semibold text-slate-900">
                  {formatPKR(t.runningBalance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Actions */}
      {canEdit && (
        <div className="flex gap-3">
          <Button onClick={() => navigate(`/ledger/${student.sno}/add-demand`)}>
            <Plus size={16} className="mr-2" />
            Add Fee Demand
          </Button>
          <Button variant="outline" onClick={() => navigate(`/ledger/${student.sno}/add-charge`)}>
            <Scale size={16} className="mr-2" />
            Add Charge
          </Button>
          <Button variant="outline" onClick={() => navigate(`/ledger/${student.sno}/adjust`)}>
            <SlidersHorizontal size={16} className="mr-2" />
            Adjust
          </Button>
          <Button variant="outline" onClick={() => navigate(`/payments/record?sno=${student.sno}`)}>
            <CreditCard size={16} className="mr-2" />
            Record Payment
          </Button>
        </div>
      )}
    </div>
  );
}
