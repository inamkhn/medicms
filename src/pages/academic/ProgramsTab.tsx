// ============================================
// Programs tab — BATCHES_ACADEMIC_SETUP_DESIGN §35
// Courses and programs become editable data. Programs are grouped under their course,
// active first then disabled in grey; the row menu edits, disables/enables and deletes
// (unused only). The editor carries the §7 locks (short code once batches exist, term
// system once students exist), the term-count guard and the terms-per-year warning, and
// needs a reason for any change to an existing program. Mutations are Admin-only
// (academic.manage); the store write stays thin because every rule is validated here.
// ============================================

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmDialog } from '@/lib/confirm';
import { toastError, toastSuccess } from '@/lib/toast';
import { can } from '@/lib/permissions';
import {
  TERMS_PER_YEAR_CHOICES,
  courseLengthLabel,
  isValidTermsPerYear,
  numTermsBelowHighestStudentTerm,
  termLengthLabel,
  termLongLabel,
  type AcademicCourse,
  type AcademicProgram,
  type TermSystem,
} from '@/lib/academic';
import {
  useAcademicStore,
  useAuditStore,
  useAuthStore,
  useFeeTemplateStore,
  useStudentStore,
} from '@/stores';

// What the editor receives when an existing program is opened, so it can lock and warn
// without re-deriving counts; a new program gets the empty shape.
interface ProgramContext {
  batchCount: number;
  studentCount: number;
  highestStudentTerm: number;
  activeTemplates: number;
  runningBatches: number;
}
const EMPTY_CTX: ProgramContext = { batchCount: 0, studentCount: 0, highestStudentTerm: 0, activeTemplates: 0, runningBatches: 0 };

interface ProgramValues {
  courseId: string;
  name: string;
  shortCode: string;
  termSystem: TermSystem;
  numTerms: number;
  termsPerYear: number;
  notes: string | null;
}

type DialogState =
  | { kind: 'program'; program: AcademicProgram | null }
  | { kind: 'course'; course: AcademicCourse | null }
  | null;

export default function ProgramsTab() {
  const role = useAuthStore((s) => s.user?.role);
  const canManage = can(role, 'academic.manage');

  const courses = useAcademicStore((s) => s.courses);
  const programs = useAcademicStore((s) => s.programs);
  const batches = useAcademicStore((s) => s.batches);
  const students = useStudentStore((s) => s.students);
  const templates = useFeeTemplateStore((s) => s.templates);

  const addProgram = useAcademicStore((s) => s.addProgram);
  const updateProgram = useAcademicStore((s) => s.updateProgram);
  const deleteProgram = useAcademicStore((s) => s.deleteProgram);
  const addCourse = useAcademicStore((s) => s.addCourse);
  const updateCourse = useAcademicStore((s) => s.updateCourse);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<DialogState>(null);

  const sortedCourses = useMemo(() => [...courses].sort((a, b) => a.order - b.order), [courses]);

  const batchesFor = (p: AcademicProgram) => batches.filter((b) => b.programId === p.id);
  const studentsFor = (legacy?: string) => (legacy ? students.filter((s) => s.program === legacy) : []);
  const templatesFor = (legacy?: string) => (legacy ? templates.filter((t) => t.program === legacy) : []);
  const highestStudentTerm = (p: AcademicProgram) => {
    const terms = studentsFor(p.legacyValue)
      .map((s) => parseInt(s.semester, 10))
      .filter((n) => Number.isFinite(n));
    return terms.length ? Math.max(...terms) : 0;
  };

  const programContext = (p: AcademicProgram): ProgramContext => ({
    batchCount: batchesFor(p).length,
    studentCount: studentsFor(p.legacyValue).length,
    highestStudentTerm: highestStudentTerm(p),
    activeTemplates: templatesFor(p.legacyValue).filter((t) => t.status === 'Active').length,
    runningBatches: batchesFor(p).filter((b) => b.status === 'Running').length,
  });

  const orderedPrograms = (courseId: string) =>
    programs
      .filter((p) => p.courseId === courseId)
      .sort((a, b) =>
        a.status === b.status ? a.order - b.order : a.status === 'Active' ? -1 : 1,
      );

  const user = useAuthStore.getState().user?.name ?? 'Admin';

  async function onDisable(p: AcademicProgram) {
    const running = batchesFor(p).filter((b) => b.status === 'Running').length;
    if (running > 0) {
      toastError(`${p.shortCode} has ${running} running batch${running > 1 ? 'es' : ''}. Complete or close ${running > 1 ? 'them' : 'it'} first.`);
      return;
    }
    const ok = await confirmDialog({
      title: `Disable ${p.shortCode}?`,
      effect: `${p.name} will no longer appear in admission, new batch or template screens. Existing students keep their history.`,
      confirmLabel: 'Disable program',
      tone: 'neutral',
    });
    if (!ok) return;
    updateProgram(p.id, { status: 'Disabled' });
    useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Program disabled: ${p.shortCode}` });
    toastSuccess(`${p.shortCode} disabled.`);
  }

  async function onEnable(p: AcademicProgram) {
    const ok = await confirmDialog({
      title: `Enable ${p.shortCode}?`,
      effect: `${p.name} will again be selectable in admission, new batch and template screens.`,
      confirmLabel: 'Enable program',
    });
    if (!ok) return;
    updateProgram(p.id, { status: 'Active' });
    useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Program enabled: ${p.shortCode}` });
    toastSuccess(`${p.shortCode} enabled.`);
  }

  async function onDelete(p: AcademicProgram) {
    const used = batchesFor(p).length + templatesFor(p.legacyValue).length;
    if (used > 0) {
      toastError('This program has batches or templates and cannot be deleted.');
      return;
    }
    const ok = await confirmDialog({
      title: `Delete ${p.shortCode}?`,
      effect: 'This program has no batches or templates and will be deleted permanently.',
      confirmLabel: 'Delete program',
      tone: 'destructive',
    });
    if (!ok) return;
    deleteProgram(p.id);
    useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Program deleted: ${p.shortCode}` });
    toastSuccess(`${p.shortCode} deleted.`);
  }

  function saveProgram(values: ProgramValues, reason: string) {
    const editing = dialog?.kind === 'program' ? dialog.program : null;
    if (editing) {
      updateProgram(editing.id, { ...values });
      useAuditStore.getState().addLog({
        user,
        action: 'Academic Setup',
        details: `Program updated: ${editing.shortCode} — ${reason}`,
      });
    } else {
      const course = courses.find((c) => c.id === values.courseId);
      const order = (course?.order ?? 0) * 100 + programs.filter((p) => p.courseId === values.courseId).length;
      addProgram({ ...values, status: 'Active', order });
      useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Program created: ${values.shortCode}` });
    }
    toastSuccess('Program saved.');
    setDialog(null);
  }

  function saveCourse(values: { name: string; order: number; status: AcademicCourse['status'] }) {
    const editing = dialog?.kind === 'course' ? dialog.course : null;
    if (editing) {
      updateCourse(editing.id, values);
      useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Course updated: ${values.name}` });
    } else {
      addCourse({ name: values.name, status: 'Active', order: values.order });
      useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Course created: ${values.name}` });
    }
    toastSuccess('Course saved.');
    setDialog(null);
  }

  const editCtx = dialog?.kind === 'program' && dialog.program ? programContext(dialog.program) : EMPTY_CTX;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-ui font-semibold text-ink">Programs</h2>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'course', course: null })}>
              <Plus size={14} /> New course
            </Button>
            <Button size="sm" onClick={() => setDialog({ kind: 'program', program: null })}>
              <Plus size={14} /> New program
            </Button>
          </div>
        )}
      </div>

      {sortedCourses.map((course) => {
        const rows = orderedPrograms(course.id);
        const activeCount = rows.filter((p) => p.status === 'Active').length;
        const isCollapsed = collapsed[course.id];
        return (
          <div key={course.id} className="overflow-hidden rounded-card border border-hairline bg-panel">
            <div className="flex items-center justify-between gap-2 border-b border-hairline-soft bg-hairline-soft/50 px-3 py-2">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [course.id]: !c[course.id] }))}
                className="flex flex-1 items-center gap-2 text-left"
              >
                {isCollapsed ? <ChevronRight size={16} className="text-ink-muted" /> : <ChevronDown size={16} className="text-ink-muted" />}
                <span className="text-body font-semibold text-ink">{course.name}</span>
                <span className="text-meta text-ink-muted">
                  ({rows.length} program{rows.length === 1 ? '' : 's'}, {activeCount} active)
                </span>
                {course.status === 'Disabled' && <Badge variant="secondary">Disabled</Badge>}
              </button>
              {canManage && (
                <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'course', course })}>
                  Edit course
                </Button>
              )}
            </div>

            {!isCollapsed && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Program</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>System</TableHead>
                    <TableHead>Terms</TableHead>
                    <TableHead>Per year</TableHead>
                    <TableHead>Term length</TableHead>
                    <TableHead className="text-right">Batches</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="w-[44px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id} className={p.status === 'Disabled' ? 'text-ink-muted' : undefined}>
                      <TableCell className="font-medium text-ink">{p.name}</TableCell>
                      <TableCell className="num">{p.shortCode}</TableCell>
                      <TableCell>{p.termSystem}</TableCell>
                      <TableCell className="num">{p.numTerms}</TableCell>
                      <TableCell className="num">{p.termsPerYear}</TableCell>
                      <TableCell>{termLengthLabel(p.termsPerYear)}</TableCell>
                      <TableCell className="num text-right">{batchesFor(p).length}</TableCell>
                      <TableCell className="num text-right">{studentsFor(p.legacyValue).length}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === 'Active' ? 'cleared' : 'secondary'}>{p.status}</Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${p.shortCode}`}>
                                <MoreHorizontal size={15} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setDialog({ kind: 'program', program: p })}>Edit</DropdownMenuItem>
                              {p.status === 'Active' ? (
                                <DropdownMenuItem onSelect={() => void onDisable(p)}>Disable</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => void onEnable(p)}>Enable</DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onSelect={() => void onDelete(p)}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={canManage ? 10 : 9} className="py-6 text-center text-ink-muted">
                        No programs in this course yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        );
      })}

      {dialog?.kind === 'program' && (
        <ProgramDialog
          key={dialog.program?.id ?? 'new'}
          program={dialog.program}
          courses={sortedCourses.filter((c) => c.status === 'Active')}
          allPrograms={programs}
          context={editCtx}
          onCancel={() => setDialog(null)}
          onSave={saveProgram}
        />
      )}

      {dialog?.kind === 'course' && (
        <CourseDialog
          key={dialog.course?.id ?? 'new-course'}
          course={dialog.course}
          nextOrder={sortedCourses.length === 0 ? 0 : Math.max(...sortedCourses.map((c) => c.order)) + 1}
          onCancel={() => setDialog(null)}
          onSave={saveCourse}
        />
      )}
    </div>
  );
}

// --- Program editor (§35.2) ---

function ProgramDialog({
  program,
  courses,
  allPrograms,
  context,
  onCancel,
  onSave,
}: {
  program: AcademicProgram | null;
  courses: AcademicCourse[];
  allPrograms: AcademicProgram[];
  context: ProgramContext;
  onCancel: () => void;
  onSave: (values: ProgramValues, reason: string) => void;
}) {
  const isEdit = program !== null;
  const [courseId, setCourseId] = useState(program?.courseId ?? courses[0]?.id ?? '');
  const [name, setName] = useState(program?.name ?? '');
  const [shortCode, setShortCode] = useState(program?.shortCode ?? '');
  const [termSystem, setTermSystem] = useState<TermSystem>(program?.termSystem ?? 'Semester');
  const [numTerms, setNumTerms] = useState(String(program?.numTerms ?? 2));
  const [termsPerYear, setTermsPerYear] = useState(String(program?.termsPerYear ?? 2));
  const [notes, setNotes] = useState(program?.notes ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const shortCodeLocked = isEdit && context.batchCount > 0;
  const termSystemLocked = isEdit && context.studentCount > 0;
  const termsNum = parseInt(numTerms, 10);
  const tpy = parseInt(termsPerYear, 10);
  const belowTerm = context.highestStudentTerm > 0 && numTermsBelowHighestStudentTerm(Number.isFinite(termsNum) ? termsNum : 0, [context.highestStudentTerm]);
  const tpyChanged = isEdit && tpy !== (program?.termsPerYear ?? tpy);
  const affected = context.activeTemplates + context.runningBatches;

  function submit() {
    setError('');
    if (!name.trim()) return setError('Program name is required.');
    if (!shortCode.trim()) return setError('Short code is required.');
    if (shortCode.trim().length > 8) return setError('Short code must be 8 characters or fewer.');
    const clash = allPrograms.some(
      (p) => p.id !== program?.id && p.shortCode.toLowerCase() === shortCode.trim().toLowerCase(),
    );
    if (clash) return setError(`The code ${shortCode.trim().toUpperCase()} is already used by another program.`);
    if (!Number.isFinite(termsNum) || termsNum < 1 || termsNum > 12) return setError('Number of terms must be between 1 and 12.');
    if (belowTerm) return setError(`Cannot be below ${context.highestStudentTerm}. A student is in ${termLongLabel(termSystem, context.highestStudentTerm)}.`);
    if (!isValidTermsPerYear(tpy)) return setError('Choose how many terms make one year.');
    if (isEdit && reason.trim().length < 3) return setError('A reason is required for a change.');

    onSave(
      {
        courseId,
        name: name.trim(),
        shortCode: shortCode.trim().toUpperCase(),
        termSystem,
        numTerms: termsNum,
        termsPerYear: tpy,
        notes: notes.trim() ? notes.trim() : null,
      },
      reason.trim(),
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit program: ${program?.shortCode}` : 'New program'}</DialogTitle>
          <DialogDescription>Course structure and the term system that drives promotion.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Course *</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Health Technology" />
          </div>

          <div className="space-y-1.5">
            <Label>Short code *</Label>
            <Input value={shortCode} maxLength={8} disabled={shortCodeLocked} onChange={(e) => setShortCode(e.target.value)} placeholder="HLT" />
            {shortCodeLocked && (
              <p className="text-meta text-ink-muted">Locked: {context.batchCount} batch{context.batchCount > 1 ? 'es' : ''} use this code.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Term system</Label>
            <Select value={termSystem} onValueChange={(v) => setTermSystem(v as TermSystem)} disabled={termSystemLocked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['Semester', 'Year', 'Term'] as TermSystem[]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {termSystemLocked && <p className="text-meta text-ink-muted">Locked: students exist.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Number of terms</Label>
            <Input type="text" inputMode="numeric" num value={numTerms} onChange={(e) => setNumTerms(e.target.value)} invalid={belowTerm} />
            {belowTerm && (
              <p className="text-meta text-danger">Cannot be below {context.highestStudentTerm} (a student is in {termLongLabel(termSystem, context.highestStudentTerm)}).</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Terms per year</Label>
            <Select value={termsPerYear} onValueChange={setTermsPerYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TERMS_PER_YEAR_CHOICES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            {isValidTermsPerYear(tpy) && (
              <p className="text-meta text-ink-muted">&rarr; each term lasts {termLengthLabel(tpy)}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Course length</Label>
            <p className="text-body text-ink">
              {Number.isFinite(termsNum) && isValidTermsPerYear(tpy) ? courseLengthLabel(termsNum, tpy) : '—'}
            </p>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
              placeholder="Optional"
            />
          </div>

          {tpyChanged && affected > 0 && (
            <div className="col-span-2 rounded-control border border-dues/25 bg-dues-soft p-3 text-meta text-ink">
              Changing terms per year affects {context.activeTemplates} Active template{context.activeTemplates === 1 ? '' : 's'} and {context.runningBatches} running batch{context.runningBatches === 1 ? '' : 'es'}. Students already admitted keep the value stored in their plan.
            </div>
          )}

          {isEdit && (
            <div className="col-span-2 space-y-1.5">
              <Label>Reason *</Label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className={cn(
                  'w-full resize-y rounded-control border bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle',
                  reason.trim().length > 0 && reason.trim().length < 3 ? 'border-danger' : 'border-hairline',
                )}
                placeholder="Updating program structure"
              />
            </div>
          )}

          {error && <p className="col-span-2 text-meta text-danger">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit}>{isEdit ? 'Save program' : 'Create program'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Course editor (§35.3 New course: name, order) ---

function CourseDialog({
  course,
  nextOrder,
  onCancel,
  onSave,
}: {
  course: AcademicCourse | null;
  nextOrder: number;
  onCancel: () => void;
  onSave: (values: { name: string; order: number; status: AcademicCourse['status'] }) => void;
}) {
  const isEdit = course !== null;
  const [name, setName] = useState(course?.name ?? '');
  const [order, setOrder] = useState(String(course?.order ?? nextOrder));
  const [status, setStatus] = useState<AcademicCourse['status']>(course?.status ?? 'Active');
  const [error, setError] = useState('');

  function submit() {
    setError('');
    if (!name.trim()) return setError('Course name is required.');
    const orderNum = parseInt(order, 10);
    if (!Number.isFinite(orderNum) || orderNum < 0) return setError('Order must be zero or greater.');
    onSave({ name: name.trim(), order: orderNum, status });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit course: ${course?.name}` : 'New course'}</DialogTitle>
          <DialogDescription>A course groups one or more programs; it never carries terms itself.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Paramedics" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Order</Label>
              <Input type="text" inputMode="numeric" num value={order} onChange={(e) => setOrder(e.target.value)} />
            </div>
            {isEdit && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as AcademicCourse['status'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {error && <p className="text-meta text-danger">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit}>{isEdit ? 'Save course' : 'Create course'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
