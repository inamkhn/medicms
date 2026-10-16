// ============================================
// Batch page — Term schedule tab (BATCHES_ACADEMIC_SETUP_DESIGN §33.4)
// Shows the generated schedule with each term's status (Done / Current / Upcoming) and
// how many of the batch's active students a fee charge has reached. Edit dates turns
// the start dates into pickers; ends recompute automatically and dates must stay in
// order. Regenerate rebuilds every date from Term 1. Both ask for a reason and write an
// audit entry, so a re-timed batch is traceable. The "Mark completed" suggestion for a
// finished batch opens the same dialog as the header (§34, Phase 6).
// ============================================

import { useState } from 'react';
import { CalendarClock, TriangleAlert } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { confirmWithReason } from '@/lib/confirm';
import { toastSuccess, toastError } from '@/lib/toast';
import { daysBetween } from '@/lib/dates';
import { termLongLabel, termLengthMonthsOf, generateSchedule } from '@/lib/academic';
import type { AcademicBatch, AcademicProgram, CalendarTerm, TermRow } from '@/lib/academic';
import { normalizeScheduleEnds, scheduleOrderProblem, termStatusOf } from '@/lib/academic/batchStats';
import { useAcademicStore, useAuditStore, useAuthStore } from '@/stores';

const STATUS_LABEL: Record<'done' | 'current' | 'upcoming', string> = {
  done: 'Done',
  current: 'Current',
  upcoming: 'Upcoming',
};

export function BatchScheduleTab({ batch, program, chargedByTerm, activeStudents, calendar, canEditDates, today }: {
  batch: AcademicBatch;
  program: AcademicProgram | undefined;
  chargedByTerm: Record<number, number>;
  activeStudents: number;
  calendar: CalendarTerm;
  canEditDates: boolean;
  today: string;
}) {
  const setSchedule = useAcademicStore((s) => s.setSchedule);
  const user = useAuthStore((s) => s.user?.name ?? 'Admin');

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TermRow[]>(batch.schedule);

  if (!program || batch.schedule.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-panel p-8 text-center">
        <CalendarClock size={22} className="mx-auto mb-2 text-ink-subtle" />
        <p className="text-body text-ink-muted">
          This batch has no term schedule yet. Set a Term 1 start date in the batch editor to generate one.
        </p>
      </div>
    );
  }

  const termMonths = termLengthMonthsOf(program.termsPerYear);
  const shortCode = program.shortCode;
  const numTerms = program.numTerms;
  const termsPerYear = program.termsPerYear;
  const rows = editing ? draft : batch.schedule;
  const notStarted = calendar.state === 'notStarted';
  const finished = calendar.state === 'finished';

  function startEdit() {
    setDraft(batch.schedule.map((r) => ({ ...r })));
    setEditing(true);
  }

  function changeStart(term: number, value: string) {
    setDraft((prev) => {
      const starts = prev.map((r) => (r.term === term ? value : r.starts));
      return normalizeScheduleEnds(starts, termMonths);
    });
  }

  async function saveEdits() {
    const problem = scheduleOrderProblem(draft);
    if (problem) return toastError(problem);
    const outcome = await confirmWithReason({
      title: 'Save the term schedule',
      effect: `The ${draft.length} term dates for ${batch.name || shortCode} ${batch.session} change for every screen and print layout. A reason is recorded in the audit trail.`,
      confirmLabel: 'Save dates',
      reason: { label: 'Reason for change', placeholder: 'Re-timed after a delayed session start' },
    });
    if (!outcome.confirmed) return;
    setSchedule(batch.id, draft, user);
    useAuditStore.getState().addLog({
      user,
      action: 'Academic Setup',
      details: `Term schedule edited: ${shortCode} ${batch.name} ${batch.session} — ${outcome.reason ?? ''}`,
    });
    toastSuccess('Term schedule saved.');
    setEditing(false);
  }

  async function regenerate() {
    if (!batch.term1Start) return toastError('Set a Term 1 start date first.');
    const outcome = await confirmWithReason({
      title: 'Regenerate from Term 1',
      effect: 'Every term date is rebuilt from the Term 1 start and term length. Any hand-edited dates are replaced.',
      confirmLabel: 'Regenerate',
      tone: 'destructive',
      reason: { label: 'Reason', placeholder: 'Correcting the whole calendar' },
    });
    if (!outcome.confirmed) return;
    const fresh = generateSchedule(batch.term1Start, numTerms, termsPerYear);
    setSchedule(batch.id, fresh, user);
    useAuditStore.getState().addLog({
      user,
      action: 'Academic Setup',
      details: `Term schedule regenerated: ${shortCode} ${batch.name} ${batch.session} — ${outcome.reason ?? ''}`,
    });
    toastSuccess('Term schedule regenerated.');
    setEditing(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-meta text-ink-secondary">
          Term 1 starts {formatDate(batch.schedule[0].starts)}. {termMonths}-month terms.
        </div>
        {canEditDates && (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={() => void saveEdits()}>Save dates</Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={startEdit}>Edit dates</Button>
                <Button variant="subtle" size="sm" onClick={() => void regenerate()}>Regenerate from Term 1 date</Button>
              </>
            )}
          </div>
        )}
      </div>

      {notStarted && calendar.state === 'notStarted' && (
        <div className="flex items-center gap-1.5 rounded-control border border-dues/25 bg-dues-soft p-2.5 text-meta text-ink">
          <TriangleAlert size={14} className="text-dues" />
          Starts in {batch.term1Start ? daysBetween(today, batch.term1Start) : '—'} days.
        </div>
      )}
      {finished && (
        <div className="flex items-center justify-between gap-2 rounded-control border border-hairline bg-hairline-soft p-2.5 text-meta text-ink">
          <span>Course finished — the last term ended {formatDate(calendar.lastEnds)}.</span>
          <span className="text-ink-muted">Mark completed is available from the batch header (§34).</span>
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-hairline bg-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Term</TableHead>
              <TableHead>Starts</TableHead>
              <TableHead>Ends</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Charged</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const status = termStatusOf(r, calendar);
              const charged = chargedByTerm[r.term] ?? 0;
              const shortfall = status === 'current' && charged < activeStudents;
              return (
                <TableRow key={r.term}>
                  <TableCell className="font-medium text-ink">{termLongLabel(program.termSystem, r.term)}</TableCell>
                  <TableCell>
                    {editing ? (
                      <Input type="date" num={false} value={r.starts} onChange={(e) => changeStart(r.term, e.target.value)} className="h-8" />
                    ) : formatDate(r.starts)}
                  </TableCell>
                  <TableCell className="text-ink-secondary">{formatDate(r.ends)}</TableCell>
                  <TableCell>
                    <Badge variant={status === 'current' ? 'cleared' : status === 'done' ? 'secondary' : 'outline'}>{STATUS_LABEL[status]}</Badge>
                  </TableCell>
                  <TableCell className={cn('num text-right', shortfall ? 'text-dues' : 'text-ink-secondary')}>
                    {status === 'upcoming' ? '—' : `${charged} of ${activeStudents}`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
