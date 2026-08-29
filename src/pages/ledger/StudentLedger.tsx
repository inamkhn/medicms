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
  const liveBalance = totalDemanded + totalCharges - totalDiscount - totalPaid;
  const balanceDisplay = formatBalanceDisplay(liveBalance);

  return (
    <div className="space-y-3">
      {/* Header — compact */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[14px] font-bold text-slate-900 tracking-tight">Fee Ledger — {student.name}</h1>
          <p className="text-[11px] text-slate-500 truncate">
            SNO:{student.sno} · {getSubCourseDef(student.program).course.label}—{getSubCourseDef(student.program).sub.label} · {student.batch} · {student.session} · <span className={balanceDisplay.color}>{balanceDisplay.label}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-[12px] print:hidden" onClick={() => window.print()}>
          <Printer size={12} className="mr-1.5" />
          Print
        </Button>
      </div>

      {/* Balance Summary — compact single row */}
      <Card>
        <CardContent className="py-2.5">
          <div className="grid grid-cols-5 gap-2 text-[11px]">
            <div>
              <div className="text-slate-500 uppercase tracking-wide text-[10px]">Live Balance</div>
              <div className={`text-[13px] font-bold ${balanceDisplay.color}`}>{balanceDisplay.label}</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wide text-[10px]">Demanded</div>
              <div className="font-semibold text-slate-900 text-[12px]">{formatPKR(totalDemanded)}</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wide text-[10px]">Discounts</div>
              <div className="font-semibold text-teal-600 text-[12px]">{formatPKR(totalDiscount)}</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wide text-[10px]">Paid</div>
              <div className="font-semibold text-emerald-600 text-[12px]">{formatPKR(totalPaid)}</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wide text-[10px]">Charges</div>
              <div className="font-semibold text-purple-600 text-[12px]">{formatPKR(totalCharges)}</div>
            </div>
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

      {/* Actions — compact toolbar */}
      {canEdit && (
        <div className="flex gap-1.5 print:hidden">
          <Button size="sm" className="h-7 text-[12px]" onClick={() => navigate(`/ledger/${student.sno}/add-demand`)}>
            <Plus size={12} className="mr-1.5" />
            Demand
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => navigate(`/ledger/${student.sno}/add-charge`)}>
            <Scale size={12} className="mr-1.5" />
            Charge
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => navigate(`/ledger/${student.sno}/adjust`)}>
            <SlidersHorizontal size={12} className="mr-1.5" />
            Adjust
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => navigate(`/payments/record?sno=${student.sno}`)}>
            <CreditCard size={12} className="mr-1.5" />
            Payment
          </Button>
        </div>
      )}
    </div>
  );
}
