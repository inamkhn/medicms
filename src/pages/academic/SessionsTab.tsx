// ============================================
// Sessions tab — BATCHES_ACADEMIC_SETUP_DESIGN §36, §12
// The academic-year list replaces the fixed 2017–2028 array. Newest first, with the
// older closed sessions collapsed behind a toggle. Row actions: set current, close,
// reopen, edit notes and delete (unused only). The §12 rules are enforced here — the
// Current session cannot be closed, closing does not touch batches already started in
// it, and a session with batches or templates cannot be deleted. Every change is
// audited; mutations are Admin-only (academic.manage).
// ============================================

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmDialog, confirmWithReason } from '@/lib/confirm';
import { toastError, toastSuccess } from '@/lib/toast';
import { can } from '@/lib/permissions';
import type { AcademicSession } from '@/lib/academic';
import {
  useAcademicStore,
  useAuditStore,
  useAuthStore,
  useFeeTemplateStore,
  useStudentStore,
} from '@/stores';

type DialogState = { kind: 'add' } | { kind: 'notes'; session: AcademicSession } | null;

const EXPANDED_COUNT = 5;

export default function SessionsTab() {
  const role = useAuthStore((s) => s.user?.role);
  const canManage = can(role, 'academic.manage');

  const sessions = useAcademicStore((s) => s.sessions);
  const batches = useAcademicStore((s) => s.batches);
  const students = useStudentStore((s) => s.students);
  const templates = useFeeTemplateStore((s) => s.templates);

  const addSession = useAcademicStore((s) => s.addSession);
  const setCurrentSession = useAcademicStore((s) => s.setCurrentSession);
  const setSessionState = useAcademicStore((s) => s.setSessionState);
  const deleteSession = useAcademicStore((s) => s.deleteSession);
  const updateSession = useAcademicStore((s) => s.updateSession);

  const [showEarlier, setShowEarlier] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const sorted = useMemo(() => [...sessions].sort((a, b) => b.year - a.year), [sessions]);
  const newestYear = sorted.length ? sorted[0].year : new Date().getFullYear();

  const user = useAuthStore.getState().user?.name ?? 'Admin';

  const batchesIn = (year: number) => batches.filter((b) => b.session === year);
  const runningIn = (year: number) => batchesIn(year).filter((b) => b.status === 'Running');
  const studentsIn = (year: number) => students.filter((s) => s.session === year);
  const templatesIn = (year: number) => templates.filter((t) => t.session === year);

  const current = sessions.find((s) => s.isCurrent);
  const nextSession = current ?? sorted.find((s) => s.state === 'Open');

  const visible = showEarlier ? sorted : sorted.slice(0, EXPANDED_COUNT);
  const earlier = sorted.slice(EXPANDED_COUNT);

  async function onSetCurrent(s: AcademicSession) {
    const prev = current;
    const ok = await confirmDialog({
      title: `Make ${s.year} current?`,
      effect: `${s.year} will become the default session for new batches, admissions and templates.${prev ? ` ${prev.year} stays Open.` : ''}`,
      confirmLabel: 'Set as current',
    });
    if (!ok) return;
    setCurrentSession(s.year);
    useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Session set current: ${s.year}` });
    toastSuccess(`${s.year} is now the current session.`);
  }

  async function onClose(s: AcademicSession) {
    const running = runningIn(s.year).length;
    const ok = await confirmDialog({
      title: `Close session ${s.year}?`,
      effect: `Closing ${s.year} stops new batches, admissions and templates from using it. ${running} running batch${running === 1 ? '' : 'es'} started in ${s.year} ${running === 1 ? 'carries' : 'carry'} on as before.`,
      confirmLabel: 'Close session',
      tone: 'neutral',
    });
    if (!ok) return;
    setSessionState(s.year, 'Closed');
    useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Session closed: ${s.year}` });
    toastSuccess(`${s.year} closed.`);
  }

  async function onReopen(s: AcademicSession) {
    const outcome = await confirmWithReason({
      title: `Reopen session ${s.year}?`,
      effect: `${s.year} will accept new batches, admissions and templates again.`,
      confirmLabel: 'Reopen session',
      reason: { label: 'Reason *', placeholder: 'e.g. admit a late student into an older batch' },
    });
    if (!outcome.confirmed) return;
    setSessionState(s.year, 'Open');
    useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Session reopened: ${s.year} — ${outcome.reason ?? ''}` });
    toastSuccess(`${s.year} reopened.`);
  }

  async function onDelete(s: AcademicSession) {
    const used = batchesIn(s.year).length + templatesIn(s.year).length;
    if (used > 0) {
      toastError('This session has batches or templates and cannot be deleted.');
      return;
    }
    const ok = await confirmDialog({
      title: `Delete session ${s.year}?`,
      effect: `${s.year} has no batches or templates and will be deleted permanently.`,
      confirmLabel: 'Delete session',
      tone: 'destructive',
    });
    if (!ok) return;
    deleteSession(s.year);
    useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Session deleted: ${s.year}` });
    toastSuccess(`${s.year} deleted.`);
  }

  function onAddNext() {
    const created = addSession(newestYear + 1);
    if (!created) {
      toastError(`Session ${newestYear + 1} already exists.`);
      return;
    }
    useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Session added: ${newestYear + 1}` });
    toastSuccess(`${newestYear + 1} added.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-ui font-semibold text-ink">Sessions</h2>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onAddNext}>Add next session ({newestYear + 1})</Button>
            <Button size="sm" onClick={() => setDialog({ kind: 'add' })}>
              <Plus size={14} /> Add session
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-hairline bg-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Batches</TableHead>
              <TableHead className="text-right">Students</TableHead>
              <TableHead>Notes</TableHead>
              {canManage && <TableHead className="w-[44px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium text-ink num">{s.year}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {s.isCurrent && <Badge variant="default">Current</Badge>}
                    <Badge variant={s.state === 'Open' ? 'cleared' : 'secondary'}>{s.state}</Badge>
                  </div>
                </TableCell>
                <TableCell className="num text-right">{batchesIn(s.year).length}</TableCell>
                <TableCell className="num text-right">{studentsIn(s.year).length}</TableCell>
                <TableCell className="text-ink-muted">{s.notes ?? ''}</TableCell>
                {canManage && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for session ${s.year}`}>
                          <MoreHorizontal size={15} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={s.isCurrent} onSelect={() => !s.isCurrent && void onSetCurrent(s)}>
                          {s.isCurrent ? 'Current session' : 'Set as current'}
                        </DropdownMenuItem>
                        {s.state === 'Open' ? (
                          <DropdownMenuItem disabled={s.isCurrent} title="Make another session current first." onSelect={() => !s.isCurrent && void onClose(s)}>
                            Close
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => void onReopen(s)}>Reopen</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => setDialog({ kind: 'notes', session: s })}>Edit notes</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => void onDelete(s)}>Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {earlier.length > 0 && !showEarlier && (
          <button
            type="button"
            onClick={() => setShowEarlier(true)}
            className="flex w-full items-center gap-1.5 border-t border-hairline-soft px-3 py-2 text-left text-meta text-accent hover:bg-hairline-soft"
          >
            <ChevronRight size={14} /> Show earlier sessions ({earlier[earlier.length - 1].year} to {earlier[0].year})
          </button>
        )}
        {showEarlier && earlier.length > 0 && (
          <button
            type="button"
            onClick={() => setShowEarlier(false)}
            className="flex w-full items-center gap-1.5 border-t border-hairline-soft px-3 py-2 text-left text-meta text-ink-muted hover:bg-hairline-soft"
          >
            <ChevronDown size={14} /> Hide earlier sessions
          </button>
        )}
      </div>

      {nextSession && (
        <p className="text-meta text-ink-muted">
          New batches, admissions and templates default to session {nextSession.year}.
        </p>
      )}

      {dialog?.kind === 'add' && (
        <AddSessionDialog
          key="add-session"
          newestYear={newestYear}
          existingYears={sessions.map((s) => s.year)}
          onCancel={() => setDialog(null)}
          onSave={(year, notes, makeCurrent) => {
            const created = addSession(year);
            if (!created) {
              toastError(`Session ${year} already exists.`);
              return;
            }
            if (notes.trim()) updateSession(year, { notes: notes.trim() });
            if (makeCurrent) setCurrentSession(year);
            useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: makeCurrent ? `Session added and set current: ${year}` : `Session added: ${year}` });
            toastSuccess(`Session ${year} added.`);
            setDialog(null);
          }}
        />
      )}

      {dialog?.kind === 'notes' && (
        <NotesDialog
          key={`notes-${dialog.session.year}`}
          session={dialog.session}
          onCancel={() => setDialog(null)}
          onSave={(notes) => {
            updateSession(dialog.session.year, { notes: notes.trim() ? notes.trim() : null });
            useAuditStore.getState().addLog({ user, action: 'Academic Setup', details: `Session notes updated: ${dialog.session.year}` });
            toastSuccess('Notes saved.');
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function AddSessionDialog({
  newestYear,
  existingYears,
  onCancel,
  onSave,
}: {
  newestYear: number;
  existingYears: number[];
  onCancel: () => void;
  onSave: (year: number, notes: string, makeCurrent: boolean) => void;
}) {
  const [year, setYear] = useState(String(newestYear + 1));
  const [notes, setNotes] = useState('');
  const [makeCurrent, setMakeCurrent] = useState(false);
  const [error, setError] = useState('');

  function submit() {
    setError('');
    const y = parseInt(year, 10);
    if (!Number.isFinite(y) || year.trim().length !== 4) return setError('Session label must be a four-digit year.');
    if (existingYears.includes(y)) return setError(`Session ${y} already exists.`);
    onSave(y, notes, makeCurrent);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add session</DialogTitle>
          <DialogDescription>A session is an academic year. One session is always Current.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Year *</Label>
            <Input type="text" inputMode="numeric" num value={year} onChange={(e) => setYear(e.target.value)} invalid={!!error} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
              placeholder="Optional — e.g. Planned intake"
            />
          </div>
          <label className="flex items-center gap-2 text-body text-ink-secondary">
            <Checkbox checked={makeCurrent} onCheckedChange={(c) => setMakeCurrent(c === true)} />
            Make this the current session
          </label>
          {error && <p className="text-meta text-danger">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit}>Add session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotesDialog({
  session,
  onCancel,
  onSave,
}: {
  session: AcademicSession;
  onCancel: () => void;
  onSave: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(session.notes ?? '');
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notes for {session.year}</DialogTitle>
          <DialogDescription>Shown beside the session in filters and reports.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
            placeholder="Optional"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onSave(notes)}>Save notes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
