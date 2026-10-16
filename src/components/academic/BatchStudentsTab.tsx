// ============================================
// Batch page — Students tab (BATCHES_ACADEMIC_SETUP_DESIGN §33.3)
// The directory narrowed to one batch with the batch filter locked: the same figures
// the Students directory prints (balance, badge, term, last payment) but scoped to the
// students whose saved program + session + batch name point at this batch. Search and
// the status tabs are local; a row opens the student's profile. Selection and the bulk
// actions (§33.3 promote / print / strike-off) arrive with the promotion wiring and
// the print layouts, so this stays a read-only view for now.
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn, formatBalanceDisplay } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { chargeStatesByStudent, overdueTotal } from '@/lib/ledger/charges';
import { termShortLabel } from '@/lib/academic';
import type { AcademicBatch, AcademicProgram, CalendarTerm } from '@/lib/academic';
import type { LedgerEntry, Student } from '@/types';
import { studentsInBatch } from '@/lib/academic/batchStats';

type StatusTab = 'all' | 'active' | 'dues' | 'overdue' | 'credit' | 'struck';

interface Row {
  student: Student;
  balance: number;
  term: number;
  behind: boolean;
  overdue: number;
}

export function BatchStudentsTab({ batch, program, students, entries, calendar, today }: {
  batch: AcademicBatch;
  program: AcademicProgram | undefined;
  students: readonly Student[];
  entries: readonly LedgerEntry[];
  calendar: CalendarTerm;
  today: string;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<StatusTab>('all');

  const calendarTerm = calendar.state === 'term' ? calendar.term : calendar.state === 'finished' ? Number.MAX_SAFE_INTEGER : 0;

  const rows = useMemo<Row[]>(() => {
    const matched = studentsInBatch(batch, program, students);
    const withBal = getStudentsWithBalanceLive(matched, entries);
    const states = chargeStatesByStudent(entries);
    return withBal.map((s) => {
      const term = parseInt(s.semester, 10) || 0;
      const state = states.get(s.sno);
      const overdue = state ? overdueTotal(state, today) : 0;
      return {
        student: s,
        balance: s.computedBalance,
        term,
        behind: !s.struckOff && term > 0 && term < calendarTerm,
        overdue,
      };
    });
  }, [batch, program, students, entries, calendarTerm, today]);

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((r) => !r.student.struckOff).length,
    dues: rows.filter((r) => !r.student.struckOff && r.balance > 0).length,
    overdue: rows.filter((r) => !r.student.struckOff && r.overdue > 0).length,
    credit: rows.filter((r) => !r.student.struckOff && r.balance < 0).length,
    struck: rows.filter((r) => r.student.struckOff).length,
  }), [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === 'active' && r.student.struckOff) return false;
      if (tab === 'dues' && (r.student.struckOff || r.balance <= 0)) return false;
      if (tab === 'overdue' && (r.student.struckOff || r.overdue <= 0)) return false;
      if (tab === 'credit' && (r.student.struckOff || r.balance >= 0)) return false;
      if (tab === 'struck' && !r.student.struckOff) return false;
      if (needle) {
        const hay = `${r.student.name} ${r.student.sno} ${r.student.contact ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, tab, q]);

  const TABS: { id: StatusTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'dues', label: 'With dues', count: counts.dues },
    { id: 'overdue', label: 'Overdue', count: counts.overdue },
    { id: 'credit', label: 'Credit', count: counts.credit },
    { id: 'struck', label: 'Struck off', count: counts.struck },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search in this batch…"
            leadingIcon={<Search size={15} className="text-ink-subtle" />}
          />
        </div>
        <Badge variant="outline">{program?.shortCode ?? '?'} {batch.name} {batch.session}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-body transition-colors duration-120 ease-standard',
              tab === t.id ? 'border-accent font-semibold text-ink' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
            <span className="rounded-pill bg-hairline-soft px-1.5 text-micro font-medium text-ink-secondary">{t.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-card border border-hairline bg-panel p-8 text-center">
          <p className="text-body text-ink-muted">No students in this batch match the view.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-hairline bg-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SNO</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const bal = formatBalanceDisplay(r.balance);
                return (
                  <TableRow
                    key={r.student.sno}
                    className="cursor-pointer"
                    onClick={() => navigate(`/students/${r.student.sno}`)}
                  >
                    <TableCell className="num text-ink-secondary">{String(r.student.sno).padStart(4, '0')}</TableCell>
                    <TableCell>
                      <div className="font-medium text-ink">{r.student.name}</div>
                      {r.student.struckOff && <div className="text-micro text-ink-muted">Struck off</div>}
                    </TableCell>
                    <TableCell>
                      <span className="num">{r.term ? termShortLabel(program?.termSystem ?? 'Semester', r.term) : '—'}</span>
                      {r.behind && <Badge variant="dues" className="ml-1.5">Behind</Badge>}
                    </TableCell>
                    <TableCell className="text-ink-secondary">{r.student.contact ?? '—'}</TableCell>
                    <TableCell className={cn('num text-right', bal.color)}>{r.student.struckOff && r.balance <= 0 ? '—' : bal.label}</TableCell>
                    <TableCell>
                      {r.student.struckOff
                        ? <Badge variant="struckoff">Struck off</Badge>
                        : r.balance > 0
                          ? <Badge variant="dues">Dues</Badge>
                          : r.balance < 0
                            ? <Badge variant="credit">Credit</Badge>
                            : <Badge variant="cleared">Active</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-meta text-ink-muted">Showing {visible.length} of {rows.length} students.</p>
    </div>
  );
}
