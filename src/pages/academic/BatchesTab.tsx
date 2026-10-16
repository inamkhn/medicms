// ============================================
// Batches tab — BATCHES_ACADEMIC_SETUP_DESIGN §31
// The batch list on top of the academic store. Every row's figures (admitted, term
// spread, calendar term, promotion-due, seats meter and fee-template coverage) come
// from the shared computeBatchFigures helper, so they match the drawer and the batch
// page. Filters, search, hide-completed and the Table / By-program view are mirrored
// to the address (§28) so a link or a refresh lands on the same list. Creating and
// editing open the batch drawer; the row's other actions (open page, admissions
// toggle, complete, delete, print) arrive with Phases 5, 6 and 9.
// ============================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { can } from '@/lib/permissions';
import { todayKey } from '@/lib/dates';
import { computeBatchFigures } from '@/lib/academic/batchStats';
import { batchDisplayName } from '@/lib/academic';
import type { AcademicBatch, BatchStatus, TermSystem } from '@/lib/academic';
import {
  AdmissionsBadge,
  BatchStatusBadge,
  PromotionDueBadge,
  SeatsMeter,
  TemplateBadge,
  TermCell,
} from '@/components/academic/BatchBadges';
import { BatchDrawer } from '@/components/academic/BatchDrawer';
import {
  useAcademicStore,
  useAuthStore,
  useFeeTemplateStore,
  useStudentStore,
} from '@/stores';

const STATUSES: BatchStatus[] = ['Planned', 'Running', 'Completed'];
type SortKey = 'batch' | 'status' | 'students' | 'seats';

interface Enriched {
  batch: AcademicBatch;
  programName: string;
  shortCode: string;
  courseId: string;
  courseName: string;
  programOrder: number;
  termSystem: TermSystem;
  displayName: string;
  figures: ReturnType<typeof computeBatchFigures>;
}

export default function BatchesTab() {
  const role = useAuthStore((s) => s.user?.role);
  const canManage = can(role, 'academic.manage');

  const batches = useAcademicStore((s) => s.batches);
  const programs = useAcademicStore((s) => s.programs);
  const courses = useAcademicStore((s) => s.courses);
  const sessions = useAcademicStore((s) => s.sessions);
  const students = useStudentStore((s) => s.students);
  const templates = useFeeTemplateStore((s) => s.templates);

  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });
  const [drawer, setDrawer] = useState<{ batch: AcademicBatch | null; presetProgramId?: string } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const q = params.get('q') ?? '';
  const fSession = params.get('session') ?? 'all';
  const fCourse = params.get('course') ?? 'all';
  const fProgram = params.get('program') ?? 'all';
  const fStatus = (params.get('status') as BatchStatus | null) ?? 'all';
  const fAdmissions = params.get('admissions') ?? 'all';
  const view = params.get('view') === 'program' ? 'program' : 'table';
  const hideCompleted = params.get('hideCompleted') !== '0';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '' || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  const today = todayKey();

  const enriched = useMemo<Enriched[]>(() => {
    return batches.map((batch) => {
      const program = programs.find((p) => p.id === batch.programId);
      const course = program ? courses.find((c) => c.id === program.courseId) : undefined;
      const figures = computeBatchFigures({ batch, program, course, students, templates, today });
      const shortCode = program?.shortCode ?? '?';
      return {
        batch,
        programName: program?.name ?? 'Unknown program',
        shortCode,
        courseId: program?.courseId ?? '',
        courseName: course?.name ?? 'Unknown course',
        programOrder: program?.order ?? Number.MAX_SAFE_INTEGER,
        termSystem: program?.termSystem ?? 'Semester',
        displayName: batchDisplayName(shortCode, batch.name, batch.session),
        figures,
      };
    });
  }, [batches, programs, courses, students, templates, today]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = enriched.filter((e) => {
      if (hideCompleted && e.batch.status === 'Completed') return false;
      if (fSession !== 'all' && String(e.batch.session) !== fSession) return false;
      if (fCourse !== 'all' && e.courseId !== fCourse) return false;
      if (fProgram !== 'all' && e.batch.programId !== fProgram && e.shortCode !== fProgram) return false;
      if (fStatus !== 'all' && e.batch.status.toLowerCase() !== String(fStatus).toLowerCase()) return false;
      if (fAdmissions !== 'all' && e.batch.admissions.toLowerCase() !== fAdmissions.toLowerCase()) return false;
      if (needle) {
        const hay = `${e.displayName} ${e.programName} ${e.courseName} ${e.batch.session} ${e.batch.notes ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    // §31.3 default: session (newest first), then program order, then name.
    const defaultCmp = (a: Enriched, b: Enriched) =>
      b.batch.session - a.batch.session ||
      a.programOrder - b.programOrder ||
      a.displayName.localeCompare(b.displayName);

    const dirMul = sort.dir === 'asc' ? 1 : -1;
    const cmp = (a: Enriched, b: Enriched) => {
      switch (sort.key) {
        case 'batch': return a.displayName.localeCompare(b.displayName) * dirMul;
        case 'status': return a.batch.status.localeCompare(b.batch.status) * dirMul;
        case 'students': return (a.figures.activeStudents - b.figures.activeStudents) * dirMul;
        case 'seats': return ((a.figures.seatsPct ?? -1) - (b.figures.seatsPct ?? -1)) * dirMul;
        default: return defaultCmp(a, b);
      }
    };
    return [...rows].sort(cmp);
  }, [enriched, q, fSession, fCourse, fProgram, fStatus, fAdmissions, hideCompleted, sort]);

  const hiddenCompleted = enriched.filter((e) => e.batch.status === 'Completed').length;

  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const toggleGroup = (id: string) => setCollapsedGroups((g) => ({ ...g, [id]: !g[id] }));

  const headerCell = (label: string, key?: SortKey) => (
    <TableHead>
      {key ? (
        <button type="button" onClick={() => sortBy(key)} className="flex items-center gap-1 font-semibold text-ink hover:text-accent">
          {label}
          {sort.key === key && <span className="text-micro">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
        </button>
      ) : label}
    </TableHead>
  );

  const renderRow = (e: Enriched) => (
    <TableRow key={e.batch.id}>
      <TableCell>
        <Link to={`/academic/batches/${e.batch.id}`} className="font-medium text-ink hover:text-accent">{e.displayName}</Link>
        <div className="text-meta text-ink-muted">{e.courseName}, {e.batch.session}</div>
      </TableCell>
      <TableCell><BatchStatusBadge status={e.batch.status} /></TableCell>
      <TableCell><AdmissionsBadge state={e.batch.admissions} /></TableCell>
      <TableCell className="num">{e.figures.activeStudents} / {e.figures.admitted}</TableCell>
      <TableCell><SeatsMeter seats={e.batch.seats} admitted={e.figures.admitted} pct={e.figures.seatsPct} full={e.figures.full} /></TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <TermCell system={e.termSystem} studentMin={e.figures.studentTermMin} studentMax={e.figures.studentTermMax} calendar={e.figures.calendar} />
          {e.figures.dueForPromotion && <PromotionDueBadge />}
        </div>
      </TableCell>
      <TableCell><TemplateBadge name={e.figures.template?.name} version={e.figures.template?.version} /></TableCell>
      {canManage && (
        <TableCell className="text-right">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${e.displayName}`} onClick={() => setDrawer({ batch: e.batch })}>
            <Pencil size={14} />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Input
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="Search batches…"
            leadingIcon={<Search size={15} className="text-ink-subtle" />}
          />
        </div>
        <FilterSelect label="Session" value={fSession} onChange={(v) => setParam('session', v)} options={sessions.map((s) => ({ value: String(s.year), label: String(s.year) }))} />
        <FilterSelect label="Course" value={fCourse} onChange={(v) => setParam('course', v)} options={courses.map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect label="Program" value={fProgram} onChange={(v) => setParam('program', v)} options={programs.map((p) => ({ value: p.shortCode, label: `${p.shortCode}, ${p.name}` }))} />
        <FilterSelect label="Status" value={fStatus} onChange={(v) => setParam('status', v)} options={STATUSES.map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Admissions" value={fAdmissions} onChange={(v) => setParam('admissions', v)} options={[{ value: 'Open', label: 'Open' }, { value: 'Closed', label: 'Closed' }]} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-meta text-ink-secondary">
          <Checkbox checked={hideCompleted} onCheckedChange={(c) => setParam('hideCompleted', c === true ? '1' : '0')} />
          Hide completed
          {hiddenCompleted > 0 && <span className="text-ink-muted">({hiddenCompleted} hidden)</span>}
        </label>
        <div className="flex items-center gap-1">
          <span className="text-meta text-ink-muted">View:</span>
          <Button size="sm" variant={view === 'table' ? 'default' : 'outline'} onClick={() => setParam('view', view === 'table' ? null : 'program')}>Table</Button>
          <Button size="sm" variant={view === 'program' ? 'default' : 'outline'} onClick={() => setParam('view', view === 'program' ? null : 'program')}>By program</Button>
        </div>
        <Button variant="link" size="sm" onClick={clearAll}>Clear all</Button>
        {canManage && (
          <Button size="sm" className="ml-auto" onClick={() => setDrawer({ batch: null })}>
            <Plus size={14} /> New batch
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-hairline bg-panel p-8 text-center">
          <p className="text-body text-ink-muted">No batches match these filters.</p>
          <Button variant="link" size="sm" className="mt-1" onClick={clearAll}>Clear filters</Button>
        </div>
      ) : view === 'table' ? (
        <div className="overflow-hidden rounded-card border border-hairline bg-panel">
          <Table>
            <TableHeader>
              <TableRow>
                {headerCell('Batch', 'batch')}
                {headerCell('Status', 'status')}
                <TableHead>Admissions</TableHead>
                {headerCell('Students', 'students')}
                {headerCell('Seats', 'seats')}
                <TableHead>Term</TableHead>
                <TableHead>Fee template</TableHead>
                {canManage && <TableHead className="w-[44px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(renderRow)}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedForView(filtered).map((group) => {
            const isCollapsed = collapsedGroups[group.programId];
            return (
              <div key={group.programId} className="overflow-hidden rounded-card border border-hairline bg-panel">
                <div className="flex items-center justify-between gap-2 border-b border-hairline-soft bg-hairline-soft/50 px-3 py-2">
                  <button type="button" onClick={() => toggleGroup(group.programId)} className="flex flex-1 items-center gap-2 text-left">
                    {isCollapsed ? <ChevronRight size={16} className="text-ink-muted" /> : <ChevronDown size={16} className="text-ink-muted" />}
                    <span className="text-body font-semibold text-ink">{group.courseName}, {group.shortCode}</span>
                    <span className="text-meta text-ink-muted">
                      {group.rows.filter((r) => r.batch.status === 'Running').length} running · {group.activeStudents} active students
                    </span>
                  </button>
                  {canManage && (
                    <Button size="sm" variant="outline" onClick={() => setDrawer({ batch: null, presetProgramId: group.programId })}>
                      <Plus size={14} /> Batch
                    </Button>
                  )}
                </div>
                {!isCollapsed && (
                  <Table>
                    <TableBody>
                      {group.rows.map(renderRow)}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-meta text-ink-muted">Showing {filtered.length} batch{filtered.length === 1 ? '' : 'es'}.</p>

      {drawer && (
        <BatchDrawer
          key={drawer.batch?.id ?? `new-${drawer.presetProgramId ?? ''}`}
          batch={drawer.batch}
          presetProgramId={drawer.presetProgramId}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[150px]"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: all</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

interface Group {
  programId: string;
  shortCode: string;
  courseName: string;
  activeStudents: number;
  rows: Enriched[];
}

function groupedForView(rows: Enriched[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const id = r.batch.programId;
    let g = map.get(id);
    if (!g) {
      g = { programId: id, shortCode: r.shortCode, courseName: r.courseName, activeStudents: 0, rows: [] };
      map.set(id, g);
    }
    g.rows.push(r);
    g.activeStudents += r.figures.activeStudents;
  }
  return [...map.values()].sort((a, b) => (a.courseName + a.shortCode).localeCompare(b.courseName + b.shortCode));
}
