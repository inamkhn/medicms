// ============================================
// MediCMS Desktop v4.0 - Student Profile
// Full-page quick view of a student (replaces the old right-side drawer)
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit, CreditCard, FileText, UserX, Printer, Plus, Scale, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StruckOffModal } from '@/components/shared/StruckOffModal';
import { useAuthStore, useStudentStore } from '@/stores';
import { canWrite } from '@/stores/authStore';
import { formatDate, formatCNIC, formatPKR, formatBalanceDisplay, getTermLabel } from '@/lib/utils';
import { getSubCourseDef } from '@/lib/constants';
import { getStudentsWithBalance, MOCK_LEDGER } from '@/lib/mockData';

export default function StudentProfile() {
  const navigate = useNavigate();
  const { sno } = useParams<{ sno: string }>();
  const { user } = useAuthStore();
  const canEdit = canWrite(user?.role);
  const [modalMode, setModalMode] = useState<'strike' | 'reverse' | null>(null);

  const students = useStudentStore((s) => s.students);
  const student = getStudentsWithBalance(students).find((s) => s.sno.toString() === sno);

  // Esc navigates back (modal closes first when open)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modalMode) {
        setModalMode(null);
      } else {
        navigate(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalMode, navigate]);

  if (!student) {
    return (
      <div className="p-8 text-center text-slate-400">
        Student not found (SNO: {sno})
      </div>
    );
  }

  const subDef = getSubCourseDef(student.program);
  const termNoun = subDef.course.system === 'annual' ? 'Year' : subDef.course.system === 'months' ? 'Term' : 'Semester';
  const balanceDisplay = formatBalanceDisplay(student.computedBalance);

  // Demanded / paid mini-summary from the ledger
  const ledger = MOCK_LEDGER.filter((t) => t.studentSno === student.sno);
  const totalDemanded = ledger.reduce((sum, t) => sum + t.fees, 0);
  const totalPaid = ledger.reduce((sum, t) => sum + t.payment, 0);

  return (
    <div className="w-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{student.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            SNO: {student.sno} · {subDef.course.label} — {subDef.sub.label} · {student.batch} · Session: {student.session}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(`/ledger/${student.sno}`)}>
          <FileText size={14} className="mr-2" />
          View Ledger
        </Button>
      </div>

      {/* Struck off banner */}
      {student.struckOff && (
        <div className="flex items-center gap-3 bg-red-50/80 border border-red-100 rounded-xl p-4">
          <UserX size={18} className="text-red-500 shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-red-600">Struck Off</div>
            <div className="text-red-500 mt-0.5">
              {student.struckOffDate && <>on {formatDate(student.struckOffDate)}</>}
              {student.struckOffReason && <> — {student.struckOffReason}</>}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Program Info */}
          <Card>
            <CardHeader>
              <CardTitle>Program & Registration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Course</span>
                  <div className="font-medium text-slate-900 mt-0.5">{subDef.course.label}</div>
                </div>
                <div>
                  <span className="text-slate-500">Program</span>
                  <div className="font-medium text-slate-900 mt-0.5">{subDef.sub.label}</div>
                </div>
                <div>
                  <span className="text-slate-500">Batch</span>
                  <div className="text-slate-700 mt-0.5">{student.batch}</div>
                </div>
                <div>
                  <span className="text-slate-500">Session</span>
                  <div className="text-slate-700 mt-0.5">{student.session}</div>
                </div>
                <div>
                  <span className="text-slate-500">{termNoun}</span>
                  <div className="text-slate-700 mt-0.5">{getTermLabel(subDef.course.system, student.semester)}</div>
                </div>
                <div>
                  <span className="text-slate-500">Reg Date</span>
                  <div className="text-slate-700 mt-0.5">{formatDate(student.regDate)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Father</span>
                  <div className="font-medium text-slate-900 mt-0.5">{student.fatherName}</div>
                </div>
                <div>
                  <span className="text-slate-500">Contact</span>
                  <div className="text-slate-700 mt-0.5">{student.contact || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">CNIC</span>
                  <div className="text-slate-700 mt-0.5">{formatCNIC(student.cnic)}</div>
                </div>
                <div>
                  <span className="text-slate-500">Address</span>
                  <div className="text-slate-700 mt-0.5">{student.address || 'Not entered'}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: balance + actions */}
        <div className="space-y-6">
          {/* Live Balance */}
          <Card>
            <CardHeader>
              <CardTitle>Live Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${balanceDisplay.color}`}>
                {balanceDisplay.label}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                <div>
                  <span className="text-xs text-slate-400">Demanded</span>
                  <div className="text-sm font-semibold text-slate-700 mt-0.5">{formatPKR(totalDemanded)}</div>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Paid</span>
                  <div className="text-sm font-semibold text-emerald-600 mt-0.5">{formatPKR(totalPaid)}</div>
                </div>
              </div>
              <div className="text-xs text-slate-400 mt-3">
                Computed from ledger — never from Dues column
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/payments/record?sno=${student.sno}`)}>
                <CreditCard size={14} className="mr-1.5" />
                Record Payment
              </Button>

              {canEdit && (
                <div className="grid grid-cols-2 gap-2.5">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/students/${student.sno}/edit`)}>
                    <Edit size={14} className="mr-1.5" />
                    Edit Info
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/ledger/${student.sno}`)}>
                    <Printer size={14} className="mr-1.5" />
                    Print Statement
                  </Button>
                </div>
              )}

              {canEdit && !student.struckOff && (
                <Button variant="destructive" size="sm" className="w-full" onClick={() => setModalMode('strike')}>
                  <UserX size={14} className="mr-1.5" />
                  Mark as Struck Off
                </Button>
              )}

              {canEdit && student.struckOff && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  onClick={() => setModalMode('reverse')}
                >
                  <RotateCcw size={14} className="mr-1.5" />
                  Reverse Struck Off
                </Button>
              )}

              {canEdit && (
                <div className="grid grid-cols-2 gap-2.5">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/ledger/${student.sno}/add-demand`)}>
                    <Plus size={14} className="mr-1.5" />
                    Add Fee Demand
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/ledger/${student.sno}/add-charge`)}>
                    <Scale size={14} className="mr-1.5" />
                    Add Charge
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Struck Off Modal */}
      {modalMode && (
        <StruckOffModal
          student={student}
          mode={modalMode}
          onClose={() => setModalMode(null)}
        />
      )}
    </div>
  );
}
