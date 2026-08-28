// ============================================
// MediCMS Desktop v4.0 - Edit Student (Screen 3.7)
// ============================================

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, Upload, X, User } from 'lucide-react';
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
import { getSubCourseDef } from '@/lib/constants';
import { getStudentsWithBalance } from '@/lib/mockData';
import { getTermLabel, formatCNIC, normalizeCNIC, isValidCNIC, isValidContact, normalizeContact } from '@/lib/utils';
import { useStudentStore, useLedgerStore, useAuditStore, useAuthStore } from '@/stores';
import type { Semester } from '@/types';

export default function EditStudent() {
  const navigate = useNavigate();
  const { sno } = useParams<{ sno: string }>();

  const students = useStudentStore((s) => s.students);
  const updateStudent = useStudentStore((s) => s.updateStudent);
  const allStudents = getStudentsWithBalance(students);
  const student = allStudents.find(s => s.sno.toString() === sno);

  const [formData, setFormData] = useState({
    name: student?.name ?? '',
    fatherName: student?.fatherName ?? '',
    contact: student?.contact ?? '',
    cnic: student?.cnic ?? '',
    address: student?.address ?? '',
    semester: student?.semester ?? '1st',
    photoUrl: student?.photoUrl ?? null as string | null,
    dob: student?.dob ?? '',
    gender: (student?.gender ?? '') as '' | 'Male' | 'Female' | 'Other',
    domicile: student?.domicile ?? '',
    emergencyContact: student?.emergencyContact ?? '',
  });
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);

  if (!student) {
    return (
      <div className="p-8 text-center text-slate-400">
        Student not found (SNO: {sno})
      </div>
    );
  }

  const subDef = getSubCourseDef(student.program);
  const termNoun = subDef.course.system === 'annual' ? 'Year' : subDef.course.system === 'months' ? 'Term' : 'Semester';

  // Derived semester: max Demand semester in the ledger for this student (live store)
  const ledgerTx = useLedgerStore((s) => s.transactions);
  const demandSemesters = ledgerTx
    .filter(t => t.studentSno === student.sno && t.type === 'Demand' && t.semester)
    .map(t => t.semester as Semester);
  const derivedSemester: Semester = demandSemesters.length > 0
    ? demandSemesters.reduce((max, s) => (parseInt(s, 10) > parseInt(max, 10) ? s : max))
    : student.semester;

  // Dirty detection: compare the form against the stored student
  const isDirty =
    formData.name !== student.name ||
    formData.fatherName !== student.fatherName ||
    formData.contact !== (student.contact ?? '') ||
    formData.cnic !== (student.cnic ?? '') ||
    formData.address !== (student.address ?? '') ||
    formData.semester !== student.semester ||
    formData.photoUrl !== (student.photoUrl ?? null) ||
    (formData.dob || '') !== (student.dob ?? '') ||
    (formData.gender || '') !== (student.gender ?? '') ||
    formData.domicile !== (student.domicile ?? '') ||
    formData.emergencyContact !== (student.emergencyContact ?? '');

  const normalizedCnicPreview = normalizeCNIC(formData.cnic);
  const cnicValid = normalizedCnicPreview === null || isValidCNIC(normalizedCnicPreview);
  const contactValid = isValidContact(formData.contact);
  const emergencyValid = isValidContact(formData.emergencyContact);
  const dobValid = !formData.dob || new Date(formData.dob) <= new Date();
  const nameFilled = formData.name.trim() !== '' && formData.fatherName.trim() !== '';
  const canSave = isDirty && nameFilled && reason.trim() !== '' && cnicValid && contactValid && emergencyValid && dobValid;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) { alert('Photo must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setFormData(prev => ({ ...prev, photoUrl: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!canSave) return;
    const normalizedCnic = normalizeCNIC(formData.cnic);
    const normalizedContact = normalizeContact(formData.contact);
    const normalizedEmergency = normalizeContact(formData.emergencyContact);
    // Build audit changes before patch
    const changes: { field: string; before: string; after: string }[] = [];
    if (formData.name.trim() !== student.name) changes.push({ field: 'Name', before: student.name, after: formData.name.trim() });
    if (formData.fatherName.trim() !== student.fatherName) changes.push({ field: 'Father Name', before: student.fatherName, after: formData.fatherName.trim() });
    if ((normalizedContact ?? '—') !== (student.contact ?? '—')) changes.push({ field: 'Contact', before: student.contact ?? '—', after: normalizedContact ?? '—' });
    if ((normalizedCnic ?? '—') !== (student.cnic ?? '—')) changes.push({ field: 'CNIC', before: student.cnic ? formatCNIC(student.cnic) : '—', after: normalizedCnic ? formatCNIC(normalizedCnic) : '—' });
    if ((formData.address.trim() || null) !== student.address) changes.push({ field: 'Address', before: student.address ?? '—', after: formData.address.trim() || '—' });
    if (formData.semester !== student.semester) changes.push({ field: 'Semester', before: getTermLabel(subDef.course.system, student.semester), after: getTermLabel(subDef.course.system, formData.semester) });
    if ((formData.photoUrl ?? '—') !== (student.photoUrl ?? '—')) changes.push({ field: 'Photo', before: student.photoUrl ? 'Has photo' : 'No photo', after: formData.photoUrl ? 'Updated photo' : 'Removed photo' });
    if ((formData.dob || '—') !== (student.dob ?? '—')) changes.push({ field: 'DOB', before: student.dob ?? '—', after: formData.dob || '—' });
    if ((formData.gender || '—') !== (student.gender ?? '—')) changes.push({ field: 'Gender', before: student.gender ?? '—', after: formData.gender || '—' });
    if (formData.domicile !== (student.domicile ?? '')) changes.push({ field: 'Domicile', before: student.domicile ?? '—', after: formData.domicile || '—' });
    if ((normalizedEmergency ?? '—') !== (student.emergencyContact ?? '—')) changes.push({ field: 'Emergency Contact', before: student.emergencyContact ?? '—', after: normalizedEmergency ?? '—' });

    updateStudent(student.sno, {
      name: formData.name.trim(),
      fatherName: formData.fatherName.trim(),
      contact: normalizedContact,
      cnic: normalizedCnic,
      address: formData.address.trim() || null,
      semester: formData.semester,
      photoUrl: formData.photoUrl,
      dob: formData.dob || null,
      gender: formData.gender || null,
      domicile: formData.domicile.trim() || null,
      emergencyContact: normalizedEmergency,
    });
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Student Edit',
      studentSno: student.sno,
      details: reason.trim(),
      changes,
    });
    setSaved(true);
    setTimeout(() => navigate(-1), 1500);
  };

  const handleCancel = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    navigate(-1);
  };

  return (
    <div className="w-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleCancel}>
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
            <Label>Student Photo (ID Card)</Label>
            <div className="flex items-start gap-4 mt-2">
              <div className="w-24 h-28 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                {formData.photoUrl ? <img src={formData.photoUrl} alt="Preview" className="w-full h-full object-cover" /> : student.photoUrl ? <img src={student.photoUrl} alt="Current" className="w-full h-full object-cover" /> : <User size={24} className="text-slate-300" />}
              </div>
              <div className="flex-1 space-y-2">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Upload size={14} /> {formData.photoUrl ? 'Change Photo' : 'Upload Photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </label>
                {(formData.photoUrl || student.photoUrl) && (
                  <button type="button" onClick={() => setFormData({ ...formData, photoUrl: null })} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 ml-3">
                    <X size={12} /> Remove
                  </button>
                )}
                <p className="text-xs text-slate-400">JPG/PNG max 2MB. Printed on ID card.</p>
              </div>
            </div>
          </div>
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
              className={!contactValid ? 'border-red-300' : ''}
            />
            {!contactValid && <p className="text-xs text-red-500 mt-1">Invalid PK number — use 03XX-XXXXXXX or +92XXXXXXXXXX</p>}
          </div>
          <div>
            <Label htmlFor="cnic">CNIC</Label>
            <Input
              id="cnic"
              value={formData.cnic}
              onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
              placeholder={student.cnic ? `Currently: ${formatCNIC(student.cnic)}` : 'Currently: Not entered'}
              className={!cnicValid ? 'border-red-300' : ''}
            />
            {!cnicValid && <p className="text-xs text-red-500 mt-1">CNIC must be 13 digits (XXXXX-XXXXXXX-X)</p>}
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="House, Street, Village, Tehsil — e.g. Village Kokarai, Tehsil Kabal"
              rows={3}
              className="flex min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 focus-visible:border-blue-200"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dob">Date of Birth</Label>
              <Input id="dob" type="date" value={formData.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })} max={new Date().toISOString().split('T')[0]} className={!dobValid ? 'border-red-300' : ''} />
              {!dobValid && <p className="text-xs text-red-500 mt-1">DOB cannot be in future</p>}
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v as '' | 'Male' | 'Female' | 'Other' })}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="domicile">Domicile (District)</Label>
              <Input id="domicile" value={formData.domicile} onChange={(e) => setFormData({ ...formData, domicile: e.target.value })} placeholder="e.g. Swat" />
            </div>
            <div>
              <Label htmlFor="emergencyContact">Emergency Contact</Label>
              <Input id="emergencyContact" value={formData.emergencyContact} onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })} placeholder="+92..." className={!emergencyValid ? 'border-red-300' : ''} />
              {!emergencyValid && <p className="text-xs text-red-500 mt-1">Invalid PK number</p>}
            </div>
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
              <div className="font-medium text-slate-900">
                {subDef.course.label} — {subDef.sub.label}
              </div>
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

      {/* Semester / Year / Term Update */}
      <Card>
        <CardHeader>
          <CardTitle>{termNoun}</CardTitle>
          <CardDescription>Update for correction only</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Current stored {termNoun.toLowerCase()}</span>
              <div>{getTermLabel(subDef.course.system, student.semester)}</div>
            </div>
            <div>
              <span className="text-slate-500">Derived from ledger</span>
              <div className="text-blue-500 font-medium">
                {getTermLabel(subDef.course.system, derivedSemester)}
                {derivedSemester !== student.semester && ' — recommended'}
              </div>
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
                {subDef.sub.terms.map((t) => (
                  <SelectItem key={t} value={t}>
                    {getTermLabel(subDef.course.system, t)}
                  </SelectItem>
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
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          {!isDirty && !saved && (
            <span className="text-xs text-slate-400">No changes detected yet</span>
          )}
          <Button
            onClick={handleSave}
            disabled={!canSave || saved}
          >
            {saved ? 'Saved' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
