// ============================================
// Batch presentation atoms — BATCHES_ACADEMIC_SETUP_DESIGN §29.3, §31.2, §42.1
// The badges and the seats meter every batch screen shares, so "Running" or "Full"
// reads and colours the same in the list, the drawer and the batch page. Colour comes
// only from Badge variants and the status tokens (never a raw hex), and every badge
// carries its word so state is never colour-only (P3, P4).
// ============================================

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { termShortLabel } from '@/lib/academic';
import type { AdmissionsState, BatchStatus, CalendarTerm, TermSystem } from '@/lib/academic';

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const variant = status === 'Running' ? 'cleared' : status === 'Planned' ? 'dues' : 'secondary';
  return <Badge variant={variant}>{status}</Badge>;
}

export function AdmissionsBadge({ state }: { state: AdmissionsState }) {
  return <Badge variant={state === 'Open' ? 'cleared' : 'secondary'}>{state === 'Open' ? 'Admissions open' : 'Admissions closed'}</Badge>;
}

export function PromotionDueBadge() {
  return <Badge variant="dues">Promotion due</Badge>;
}

export function NoTemplateBadge() {
  return <Badge variant="danger">No template</Badge>;
}

export function SeatsMeter({ seats, admitted, pct, full }: { seats: number | null; admitted: number; pct: number | null; full: boolean }) {
  if (seats === null || pct === null) return <span className="text-ink-subtle">—</span>;
  const tone = pct >= 100 ? 'bg-danger' : pct >= 90 ? 'bg-dues' : 'bg-cleared';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="num text-meta text-ink-secondary" aria-label={`${admitted} of ${seats} seats taken`}>
          {admitted} of {seats}
        </span>
        {full && <Badge variant="danger">Full</Badge>}
      </div>
      <div className="h-1.5 w-24 overflow-hidden rounded-pill bg-hairline" role="presentation">
        <div className={cn('h-full rounded-pill', tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

/** Students' term ÷ calendar term, e.g. "T2 / T3", or "T2-T3 / T3" when spread out. */
export function TermCell({ system, studentMin, studentMax, calendar }: {
  system: TermSystem;
  studentMin: number | null;
  studentMax: number | null;
  calendar: CalendarTerm;
}) {
  const cal =
    calendar.state === 'term' ? termShortLabel(system, calendar.term)
      : calendar.state === 'finished' ? 'Finished'
        : '—';
  let students = '—';
  if (studentMin !== null && studentMax !== null) {
    students = studentMin === studentMax
      ? termShortLabel(system, studentMin)
      : `${termShortLabel(system, studentMin)}-${termShortLabel(system, studentMax)}`;
  }
  return <span className="num text-body text-ink">{students} / {cal}</span>;
}

export function TemplateBadge({ name, version }: { name?: string; version?: number }) {
  if (!name) return <NoTemplateBadge />;
  return <Badge variant="outline">{name}{version !== undefined ? ` v${version}` : ''}</Badge>;
}
