// ============================================
// Batch page — BATCHES_ACADEMIC_SETUP_DESIGN §33
// One batch in full: a sticky header (identity, status, calendar position and the
// promotion warning) over five tabs — Overview, Students, Term schedule, Fees and
// template, History. The active tab lives in the address (?tab=), so the setup-health
// panel and the dashboard can link straight into a section. Every figure comes from the
// shared computeBatchFigures / computeBatchFeeFigures helpers, so the page, the list and
// the drawer always agree (§42.2). Edit opens the batch drawer; the state-changing
// dialogs in the header's More menu (close admissions, complete, delete) and print land
// in Phases 6 and 9.
// ============================================

import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Pencil, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { can } from '@/lib/permissions';
import { todayKey } from '@/lib/dates';
import { formatDateTime } from '@/lib/utils';
import { batchDisplayName, termLengthLabel, termLongLabel, termShortLabel } from '@/lib/academic';
import { computeBatchFeeFigures, computeBatchFigures, studentsInBatch } from '@/lib/academic/batchStats';
import {
  AdmissionsBadge,
  BatchStatusBadge,
  NoTemplateBadge,
  SeatsMeter,
} from '@/components/academic/BatchBadges';
import { BatchDrawer } from '@/components/academic/BatchDrawer';
import { BatchMoreMenu } from '@/components/academic/BatchMoreMenu';
import { BatchStudentsTab } from '@/components/academic/BatchStudentsTab';
import { BatchScheduleTab } from '@/components/academic/BatchScheduleTab';
import {
  useAcademicStore,
  useAuditStore,
  useAuthStore,
  useFeeTemplateStore,
  useLedgerStore,
  useStudentStore,
} from '@/stores';

const TAB_VALUES = ['overview', 'students', 'schedule', 'fees', 'history'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function StatRow({ label, value, tone, onClick }: { label: string; value: React.ReactNode; tone?: string; onClick?: () => void }) {
  const base = 'flex items-center justify-between gap-3 py-1';
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(base, 'w-full text-left hover:bg-hairline-soft')}>
      <span className="text-meta text-ink-secondary">{label}</span>
      <span className={cn('num text-body font-medium text-ink', tone)}>{value}</span>
    </button>
  ) : (
    <div className={base}>
      <span className="text-meta text-ink-secondary">{label}</span>
      <span className={cn('num text-body font-medium text-ink', tone)}>{value}</span>
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-card border border-hairline bg-panel p-4', className)}>
      <h2 className="mb-2 text-ui font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

const money = (n: number) => `PKR ${n.toLocaleString('en-PK')}`;

export default function BatchPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();

  const role = useAuthStore((s) => s.user?.role);
  const canManage = can(role, 'academic.manage');
  const canDates = can(role, 'academic.dates');

  const batches = useAcademicStore((s) => s.batches);
  const programs = useAcademicStore((s) => s.programs);
  const courses = useAcademicStore((s) => s.courses);
  const students = useStudentStore((s) => s.students);
  const templates = useFeeTemplateStore((s) => s.templates);
  const entries = useLedgerStore((s) => s.entries);
  const logs = useAuditStore((s) => s.logs);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const batch = batches.find((b) => b.id === id);
  const today = todayKey();

  const program = batch ? programs.find((p) => p.id === batch.programId) : undefined;
  const course = program ? courses.find((c) => c.id === program.courseId) : undefined;

  const figures = useMemo(
    () => (batch ? computeBatchFigures({ batch, program, course, students, templates, today }) : null),
    [batch, program, course, students, templates, today],
  );
  const matched = useMemo(() => (batch ? studentsInBatch(batch, program, students) : []), [batch, program, students]);
  const fee = useMemo(() => computeBatchFeeFigures({ students: matched, entries, today }), [matched, entries, today]);

  const displayName = program ? batchDisplayName(program.shortCode, batch?.name ?? '', batch?.session ?? 0) : 'Batch';

  const calendarTerm = figures?.calendar.state === 'term' ? figures.calendar.term : 0;
  const behindCount = figures
    ? matched.filter((s) => !s.struckOff && (parseInt(s.semester, 10) || 0) > 0 && (parseInt(s.semester, 10) || 0) < calendarTerm).length
    : 0;

  const history = useMemo(
    () => logs.filter((l) => l.details.includes(displayName) || (batch ? l.details.includes(batch.id) : false)),
    [logs, displayName, batch],
  );

  const tab: TabValue = (TAB_VALUES as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as TabValue) : 'overview';
  const setTab = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === 'overview') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  if (!batch) {
    return (
      <div className="rounded-card border border-hairline bg-panel p-8 text-center">
        <p className="text-body text-ink-muted">That batch no longer exists.</p>
        <Button asChild variant="link" className="mt-1"><Link to="/academic/batches">Back to batches</Link></Button>
      </div>
    );
  }

  const structLine = program
    ? `${program.numTerms} ${program.termSystem.toLowerCase()}s, ${termLengthLabel(program.termsPerYear)} each`
    : '';
  const calendarLine = figures?.calendar
    ? figures.calendar.state === 'term'
      ? `${termLongLabel(program?.termSystem ?? 'Semester', figures.calendar.term)} from ${formatDateLocal(figures.calendar.starts)}`
      : figures.calendar.state === 'finished'
        ? 'Finished'
        : 'Not started'
    : '—';

  const sys = program?.termSystem ?? 'Semester';
  const termSpread = (() => {
    if (!figures || figures.studentTermMin === null || figures.studentTermMax === null) return '—';
    const { studentTermMin, studentTermMax } = figures;
    return studentTermMin === studentTermMax
      ? termShortLabel(sys, studentTermMin)
      : `${termShortLabel(sys, studentTermMin)}-${termShortLabel(sys, studentTermMax)}`;
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-1 text-meta text-ink-muted">
          <Link to="/academic/batches" className="hover:text-accent">Academic setup</Link>
          <ChevronRight size={12} />
          <Link to="/academic/batches" className="hover:text-accent">Batches</Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-title font-semibold text-ink">{displayName}</h1>
          <BatchStatusBadge status={batch.status} />
          <AdmissionsBadge state={batch.admissions} />
          {figures?.dueForPromotion && <Badge variant="dues">Promotion due</Badge>}
          {figures?.full && <Badge variant="danger">Full</Badge>}
          <div className="ml-auto flex items-center gap-2">
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
                <Pencil size={14} /> Edit
              </Button>
            )}
            <BatchMoreMenu batch={batch} program={program} />
          </div>
        </div>

        <p className="text-body text-ink-secondary">
          {course?.name ?? 'Unknown course'}, {program?.shortCode ?? '?'} | Session {batch.session} | {structLine}
        </p>
        <p className="text-meta text-ink-muted">Calendar: {calendarLine}</p>

        {figures?.dueForPromotion && (
          <div className="flex items-center gap-2 rounded-control border border-dues/25 bg-dues-soft p-2.5 text-body text-ink">
            <TriangleAlert size={16} className="flex-none text-dues" />
            <span>Promotion due: {behindCount} active {behindCount === 1 ? 'student is' : 'students are'} still behind {termShortLabel(program?.termSystem ?? 'Semester', calendarTerm)}.</span>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="students">Students <TabCount>{figures?.admitted ?? 0}</TabCount></TabsTrigger>
          <TabsTrigger value="schedule">Term schedule</TabsTrigger>
          <TabsTrigger value="fees">Fees and template</TabsTrigger>
          <TabsTrigger value="history">History <TabCount>{history.length}</TabCount></TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Panel title="Students">
              <StatRow label="Active" value={figures?.activeStudents ?? 0} onClick={() => setTab('students')} />
              <StatRow label="Struck off" value={matched.filter((s) => s.struckOff).length} />
              <StatRow label="Total" value={figures?.admitted ?? 0} />
            </Panel>

            <Panel title="Seats">
              <SeatsMeter seats={batch.seats} admitted={figures?.admitted ?? 0} pct={figures?.seatsPct ?? null} full={figures?.full ?? false} />
              <p className="mt-2 text-meta text-ink-muted">Admissions {batch.admissions.toLowerCase()}.</p>
            </Panel>

            <Panel title="Fees (this batch)">
              <StatRow label="Outstanding" value={money(fee.outstanding)} onClick={() => setTab('students')} />
              <StatRow label="of which overdue" value={money(fee.overdue)} tone={fee.overdue > 0 ? 'text-dues' : undefined} />
              <StatRow label="Credit held" value={money(fee.creditHeld)} tone={fee.creditHeld > 0 ? 'text-credit' : undefined} />
              <StatRow label="Collected (this month)" value={money(fee.collectedThisMonth)} />
            </Panel>

            <Panel title="Term position">
              <StatRow label="Calendar term" value={calendarLine} />
              <StatRow
                label="Students' term"
                value={termSpread}
              />
              <StatRow label="Promotion" value={figures?.dueForPromotion ? 'Due' : 'Not due'} tone={figures?.dueForPromotion ? 'text-dues' : undefined} />
            </Panel>

            <Panel title="Fee template" className="lg:col-span-2">
              {figures?.template ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-body font-medium text-ink">{figures.template.name} v{figures.template.version}</span>
                      <Badge variant="cleared">{figures.template.status}</Badge>
                    </div>
                    <p className="text-meta text-ink-muted">Matches this batch.</p>
                  </div>
                  <Button asChild variant="outline" size="sm"><Link to="/fee-templates">Open template</Link></Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><NoTemplateBadge /><span className="text-meta text-ink-secondary">No active fee template for {program?.shortCode}, {batch.session}.</span></div>
                  <Button asChild variant="outline" size="sm"><Link to="/fee-templates">Create template</Link></Button>
                </div>
              )}
            </Panel>
          </div>
        </TabsContent>

        {/* Students */}
        <TabsContent value="students">
          <BatchStudentsTab batch={batch} program={program} students={students} entries={entries} calendar={figures?.calendar ?? { state: 'notStarted' }} today={today} />
        </TabsContent>

        {/* Term schedule */}
        <TabsContent value="schedule">
          <BatchScheduleTab batch={batch} program={program} chargedByTerm={fee.chargedByTerm} activeStudents={figures?.activeStudents ?? 0} calendar={figures?.calendar ?? { state: 'notStarted' }} canEditDates={canDates} today={today} />
        </TabsContent>

        {/* Fees and template */}
        <TabsContent value="fees">
          <div className="space-y-3">
            <Panel title="Matching fee template">
              {figures?.template ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-body font-medium text-ink">{figures.template.name} v{figures.template.version}</span>
                      <Badge variant="cleared">{figures.template.status}</Badge>
                    </div>
                    <p className="text-meta text-ink-muted">
                      Applies to: {figures.template.batch ? figures.template.batch : 'all batches'} · session {figures.template.session}.
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm"><Link to="/fee-templates">Open template</Link></Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><NoTemplateBadge /><span className="text-meta text-ink-secondary">No active fee template — create one for {program?.shortCode}, session {batch.session}.</span></div>
                  <Button asChild variant="outline" size="sm"><Link to="/fee-templates">Create template</Link></Button>
                </div>
              )}
            </Panel>

            <Panel title="Student fee plans">
              <StatRow label="Active students" value={figures?.activeStudents ?? 0} />
              <StatRow label="Students without a fee charge" value={fee.withoutCharge} tone={fee.withoutCharge > 0 ? 'text-dues' : undefined} onClick={fee.withoutCharge > 0 ? () => setTab('students') : undefined} />
              <p className="mt-2 text-meta text-ink-muted">
                The per-template-version breakdown and concession count arrive with the fee-plan records (Phase 7).
              </p>
            </Panel>
          </div>
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          {history.length === 0 ? (
            <div className="rounded-card border border-hairline bg-panel p-8 text-center">
              <p className="text-body text-ink-muted">No recorded changes for this batch yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-hairline bg-panel">
              {history.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3 border-b border-hairline-soft px-4 py-2.5 last:border-b-0">
                  <div className="min-w-0">
                    <p className="text-body text-ink">{l.details}</p>
                    <p className="text-micro text-ink-muted">{l.user}</p>
                  </div>
                  <span className="flex-none text-meta text-ink-secondary">{formatDateTime(l.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {drawerOpen && <BatchDrawer batch={batch} onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}

function TabCount({ children }: { children: React.ReactNode }) {
  return <span className="rounded-pill bg-hairline-soft px-1.5 text-micro font-medium text-ink-secondary">{children}</span>;
}

/** "1 Sep 2026" from a stored YYYY-MM-DD, day without a leading zero. */
function formatDateLocal(iso: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${months[m - 1]} ${y}`;
}
