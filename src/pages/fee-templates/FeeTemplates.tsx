// ============================================
// MediCMS Desktop v4.0 - Fee Templates (Module 6)
// ============================================

import { useState } from 'react';
import { Plus, Edit, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PROGRAM_OPTIONS, SEMESTER_OPTIONS, BATCH_OPTIONS, SESSION_OPTIONS } from '@/lib/constants';
import { formatPKR, computeFeeTemplateTotal, getFeeWarnings } from '@/lib/utils';
import { MOCK_FEE_TEMPLATES } from '@/lib/mockData';
import type { FeeTemplate, ProgramCode, Semester, BatchName } from '@/types';

type View = 'list' | 'edit';

export default function FeeTemplates() {
  const [view, setView] = useState<View>('list');
  const [editingTemplate, setEditingTemplate] = useState<FeeTemplate | null>(null);
  const [programFilter, setProgramFilter] = useState<string>('all');
  const [semesterFilter, setSemesterFilter] = useState<string>('all');

  const filteredTemplates = MOCK_FEE_TEMPLATES.filter(t => {
    if (programFilter !== 'all' && t.program !== programFilter) return false;
    if (semesterFilter !== 'all' && t.semester !== semesterFilter) return false;
    return true;
  });

  const handleEdit = (template: FeeTemplate) => {
    setEditingTemplate(template);
    setView('edit');
  };

  const handleAdd = () => {
    setEditingTemplate(null);
    setView('edit');
  };

  if (view === 'edit') {
    return (
      <FeeTemplateEditor
        template={editingTemplate}
        onBack={() => setView('list')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fee Templates</h1>
          <p className="text-sm text-slate-500">
            Define default fee amounts per program, semester, session, and batch
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus size={16} className="mr-1" />
          Add Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Programs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {PROGRAM_OPTIONS.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={semesterFilter} onValueChange={setSemesterFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Semesters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Semesters</SelectItem>
            {SEMESTER_OPTIONS.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Program</TableHead>
              <TableHead>Sem</TableHead>
              <TableHead>Session</TableHead>
              <TableHead className="text-right">Adm Fee</TableHead>
              <TableHead className="text-right">Tuit Fee</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTemplates.map(template => (
              <TableRow key={template.id} className="cursor-pointer hover:bg-slate-50" onClick={() => handleEdit(template)}>
                <TableCell className="font-medium">{template.program}</TableCell>
                <TableCell>{template.semester}</TableCell>
                <TableCell>{template.session}</TableCell>
                <TableCell className="text-right">{formatPKR(template.admissionFee)}</TableCell>
                <TableCell className="text-right">{formatPKR(template.tuitionFee)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatPKR(computeFeeTemplateTotal(template))}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit(template); }}>
                    <Edit size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filteredTemplates.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                  No templates found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="p-3 border-t border-slate-100 text-sm text-slate-500">
          Total: {filteredTemplates.length} templates
        </div>
      </Card>

      {/* Business Rules */}
      <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl space-y-1">
        <div>⚠ Annual Charges: applies Sem 3+ only (data shows 0 in Sem 1 & 2)</div>
        <div>⚠ Clinical Charges: applies Sem 3 only (data shows 0 in Sem 4)</div>
        <div>⚠ Diploma Fee: always 0 (never charged — no finished batch yet)</div>
        <div>⚠ Security Fee: always 0 (never charged — unused)</div>
      </div>
    </div>
  );
}

// --- Fee Template Editor ---
function FeeTemplateEditor({ template, onBack }: { template: FeeTemplate | null; onBack: () => void }) {
  const [form, setForm] = useState({
    program: (template?.program ?? '') as ProgramCode | '',
    semester: (template?.semester ?? '1st') as Semester,
    batch: (template?.batch ?? '17th Batch') as BatchName,
    session: template?.session ?? 2026,
    admissionFee: template?.admissionFee ?? 20000,
    tuitionFee: template?.tuitionFee ?? 20000,
    idCardFee: template?.idCardFee ?? 0,
    annualCharges: template?.annualCharges ?? 0,
    securityFee: template?.securityFee ?? 0,
    enrollmentFee: template?.enrollmentFee ?? 5000,
    diplomaFee: template?.diplomaFee ?? 0,
    clinicalCharges: template?.clinicalCharges ?? 0,
  });
  const [loading, setLoading] = useState(false);

  const total = form.admissionFee + form.tuitionFee + form.idCardFee +
    form.annualCharges + form.securityFee + form.enrollmentFee +
    form.diplomaFee + form.clinicalCharges;

  // Collect warnings
  const warnings: string[] = [];
  const w1 = getFeeWarnings(form.semester, 'annualCharges', form.annualCharges);
  const w2 = getFeeWarnings(form.semester, 'clinicalCharges', form.clinicalCharges);
  const w3 = getFeeWarnings(form.semester, 'diplomaFee', form.diplomaFee);
  if (w1) warnings.push(w1);
  if (w2) warnings.push(w2);
  if (w3) warnings.push(w3);

  const handleSave = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    onBack();
  };

  return (
    <div className="w-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>←</Button>
        <h1 className="text-2xl font-bold text-slate-900">
          {template ? 'Edit Fee Template' : 'Add Fee Template'}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Program</Label>
              <Select value={form.program} onValueChange={(v) => setForm({ ...form, program: v as ProgramCode })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {PROGRAM_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Semester</Label>
              <Select value={form.semester} onValueChange={(v) => setForm({ ...form, semester: v as Semester })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEMESTER_OPTIONS.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Batch</Label>
              <Select value={form.batch} onValueChange={(v) => setForm({ ...form, batch: v as BatchName })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BATCH_OPTIONS.map(b => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Session</Label>
              <Select value={form.session.toString()} onValueChange={(v) => setForm({ ...form, session: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SESSION_OPTIONS.map(y => (<SelectItem key={y} value={y.toString()}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fee Components */}
      <Card>
        <CardHeader>
          <CardTitle>Fee Components</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            ['admissionFee', 'Admission Fee', 'Sem 1 only'],
            ['tuitionFee', 'Tuition Fee', 'Every semester'],
            ['idCardFee', 'ID Card Fee', 'Sem 1 (was 200/2018)'],
            ['annualCharges', 'Annual Charges', 'Only Sem 3+'],
            ['securityFee', 'Security Fee', 'Not used — keep 0'],
            ['enrollmentFee', 'Enrollment Fee', 'Sem 1 only'],
            ['diplomaFee', 'Diploma Fee', 'Only Sem 4'],
            ['clinicalCharges', 'Clinical Charges', 'Only Sem 3'],
          ] as const).map(([key, label, rule]) => (
            <div key={key} className="flex items-center gap-4">
              <Label className="w-[150px]">{label}</Label>
              <Input
                type="number"
                className="w-[150px]"
                value={(form as Record<string, unknown>)[key] as number}
                onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })}
              />
              <span className="text-xs text-slate-400">{rule}</span>
            </div>
          ))}
          <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
            <Label className="w-[150px] font-bold">TOTAL</Label>
            <span className="font-bold text-lg">{formatPKR(total)}</span>
            <span className="text-xs text-slate-400">computed — no edit</span>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-amber-100 bg-amber-50/50">
          <CardContent className="py-4 space-y-2">
            <div className="font-medium text-amber-700 text-sm flex items-center gap-2">
              <AlertTriangle size={14} />
              Semester Warnings (soft — can override)
            </div>
            {warnings.map((w, i) => (
              <div key={i} className="text-sm text-amber-600">{w}</div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button onClick={handleSave} disabled={loading || !form.program}>
          {loading ? 'Saving...' : '💾 Save Template'}
        </Button>
      </div>
    </div>
  );
}
