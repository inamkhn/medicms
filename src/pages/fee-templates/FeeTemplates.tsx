// ============================================
// MediCMS Desktop v4.0 - Fee Templates (Module 6)
// Design doc §5 (structure), §6 (the three screens), §7 (the rules).
//
// One template covers a whole placement (course, program, session, batch) and holds
// fee components; the amount for each term is computed by the fee engine, never
// stored per term. Every write goes through useFeeTemplateStore, which is where the
// §7 rules live, so this screen cannot invent its own answer to "may I activate this"
// or "is this placement already covered".
// ============================================

import { useMemo, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowUp, BadgeCheck, Copy, Plus, Save, TriangleAlert, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { COURSES, getCourseDef, getCourseOfProgram, getSubCourseDef } from '@/lib/constants';
import { formatPKR, getTermLabel } from '@/lib/utils';
import { confirmDialog } from '@/lib/confirm';
import { toastError, toastSuccess } from '@/lib/toast';
import { templateCourseTotal, templateRefundableTotal, termFeesOf } from '@/lib/fee/templateCompat';
import {
  ALL_BATCHES, contentChanged, termsPerYearFor,
} from '@/lib/fee/templateRules';
import {
  useAuditStore, useAuthStore, useFeeTemplateStore, useSettingsStore, useStudentStore,
  useAcademicStore,
} from '@/stores';
import { AcademicSelector, type AcademicSelection } from '@/components/academic/AcademicSelector';
import type {
  AuditChange, ChargeTiming, CourseCode, FeeComponent, FeeTemplate, ProgramCode, TemplateStatus,
} from '@/types';

/** §5.3 - the five timing options in the words the operator uses. */
const TIMING_LABELS: Record<ChargeTiming, string> = {
  AtAdmission: 'At admission',
  EveryTerm: 'Every term',
  EveryNewYear: 'Every new year',
  OnPromotion: 'On promotion',
  LastTermOnly: 'Last term only',
};

/**
 * §5.3 - "from term" and "to term" can narrow any option, but only the pairs that
 * change the answer are worth showing. A hidden field is cleared rather than left
 * behind, so a stored component never carries a range the screen cannot show.
 */
const TIMING_FIELDS: Record<ChargeTiming, { from: boolean; to: boolean }> = {
  AtAdmission: { from: true, to: false },
  EveryTerm: { from: true, to: true },
  EveryNewYear: { from: true, to: false },
  OnPromotion: { from: true, to: false },
  LastTermOnly: { from: false, to: true },
};

/** §5.2 - suggestions only; the name stays free text. */
const NAME_SUGGESTIONS = [
  'Admission fee', 'Tuition', 'ID card', 'Security deposit', 'Lab fee', 'Enrollment fee',
  'Annual charges', 'Clinical training', 'Exam fee', 'Promotion fee', 'Diploma fee', 'Other',
];

const STATUS_TONE: Record<TemplateStatus, BadgeVariant> = {
  Draft: 'secondary',
  Active: 'cleared',
  Archived: 'outline',
};

function batchLabel(batch: string): string {
  return batch === ALL_BATCHES ? 'All batches' : batch;
}

function termLabel(program: ProgramCode, term: number): string {
  const { course, sub } = getSubCourseDef(program);
  const semester = sub.terms[term - 1];
  return semester ? getTermLabel(course.system, semester) : `Term ${term}`;
}

/** The audit trail compares components as one readable value, not eight columns. */
function describeComponents(components: readonly FeeComponent[]): string {
  if (!components.length) return 'no components';
  const names = components.map((c) => `${c.name || '(unnamed)'} ${formatPKR(c.amount)}`).join(', ');
  return `${components.length} component(s): ${names}`;
}

/** Ids are generated in the handler that adds a row, never during render. */
function newComponent(): FeeComponent {
  return {
    id: `comp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    amount: 0,
    charged: 'EveryTerm',
    refundable: false,
  };
}

function StatusChip({ status }: { status: TemplateStatus }) {
  return <Badge variant={STATUS_TONE[status]}>{status}</Badge>;
}

// ============================================
// Page
// ============================================

export default function FeeTemplates() {
  const templates = useFeeTemplateStore((s) => s.templates);
  const setStatus = useFeeTemplateStore((s) => s.setStatus);
  const createTemplate = useFeeTemplateStore((s) => s.createTemplate);
  const duplicateToSession = useFeeTemplateStore((s) => s.duplicateToSession);
  const usedByCount = useFeeTemplateStore((s) => s.usedByCount);
  const students = useStudentStore((s) => s.students);
  const termsPerYearByProgram = useSettingsStore((s) => s.termsPerYearByProgram);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  // 'list' shows the table; 'edit' shows the template named by openId. The two
  // dialogs are overlays on the list, so they are separate state rather than views.
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'none' | 'new' | 'duplicate'>('none');
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [programFilter, setProgramFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const open = openId ? templates.find((t) => t.id === openId) ?? null : null;

  const programOptions = courseFilter === 'all'
    ? COURSES.flatMap((c) => c.subCourses)
    : getCourseDef(courseFilter as CourseCode).subCourses;

  const rows = templates
    .filter((t) => {
      if (courseFilter !== 'all' && t.course !== courseFilter) return false;
      if (programFilter !== 'all' && t.program !== programFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      return true;
    })
    .map((t) => ({
      template: t,
      courseTotal: templateCourseTotal(t),
      refundable: templateRefundableTotal(t),
      usedBy: usedByCount(t.id, students),
    }))
    .sort((a, b) =>
      a.template.program.localeCompare(b.template.program)
      || b.template.session - a.template.session
      || a.template.batch.localeCompare(b.template.batch));

  const logStatusChange = (before: FeeTemplate, after: FeeTemplate) => {
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Fee Template Change',
      details: `${after.status === 'Active' ? 'Activated' : 'Archived'} template "${after.name}" · ${after.program} · Session ${after.session} · ${batchLabel(after.batch)}`,
      changes: [{ field: 'Status', before: before.status, after: after.status }],
    });
  };

  const handleStatus = async (template: FeeTemplate, status: TemplateStatus) => {
    if (status === 'Archived') {
      const used = usedByCount(template.id, students);
      const go = await confirmDialog({
        title: `Archive "${template.name}"?`,
        effect: `Admissions from now on can no longer pick this template. The ${used} student(s) already on it keep their locked plan, and the ledger entries already posted are untouched.`,
        confirmLabel: 'Archive template',
      });
      if (!go) return;
    }
    const result = setStatus(template.id, status);
    if (!result.ok) {
      toastError({ title: status === 'Active' ? 'Cannot activate' : 'Cannot archive', description: result.reason });
      return;
    }
    logStatusChange(template, result.template);
    toastSuccess({
      title: status === 'Active' ? 'Template activated' : 'Template archived',
      description: `${result.template.name} · v${result.template.version}`,
    });
  };

  const handleCreate = (input: {
    course: CourseCode; program: ProgramCode; session: number; batch: string; name: string;
  }) => {
    const termsPerYear = termsPerYearFor(input.program, termsPerYearByProgram);
    const result = createTemplate({ ...input, termsPerYear });
    if (!result.ok) {
      toastError({ title: 'Cannot create template', description: result.reason });
      return;
    }
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Fee Template Change',
      details: `Created template "${result.template.name}" · ${result.template.program} · Session ${result.template.session} · ${batchLabel(result.template.batch)}`,
      changes: [{ field: 'Status', before: '—', after: 'Draft' }],
    });
    setDialog('none');
    setOpenId(result.template.id);
  };

  const handleDuplicate = (source: FeeTemplate, target: { session: number; batch: string; increasePercent: number }) => {
    const result = duplicateToSession(source.id, target);
    if (!result.ok) {
      toastError({ title: 'Cannot duplicate template', description: result.reason });
      return;
    }
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Fee Template Change',
      details: `Duplicated "${source.name}" into "${result.template.name}" · Session ${result.template.session}`
        + (target.increasePercent > 0 ? ` · amounts raised ${target.increasePercent}% (rounded to the nearest 100)` : ''),
      changes: [
        { field: 'Session', before: String(source.session), after: String(result.template.session) },
        { field: 'Batch', before: batchLabel(source.batch), after: batchLabel(result.template.batch) },
        { field: 'Status', before: source.status, after: result.template.status },
      ],
    });
    setDialog('none');
    setDuplicateId(null);
    setOpenId(result.template.id);
  };

  if (open) {
    return (
      <TemplateEditor
        key={open.id}
        template={open}
        termsPerYearByProgram={termsPerYearByProgram}
        onBack={() => setOpenId(null)}
      />
    );
  }

  const duplicateSource = duplicateId ? templates.find((t) => t.id === duplicateId) ?? null : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fee Templates</h1>
          <p className="text-sm text-slate-500">
            One template per course, sub-course, session and batch — components decide what each term charges
          </p>
        </div>
        <Button onClick={() => setDialog('new')}>
          <Plus size={16} className="mr-1" />
          New Template
        </Button>
      </div>

      {/* Filters (§6.1 — course, program, status; a template is not per semester any more) */}
      <div className="flex gap-3">
        <Select value={courseFilter} onValueChange={(v) => { setCourseFilter(v); setProgramFilter('all'); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Courses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {COURSES.map((c) => (<SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>))}
          </SelectContent>
        </Select>

        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Sub-courses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sub-courses</SelectItem>
            {programOptions.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table (§6.1) */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Course / Program</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Terms/yr</TableHead>
              <TableHead className="text-right">Course total</TableHead>
              <TableHead className="text-right">Refundable</TableHead>
              <TableHead className="text-right">Used by</TableHead>
              <TableHead className="w-[190px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ template, courseTotal, refundable, usedBy }) => (
              <TableRow
                key={template.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setOpenId(template.id)}
              >
                <TableCell className="font-medium">
                  {template.name}
                  <span className="ml-1.5 text-xs text-slate-400">v{template.version}</span>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {getSubCourseDef(template.program).course.label} · {getSubCourseDef(template.program).sub.label}
                </TableCell>
                <TableCell>{template.session}</TableCell>
                <TableCell className="text-sm">{batchLabel(template.batch)}</TableCell>
                <TableCell><StatusChip status={template.status} /></TableCell>
                <TableCell className="text-right tabular-nums">{template.termsPerYear}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatPKR(courseTotal)}</TableCell>
                <TableCell className="text-right tabular-nums text-slate-500">
                  {refundable > 0 ? formatPKR(refundable) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{usedBy}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Open" onClick={(e) => { e.stopPropagation(); setOpenId(template.id); }}>
                      <ArrowUp size={14} className="rotate-90" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Duplicate to a session"
                      onClick={(e) => { e.stopPropagation(); setDuplicateId(template.id); setDialog('duplicate'); }}
                    >
                      <Copy size={14} />
                    </Button>
                    {template.status !== 'Active' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Activate"
                        onClick={(e) => { e.stopPropagation(); void handleStatus(template, 'Active'); }}
                      >
                        <BadgeCheck size={14} />
                      </Button>
                    )}
                    {template.status !== 'Archived' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Archive"
                        onClick={(e) => { e.stopPropagation(); void handleStatus(template, 'Archived'); }}
                      >
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                  No templates match these filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="p-3 border-t border-slate-100 text-sm text-slate-500">
          Total: {rows.length} template(s)
          {/* A template in use cannot be deleted, so archiving is how one is retired (§7.5). */}
          <span className="ml-2 text-xs text-slate-400">· a template students are using is archived, never deleted</span>
        </div>
      </Card>

      <Dialog open={dialog === 'new'} onOpenChange={(v) => { if (!v) setDialog('none'); }}>
        <DialogContent>
          <NewTemplateDialog
            onCancel={() => setDialog('none')}
            onCreate={handleCreate}
            defaultSession={new Date().getFullYear()}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'duplicate' && !!duplicateSource} onOpenChange={(v) => { if (!v) { setDialog('none'); setDuplicateId(null); } }}>
        <DialogContent>
          {duplicateSource && (
            <DuplicateDialog
              source={duplicateSource}
              onCancel={() => { setDialog('none'); setDuplicateId(null); }}
              onDuplicate={handleDuplicate}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// Shared placement fields
// ============================================

interface PlacementValue {
  course: CourseCode | '';
  program: ProgramCode | '';
  session: number;
  batch: string;
}

function PlacementFields({
  value, onChange, courseLocked,
}: {
  value: PlacementValue;
  onChange: (next: Partial<PlacementValue>) => void;
  /** Course follows the program, so it is only ever picked through the program list. */
  courseLocked?: boolean;
}) {
  const courses = useAcademicStore((s) => s.courses);
  const programs = useAcademicStore((s) => s.programs);
  const batches = useAcademicStore((s) => s.batches);

  // §38/§46 The placement picker is the shared AcademicSelector. Templates still store
  // the legacy (course, program, session, batch name) placement — the same triple the
  // ledger matches on — so the selection is derived from it and mapped back on change.
  const selection = useMemo<AcademicSelection>(() => {
    const program = value.program ? programs.find((p) => p.legacyValue === value.program) : undefined;
    const course = value.course ? courses.find((c) => c.legacyValue === value.course) : undefined;
    const batch = value.batch !== ALL_BATCHES && program
      ? batches.find((b) => b.programId === program.id && b.session === value.session
          && b.name.trim().toLowerCase() === value.batch.trim().toLowerCase())
      : undefined;
    return {
      courseId: course?.id ?? program?.courseId ?? '',
      programId: program?.id ?? '',
      session: value.session,
      batchId: batch?.id ?? '',
    };
  }, [courses, programs, batches, value]);

  const apply = (next: AcademicSelection) => {
    const program = next.programId ? programs.find((p) => p.id === next.programId) : undefined;
    const course = next.courseId ? courses.find((c) => c.id === next.courseId) : undefined;
    const batch = next.batchId ? batches.find((b) => b.id === next.batchId) : undefined;
    onChange({
      course: (course?.legacyValue ?? '') as CourseCode | '',
      program: (program?.legacyValue ?? '') as ProgramCode | '',
      // A template always bills one session; clearing the cascade never leaves it empty.
      session: batch ? batch.session : next.session === '' ? value.session : next.session,
      batch: batch?.name ?? ALL_BATCHES,
    });
  };

  return (
    <AcademicSelector
      context="feeTemplate"
      value={selection}
      onChange={apply}
      lockedLevels={courseLocked ? { course: true, program: true } : undefined}
    />
  );
}

// ============================================
// New template (§6.1)
// ============================================

function NewTemplateDialog({
  onCancel, onCreate, defaultSession,
}: {
  onCancel: () => void;
  onCreate: (input: { course: CourseCode; program: ProgramCode; session: number; batch: string; name: string }) => void;
  defaultSession: number;
}) {
  const [placement, setPlacement] = useState<PlacementValue>({ course: '', program: '', session: defaultSession, batch: ALL_BATCHES });
  const [name, setName] = useState('');

  const ready = placement.course !== '' && placement.program !== '';
  const suggested = placement.program
    ? `${getSubCourseDef(placement.program).sub.label} ${placement.session}`
    : '';

  return (
    <>
      <DialogHeader>
        <DialogTitle>New Fee Template</DialogTitle>
        <DialogDescription>
          A template starts as a Draft and is invisible to admission until it is activated (§7.1).
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <PlacementFields
          value={placement}
          onChange={(next) => setPlacement((p) => ({ ...p, ...next }))}
        />
        <div>
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            value={name}
            placeholder={suggested || 'e.g. BSN 2026'}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            Leave blank to use the suggested name. The term count and terms-per-year come from the program.
          </p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          disabled={!ready}
          onClick={() => {
            if (!ready) return;
            onCreate({
              course: placement.course as CourseCode,
              program: placement.program as ProgramCode,
              session: placement.session,
              batch: placement.batch,
              name: name.trim() || suggested,
            });
          }}
        >
          <Plus size={16} className="mr-1" />
          Create draft
        </Button>
      </DialogFooter>
    </>
  );
}

// ============================================
// Duplicate to a session (§6.3)
// ============================================

function DuplicateDialog({
  source, onCancel, onDuplicate,
}: {
  source: FeeTemplate;
  onCancel: () => void;
  onDuplicate: (source: FeeTemplate, target: { session: number; batch: string; increasePercent: number }) => void;
}) {
  const [placement, setPlacement] = useState<PlacementValue>({
    course: source.course, program: source.program, session: source.session, batch: source.batch,
  });
  const [increase, setIncrease] = useState('');
  const percent = parseInt(increase, 10);
  const raise = Number.isFinite(percent) && percent > 0 ? percent : 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Duplicate "{source.name}"</DialogTitle>
        <DialogDescription>
          Copies all {source.components.length} component(s) to a new session. The copy starts as a Draft
          so it can be reviewed before anyone is admitted on it (§6.3).
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <PlacementFields
          value={placement}
          onChange={(next) => setPlacement((p) => ({ ...p, ...next }))}
          courseLocked
        />
        <div>
          <Label htmlFor="increase">Raise every amount by % (optional)</Label>
          <Input
            id="increase"
            type="number"
            min={0}
            max={200}
            num
            value={increase}
            placeholder="e.g. 8"
            onChange={(e) => setIncrease(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            Rounded to the nearest 100 rupees, so a raise produces fees people can actually pay.
          </p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() => onDuplicate(source, {
            session: placement.session,
            batch: placement.batch,
            increasePercent: raise,
          })}
        >
          <Copy size={16} className="mr-1" />
          Create copy
        </Button>
      </DialogFooter>
    </>
  );
}

// ============================================
// Editor (§6.2)
// ============================================

function TemplateEditor({
  template, termsPerYearByProgram, onBack,
}: {
  template: FeeTemplate;
  termsPerYearByProgram: Partial<Record<ProgramCode, number>>;
  onBack: () => void;
}) {
  const saveTemplate = useFeeTemplateStore((s) => s.saveTemplate);
  const students = useStudentStore((s) => s.students);
  const usedByCount = useFeeTemplateStore((s) => s.usedByCount);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  // A stored template can predate the Settings table, so a missing terms-per-year is
  // filled from the program here rather than left for the activation rule to refuse on.
  const [draft, setDraft] = useState<FeeTemplate>(() => ({
    ...template,
    termsPerYear: template.termsPerYear > 0
      ? template.termsPerYear
      : termsPerYearFor(template.program, termsPerYearByProgram),
  }));
  const [saving, setSaving] = useState(false);

  const usedBy = usedByCount(template.id, students);
  const programDef = getSubCourseDef(draft.program);
  const preview = termFeesOf(draft);
  const contentDirty = contentChanged(template, draft);
  const statusDirty = draft.status !== template.status;
  const dirty = contentDirty || statusDirty;

  // §7.10 - activation needs a terms-per-year value for the program.
  const canActivate = draft.termsPerYear > 0 && draft.components.length > 0;

  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Name is required.');
  if (!draft.components.length) errors.push('Add at least one fee component.');
  draft.components.forEach((c, i) => {
    const label = c.name.trim() || `Component ${i + 1}`;
    if (!c.name.trim()) errors.push(`${label}: name is required.`);
    if (!Number.isFinite(c.amount) || c.amount < 0) errors.push(`${label}: amount must be zero or more.`);
    if (c.fromTerm !== undefined && c.fromTerm > draft.totalTerms) {
      errors.push(`${label}: from term is past the last term (${draft.totalTerms}).`);
    }
    if (c.fromTerm !== undefined && c.toTerm !== undefined && c.toTerm < c.fromTerm) {
      errors.push(`${label}: to term is before from term.`);
    }
  });
  const zeroLines = draft.components.filter((c) => !(c.amount > 0)).length;
  const valid = errors.length === 0;

  const patch = (next: Partial<FeeTemplate>) => setDraft((d) => ({ ...d, ...next }));

  /**
   * The program decides how many terms the template spans, so moving a template to
   * another program re-derives the term count and clamps every range to it — otherwise
   * a "from term 5" component would bill nothing at all in a 4-term program.
   */
  const changeProgram = (program: ProgramCode) => {
    const totalTerms = getSubCourseDef(program).sub.terms.length;
    setDraft((d) => ({
      ...d,
      program,
      // A program belongs to exactly one course, so the course cannot be left behind.
      course: getCourseOfProgram(program),
      totalTerms,
      termsPerYear: termsPerYearFor(program, termsPerYearByProgram),
      components: d.components.map((c) => ({
        ...c,
        fromTerm: c.fromTerm === undefined ? undefined : Math.min(c.fromTerm, totalTerms),
        toTerm: c.toTerm === undefined ? undefined : Math.min(c.toTerm, totalTerms),
      })),
    }));
  };

  const patchComponent = (id: string, next: Partial<FeeComponent>) => {
    setDraft((d) => ({ ...d, components: d.components.map((c) => (c.id === id ? { ...c, ...next } : c)) }));
  };

  /** Changing the timing clears the range fields the new option does not use. */
  const changeTiming = (id: string, charged: ChargeTiming) => {
    const fields = TIMING_FIELDS[charged];
    setDraft((d) => ({
      ...d,
      components: d.components.map((c) => (c.id === id ? {
        ...c,
        charged,
        fromTerm: fields.from ? c.fromTerm : undefined,
        toTerm: fields.to ? c.toTerm : undefined,
      } : c)),
    }));
  };

  const moveComponent = (index: number, delta: number) => {
    setDraft((d) => {
      const components = [...d.components];
      const target = index + delta;
      if (target < 0 || target >= components.length) return d;
      const [row] = components.splice(index, 1);
      components.splice(target, 0, row);
      return { ...d, components };
    });
  };

  const buildChanges = (after: FeeTemplate): AuditChange[] => {
    const out: AuditChange[] = [];
    const push = (field: string, before: string, next: string) => {
      if (before !== next) out.push({ field, before, after: next });
    };
    push('Name', template.name, after.name);
    push('Program', `${template.course} / ${template.program}`, `${after.course} / ${after.program}`);
    push('Session', String(template.session), String(after.session));
    push('Batch', batchLabel(template.batch), batchLabel(after.batch));
    push('Status', template.status, after.status);
    push('Terms per year', String(template.termsPerYear), String(after.termsPerYear));
    push('Admission due days', String(template.admissionDueDays), String(after.admissionDueDays));
    push('Term due days', String(template.termDueDays), String(after.termDueDays));
    push('Notes', template.notes || '—', after.notes || '—');
    push('Components', describeComponents(template.components), describeComponents(after.components));
    push('Course total', formatPKR(templateCourseTotal(template)), formatPKR(templateCourseTotal(after)));
    return out;
  };

  const handleSave = async () => {
    if (!valid || saving) return;
    const next: FeeTemplate = {
      ...draft,
      name: draft.name.trim(),
      components: draft.components.map((c) => ({ ...c, name: c.name.trim() })),
    };

    // §7.6 - warn before changing an Active template, in terms of who it affects.
    if (template.status === 'Active' && contentChanged(template, next)) {
      const go = await confirmDialog({
        title: 'Change an Active template',
        effect: `"${template.name}" is the fee plan for ${usedBy} student(s). This save raises it to v${template.version + 1} and applies to admissions taken afterwards only — plans already agreed are not re-priced (§7.4).`,
        tone: 'money',
        confirmLabel: 'Save changes',
      });
      if (!go) return;
    }

    setSaving(true);
    const result = saveTemplate(next);
    setSaving(false);
    if (!result.ok) {
      toastError({ title: 'Could not save template', description: result.reason });
      return;
    }
    const changes = buildChanges(result.template);
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Fee Template Change',
      details: `Saved template "${result.template.name}" · ${result.template.program} · Session ${result.template.session} · ${batchLabel(result.template.batch)} · v${result.template.version}`,
      changes,
    });
    toastSuccess({
      title: 'Template saved',
      description: `${result.template.name} · v${result.template.version} · course total ${formatPKR(templateCourseTotal(result.template))}`,
    });
    onBack();
  };

  const handleBack = async () => {
    if (!dirty) {
      onBack();
      return;
    }
    const go = await confirmDialog({
      title: 'Leave without saving?',
      effect: 'The changes made in this editor are discarded. Nothing stored is touched.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
    });
    if (go) onBack();
  };

  return (
    <div className="w-auto space-y-6">
      {/* Header (§6.2): name, status, version, placement, and the two write actions. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => void handleBack()}>
              <ArrowLeft size={18} />
            </Button>
            <h1 className="text-2xl font-bold text-slate-900 truncate">{draft.name || 'Untitled template'}</h1>
            <Badge variant="outline">v{draft.version}</Badge>
            <StatusChip status={draft.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {getSubCourseDef(draft.program).course.label} · {programDef.sub.label} · Session {draft.session} · {batchLabel(draft.batch)}
            {' '}· {draft.totalTerms} term(s) · used by {usedBy} student(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void handleBack()}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={!valid || saving || !dirty}>
            <Save size={16} className="mr-1" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {template.status === 'Active' && (
        <div className="text-sm bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2">
          <TriangleAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <span className="text-amber-700">
            This template is Active and is the fee plan for {usedBy} student(s). Saving changes adds a version and
            affects future admissions only — existing plans keep the fees agreed in them (§7.4, §7.6).
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Header fields (§5.1) */}
          <Card>
            <CardHeader>
              <CardTitle>Template Details</CardTitle>
              <CardDescription>
                Placement, status and the payment-due rule. Course follows the program.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tpl-name">Name</Label>
                  <Input id="tpl-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="tpl-status">Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(v) => patch({ status: v as TemplateStatus })}
                  >
                    <SelectTrigger id="tpl-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <PlacementFields
                value={{ course: draft.course, program: draft.program, session: draft.session, batch: draft.batch }}
                onChange={(next) => {
                  if (next.program && next.program !== draft.program) {
                    changeProgram(next.program as ProgramCode);
                  }
                  if (next.session !== undefined) patch({ session: next.session });
                  if (next.batch !== undefined) patch({ batch: next.batch });
                }}
                courseLocked
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tpl-tpy">Terms per year</Label>
                  <Input id="tpl-tpy" value={String(draft.termsPerYear)} readOnly num className="bg-slate-50" />
                  <p className="mt-1 text-xs text-slate-400">
                    Taken from the program — change it in Settings › Terms Per Year (§5.4).
                  </p>
                </div>
                <div>
                  <Label htmlFor="tpl-terms">Terms in program</Label>
                  <Input id="tpl-terms" value={String(draft.totalTerms)} readOnly num className="bg-slate-50" />
                  <p className="mt-1 text-xs text-slate-400">Set by the program definition.</p>
                </div>
                <div>
                  <Label htmlFor="tpl-admission-due">Admission due days</Label>
                  <Input
                    id="tpl-admission-due"
                    type="number"
                    min={0}
                    num
                    value={String(draft.admissionDueDays)}
                    onChange={(e) => patch({ admissionDueDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  />
                </div>
                <div>
                  <Label htmlFor="tpl-term-due">Term due days</Label>
                  <Input
                    id="tpl-term-due"
                    type="number"
                    min={0}
                    num
                    value={String(draft.termDueDays)}
                    onChange={(e) => patch({ termDueDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="tpl-notes">Notes (internal)</Label>
                <Input
                  id="tpl-notes"
                  value={draft.notes ?? ''}
                  placeholder="e.g. lab fee waived for this session"
                  onChange={(e) => patch({ notes: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Components (§5.2) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Fee Components</CardTitle>
                  <CardDescription>Each one says when it is charged; the engine works out every term from these.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => patch({ components: [...draft.components, newComponent()] })}>
                  <Plus size={14} className="mr-1" />
                  Add component
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <datalist id="fee-head-suggestions">
                {NAME_SUGGESTIONS.map((n) => (<option key={n} value={n} />))}
              </datalist>

              {draft.components.length === 0 ? (
                <div className="text-sm text-slate-400 py-6 text-center">
                  No components yet — add one, or duplicate a template from a previous session.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[120px] text-right">Amount</TableHead>
                      <TableHead className="w-[160px]">Charged</TableHead>
                      <TableHead className="w-[110px]">From</TableHead>
                      <TableHead className="w-[110px]">To</TableHead>
                      <TableHead className="w-[100px]">Refundable</TableHead>
                      <TableHead className="w-[110px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draft.components.map((c, i) => {
                      const fields = TIMING_FIELDS[c.charged];
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            <Input
                              value={c.name}
                              list="fee-head-suggestions"
                              placeholder="e.g. Tuition"
                              aria-label={`Component ${i + 1} name`}
                              invalid={!c.name.trim()}
                              onChange={(e) => patchComponent(c.id, { name: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step={100}
                              num
                              className="text-right"
                              value={String(c.amount)}
                              aria-label={`${c.name || `Component ${i + 1}`} amount`}
                              onChange={(e) => patchComponent(c.id, { amount: parseInt(e.target.value, 10) || 0 })}
                            />
                          </TableCell>
                          <TableCell>
                            <Select value={c.charged} onValueChange={(v) => changeTiming(c.id, v as ChargeTiming)}>
                              <SelectTrigger aria-label={`${c.name || `Component ${i + 1}`} timing`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(TIMING_LABELS) as ChargeTiming[]).map((t) => (
                                  <SelectItem key={t} value={t}>{TIMING_LABELS[t]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {fields.from ? (
                              <Select
                                value={c.fromTerm === undefined ? 'any' : String(c.fromTerm)}
                                onValueChange={(v) => patchComponent(c.id, { fromTerm: v === 'any' ? undefined : parseInt(v, 10) })}
                              >
                                <SelectTrigger aria-label="From term"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="any">First</SelectItem>
                                  {Array.from({ length: draft.totalTerms }, (_, t) => t + 1).map((t) => (
                                    <SelectItem key={t} value={String(t)}>Term {t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-slate-400">not used</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {fields.to ? (
                              <Select
                                value={c.toTerm === undefined ? 'any' : String(c.toTerm)}
                                onValueChange={(v) => patchComponent(c.id, { toTerm: v === 'any' ? undefined : parseInt(v, 10) })}
                              >
                                <SelectTrigger aria-label="To term"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="any">Last</SelectItem>
                                  {Array.from({ length: draft.totalTerms }, (_, t) => t + 1).map((t) => (
                                    <SelectItem key={t} value={String(t)}>Term {t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-slate-400">not used</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                              <Checkbox
                                checked={c.refundable}
                                onCheckedChange={(v) => patchComponent(c.id, { refundable: v === true })}
                                aria-label={`${c.name || `Component ${i + 1}`} refundable`}
                              />
                              {c.refundable ? 'Yes' : 'No'}
                            </label>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost" size="icon" title="Move up"
                                disabled={i === 0}
                                onClick={() => moveComponent(i, -1)}
                              >
                                <ArrowUp size={14} />
                              </Button>
                              <Button
                                variant="ghost" size="icon" title="Move down"
                                disabled={i === draft.components.length - 1}
                                onClick={() => moveComponent(i, 1)}
                              >
                                <ArrowDown size={14} />
                              </Button>
                              <Button
                                variant="ghost" size="icon" title="Remove"
                                onClick={() => patch({ components: draft.components.filter((row) => row.id !== c.id) })}
                              >
                                <X size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {zeroLines > 0 && (
                <p className="mt-3 text-xs text-amber-600">
                  {zeroLines} component(s) carry 0 — the engine skips them, so a term with nothing else bills nothing.
                </p>
              )}
            </CardContent>
          </Card>

          {!valid && (
            <Card className="border-amber-100 bg-amber-50/50">
              <CardContent className="py-4 space-y-1.5">
                <div className="font-medium text-amber-700 text-sm flex items-center gap-2">
                  <TriangleAlert size={14} />
                  Fix before saving
                </div>
                {errors.map((e) => (<div key={e} className="text-sm text-amber-700">{e}</div>))}
              </CardContent>
            </Card>
          )}

          {draft.status === 'Active' && !canActivate && (
            <p className="text-sm text-amber-700">
              This template cannot stay Active: it needs a terms-per-year value and at least one component (§7.10).
            </p>
          )}
        </div>

        {/* Live term-by-term preview (§6.2) */}
        <Card className="lg:sticky lg:top-4 h-fit">
          <CardHeader>
            <CardTitle>Term by term</CardTitle>
            <CardDescription>Computed from the components as you edit — this is what a new student is billed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {preview.terms.map((t) => (
                <div key={t.term} className="flex items-baseline gap-2 py-1.5 text-sm">
                  <span className="text-slate-600">{termLabel(draft.program, t.term)}</span>
                  <span className="flex-1 border-b border-dotted border-slate-200" />
                  <span className="tabular-nums font-medium">{formatPKR(t.total)}</span>
                </div>
              ))}
              {preview.terms.length === 0 && (
                <div className="py-3 text-sm text-slate-400">No terms to bill — check the term count.</div>
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
              <div className="flex items-baseline gap-2 text-sm font-bold">
                <span>Course total</span>
                <span className="flex-1" />
                <span className="tabular-nums">{formatPKR(preview.courseTotal)}</span>
              </div>
              <div className="flex items-baseline gap-2 text-xs text-slate-500">
                <span>of which refundable</span>
                <span className="flex-1" />
                <span className="tabular-nums">{formatPKR(preview.refundableTotal)}</span>
              </div>
              <div className="flex items-baseline gap-2 text-xs text-slate-500">
                <span>first term charge</span>
                <span className="flex-1" />
                <span className="tabular-nums">{formatPKR(preview.firstTermTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
