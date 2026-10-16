// ============================================
// Batch header "More" menu — BATCHES_ACADEMIC_SETUP_DESIGN §33.1, §34, §17, §21
// The state-changing actions that are not full-field edits: rename, close/reopen
// admissions, mark completed, reopen a completed batch, and delete (unused only).
// Each one is gated by its own §3 capability — an Accountant may move admissions,
// dates and completion, but only an Admin renames, reopens a completed batch or
// deletes. Every action writes the audit trail with the old and new value. Simple
// confirmations go through the confirm bridge; the two that must show impact or a
// choice (rename, mark completed) are their own dialogs. No hand-rolled overlays:
// the single-overlay convention (§ design system) keeps everything in Radix Dialog.
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CircleCheck,
  Lock,
  MoreHorizontal,
  PenLine,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { confirmDialog, confirmWithReason } from '@/lib/confirm';
import { toastSuccess } from '@/lib/toast';
import { batchDisplayName, isDuplicateBatchName, type AcademicBatch, type AcademicProgram } from '@/lib/academic';
import { studentsInBatch, templatesForBatch } from '@/lib/academic/batchStats';
import { can } from '@/lib/permissions';
import {
  useAcademicStore,
  useAuditStore,
  useAuthStore,
  useDirectoryStore,
  useFeeTemplateStore,
  useStudentStore,
} from '@/stores';

/** Saved directory views whose `batch` filter points at this batch name (§34.1 impact). */
function savedViewsForBatch(
  views: readonly { query: string }[],
  batchName: string,
): number {
  const wanted = batchName.trim().toLowerCase();
  if (!wanted) return 0;
  return views.filter((v) => {
    const q = new URLSearchParams(v.query.startsWith('?') ? v.query.slice(1) : v.query);
    return (q.get('batch') ?? '').trim().toLowerCase() === wanted;
  }).length;
}

export function BatchMoreMenu({ batch, program }: {
  batch: AcademicBatch;
  program: AcademicProgram | undefined;
}) {
  const navigate = useNavigate();

  const role = useAuthStore((s) => s.user?.role);
  const user = useAuthStore((s) => s.user?.name) ?? 'Admin';

  const batches = useAcademicStore((s) => s.batches);
  const sessions = useAcademicStore((s) => s.sessions);
  const students = useStudentStore((s) => s.students);
  const templates = useFeeTemplateStore((s) => s.templates);
  const views = useDirectoryStore((s) => s.views);

  const updateBatch = useAcademicStore((s) => s.updateBatch);
  const setAdmissions = useAcademicStore((s) => s.setAdmissions);
  const setStatus = useAcademicStore((s) => s.setStatus);
  const deleteBatch = useAcademicStore((s) => s.deleteBatch);
  const addLog = useAuditStore((s) => s.addLog);

  const [renameOpen, setRenameOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const displayName = program ? batchDisplayName(program.shortCode, batch.name, batch.session) : 'Batch';

  // --- Impact + gating (§17, §21, §34) ---
  const matched = useMemo(() => studentsInBatch(batch, program, students), [batch, program, students]);
  const batchTemplates = useMemo(() => templatesForBatch(batch, program, templates), [batch, program, templates]);
  const affectedViews = useMemo(() => savedViewsForBatch(views, batch.name), [views, batch.name]);

  const activeCount = matched.filter((s) => !s.struckOff).length;
  const struckCount = matched.filter((s) => s.struckOff).length;

  const session = sessions.find((s) => s.year === batch.session);
  const sessionClosed = !session || session.state !== 'Open';

  // Rename / reopen-completed / delete are Admin (academic.manage); admissions and
  // complete carry their own capabilities so an Accountant can reach them (§3).
  const canManage = can(role, 'academic.manage');
  const canAdmissions = can(role, 'academic.admissions');
  const canComplete = can(role, 'academic.complete');

  const reopenAdmissionsBlocked = batch.status === 'Completed' ? 'The batch is completed.'
    : sessionClosed ? `Session ${batch.session} is closed.` : null;

  const isUsed = matched.length > 0 || batchTemplates.length > 0;
  const deleteReason = matched.length > 0
    ? `This batch has ${matched.length} ${matched.length === 1 ? 'student' : 'students'} and cannot be deleted.`
    : batchTemplates.length > 0
      ? `This batch has ${batchTemplates.length} fee ${batchTemplates.length === 1 ? 'template' : 'templates'} and cannot be deleted.`
      : null;

  const showMenu = canManage || canAdmissions || canComplete;

  // --- Actions ---

  async function toggleAdmissions() {
    if (batch.admissions === 'Open') {
      const outcome = await confirmWithReason({
        title: 'Close admissions',
        effect: `${displayName} will no longer appear in the admission form. Its students are not affected.`,
        confirmLabel: 'Close admissions',
        reason: { label: 'Note (optional)', placeholder: 'Seats nearly full' },
      });
      if (!outcome.confirmed) return;
      setAdmissions(batch.id, 'Closed', user);
      addLog({
        user,
        action: 'Academic Setup',
        details: `${displayName}: admissions closed${outcome.reason ? `. Note: ${outcome.reason}` : ''}`,
        changes: [{ field: 'Admissions', before: 'Open', after: 'Closed' }],
      });
      toastSuccess('Admissions closed.');
    } else {
      if (reopenAdmissionsBlocked) return;
      const outcome = await confirmWithReason({
        title: 'Reopen admissions',
        effect: `${displayName} will appear in the admission form again.`,
        confirmLabel: 'Reopen admissions',
        reason: { label: 'Note (optional)', placeholder: 'Extra seats approved' },
      });
      if (!outcome.confirmed) return;
      setAdmissions(batch.id, 'Open', user);
      addLog({
        user,
        action: 'Academic Setup',
        details: `${displayName}: admissions reopened${outcome.reason ? `. Note: ${outcome.reason}` : ''}`,
        changes: [{ field: 'Admissions', before: 'Closed', after: 'Open' }],
      });
      toastSuccess('Admissions reopened.');
    }
  }

  async function reopenCompleted() {
    const outcome = await confirmWithReason({
      title: 'Reopen completed batch',
      effect: `${displayName} will be set Running again, with admissions Closed. Change its status back to Running.`,
      confirmLabel: 'Reopen batch',
      tone: 'neutral',
      reason: { label: 'Reason *', placeholder: 'Late term still running' },
    });
    if (!outcome.confirmed) return;
    setStatus(batch.id, 'Running', user);
    addLog({
      user,
      action: 'Academic Setup',
      details: `${displayName}: reopened from Completed — ${outcome.reason ?? ''}`.trim(),
      changes: [{ field: 'Status', before: 'Completed', after: 'Running' }],
    });
    toastSuccess('Batch reopened.');
  }

  async function doDelete() {
    if (isUsed) return;
    const ok = await confirmDialog({
      title: 'Delete batch',
      effect: 'This batch has no students, fee plans or templates. It will be deleted permanently.',
      confirmLabel: 'Delete batch',
      tone: 'destructive',
    });
    if (!ok) return;
    deleteBatch(batch.id);
    addLog({ user, action: 'Academic Setup', details: `${displayName}: batch deleted (was unused)` });
    toastSuccess('Batch deleted.');
    navigate('/academic/batches');
  }

  function commitComplete() {
    setStatus(batch.id, 'Completed', user);
    addLog({
      user,
      action: 'Academic Setup',
      details: `${displayName}: marked completed. Admissions closed.`,
      changes: [{ field: 'Status', before: batch.status, after: 'Completed' }, { field: 'Admissions', before: batch.admissions, after: 'Closed' }],
    });
    toastSuccess('Batch marked completed.');
    setCompleteOpen(false);
  }

  if (!showMenu) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="More actions">
            <MoreHorizontal size={14} /> More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canManage && (
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              <PenLine size={14} /> Rename
            </DropdownMenuItem>
          )}

          {canAdmissions && (
            batch.admissions === 'Open' ? (
              <DropdownMenuItem onSelect={() => void toggleAdmissions()}>
                <Lock size={14} /> Close admissions
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={!!reopenAdmissionsBlocked}
                onSelect={() => void toggleAdmissions()}
              >
                <Unlock size={14} /> Reopen admissions
                {reopenAdmissionsBlocked && <span className="ml-auto text-micro text-ink-muted">({reopenAdmissionsBlocked})</span>}
              </DropdownMenuItem>
            )
          )}

          {canComplete && batch.status !== 'Completed' && (
            <DropdownMenuItem onSelect={() => setCompleteOpen(true)}>
              <CircleCheck size={14} /> Mark completed
            </DropdownMenuItem>
          )}

          {canManage && batch.status === 'Completed' && (
            <DropdownMenuItem onSelect={() => void reopenCompleted()}>
              <RotateCcw size={14} /> Reopen completed batch
            </DropdownMenuItem>
          )}

          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                destructive
                disabled={isUsed}
                onSelect={() => void doDelete()}
              >
                <Trash2 size={14} /> {deleteReason ?? 'Delete batch'}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {renameOpen && (
        <RenameDialog
          batch={batch}
          program={program}
          batches={batches}
          displayName={displayName}
          affected={{ students: matched.length, templates: batchTemplates.length, views: affectedViews }}
          onClose={() => setRenameOpen(false)}
          onSubmit={(nextName, reason) => {
            const before = batch.name;
            updateBatch(batch.id, { name: nextName }, user);
            addLog({
              user,
              action: 'Academic Setup',
              details: `${displayName}: renamed "${before}" → "${nextName}" — ${reason}`,
              changes: [{ field: 'Name', before, after: nextName }],
            });
            toastSuccess('Batch renamed.');
            setRenameOpen(false);
          }}
        />
      )}

      {completeOpen && (
        <Dialog open onOpenChange={(o) => !o && setCompleteOpen(false)}>
          <DialogContent showClose>
            <DialogHeader>
              <DialogTitle>Mark {displayName} as completed?</DialogTitle>
              <DialogDescription>The batch is finished. Admissions will be closed and it will be hidden from selectors.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="flex gap-4 text-body text-ink">
                <span>Active <span className="num font-semibold">{activeCount}</span></span>
                <span>Struck off <span className="num font-semibold">{struckCount}</span></span>
                <span>Total <span className="num font-semibold">{matched.length}</span></span>
              </div>

              <label className="flex items-start gap-2 text-body text-ink-muted">
                <Checkbox checked disabled />
                <span>
                  Mark the remaining Active students as Completed
                  <span className="block text-meta text-ink-subtle">
                    Per-student completion arrives with promotion (Phase 7), so this is not available yet.
                  </span>
                </span>
              </label>

              {activeCount > 0 && (
                <p className="flex items-start gap-2 rounded-control border border-dues/25 bg-dues-soft p-2.5 text-meta text-ink">
                  <TriangleAlert size={14} className="mt-0.5 flex-none text-dues" />
                  The {activeCount} Active {activeCount === 1 ? 'student stays' : 'students stay'} Active, so this batch will show a warning until the students move on.
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancel</Button>
              <Button onClick={commitComplete}>Mark completed</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// --- Rename dialog (§34.1): shows the display-name change and what it affects ----

function RenameDialog({
  batch, program, batches, displayName, affected, onClose, onSubmit,
}: {
  batch: AcademicBatch;
  program: AcademicProgram | undefined;
  batches: readonly AcademicBatch[];
  displayName: string;
  affected: { students: number; templates: number; views: number };
  onClose: () => void;
  onSubmit: (name: string, reason: string) => void;
}) {
  const [name, setName] = useState(batch.name);
  const [reason, setReason] = useState('');

  const shortCode = program?.shortCode ?? '';
  const preview = program ? batchDisplayName(shortCode, name.trim(), batch.session) : '';
  const taken = !!program && isDuplicateBatchName(batches, { id: batch.id, programId: batch.programId, session: batch.session, name });

  const tooLong = name.trim().length > 30;
  const unchanged = name.trim() === batch.name;
  const canSave = !unchanged && !taken && !tooLong && reason.trim().length >= 3;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showClose>
        <DialogHeader>
          <DialogTitle>Rename batch</DialogTitle>
          <DialogDescription>
            Students link to the batch, not its name, so every screen shows the new name straight away. Documents already printed keep the old name.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="batch-rename-name">Name</Label>
            <Input
              id="batch-rename-name"
              value={name}
              maxLength={30}
              autoFocus
              invalid={taken || tooLong}
              onChange={(e) => setName(e.target.value)}
              placeholder={batch.name || '(no name)'}
            />
            <p className="text-body text-ink-secondary">
              Display name changes from <span className="font-medium text-ink">{displayName}</span> to <span className="font-medium text-ink">{preview || '—'}</span>.
            </p>
            {taken && <p className="text-meta text-danger">A batch with this name already exists for the program and session.</p>}
            {tooLong && <p className="text-meta text-danger">Batch name must be 30 characters or fewer.</p>}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-control border border-hairline bg-hairline-soft p-2.5 text-meta text-ink-secondary">
            <span>This affects:</span>
            <span><span className="num font-semibold text-ink">{affected.students}</span> {affected.students === 1 ? 'student' : 'students'}</span>
            <span><span className="num font-semibold text-ink">{affected.templates}</span> fee {affected.templates === 1 ? 'template' : 'templates'}</span>
            <span><span className="num font-semibold text-ink">{affected.views}</span> saved {affected.views === 1 ? 'view' : 'views'}</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="batch-rename-reason">Reason *</Label>
            <textarea
              id="batch-rename-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
              placeholder="Clearer name"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSave} onClick={() => onSubmit(name.trim(), reason.trim())}>Rename batch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
