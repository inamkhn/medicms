// ============================================
// MediCMS Desktop — Day book (§9.2, §60)
//
// "A register of everything entered on one day." The totals by mode, the other
// entries that are not money coming in, and the rows underneath — straight from
// `dayBook`, so the figures on screen and the printed sheet cannot differ from
// the dashboard's collection for the same date (§10 "the day book totals match
// the dashboard's collection for the same day").
//
// A counter operator sees only their own entries (§60); the counter filter is
// theirs, not a choice. The cash line is `cashTaken`, which is what the day
// closing screen counts against (§9.2 "it feeds the day closing screen").
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatPKR, formatTime, formatDate, cn } from '@/lib/utils';
import { todayKey } from '@/lib/dates';
import { downloadCsv } from '@/lib/csv';
import {
  ENTRY_LABELS,
  typeDirection,
  type LedgerEntryType,
  type PaymentMode,
} from '@/lib/ledger';
import { PAYMENT_MODES, cashTaken, dayBook } from '@/lib/receipts';
import { can } from '@/lib/permissions';
import { useAuthStore, useLedgerStore, useSettingsStore, useStudentStore } from '@/stores';

export default function DayBook() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const entries = useLedgerStore((s) => s.entries);
  const students = useStudentStore((s) => s.students);
  const instituteName = useSettingsStore((s) => s.instituteName);

  const isCounter = user?.role === 'Counter';
  const [date, setDate] = useState(todayKey());
  const [counter, setCounter] = useState('All');
  const [mode, setMode] = useState<PaymentMode | 'All'>('All');
  const [type, setType] = useState<LedgerEntryType | 'All'>('All');

  const nameBySno = useMemo(() => new Map(students.map((s) => [s.sno, s.name] as const)), [students]);
  // Who can appear in the counter filter: everyone who has entered something.
  const counterNames = useMemo(
    () => [...new Set(entries.map((entry) => entry.createdBy))].sort((a, b) => a.localeCompare(b)),
    [entries],
  );
  const typeNames = useMemo(
    () => [...new Set(entries.map((entry) => entry.type))].sort((a, b) => ENTRY_LABELS[a].localeCompare(ENTRY_LABELS[b])),
    [entries],
  );

  // §60 "Counter operators see only their own entries" — scope wins over the filter.
  const scope = isCounter ? user?.name ?? '' : counter === 'All' ? null : counter;

  const book = useMemo(
    () => dayBook(entries, { date, mode, type, counter: scope, names: nameBySno }),
    [entries, date, mode, type, scope, nameBySno],
  );

  const cash = cashTaken(book);
  const others = book.byType.filter((total) => total.type !== 'Payment');

  const exportCsv = () => {
    downloadCsv(
      `day-book-${date}.csv`,
      ['Time', 'Receipt', 'Student', 'SNO', 'Type', 'Mode', 'Amount', 'By', 'Voided'],
      book.rows.map((row) => [
        row.createdAt.slice(11, 16),
        row.reference,
        row.studentName,
        row.studentSno,
        ENTRY_LABELS[row.type],
        row.mode ?? '',
        row.amount,
        row.by,
        row.voided ? 'Void' : '',
      ]),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/ledger')} title="Ledger">
          <ArrowLeft size={14} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-ui font-bold text-ink tracking-tight">Day book</h1>
          <p className="text-micro text-ink-muted">
            Everything entered on {formatDate(date)} — totals by mode and the other entries, then the rows (§60).
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {can(user?.role, 'payment.record') && (
            <Button variant="outline" size="sm" className="h-control-sm text-meta" onClick={() => navigate('/finance/day-close')}>
              <CalendarCheck size={12} className="mr-1.5" /> Close day
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-control-sm text-meta" onClick={exportCsv}>
            <Download size={12} className="mr-1.5" /> Export
          </Button>
          <Button variant="outline" size="sm" className="h-control-sm text-meta" onClick={() => window.print()}>
            <Printer size={12} className="mr-1.5" /> Print
          </Button>
        </div>
      </div>

      {/* §60's filter row: date, counter, mode, type. */}
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <div className="space-y-1">
            <label htmlFor="daybook-date" className="text-micro text-ink-muted">Date</label>
            <Input id="daybook-date" type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className="h-control-sm w-[150px] text-meta" />
          </div>
          {!isCounter && (
            <div className="space-y-1">
              <span className="text-micro text-ink-muted">Counter</span>
              <Select value={counter} onValueChange={setCounter}>
                <SelectTrigger className="h-control-sm w-[160px] text-meta" aria-label="Counter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All counters</SelectItem>
                  {counterNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <span className="text-micro text-ink-muted">Mode</span>
            <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode | 'All')}>
              <SelectTrigger className="h-control-sm w-[130px] text-meta" aria-label="Payment mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All modes</SelectItem>
                {PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-micro text-ink-muted">Entry type</span>
            <Select value={type} onValueChange={(v) => setType(v as LedgerEntryType | 'All')}>
              <SelectTrigger className="h-control-sm w-[180px] text-meta" aria-label="Entry type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All entries</SelectItem>
                {typeNames.map((t) => <SelectItem key={t} value={t}>{ENTRY_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isCounter && <span className="text-micro text-ink-muted">Showing your entries only.</span>}
        </CardContent>
      </Card>

      <div className="print-area space-y-3">
        {isCounter && <p className="hidden print:block text-meta">Counter: {user?.name}</p>}

        {/* §60 totals by mode, then the four always present. */}
        <Card>
          <CardContent className="space-y-2 py-3">
            <div className="flex items-center gap-2">
              <span className="text-meta font-semibold text-ink">Totals by mode</span>
              <span className="text-micro text-ink-muted">{instituteName || 'Day book'} · {formatDate(date)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {book.byMode.map((row) => (
                <div key={row.mode} className="rounded-control border border-hairline-soft bg-panel-soft px-2.5 py-1.5">
                  <div className="text-micro text-ink-muted">{row.mode}</div>
                  <div className="num text-body font-semibold text-ink">{formatPKR(row.amount)}</div>
                  <div className="text-micro text-ink-subtle">{row.count} {row.count === 1 ? 'receipt' : 'receipts'}</div>
                </div>
              ))}
              <div className="rounded-control border border-hairline-strong bg-panel px-2.5 py-1.5">
                <div className="text-micro text-ink-muted">Total collected</div>
                <div className="num text-body font-bold text-ink">{formatPKR(book.collected)}</div>
                <div className="text-micro text-ink-subtle">{book.collectedCount} {book.collectedCount === 1 ? 'receipt' : 'receipts'}</div>
              </div>
            </div>
            <p className="text-micro text-ink-muted">
              Cash taken {formatPKR(cash)} — the figure the day closing screen counts against (§9.2).
            </p>
          </CardContent>
        </Card>

        {/* §60 "Other entries": concessions, charges, refunds and the day's voids. */}
        <Card>
          <CardContent className="space-y-2 py-3">
            <span className="text-meta font-semibold text-ink">Other entries</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-meta">
              {others.length === 0 && book.voids.count === 0 && (
                <span className="text-ink-muted">Nothing else was entered this day.</span>
              )}
              {others.map((total) => {
                const sign = typeDirection(total.type) > 0 ? '+' : '−';
                return (
                  <span key={total.type}>
                    {ENTRY_LABELS[total.type]}{' '}
                    <b className="num text-ink">{sign}{formatPKR(total.amount).replace('−', '')}</b>{' '}
                    <span className="text-ink-muted">({total.count})</span>
                  </span>
                );
              })}
              {book.voids.count > 0 && (
                <span>
                  Voids <b className="num text-dues">−{formatPKR(book.voids.amount)}</b>{' '}
                  <span className="text-ink-muted">({book.voids.count})</span>
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Time</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {book.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-meta text-ink-muted">
                      Nothing was entered on {formatDate(date)}.
                    </TableCell>
                  </TableRow>
                )}
                {book.rows.map((row) => (
                  <TableRow key={row.id} className={cn(row.voided && 'text-ink-muted')}>
                    <TableCell className="num text-meta text-ink-secondary">{formatTime(row.createdAt)}</TableCell>
                    <TableCell className="num text-meta">
                      <span className={cn(row.voided && 'line-through')}>{row.reference || '—'}</span>
                      {row.voided && <Badge variant="secondary" className="ml-1.5">Void</Badge>}
                    </TableCell>
                    <TableCell className="text-meta text-ink">
                      {row.studentName} <span className="text-ink-subtle">SNO {row.studentSno}</span>
                    </TableCell>
                    <TableCell className="text-meta text-ink-secondary">{ENTRY_LABELS[row.type]}</TableCell>
                    <TableCell className="text-meta text-ink-secondary">{row.mode ?? '—'}</TableCell>
                    <TableCell className={cn('num text-right text-meta font-medium', row.voided ? 'line-through text-ink-muted' : 'text-ink')}>
                      {formatPKR(row.amount)}
                    </TableCell>
                    <TableCell className="text-meta text-ink-secondary">{row.by}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <p className="text-micro text-ink-muted">
          Totals match the dashboard's collection for the same date (§10). A voided receipt stays on the day it was
          entered, struck through and counted under Voids, never in the collection (§60).
        </p>
      </div>
    </div>
  );
}
