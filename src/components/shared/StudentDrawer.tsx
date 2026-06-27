// ============================================
// MediCMS Desktop v4.0 - Student Drawer
// ============================================

import { useState } from 'react';
import { X, Edit, CreditCard, FileText, UserX, Printer, Plus, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores';
import { formatDate, formatCNIC, formatBalanceDisplay } from '@/lib/utils';
import { canWrite } from '@/stores/authStore';
import { StruckOffModal } from './StruckOffModal';
import type { StudentWithBalance } from '@/types';

interface Props {
  student: StudentWithBalance;
  onClose: () => void;
}

export function StudentDrawer({ student, onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canEdit = canWrite(user?.role);
  const [showStruckOff, setShowStruckOff] = useState(false);
  
  const balanceDisplay = formatBalanceDisplay(student.computedBalance);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/10 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[380px] bg-white shadow-2xl shadow-slate-200/50 z-50 flex flex-col rounded-l-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100/60">
          <div>
            <h2 className="font-semibold text-lg text-slate-900">{student.name}</h2>
            <div className="text-sm text-slate-500 mt-0.5">SNO: {student.sno}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded-full p-1.5 hover:bg-slate-100 transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Program Info */}
          <div className="text-sm space-y-2.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Program</span>
              <span className="font-medium text-slate-900">{student.program}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Batch</span>
              <span className="text-slate-700">{student.batch}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Session</span>
              <span className="text-slate-700">{student.session}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Semester</span>
              <span className="text-slate-700">{student.semester}</span>
            </div>
          </div>

          {/* Contact Info */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2.5 px-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Father</span>
                <span className="text-slate-700">{student.fatherName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Contact</span>
                <span className="text-slate-700">{student.contact || 'Not entered'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CNIC</span>
                <span className="text-slate-700">{formatCNIC(student.cnic)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Address</span>
                <span className="text-right text-slate-700">{student.address || 'Not entered'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reg Date</span>
                <span className="text-slate-700">{formatDate(student.regDate)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Balance */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Live Balance</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <div className={`text-2xl font-bold ${balanceDisplay.color}`}>
                {balanceDisplay.label}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Computed from ledger — never from Dues column
              </div>
            </CardContent>
          </Card>

          {/* Status */}
          {student.struckOff && (
            <div className="bg-red-50/80 border border-red-100 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-600">
                <UserX size={16} />
                <span className="font-medium text-sm">Struck Off</span>
              </div>
              {student.struckOffDate && (
                <div className="text-sm text-red-500 mt-1.5">
                  Date: {formatDate(student.struckOffDate)}
                </div>
              )}
              {student.struckOffReason && (
                <div className="text-sm text-red-500">
                  Reason: {student.struckOffReason}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-slate-100/60 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="outline" size="sm" onClick={() => navigate(`/ledger/${student.sno}`)}>
              <FileText size={14} className="mr-1.5" />
              View Ledger
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/payments/record?sno=${student.sno}`)}>
              <CreditCard size={14} className="mr-1.5" />
              Record Payment
            </Button>
          </div>
          
          {canEdit && (
            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="outline" size="sm" onClick={() => navigate(`/students/${student.sno}/edit`)}>
                <Edit size={14} className="mr-1.5" />
                Edit Info
              </Button>
              <Button variant="outline" size="sm">
                <Printer size={14} className="mr-1.5" />
                Print Statement
              </Button>
            </div>
          )}
          
          {canEdit && !student.struckOff && (
            <Button variant="destructive" size="sm" className="w-full" onClick={() => setShowStruckOff(true)}>
              <UserX size={14} className="mr-1.5" />
              Mark as Struck Off
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
        </div>

        {/* Struck Off Modal */}
        {showStruckOff && (
          <StruckOffModal
            student={student}
            onClose={() => setShowStruckOff(false)}
            onConfirm={() => {
              setShowStruckOff(false);
              onClose();
            }}
          />
        )}
      </div>
    </>
  );
}
