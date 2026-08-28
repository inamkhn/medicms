// ============================================
// MediCMS Desktop v4.0 - Student Profile
// Full-page quick view of a student (replaces the old right-side drawer)
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit, CreditCard, FileText, UserX, Printer, Plus, Scale, RotateCcw, IdCard, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StruckOffModal } from '@/components/shared/StruckOffModal';
import { useAuthStore, useStudentStore } from '@/stores';
import { canWrite } from '@/stores/authStore';
import { formatDate, formatCNIC, formatPKR, formatBalanceDisplay, getTermLabel } from '@/lib/utils';
import { getSubCourseDef } from '@/lib/constants';
import { INSTITUTE_INFO } from '@/lib/constants';
import { getStudentsWithBalance } from '@/lib/mockData';
import { useLedgerStore } from '@/stores';

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

  // Demanded / paid mini-summary from the ledger (live store) — selector must be stable
  const allLedger = useLedgerStore((s) => s.transactions);
  const ledger = useMemo(() => allLedger.filter((t) => t.studentSno === student.sno), [allLedger, student.sno]);
  const totalDemanded = ledger.reduce((sum, t) => sum + t.fees, 0);
  const totalPaid = ledger.reduce((sum, t) => sum + t.payment, 0);

  return (
    <div className="w-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div className="w-16 h-20 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
          {student.photoUrl ? (
            <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" />
          ) : (
            <User size={24} className="text-slate-300" />
          )}
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{student.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            SNO: {student.sno} · {subDef.course.label} — {subDef.sub.label} · {student.batch} · Session: {student.session}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <IdCard size={14} className="mr-2" />
          Print ID Card
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/ledger/${student.sno}`)}>
          <FileText size={14} className="mr-2" />
          View Ledger
        </Button>
      </div>

      {/* Printable ID Card (visible only on print) */}
      <div className="hidden print:block">
        <div className="border-2 border-slate-900 rounded-xl p-6 max-w-[400px] mx-auto text-center">
          <div className="w-24 h-28 mx-auto rounded-lg overflow-hidden border border-slate-300 bg-slate-50 flex items-center justify-center">
            {student.photoUrl ? <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" /> : <User size={32} className="text-slate-300" />}
          </div>
          <h2 className="mt-3 text-lg font-bold text-slate-900">{student.name}</h2>
          <p className="text-sm text-slate-600">S/O {student.fatherName}</p>
          <p className="mt-2 text-sm font-mono">SNO: {student.sno}</p>
          <p className="text-xs text-slate-500">{subDef.course.label} — {subDef.sub.label}</p>
          <p className="text-xs text-slate-500">{student.batch} · Session {student.session}</p>
          <p className="mt-3 text-[11px] font-semibold text-slate-700 uppercase tracking-widest">{INSTITUTE_INFO.name}</p>
          <p className="text-[11px] text-slate-500">{INSTITUTE_INFO.location}</p>
        </div>
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
                <div className="col-span-2">
                  <span className="text-slate-500">Address</span>
                  <div className="text-slate-700 mt-0.5 whitespace-pre-wrap break-words">{student.address || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">DOB</span>
                  <div className="text-slate-700 mt-0.5">{student.dob ? formatDate(student.dob) : 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Gender</span>
                  <div className="text-slate-700 mt-0.5">{student.gender || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Domicile</span>
                  <div className="text-slate-700 mt-0.5">{student.domicile || 'Not entered'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Emergency Contact</span>
                  <div className="text-slate-700 mt-0.5">{student.emergencyContact || 'Not entered'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Semester History Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Semester History</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const demandBySem = ledger.filter(t => t.type === 'Demand' && t.semester).reduce((acc, t) => {
                  const key = `${t.semester}-${t.session ?? ''}`;
                  if (!acc[key]) acc[key] = { semester: t.semester!, session: t.session, date: t.date, fees: 0, count: 0 };
                  acc[key].fees += t.fees;
                  acc[key].date = t.date < acc[key].date ? t.date : acc[key].date;
                  acc[key].count += 1;
                  return acc;
                }, {} as Record<string, { semester: string; session?: number; date: string; fees: number; count: number }>);
                const timeline = Object.values(demandBySem).sort((a,b) => parseInt(a.semester,10) - parseInt(b.semester,10));
                if (timeline.length === 0) {
                  return <div className="text-sm text-slate-400">No semester demands yet — add from ledger.</div>;
                }
                return (
                  <div className="relative pl-6 space-y-0">
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
                    {timeline.map((item, idx) => {
                      const isCurrent = item.semester === student.semester;
                      const isPast = parseInt(item.semester,10) < parseInt(student.semester,10);
                      return (
                        <div key={idx} className="relative pb-5 last:pb-0">
                          <div className={`absolute left-[-6px] top-1 w-3 h-3 rounded-full border-2 ${isCurrent ? 'bg-blue-600 border-blue-600' : isPast ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`} />
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className={`text-sm font-medium ${isCurrent ? 'text-blue-600' : 'text-slate-900'}`}>
                                {getTermLabel(subDef.course.system, item.semester)} {isCurrent && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">Current</span>}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">{item.session ? `Session ${item.session} · ` : ''}{formatDate(item.date)} · {formatPKR(item.fees)} demanded</div>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate(`/ledger/${student.sno}`)}>View</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate(`/ledger/${student.sno}/add-demand`)}>
                  <Plus size={14} className="mr-1.5" /> Add Demand
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/ledger/${student.sno}`)}>Full Ledger</Button>
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
