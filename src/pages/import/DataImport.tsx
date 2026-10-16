import { importBatch } from '@/lib/academic/workflowBatches';
// ============================================
// MediCMS Desktop v4.0 - Student Data Import (§23)
// A staged, nothing-saved-until-confirmed CSV importer:
//   1. Download template  2. Upload  3. Validate  4. Review
//   5. Resolve duplicates  6. Import  7. Result (+ error report)
// Replaces the old mock wizard. Row rules follow §23.3 / §23.5.
// ============================================

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Download, Upload, Check, X, AlertTriangle, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useStudentStore, useLedgerStore, useAcademicStore, useAuditStore, useAuthStore, useFeeTemplateStore } from '@/stores';
import type { NewStudentInput } from '@/stores/studentStore';
import { normalizeCNIC, normalizeContact, isValidCNIC, isValidContact } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { termIndexOf } from '@/lib/promotion';
import { legacyPlanFor } from '@/lib/fee/templateCompat';
import { findActiveFor } from '@/lib/fee/templateRules';
import { entryId } from '@/lib/ledger';
import { COURSES } from '@/lib/constants';
import type {
  CourseCode, ProgramCode, Semester, FeeTemplate, LedgerEntry,
} from '@/types';

// --- Column model (§23.3) ---
const COLUMNS = [
  'name', 'father_name', 'cnic', 'phone', 'address', 'date_of_birth', 'gender',
  'domicile', 'emergency_contact', 'registration_date', 'course', 'program',
  'batch', 'session', 'current_term', 'opening_balance', 'fee_template',
] as const;
type Column = (typeof COLUMNS)[number];

const ALIASES: Record<Column, string[]> = {
  name: ['name'],
  father_name: ['father_name', 'fathername', 'father name', 'father'],
  cnic: ['cnic'],
  phone: ['phone', 'contact', 'mobile', 'cell'],
  address: ['address'],
  date_of_birth: ['date_of_birth', 'dob'],
  gender: ['gender'],
  domicile: ['domicile'],
  emergency_contact: ['emergency_contact', 'emergencycontact', 'emergency contact'],
  registration_date: ['registration_date', 'regdate', 'reg date', 'registration'],
  course: ['course'],
  program: ['program', 'sub_course', 'sub-course', 'subcourse'],
  batch: ['batch'],
  session: ['session', 'year'],
  current_term: ['current_term', 'term', 'semester'],
  opening_balance: ['opening_balance', 'opening balance', 'balance', 'dues'],
  fee_template: ['fee_template', 'fee template', 'template'],
};

const REQUIRED: Column[] = [
  'name', 'father_name', 'cnic', 'phone', 'registration_date',
  'course', 'program', 'session', 'current_term',
];

type RowStatus = 'ready' | 'warning' | 'error' | 'duplicate';
type DupResolution = 'skip' | 'update' | 'create';

interface ResolvedPlacement {
  course: CourseCode;
  program: ProgramCode;
  term: Semester;
}

interface ParsedRow {
  line: number;
  get: (c: Column) => string;
  status: RowStatus;
  messages: string[];
  dupSno?: number;
  resolution: DupResolution;
  placement?: ResolvedPlacement;
}

const STATUS_BADGE: Record<RowStatus, { label: string; variant: 'cleared' | 'secondary' | 'danger' | 'default' }> = {
  ready: { label: 'Ready', variant: 'cleared' },
  warning: { label: 'Warning', variant: 'secondary' },
  duplicate: { label: 'Duplicate', variant: 'default' },
  error: { label: 'Error', variant: 'danger' },
};

// --- CSV parsing (quoted fields + "" escaping) ---
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
    } else if (c === ',' && !inQ) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// --- Placement resolution ---
function resolveCourse(raw: string): CourseCode | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const c = COURSES.find((x) => x.code.toLowerCase() === v || x.label.toLowerCase() === v);
  return c ? c.code : null;
}

function resolveProgram(course: CourseCode, raw: string): ProgramCode | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const c = COURSES.find((x) => x.code === course);
  if (!c) return null;
  const sub = c.subCourses.find((s) => s.value.toLowerCase() === v || s.label.toLowerCase() === v);
  return sub ? sub.value : null;
}

function resolveTerm(program: ProgramCode, raw: string): Semester | null {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  for (const c of COURSES) {
    const sub = c.subCourses.find((s) => s.value === program);
    if (sub) return sub.terms.find((t) => parseInt(t, 10) === n) ?? null;
  }
  return null;
}

function isFuture(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return dateStr > dayKey();
}

// --- Fee plan (§23.4): attach a template so promotion works ---
// A named column wins by template id or name; otherwise the Active template for the
// row's own placement (§7.1). Which term the row joins decides which term's charge
// is locked, so a Term 3 import is not priced as if it opened at Term 1.
function findTemplate(
  templates: readonly FeeTemplate[],
  placement: { course: CourseCode; program: ProgramCode; session: number; batch: string },
  named: string,
): FeeTemplate | null {
  if (named) {
    const needle = named.trim().toLowerCase();
    const byId = templates.find((t) => t.id.toLowerCase() === needle);
    if (byId) return byId;
    const byName = templates.find((t) => t.name.toLowerCase() === needle);
    if (byName) return byName;
  }
  return findActiveFor(templates, placement) ?? null;
}

const GENDER_SET = ['Male', 'Female', 'Other'] as const;
function asGender(raw: string): 'Male' | 'Female' | 'Other' | null {
  const m = GENDER_SET.find((g) => g.toLowerCase() === raw.trim().toLowerCase());
  return m ?? null;
}

export default function DataImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [summary, setSummary] = useState<{ imported: number; skipped: number; failed: number } | null>(null);

  const students = useStudentStore((s) => s.students);
  const academic = useAcademicStore();

  // --- Validation: check every row, save nothing (§23.5) ---
  const validate = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) { setRows([]); setStep(1); return; }
    const headerCells = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
    const idx: Partial<Record<Column, number>> = {};
    (Object.keys(ALIASES) as Column[]).forEach((col) => {
      const pos = headerCells.findIndex((h) => ALIASES[col].includes(h));
      if (pos >= 0) idx[col] = pos;
    });

    const out: ParsedRow[] = lines.slice(1).map((line, i) => {
      const cells = splitCsvLine(line);
      const get = (c: Column) => (idx[c] !== undefined ? (cells[idx[c]!] ?? '').trim() : '');
      const row: ParsedRow = { line: i + 2, get, status: 'ready', messages: [], resolution: 'skip' };
      const errs: string[] = [];
      const warns: string[] = [];

      // Required
      const missing = REQUIRED.filter((c) => !get(c));
      if (missing.length) errs.push(`Missing required: ${missing.join(', ')}`);

      // CNIC + phone
      const cnic = normalizeCNIC(get('cnic'));
      if (cnic && !isValidCNIC(cnic)) errs.push('Invalid CNIC (must be 13 digits)');
      const phone = get('phone');
      if (phone && !isValidContact(phone)) errs.push('Phone number is not valid');

      // Dates
      if (get('date_of_birth') && (Number.isNaN(new Date(get('date_of_birth')).getTime()) || isFuture(get('date_of_birth')))) {
        errs.push('Date of birth is invalid or in the future');
      }
      if (get('registration_date') && (Number.isNaN(new Date(get('registration_date')).getTime()) || isFuture(get('registration_date')))) {
        errs.push('Registration date is invalid or in the future');
      }

      // Opening balance must be numeric if present
      const ob = get('opening_balance');
      if (ob && Number.isNaN(Number(ob))) errs.push('Opening balance is not a number');

      // Placement
      let placement: ResolvedPlacement | undefined;
      const course = resolveCourse(get('course'));
      if (get('course') && !course) errs.push(`Unknown course "${get('course')}"`);
      if (course) {
        const program = resolveProgram(course, get('program'));
        if (get('program') && !program) errs.push(`Program "${get('program')}" does not belong to ${course}`);
        if (program) {
          const term = resolveTerm(program, get('current_term'));
          if (get('current_term') && !term) errs.push(`Invalid current term "${get('current_term')}"`);
          // Historical imports may use closed cohorts, but never another session's batch.
          const session = Number(get('session'));
          if (!importBatch(academic, { course, program, session, batch: get('batch') })) {
            errs.push(`Batch "${get('batch')}" not found for ${program} in session ${get('session')}`);
          }
          if (term) placement = { course, program, term };
        }
      }

      // Duplicates (CNIC exact → duplicate; name+father → warning)
      let dupSno: number | undefined;
      if (cnic) {
        const dup = students.find((s) => normalizeCNIC(s.cnic) === cnic);
        if (dup) { dupSno = dup.sno; errs.push(`CNIC already exists (SNO ${dup.sno}) — choose Skip or Update`); }
      }
      if (!dupSno && get('name') && get('father_name')) {
        const soft = students.find(
          (s) => s.name.toLowerCase() === get('name').toLowerCase() && s.fatherName.toLowerCase() === get('father_name').toLowerCase()
        );
        if (soft) warns.push(`Same name and father's name as SNO ${soft.sno}`);
      }

      if (errs.some((e) => e.includes('already exists'))) {
        row.status = 'duplicate'; row.dupSno = dupSno; row.messages = [...errs, ...warns];
      } else if (errs.length) {
        row.status = 'error'; row.messages = errs;
      } else if (warns.length) {
        row.status = 'warning'; row.messages = warns;
      } else {
        row.status = 'ready'; row.messages = [];
      }
      row.placement = placement;
      return row;
    });

    setRows(out);
    setStep(1);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => validate(String(reader.result ?? ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  const setResolution = (line: number, resolution: DupResolution) =>
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, resolution } : r)));

  const counts = {
    ready: rows.filter((r) => r.status === 'ready').length,
    warning: rows.filter((r) => r.status === 'warning').length,
    error: rows.filter((r) => r.status === 'error').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
  };
  const duplicates = rows.filter((r) => r.status === 'duplicate');

  // --- Download template (§23.2 step 1) ---
  const downloadTemplate = () => {
    const sample = [
      'Maryam Iqbal,Iqbal Hussain,35202-1111111-1,03001234567,,2006-05-01,Female,Swat,,2025-09-01,BS Nursing,BSN,Fall,2025,3,18000,BSN 2025',
      'Sana Malik,Malik Hussain,35202-4444444-6,03211234567,,2007-01-01,Female,Mingora,,2025-09-01,Paramedics,Radiology,Fall,2025,2,0,',
    ];
    const csv = [COLUMNS.join(','), ...sample].join('\n');
    downloadCsv('students-import-template.csv', csv);
  };

  const downloadCsv = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  // --- Import (only Ready/Warning + resolved duplicates) (§23.2 step 6) ---
  const postOpeningBalance = (sno: number, regDate: string, term: Semester, amount: number) => {
    if (!amount) return;
    const entryNo = useLedgerStore.getState().nextEntryNo(sno);
    // A migrated opening figure is an OpeningBalance entry, not a Demand/Pay row (§6):
    // it is neither a fresh charge nor money through the till, so it carries the term it
    // arrived in but no due date and no receipt.
    const entry: LedgerEntry = {
      id: entryId(sno, entryNo),
      studentSno: sno,
      entryNo,
      date: regDate,
      type: amount > 0 ? 'OpeningBalanceDues' : 'OpeningBalanceCredit',
      amount: Math.abs(amount),
      description: 'Opening balance carried in at import',
      term: termIndexOf(term),
      createdBy: userName,
      createdAt: nowISO(),
      balanceAfter: 0,
    };
    useLedgerStore.getState().postEntries([entry], dayKey());
  };

  const runImport = () => {
    const addStudent = useStudentStore.getState().addStudent;
    const updateStudent = useStudentStore.getState().updateStudent;
    const addLog = useAuditStore.getState().addLog;
    const templates = useFeeTemplateStore.getState().templates;
    let imported = 0; let skipped = 0; let failed = 0;

    for (const r of rows) {
      if (r.status === 'error') { failed++; continue; }
      if (r.status === 'duplicate' && r.resolution === 'skip') { skipped++; continue; }
      if (!r.placement) { failed++; continue; }
      const { course, program, term } = r.placement;

      const personal = {
        contact: normalizeContact(r.get('phone')) || null,
        cnic: normalizeCNIC(r.get('cnic')),
        address: r.get('address') || null,
        dob: r.get('date_of_birth') || null,
        gender: asGender(r.get('gender')),
        domicile: r.get('domicile') || null,
        emergencyContact: normalizeContact(r.get('emergency_contact')) || null,
      };

      if (r.status === 'duplicate' && r.resolution === 'update' && r.dupSno) {
        updateStudent(r.dupSno, personal);
        addLog({ user: userName, action: 'Student Edit', studentSno: r.dupSno, details: `Import update — row ${r.line}` });
        imported++;
        continue;
      }

      const session = Number(r.get('session'));
      const matchedBatch = importBatch(useAcademicStore.getState(), { course, program, session, batch: r.get('batch') });
      if (!matchedBatch) { failed++; continue; }
      const tpl = findTemplate(
        templates,
        { course, program, session, batch: matchedBatch.name },
        r.get('fee_template'),
      );
      const input: NewStudentInput = {
        name: r.get('name'),
        fatherName: r.get('father_name'),
        regDate: r.get('registration_date') || dayKey(),
        course,
        program,
        semester: term,
        batch: matchedBatch.name,
        session,
        photoUrl: null,
        ...personal,
        ...(tpl ? legacyPlanFor(tpl, termIndexOf(term)) : {}),
      };
      const created = addStudent(input);

      const ob = Number(r.get('opening_balance')) || 0;
      addLog({ user: userName, action: 'New Admission', studentSno: created.sno, details: `Bulk import — ${created.name} · ${program} · ${r.get('batch')}` });
      postOpeningBalance(created.sno, r.get('registration_date') || dayKey(), term, ob);
      imported++;
    }

    setSummary({ imported, skipped, failed });
    setStep(3);
  };

  const downloadErrorReport = () => {
    const header = ['line', 'name', 'status', 'message'];
    const body = rows
      .filter((r) => r.status === 'error')
      .map((r) => [r.line, r.get('name') || '—', r.status, r.messages.join('; ')].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    downloadCsv(`import-errors-${dayKey()}.csv`, [header.join(','), ...body].join('\n'));
  };

  const STEPS = ['Template', 'Review', 'Duplicates', 'Result'];

  return (
    <div className="w-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/students')}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-page font-bold text-ink tracking-tight">Import students</h1>
          <p className="text-body text-ink-muted">Nothing is saved until you confirm.</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-pill border px-3 py-1 text-meta ${
                i === step ? 'border-accent bg-accent-soft text-accent font-semibold'
                  : i < step ? 'border-hairline bg-panel text-ink-secondary'
                    : 'border-hairline bg-panel text-ink-subtle'
              }`}
            >
              <span className="tabular-nums">{i + 1}</span>
              {label}
            </div>
            {i < STEPS.length - 1 && <span className="text-ink-subtle">·</span>}
          </div>
        ))}
      </div>

      {/* STEP 0 — Template + Upload */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>1. Download the template, then upload a filled file</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-body text-ink-muted">
              The template uses the exact column names. Required: name, father_name, cnic, phone,
              registration_date, course, program, batch, session, current_term.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download size={14} className="mr-1.5" /> Download CSV template
              </Button>
              <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} className="mr-1.5" /> Upload CSV
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 1 — Review validated rows */}
      {step === 1 && (
        <>
          <div className="flex flex-wrap gap-3 text-body">
            <Stat label="Ready" value={counts.ready} tone="cleared" />
            <Stat label="Warnings" value={counts.warning} tone="secondary" />
            <Stat label="Duplicates" value={counts.duplicate} tone="default" />
            <Stat label="Errors" value={counts.error} tone="danger" />
          </div>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>2. Review — {rows.length} rows</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-micro" onClick={() => setStep(0)}>Re-upload…</Button>
              </div>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <div className="text-body text-ink-muted">No rows found. Check the file has a header and at least one data row.</div>
              ) : (
                <div className="max-h-[52vh] overflow-auto rounded-card border border-hairline">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[52px]">Line</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.line}>
                          <TableCell className="tabular-nums text-ink-muted">{r.line}</TableCell>
                          <TableCell className="font-medium text-ink">{r.get('name') || '—'}</TableCell>
                          <TableCell className="text-ink-secondary">{r.get('program') || '—'}</TableCell>
                          <TableCell className="text-ink-secondary">{r.get('batch') || '—'}</TableCell>
                          <TableCell><Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge></TableCell>
                          <TableCell className="text-micro text-ink-muted">{r.messages.join('; ') || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate('/students')}>Cancel</Button>
            <Button disabled={rows.length === 0} onClick={() => setStep(counts.duplicate > 0 ? 2 : 3)}>
              Continue <ArrowRight size={14} className="ml-1.5" />
            </Button>
          </div>
        </>
      )}

      {/* STEP 2 — Resolve duplicates */}
      {step === 2 && (
        <>
          <Card>
            <CardHeader><CardTitle>3. Resolve {duplicates.length} duplicate row(s)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {duplicates.map((r) => (
                <div key={r.line} className="rounded-card border border-hairline p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className="text-amber-500" />
                    <span className="text-body font-semibold text-ink">{r.get('name')} · line {r.line}</span>
                    {r.dupSno && <span className="text-meta text-ink-muted">matches SNO {r.dupSno}</span>}
                  </div>
                  <div className="flex flex-wrap gap-3 text-body text-ink-secondary">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name={`dup-${r.line}`} checked={r.resolution === 'skip'} onChange={() => setResolution(r.line, 'skip')} className="accent-blue-600" /> Skip
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name={`dup-${r.line}`} checked={r.resolution === 'update'} onChange={() => setResolution(r.line, 'update')} className="accent-blue-600" /> Update existing
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name={`dup-${r.line}`} checked={r.resolution === 'create'} onChange={() => setResolution(r.line, 'create')} className="accent-blue-600" /> Create anyway
                    </label>
                  </div>
                  <Input placeholder="Reason (required for Create anyway)" className="h-8 text-body" />
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={runImport}>
              <Check size={14} className="mr-1.5" /> Import {counts.ready + counts.warning + duplicates.filter((d) => d.resolution !== 'skip').length} students
            </Button>
          </div>
        </>
      )}

      {/* STEP 3 — Result */}
      {step === 3 && summary && (
        <Card className={summary.failed > 0 ? '' : 'border-cleared/30'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users size={18} /> Import complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <ResultStat label="Imported" value={summary.imported} cls="text-cleared" />
              <ResultStat label="Skipped" value={summary.skipped} cls="text-ink-muted" />
              <ResultStat label="Failed" value={summary.failed} cls="text-danger" />
            </div>
            {summary.failed > 0 && (
              <div className="flex items-center justify-between rounded-card border border-hairline bg-panel p-3">
                <span className="text-body text-ink-secondary">{summary.failed} row(s) failed validation and were not imported.</span>
                <Button variant="outline" size="sm" onClick={downloadErrorReport}>
                  <Download size={14} className="mr-1.5" /> Error report
                </Button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRows([]); setSummary(null); setStep(0); }}>
                Import another file
              </Button>
              <Button onClick={() => navigate('/students')}>
                <X size={14} className="mr-1.5" /> Go to students
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'cleared' | 'secondary' | 'default' | 'danger' }) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant={tone}>{label}</Badge>
      <span className="text-title font-bold tabular-nums text-ink">{value}</span>
    </div>
  );
}

function ResultStat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-card border border-hairline bg-panel p-4 text-center">
      <div className={`text-stat font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="text-meta text-ink-muted mt-1">{label}</div>
    </div>
  );
}
