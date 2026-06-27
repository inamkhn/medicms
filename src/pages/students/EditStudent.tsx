// ============================================
// MediCMS Desktop v4.0 - Edit Student (Screen 3.7)
// ============================================

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SEMESTER_OPTIONS } from '@/lib/constants';
import { getStudentsWithBalance } from '@/lib/mockData';
import type { Semester } from '@/types';

export default function EditStudent() {
  const navigate = useNavigate();
  const { sno } = useParams<{ sno: string }>();

  const allStudents = getStudentsWithBalance();
  const student = allStudents.find(s => s.sno.toString() === sno);

  const [formData, setFormData] = useState({
    name: student?.name ?? '',
    fatherName: student?.fatherName ?? '',
    contact: student?.contact ?? '',
    cnic: student?.cnic ?? '',
    address: student?.address ?? '',
    semester: student?.semester ?? '1st',
  });
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!student) {
    return (
      <div className="p-8 text-center text-slate-400">
        Student not found (SNO: {sno})
      </div>
    );
  }

  const handleSave = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    setSaved(true);
    setTimeout(() => navigate(-1), 1500);
  };

  return (
    <div className="w-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Edit Student</h1>
          <p className="text-sm text-slate-500 mt-1">
            {student.name} (SNO: {student.sno})
          </p>
        </div>
      </div>

      {/* Audit notice */}
      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm text-blue-600">
        All changes are logged in Audit Trail with before/after values
      </div>

      {saved && (
        <div className="bg-emerald-50/80 border border-emerald-100 rounded-xl p-4 text-sm text-emerald-600">
          Changes saved successfully. Redirecting...
        </div>
      )}

      {/* Editable Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Editable Fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="fatherName">Father Name</Label>
            <Input
              id="fatherName"
              value={formData.fatherName}
              onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="contact">Contact</Label>
            <Input
              id="contact"
              value={formData.contact}
              onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
              placeholder="+92..."
            />
          </div>
          <div>
            <Label htmlFor="cnic">CNIC</Label>
            <Input
              id="cnic"
              value={formData.cnic}
              onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
              placeholder="Currently: Not entered"
            />
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Locked Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock size={16} className="text-slate-400" />
            Locked Fields
          </CardTitle>
          <CardDescription>
            Set at admission — contact admin if wrong. To change program, use Student Transfer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Program</span>
              <div className="font-medium text-slate-900">{student.program}</div>
            </div>
            <div>
              <span className="text-slate-500">Batch</span>
              <div className="font-medium text-slate-900">{student.batch}</div>
            </div>
            <div>
              <span className="text-slate-500">Session</span>
              <div className="font-medium text-slate-900">{student.session}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Semester Update */}
      <Card>
        <CardHeader>
          <CardTitle>Semester</CardTitle>
          <CardDescription>Update for correction only</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Current stored semester</span>
              <div>{student.semester}</div>
            </div>
            <div>
              <span className="text-slate-500">Derived from ledger</span>
              <div className="text-blue-500 font-medium">3rd — recommended</div>
            </div>
          </div>
          <div>
            <Label>Update to</Label>
            <Select
              value={formData.semester}
              onValueChange={(v) => setFormData({ ...formData, semester: v as Semester })}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEMESTER_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reason (mandatory) */}
      <Card>
        <CardHeader>
          <CardTitle>Reason for Edit *</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Correcting phone number — old number unreachable"
          />
          {!reason.trim() && (
            <p className="text-xs text-red-500 mt-1">Reason is required for audit trail</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={loading || !reason.trim()}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
