// ============================================
// MediCMS Desktop — Student fee ledger, the entry view (screen 4.1, §54)
//
// One row per entry, in posting order, with the running balance beside it. Nothing
// here does arithmetic: the running column comes from `runningBalances`, the header
// strip from the same charge state the fee engine uses, so the screen and the ledger
// check cannot disagree (§4, §7.3).
// ============================================

import { Fragment, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, CreditCard, Printer, Scale, SlidersHorizontal, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatPKR, formatDate, formatBalanceDisplay, cn } from '@/lib/utils';
import { getSubCourseDef } from '@/lib/constants';
import { getNextTerm } from '@/lib/promotion';
import { dayKey, todayKey } from '@/lib/dates';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import {
  ENTRY_LABELS,
  allocationLabels,
  chargeStateOf,
  entryResolver,
  overdueTotal,
  runningBalances,
} from '@/lib/ledger';
import type { LedgerEntry, LedgerEntryType } from '@/types';
import { canWrite } from '@/stores/authStore';
import { useAuthStore, useStudentStore, useLedgerStore, useSettingsStore } from '@/stores';
import { EntryTypeBadge } from '@/components/ledger/EntryTypeBadge';
import { SignedAmount } from '@/components/ledger/SignedAmount';

/** §54's Period filter, as the number of days back it looks. */
type Period = 'all' | '30' | '90' | 'year';

const PERIODS: readonly { value: Period; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'year', label: 'This year' },
];

/** The earliest date the chosen period still shows, or null for "no lower bound". */
function periodFrom(period: Period, today: string): string | null {
  if (period === 'all') return null;
  if (period === 'year') return `${today.slice(0, 4)}-01-01`;
  const start = new Date(`${today}T00:00:00`);
  start.setDate(start.getDate() - Number(period));
  return dayKey(start);
}

export default function StudentLedger() {
  const { sno } = useParams<{ sno: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const canEdit = canWrite(user?.role);
  // New-row flash after write actions (?highlight=entryId, ~1.5s) — highlightId is the single source, no mirrored state
  const highlightId = searchParams.get('highlight');
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setSearchParams({}, { replace: true }), 1500);
    return () => clearTimeout(t);
  }, [highlightId, setSearchParams]);

  const [period, setPeriod] = useState<Period>('all');
  const [typeFilter, setTypeFilter] = useState<LedgerEntryType | 'all'>('all');
  // §54: reversed rows are visible by default and the filter is what hides them.
  const [showReversed, setShowReversed] = useState(true);
  const [openLines, setOpenLines] = useState<string[]>([]);

  const students = useStudentStore((s) => s.students);
  const entries = useLedgerStore((s) => s.entries);
  const instituteName = useSettingsStore((s) => s.instituteName);
  const instituteAddress = useSettingsStore((s) => s.instituteAddress);
  const institutePhone = useSettingsStore((s) => s.institutePhone);

  // Balance and badge come from the same derivation every list uses (§4).
  const allStudents = getStudentsWithBalanceLive(students, entries);
  const student = allStudents.find((s) => s.sno.toString() === sno);

  if (!student) {
    return <div className="p-8 text-center text-ink-subtle">Student not found (SNO: {sno})</div>;
  }

  const own = entries.filter((entry) => entry.studentSno === student.sno);
  const today = todayKey();
  const state = chargeStateOf(own);
  const rows = runningBalances(own);
  const balanceDisplay = formatBalanceDisplay(student.computedBalance);
  const overdue = overdueTotal(state, today);
  const hasNextTerm = getNextTerm(student.program, student.semester) !== null;

  // §54: a reversed row links to the reversal that cancelled it, and a reversal row
  // links back to what it cancelled.
  const reversedBy = new Map<string, LedgerEntry>();
  for (const entry of own) {
    if (entry.type === 'Reversal' && entry.linkedEntryId) reversedBy.set(entry.linkedEntryId, entry);
  }
  const lookup = entryResolver(own);

  const fromDate = periodFrom(period, today);
  const visible = rows.filter(({ entry }) => {
    if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
    if (fromDate && entry.date < fromDate) return false;
    if (!showReversed && reversedBy.has(entry.id)) return false;
    return true;
  });
  const typeOptions = [...new Set(own.map((entry) => entry.type))];

  const toggleLines = (id: string) =>
    setOpenLines((open) => (open.includes(id) ? open.filter((x) => x !== id) : [...open, id]));

  return (
    <div className="space-y-3">
      {/* Print-only statement header */}
      <div className="hidden print:block print-area text-center text-black">
        <div className="font-bold text-lg">{instituteName}</div>
        <div className="text-sm">{instituteAddress} · {institutePhone}</div>
        <div className="font-bold mt-1">FEE STATEMENT — {student.name} (SNO:{student.sno})</div>
        <div className="text-sm">
          {getSubCourseDef(student.program).sub.label} · {student.batch} · Session {student.session} · Balance {formatPKR(student.computedBalance)}
        </div>
      </div>

      {/* Header — compact, with the §54 filters */}
      <div className="flex items-center gap-2 print:hidden">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/students/${student.sno}`)}>
          <ArrowLeft size={14} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-ui font-bold text-ink tracking-tight">Fee Ledger — {student.name}</h1>
          <p className="text-micro text-ink-muted truncate">
            SNO:{student.sno} · {getSubCourseDef(student.program).course.label}—{getSubCourseDef(student.program).sub.label} · {student.batch} · {student.session} · <span className={balanceDisplay.color}>{balanceDisplay.label}</span>
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[130px] h-control-sm text-meta" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as LedgerEntryType | 'all')}>
          <SelectTrigger className="w-[150px] h-control-sm text-meta" aria-label="Entry type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {typeOptions.map((type) => (
              <SelectItem key={type} value={type}>{ENTRY_LABELS[type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={showReversed ? 'show' : 'hide'} onValueChange={(v) => setShowReversed(v === 'show')}>
          <SelectTrigger className="w-[150px] h-control-sm text-meta" aria-label="Reversed entries">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="show">Show reversed</SelectItem>
            <SelectItem value="hide">Hide reversed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-control-sm text-meta print:hidden" onClick={() => window.print()}>
          <Printer size={12} className="mr-1.5" />
          Print
        </Button>
      </div>

      {/* §54 header strip — Balance · Due · Overdue · Credit, from the charge state */}
      <Card>
        <CardContent className="py-2.5">
          <div className="grid grid-cols-4 gap-2 text-micro">
            <div>
              <div className="text-ink-muted uppercase tracking-wide text-micro">Balance</div>
              <div className={cn('text-ui font-bold', balanceDisplay.color)}>{formatPKR(student.computedBalance)}</div>
            </div>
            <div>
              <div className="text-ink-muted uppercase tracking-wide text-micro">Due</div>
              <div className="text-meta font-semibold text-ink">{formatPKR(state.unpaidTotal)}</div>
            </div>
            <div>
              <div className="text-ink-muted uppercase tracking-wide text-micro">Overdue</div>
              <div className={cn('text-meta font-semibold', overdue > 0 ? 'text-dues' : 'text-ink')}>
                {formatPKR(overdue)}
              </div>
            </div>
            <div>
              <div className="text-ink-muted uppercase tracking-wide text-micro">Credit</div>
              <div className="text-meta font-semibold text-credit">{formatPKR(state.credit)}</div>
            </div>
          </div>
          {/* Money the charge list cannot account for is stated, never hidden (§7.3). */}
          {state.unplacedDues > 0 && (
            <p className="text-micro text-ink-muted mt-2">
              {formatPKR(state.unplacedDues)} of the balance sits on no fee charge — usually an opening balance carried in without one.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Entry table — posting order, the running balance beside every row */}
      <Card className="print-area">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Allocated to</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-ink-subtle text-body">
                  <div>No entries yet.</div>
                  {canEdit && !student.struckOff && (
                    <Button size="sm" className="mt-3" onClick={() => navigate(`/ledger/${student.sno}/add-demand`)}>
                      <Plus size={12} className="mr-1.5" />
                      Add Demand
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
            {rows.length > 0 && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-ink-subtle text-body">
                  No entries match these filters.
                </TableCell>
              </TableRow>
            )}
            {visible.map(({ entry, signed, running }) => {
              const cancelledBy = reversedBy.get(entry.id);
              const reversedTarget = entry.type === 'Reversal' && entry.linkedEntryId
                ? lookup(entry.linkedEntryId)
                : undefined;
              const lines = entry.lines ?? [];
              const isOpen = openLines.includes(entry.id);
              const allocated = entry.type === 'Payment' ? allocationLabels(entry, state) : [];
              // Migrated descriptions already read "Payment #101, cash", so the receipt
              // link would just repeat the number.
              const showReference = entry.type === 'Payment' && !!entry.reference
                && !entry.description.includes(entry.reference);

              return (
                <Fragment key={entry.id}>
                  <TableRow className={highlightId === entry.id ? 'bg-accent-soft' : undefined}>
                    <TableCell className="tabular-nums whitespace-nowrap">{formatDate(entry.date)}</TableCell>
                    <TableCell className="max-w-[300px]">
                      <div className={cn('truncate', cancelledBy ? 'line-through text-ink-muted' : 'text-ink-secondary')}>
                        {String(entry.entryNo).padStart(3, '0')} · {entry.description}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-micro">
                        {lines.length > 0 && (
                          <button
                            className="text-accent hover:underline inline-flex items-center gap-0.5"
                            onClick={() => toggleLines(entry.id)}
                            title="Show the itemised components"
                          >
                            lines
                            {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          </button>
                        )}
                        {cancelledBy && (
                          // §54: the link jumps to the reversal, using the same flash the
                          // write screens already use for a freshly posted row.
                          <button
                            className="text-ink-muted hover:underline"
                            onClick={() => setSearchParams({ highlight: cancelledBy.id })}
                          >
                            Reversed by #{cancelledBy.entryNo}
                          </button>
                        )}
                        {reversedTarget && <span className="text-ink-muted">Reversal of #{reversedTarget.entryNo}</span>}
                        {showReference && (
                          <button
                            className="text-accent hover:underline tabular-nums whitespace-nowrap"
                            onClick={() => navigate('/payments/reprint')}
                            title="Open receipt reprint"
                          >
                            {entry.reference}
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <EntryTypeBadge type={entry.type} />
                    </TableCell>
                    <TableCell className="text-right">
                      <SignedAmount value={signed} />
                    </TableCell>
                    <TableCell className="text-right font-semibold text-ink tabular-nums">
                      {formatPKR(running)}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap text-ink-muted">
                      {entry.dueDate ? formatDate(entry.dueDate) : '—'}
                    </TableCell>
                    <TableCell className="text-micro text-ink-secondary">
                      {allocated.length === 0
                        ? <span className="text-ink-subtle">—</span>
                        : allocated.map((row) => `${row.label}: ${formatPKR(row.amount)}`).join(', ')}
                    </TableCell>
                  </TableRow>
                  {/* The components sit under the row they belong to (§54), so the
                      running balance column stays aligned with the entries only. */}
                  {isOpen && lines.map((line) => (
                    <TableRow key={`${entry.id}-${line.name}`} className="bg-surface-sunken">
                      <TableCell />
                      <TableCell className="pl-6 text-micro text-ink-muted">{line.name}</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right text-micro text-ink-muted tabular-nums">
                        {formatPKR(line.amount)}
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        {rows.length > 0 && (
          <div className="px-4 py-2.5 border-t border-hairline flex items-center justify-between text-meta text-ink-muted">
            <span>Showing {visible.length} of {rows.length} entries</span>
            <span>
              Closing balance: <strong className="text-ink tabular-nums">{formatPKR(student.computedBalance)}</strong>
            </span>
          </div>
        )}
      </Card>

      {/* Actions — state-based disable (not hide) when struck off */}
      {canEdit && (
        <div className="flex flex-wrap gap-1.5 print:hidden">
          {hasNextTerm ? (
            <Button
              size="sm"
              className="h-control-sm text-meta"
              disabled={student.struckOff}
              title={student.struckOff ? 'Blocked — student is struck off' : 'Advance term and post recurring demand'}
              onClick={() => navigate(`/ledger/${student.sno}/promote`)}
            >
              <Plus size={12} className="mr-1.5" />
              Promote
            </Button>
          ) : (
            <span className="text-micro text-cleared bg-cleared-soft border border-hairline rounded-pill px-2.5 py-1.5">Program complete — final term</span>
          )}
          <Button
            size="sm"
            className="h-control-sm text-meta"
            disabled={student.struckOff}
            title={student.struckOff ? 'Blocked — student is struck off' : 'Post a term demand (correction only — normal billing uses Promote)'}
            onClick={() => navigate(`/ledger/${student.sno}/add-demand`)}
          >
            <Plus size={12} className="mr-1.5" />
            Add Demand
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-control-sm text-meta"
            disabled={student.struckOff}
            title={student.struckOff ? 'Blocked — student is struck off' : 'Post exam, clinical, or fine charges'}
            onClick={() => navigate(`/ledger/${student.sno}/add-charge`)}
          >
            <Scale size={12} className="mr-1.5" />
            Add Charge
          </Button>
          <Button variant="outline" size="sm" className="h-control-sm text-meta" onClick={() => navigate(`/ledger/${student.sno}/adjust`)}>
            <SlidersHorizontal size={12} className="mr-1.5" />
            Adjust
          </Button>
          <Button variant="outline" size="sm" className="h-control-sm text-meta" onClick={() => navigate(`/payments/record?sno=${student.sno}`)}>
            <CreditCard size={12} className="mr-1.5" />
            Payment
          </Button>
          <Button variant="outline" size="sm" className="h-control-sm text-meta print:hidden" onClick={() => window.print()}>
            <Printer size={12} className="mr-1.5" />
            Print Statement
          </Button>
        </div>
      )}
    </div>
  );
}
