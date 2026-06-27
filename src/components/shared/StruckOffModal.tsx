// ============================================
// MediCMS Desktop v4.0 - Struck Off Modal (Screen 3.3)
// ============================================

import { useState } from 'react';
import { UserX, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STRUCK_OFF_REASONS } from '@/lib/constants';
import { formatPKR } from '@/lib/utils';
import type { StudentWithBalance } from '@/types';

interface Props {
  student: StudentWithBalance;
  onClose: () => void;
  onConfirm: (reason: string, details: string, date: string) => void;
}

export function StruckOffModal({ student, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!reason) return;
    setLoading(true);
    // Simulate save
    await new Promise(r => setTimeout(r, 800));
    onConfirm(reason, details, date);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl shadow-slate-200/50 w-full max-w-lg border border-slate-100/60">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-100/60">
          <div className="p-2.5 bg-red-50 rounded-xl">
            <UserX size={20} className="text-red-500" />
          </div>
          <div>
            <h2 className="font-semibold text-lg text-slate-900">Mark as Struck Off</h2>
            <p className="text-sm text-slate-500">
              {student.name} (SNO: {student.sno})
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Current balance warning */}
          {student.computedBalance > 0 && (
            <div className="bg-amber-50/80 border border-amber-100 rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle size={16} />
                <span className="text-sm font-medium">
                  Current balance: {formatPKR(student.computedBalance)} outstanding
                </span>
              </div>
              <p className="text-sm text-amber-500 mt-1.5">
                This student has unpaid dues. They will appear in the
                "Struck Off with Dues" report for collection follow-up.
              </p>
            </div>
          )}

          {/* Reason */}
          <div>
            <Label>Reason *</Label>
            <div className="space-y-2.5 mt-3">
              {STRUCK_OFF_REASONS.map((r) => (
                <label key={r} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="struckOffReason"
                    value={r}
                    checked={reason === r}
                    onChange={(e) => setReason(e.target.value)}
                    className="accent-red-500 w-4 h-4"
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">{r}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Details */}
          <div>
            <Label>Details</Label>
            <Input
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Additional details (optional)"
              className="mt-2"
            />
          </div>

          {/* Date */}
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-2"
            />
            <p className="text-xs text-slate-400 mt-1.5">Today's date (editable)</p>
          </div>

          {/* Auto-filled admin */}
          <div className="text-sm text-slate-500">
            By: <strong className="text-slate-700">Admin Khalid</strong> (auto-filled, locked)
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 p-5 border-t border-slate-100/60">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || !reason}
          >
            {loading ? 'Processing...' : 'Confirm Struck Off'}
          </Button>
        </div>
      </div>
    </div>
  );
}
