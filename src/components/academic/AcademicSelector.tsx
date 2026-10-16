// ============================================
// AcademicSelector — BATCHES_ACADEMIC_SETUP_DESIGN §38, §42.1
// The one four-level Course → Program → Session → Batch picker used identically in
// admission, the directory filters, fee templates, promotion and the edit-student
// correction. All the offer/grey/hide rules come from the tested selector core, so a
// screen can never drift from another (§38.2 "one component keeps the rules identical").
// It is controlled: the parent owns the selection (so a list screen can keep it in the
// address) and reads both the IDs and — via the last batch option — the legacy
// (program, batch name, session) triple still stored on students. Changing a level
// clears the ones below it, and a lone remaining option is selected automatically.
// ============================================

import { useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { todayKey } from '@/lib/dates';
import {
  batchDisplayName,
  selectorBatches, selectorCourses, selectorPrograms, selectorSessions,
  type SelectorBatch, type SelectorContext,
} from '@/lib/academic';
import { useAcademicStore, useFeeTemplateStore, useStudentStore } from '@/stores';

/** The current picker selection. `session` is '' until a value is chosen. */
export interface AcademicSelection {
  courseId: string;
  programId: string;
  session: number | '';
  batchId: string;
}

/** The one Select value that means "no choice" — Radix items cannot hold ''. */
const ALL = 'all';

export function AcademicSelector({
  context, value, onChange, includeCompleted = false,
  disabled = false, lockedLevels, today = todayKey(), className,
}: {
  context: SelectorContext;
  value: AcademicSelection;
  onChange: (next: AcademicSelection) => void;
  /** Directory/promotion: whether a Completed batch is offered (§38.3). */
  includeCompleted?: boolean;
  disabled?: boolean;
  /** Levels a screen pre-fills and refuses to let anyone change (duplicate template:
   *  course and program follow the source). They stay visible, greyed. */
  lockedLevels?: Partial<Record<'course' | 'program' | 'session' | 'batch', boolean>>;
  today?: string;
  className?: string;
}) {
  // §38.3 which levels may be left at "All …" is a context rule, not a screen choice:
  // the directory filters on every level; a fee template can cover a whole placement.
  // Everywhere else each level is required. The directory also opts out of the
  // "one match" auto-select — auto-narrowing a filter nobody touched is wrong (§38.2).
  const optCourse = context === 'directory';
  const optProgram = context === 'directory';
  const optSession = context === 'directory';
  const optBatch = context === 'directory' || context === 'feeTemplate';

  const courses = useAcademicStore((s) => s.courses);
  const programs = useAcademicStore((s) => s.programs);
  const sessions = useAcademicStore((s) => s.sessions);
  const batches = useAcademicStore((s) => s.batches);
  const students = useStudentStore((s) => s.students);
  const templates = useFeeTemplateStore((s) => s.templates);

  const offeredPrograms = useMemo(
    () => selectorPrograms(context, programs, { programId: value.programId || undefined }),
    [context, programs, value.programId],
  );
  const offeredCourses = useMemo(
    () => selectorCourses(context, courses, offeredPrograms),
    [context, courses, offeredPrograms],
  );
  const offeredSessions = useMemo(
    () => selectorSessions(context, sessions),
    [context, sessions],
  );

  const program = offeredPrograms.find((p) => p.id === value.programId);
  const course = offeredCourses.find((c) => c.id === (program?.courseId ?? value.courseId));

  const offeredBatches = useMemo(() => {
    if (!program || value.session === '') return [];
    return selectorBatches({
      context, batches, program, course, students, templates, today,
      programId: program.id, session: value.session, includeCompleted,
    });
  }, [context, batches, program, course, students, templates, today, value.session, includeCompleted]);

  // §38.2 "one match": a level with exactly one choice and nothing selected fills
  // itself. The directory opts out — it filters, so auto-narrowing a level nobody
  // touched is wrong, and "All" is a legitimate choice there.
  useEffect(() => {
    if (disabled || optCourse) return;
    if (!value.courseId && offeredCourses.length === 1) {
      onChange({ ...value, courseId: offeredCourses[0].id });
      return;
    }
    if (value.courseId && !value.programId && offeredPrograms.length === 1) {
      onChange({ ...value, programId: offeredPrograms[0].id, courseId: offeredPrograms[0].courseId });
      return;
    }
    if (value.programId && value.session === '' && offeredSessions.length === 1) {
      onChange({ ...value, session: offeredSessions[0].year });
    }
  }, [disabled, optCourse, value, offeredCourses, offeredPrograms, offeredSessions, onChange]);

  // Radix items cannot hold '', so the unselected state of an optional level maps to
  // the "All …" sentinel; required levels have no sentinel and show the placeholder.
  const show = (id: string, optional: boolean) => (optional && id === '' ? ALL : id);
  const read = (v: string) => (v === ALL ? '' : v);
  const lock = (level: 'course' | 'program' | 'session' | 'batch') => disabled || lockedLevels?.[level] === true;

  const setCourse = (v: string) =>
    onChange({ courseId: read(v), programId: '', session: '', batchId: '' });

  const setProgram = (v: string) => {
    const programId = read(v);
    onChange({
      courseId: programs.find((p) => p.id === programId)?.courseId ?? value.courseId,
      programId,
      session: value.session,
      batchId: '',
    });
  };

  const setSession = (v: string) =>
    onChange({ ...value, session: v === ALL ? '' : Number(v), batchId: '' });

  const setBatch = (v: string) => onChange({ ...value, batchId: read(v) });

  // Keep a chosen course visible even when its programs list is empty (directory context).
  const courseValue = show(value.courseId || (program ? program.courseId : ''), optCourse);

  // A chosen batch that is not among the offers (a Completed batch reached through an
  // old saved view, a filter kept while "Include completed" is off) stays visible as a
  // label instead of leaking the bare id into the trigger.
  const chosenBatch = value.batchId && !offeredBatches.some((o) => o.batch.id === value.batchId)
    ? batches.find((b) => b.id === value.batchId)
    : undefined;
  const chosenProgram = chosenBatch ? programs.find((p) => p.id === chosenBatch.programId) : undefined;

  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <SelectorField label="Course">
        <Select value={courseValue} onValueChange={setCourse} disabled={lock('course')}>
          <SelectTrigger className="min-w-[150px]"><SelectValue placeholder="Course" /></SelectTrigger>
          <SelectContent>
            {optCourse && <SelectItem value={ALL}>All courses</SelectItem>}
            {offeredCourses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </SelectorField>

      <SelectorField label="Program">
        <Select value={show(value.programId, optProgram)} onValueChange={setProgram} disabled={lock('program') || (!optProgram && !value.courseId && offeredCourses.length > 1)}>
          <SelectTrigger className="min-w-[150px]"><SelectValue placeholder="Program" /></SelectTrigger>
          <SelectContent>
            {optProgram && <SelectItem value={ALL}>All programs</SelectItem>}
            {offeredPrograms
              .filter((p) => !value.courseId || p.courseId === value.courseId)
              .map((p) => <SelectItem key={p.id} value={p.id}>{p.shortCode} — {p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </SelectorField>

      <SelectorField label="Session">
        <Select value={value.session === '' ? (optSession ? ALL : '') : String(value.session)} onValueChange={setSession} disabled={lock('session') || (!optSession && !value.programId)}>
          <SelectTrigger className="min-w-[110px]"><SelectValue placeholder="Session" /></SelectTrigger>
          <SelectContent>
            {optSession && <SelectItem value={ALL}>All sessions</SelectItem>}
            {offeredSessions.map((s) => (
              <SelectItem key={s.year} value={String(s.year)}>{s.year}{s.isCurrent ? ' (Current)' : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SelectorField>

      <SelectorField label="Batch">
        <Select value={show(value.batchId, optBatch)} onValueChange={setBatch} disabled={lock('batch') || value.session === '' || !program}>
          <SelectTrigger className="min-w-[220px]"><SelectValue placeholder="Batch" /></SelectTrigger>
          <SelectContent>
            {optBatch && <SelectItem value={ALL}>All batches</SelectItem>}
            {chosenBatch && (
              <SelectItem value={chosenBatch.id}>
                {chosenProgram
                  ? batchDisplayName(chosenProgram.shortCode, chosenBatch.name, chosenBatch.session)
                  : `Batch ${chosenBatch.id}`}
              </SelectItem>
            )}
            {offeredBatches.map((o) => (
              <SelectItem key={o.batch.id} value={o.batch.id} disabled={o.disabled}>
                {batchLabel(context, o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SelectorField>
    </div>
  );
}

/** §38.1 — the batch dropdown line, with the context's suffix (count / state / reason). */
function batchLabel(context: SelectorContext, o: SelectorBatch): string {
  if (o.disabled && o.reason) return `${o.displayName} — ${o.reason}`;
  switch (context) {
    case 'admission':
      return `${o.displayName}   ${o.admitted} students   ${o.batch.admissions}`;
    case 'promotion':
      return o.dueForPromotion ? `${o.displayName}   Promotion due` : o.displayName;
    default:
      return o.displayName;
  }
}

function SelectorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-micro text-ink-muted">{label}</Label>
      {children}
    </div>
  );
}
