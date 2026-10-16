// ============================================
// Batch drawer (create & edit) — BATCHES_ACADEMIC_SETUP_DESIGN §32, §16-§20
// Admin-only editor for a batch. It previews the automatic display name, blocks a
// duplicate (program + session + name), explains the program's structure beside the
// Term 1 date and shows the generated schedule, checks fee-template coverage as soon
// as program + session are chosen, and refuses seats below the admitted count. On edit
// the program is locked and the session locks once students exist; a change needs a
// reason. It renders as a Radix Dialog rather than a hand-rolled right drawer, because
// the design-system gate allows the fixed overlay only inside dialog / alert-dialog and
// only Radix gives the focus trap and Escape (§ overlay convention).
// ============================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Lock, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { confirmDialog } from '@/lib/confirm';
import { toastSuccess } from '@/lib/toast';
import { todayKey } from '@/lib/dates';
import {
  batchDisplayName,
  deriveRunningStatus,
  generateSchedule,
  isDuplicateBatchName,
  seatCountProblem,
  termLengthLabel,
  termLongLabel,
  type AcademicBatch,
} from '@/lib/academic';
import { computeBatchFigures, studentsInBatch } from '@/lib/academic/batchStats';
import {
  useAcademicStore,
  useAuditStore,
  useAuthStore,
  useFeeTemplateStore,
  useStudentStore,
} from '@/stores';
import type { AdmissionsState } from '@/lib/academic';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NAME_SUGGESTIONS = ['Fall', 'Spring', 'Evening', 'Morning'];

/** "1 Sep 2026" from a stored YYYY-MM-DD, day without a leading zero. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function BatchDrawer({ batch, presetProgramId, onClose }: {
  batch: AcademicBatch | null;
  presetProgramId?: string;
  onClose: () => void;
}) {
  const isEdit = batch !== null;
  const today = todayKey();

  const courses = useAcademicStore((s) => s.courses);
  const programs = useAcademicStore((s) => s.programs);
  const sessions = useAcademicStore((s) => s.sessions);
  const batches = useAcademicStore((s) => s.batches);
  const students = useStudentStore((s) => s.students);
  const templates = useFeeTemplateStore((s) => s.templates);
  const createBatch = useAcademicStore((s) => s.createBatch);
  const updateBatch = useAcademicStore((s) => s.updateBatch);

  const currentSession = sessions.find((s) => s.isCurrent);

  const [programId, setProgramId] = useState(batch?.programId ?? presetProgramId ?? '');
  const [session, setSession] = useState(String(batch?.session ?? currentSession?.year ?? ''));
  const [name, setName] = useState(batch?.name ?? '');
  const [term1Start, setTerm1Start] = useState(batch?.term1Start ?? '');
  const [seats, setSeats] = useState(batch?.seats != null ? String(batch.seats) : '');
  const [admissions, setAdmissions] = useState<AdmissionsState>(batch?.admissions ?? 'Open');
  const [notes, setNotes] = useState(batch?.notes ?? '');
  const [reason, setReason] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [error, setError] = useState('');

  const program = programs.find((p) => p.id === programId);
  const course = program ? courses.find((c) => c.id === program.courseId) : undefined;

  const sessionNum = parseInt(session, 10);
  const seatsNum = seats.trim() === '' ? null : parseInt(seats, 10);

  const schedule = useMemo(() => {
    if (!program || !term1Start || !Number.isFinite(sessionNum)) return [];
    try {
      return generateSchedule(term1Start, program.numTerms, program.termsPerYear);
    } catch {
      return [];
    }
  }, [program, term1Start, sessionNum]);

  const admitted = useMemo(() => {
    if (!program) return 0;
    const candidate: AcademicBatch = { ...(batch as AcademicBatch), programId, session: sessionNum, name };
    return batch ? studentsInBatch(candidate, program, students).length : 0;
  }, [batch, program, programId, sessionNum, name, students]);

  const nameTaken = !!program && Number.isFinite(sessionNum) && isDuplicateBatchName(batches, {
    id: batch?.id,
    programId,
    session: sessionNum,
    name,
  });

  const displayPreview = program && Number.isFinite(sessionNum)
    ? batchDisplayName(program.shortCode, name, sessionNum)
    : '';

  const template = program && course && Number.isFinite(sessionNum)
    ? computeBatchFigures({
        batch: { ...(batch as AcademicBatch), programId, session: sessionNum, name },
        program, course, students, templates, today,
      }).template
    : undefined;

  // Sessions offered: open ones, plus the batch's own session when editing a closed one.
  const openSessions = sessions.filter((s) => s.state === 'Open');
  const sessionOptions = isEdit && batch && !openSessions.some((s) => s.year === batch.session)
    ? [...openSessions, sessions.find((s) => s.year === batch.session)!].filter(Boolean)
    : openSessions;
  const sessionLocked = isEdit && admitted > 0;

  const futureStart = !!term1Start && term1Start > today;
  const statusNote = !term1Start ? '' : futureStart
    ? `Status will be Planned until ${formatDate(term1Start)}.`
    : 'Status will be Running.';

  const fieldsChanged = isEdit && batch && (
    name !== batch.name ||
    term1Start !== (batch.term1Start ?? '') ||
    (seatsNum ?? null) !== batch.seats ||
    admissions !== batch.admissions ||
    notes.trim() !== (batch.notes ?? '')
  );

  const createValid = !!program && Number.isFinite(sessionNum) && !!term1Start && name.trim().length <= 30 && !nameTaken;
  const editValid = !!program && name.trim().length <= 30 && !nameTaken &&
    seatCountProblem(seatsNum, admitted) === null && fieldsChanged && reason.trim().length >= 3;

  async function requestClose() {
    const dirty = isEdit ? fieldsChanged : !!(programId && (name || term1Start || seats || notes));
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Discard this batch?',
        effect: 'The batch has not been saved. Closing discards what you have entered.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      });
      if (!ok) return;
    }
    onClose();
  }

  const user = useAuthStore.getState().user?.name ?? 'Admin';

  function save() {
    setError('');
    if (name.trim().length > 30) return setError('Batch name must be 30 characters or fewer.');
    if (nameTaken) return setError('A batch with this name already exists for the program and session.');

    if (!isEdit) {
      if (!createValid || !program) return;
      const status = deriveRunningStatus(term1Start, today);
      createBatch({
        programId,
        session: sessionNum,
        name: name.trim(),
        status,
        admissions,
        seats: seatsNum,
        term1Start,
        schedule,
        notes: notes.trim() ? notes.trim() : null,
        createdBy: user,
      });
      useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Batch created: ${displayPreview}` });
      toastSuccess(`Batch ${displayPreview} created.`);
      onClose();
      return;
    }

    if (!batch) return;
    const seatMsg = seatCountProblem(seatsNum, admitted);
    if (seatMsg) return setError(seatMsg);
    if (!editValid) return setError('Change something and give a reason before saving.');

    const patch: Partial<Omit<AcademicBatch, 'id'>> = {
      name: name.trim(),
      seats: seatsNum,
      admissions,
      notes: notes.trim() ? notes.trim() : null,
    };
    if (term1Start !== (batch.term1Start ?? '')) {
      patch.term1Start = term1Start;
      patch.schedule = schedule;
      if (batch.status !== 'Completed') patch.status = deriveRunningStatus(term1Start, today);
    }
    updateBatch(batch.id, patch, user);
    useAuditStore.getState().addLog({
      user,
      action: 'Academic Setup',
      details: `Batch updated: ${displayPreview} — ${reason.trim()}`,
    });
    toastSuccess('Batch saved.');
    onClose();
  }

  const changedDot = (key: boolean) =>
    isEdit && key ? (
      <span aria-label="changed" className="ml-1 inline-block h-1.5 w-1.5 rounded-pill bg-accent align-middle" />
    ) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && void requestClose()}>
      <DialogContent className="ml-auto h-full max-h-full w-full max-w-[480px] translate-y-0 rounded-none border-l">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit batch: ${displayPreview}` : 'New batch'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Locked fields cannot change once students are admitted.' : 'Display name is built from the program, name and session.'}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Program *</Label>
            <Select value={programId} onValueChange={setProgramId} disabled={isEdit}>
              <SelectTrigger><SelectValue placeholder="Select a program" /></SelectTrigger>
              <SelectContent>
                {programs.filter((p) => p.status === 'Active').map((p) => {
                  const cn2 = courses.find((c) => c.id === p.courseId);
                  return <SelectItem key={p.id} value={p.id}>{p.shortCode}, {cn2?.name ?? ''}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            {isEdit && <p className="flex items-center gap-1 text-meta text-ink-muted"><Lock size={12} /> Locked after creation.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Session *</Label>
            <Select value={session} onValueChange={setSession} disabled={sessionLocked}>
              <SelectTrigger><SelectValue placeholder="Select a session" /></SelectTrigger>
              <SelectContent>
                {sessionOptions.map((s) => (
                  <SelectItem key={s.year} value={String(s.year)}>{s.year}{s.isCurrent ? ' (Current)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sessionLocked && (
              <p className="flex items-center gap-1 text-meta text-ink-muted">
                <Lock size={12} /> Locked: {admitted} student{admitted === 1 ? '' : 's'}.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Batch name</Label>
            <Input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Fall (optional)" />
            <div className="flex flex-wrap items-center gap-1">
              {NAME_SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => setName(s)} className="rounded-pill border border-hairline-strong bg-panel px-2 py-0.5 text-micro text-ink-secondary hover:bg-hairline-soft">{s}</button>
              ))}
            </div>
            <p className="text-body">
              <span className="font-semibold text-ink">{displayPreview || '—'}</span>
              {nameTaken && <span className="ml-2 text-danger">Name already used</span>}
              {changedDot(name !== (batch?.name ?? ''))}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Term 1 starts *</Label>
            <Input type="date" value={term1Start} onChange={(e) => setTerm1Start(e.target.value)} invalid={!isEdit && !term1Start} />
            {program && (
              <p className="text-meta text-ink-muted">
                {program.numTerms} {program.termSystem.toLowerCase()}s, {termLengthLabel(program.termsPerYear)} each.
                {schedule.length ? ` The course ends on ${formatDate(schedule[schedule.length - 1].ends)}.` : ''}
              </p>
            )}
            {statusNote && <p className="text-meta text-ink-muted">{statusNote}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Seats</Label>
              <Input type="text" inputMode="numeric" num value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="optional" />
              {isEdit && <p className="text-meta text-ink-muted">{admitted} admitted. Seats cannot go below {admitted}.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Admissions</Label>
              <div className="flex gap-1.5">
                {(['Open', 'Closed'] as AdmissionsState[]).map((a) => (
                  <Button
                    key={a}
                    type="button"
                    size="sm"
                    variant={admissions === a ? 'default' : 'outline'}
                    onClick={() => setAdmissions(a)}
                    aria-pressed={admissions === a}
                  >
                    {a}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
              placeholder="Optional"
            />
          </div>

          <div className="rounded-control border border-hairline">
            <button type="button" onClick={() => setShowSchedule((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-body font-medium text-ink">
              {showSchedule ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              Term schedule
              <span className="text-meta text-ink-muted">({schedule.length} terms)</span>
            </button>
            {showSchedule && (
              program ? (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Term</TableHead><TableHead>Starts</TableHead><TableHead>Ends</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedule.map((r) => (
                      <TableRow key={r.term}>
                        <TableCell>{termLongLabel(program.termSystem, r.term)}</TableCell>
                        <TableCell>{formatDate(r.starts)}</TableCell>
                        <TableCell>{formatDate(r.ends)}</TableCell>
                      </TableRow>
                    ))}
                    {schedule.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center text-ink-muted">Enter a Term 1 start date to generate the schedule.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              ) : <p className="px-3 pb-2 text-meta text-ink-muted">Choose a program first.</p>
            )}
          </div>

          {program && Number.isFinite(sessionNum) && (
            template ? (
              <p className="flex items-center gap-1.5 text-meta text-ink-secondary"><Check size={14} className="text-cleared" /> {template.name} v{template.version} will be used for admissions.</p>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-control border border-dues/25 bg-dues-soft p-2.5 text-meta text-ink">
                <span className="flex items-center gap-1.5"><TriangleAlert size={14} className="text-dues" /> No active fee template for {program.shortCode}, {sessionNum}.</span>
                <Button asChild variant="outline" size="sm"><Link to="/fee-templates">Create template</Link></Button>
              </div>
            )
          )}

          {isEdit && (
            <div className="space-y-1.5">
              <Label>Reason for change *</Label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className={cn(
                  'w-full resize-y rounded-control border bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle',
                  reason.trim().length > 0 && reason.trim().length < 3 ? 'border-danger' : 'border-hairline',
                )}
                placeholder="Correcting a typing mistake"
              />
            </div>
          )}

          {error && <p className="text-meta text-danger">{error}</p>}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => void requestClose()}>Cancel</Button>
          {isEdit ? (
            <Button onClick={save} disabled={!editValid}>Save changes</Button>
          ) : (
            <Button onClick={save} disabled={!createValid}>Create batch</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
