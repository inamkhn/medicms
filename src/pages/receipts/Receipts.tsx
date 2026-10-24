// ============================================
// MediCMS Desktop — Receipts list (§56.1)
//
// "Receipts [Search number, student...] · [Date] [Mode] [Counter] [Status]" and
// one row per number: a receipt the book issued, or a slip that was spoiled or
// skipped. A voided receipt stays on the list, struck through, with its number
// spent (§27.2, §28); a reprint shows how many times it has been printed (§27.1).
//
// Row menu: Reprint | Open student | Void. Voiding is the Accountant's and the
// Admin's (§3), and it is a linked reversal — never a deletion — so this screen
// hands it to the ledger's own void dialog instead of writing anything itself.
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Printer, Search, X, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ReceiptDoc, type ReceiptSize } from '@/components/receipts/ReceiptDoc';
import { VoidReceiptDialog } from '@/components/ledger/VoidReceiptDialog';
import { formatDate, formatPKR, formatTime } from '@/lib/utils';
import { todayKey } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { chargeStateOf, allocationLabels, reversedEntryIds } from '@/lib/ledger';
import { formatReceiptNo, receiptFactsOf } from '@/lib/receipts';
import { useAuditStore, useAuthStore, useLedgerStore, useReceiptBookStore, useSettingsStore, useStudentStore } from '@/stores';
import type { LedgerEntry } from '@/types';

type StatusFilter = 'All' | 'Used' | 'Void' | 'Spoiled' | 'Skipped';
type DateFilter = 'All' | 'Today' | 'Week';

const STATUS_VARIANT: Record<Exclude<StatusFilter, 'All'>, BadgeVariant> = {
  Used: 'cleared',
  Void: 'secondary',
  Spoiled: 'dues',
  Skipped: 'danger',
};

/** One line of §56.1 — a receipt the book issued, or a number that was consumed without one. */
interface ReceiptRow {
  id: string;
  label: string;
  status: Exclude<StatusFilter, 'All'>;
  date: string;
  time: string;
  studentSno: number | null;
  studentName: string;
  amount: number | null;
  mode: string;
  by: string;
  reprints: number;
  /** The Payment entry, when this row is an issued receipt (needed to void or reprint it). */
  entry: LedgerEntry | null;
  /** Why a spoiled or skipped number was consumed (§27.3, §25). */
  reason: string;
}

function StatusBadge({ status }: { status: Exclude<StatusFilter, 'All'> }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

// -------------------------------------------
// Reprint (§27.1) — the DUPLICATE mark, the count, the audit
// -------------------------------------------
function ReprintDialog({
  row, institute, onClose,
}: {
  row: ReceiptRow;
  institute: { name: string; address: string; phone: string };
  onClose: () => void;
}) {
  const entry = row.entry;
  const recordReprint = useReceiptBookStore((s) => s.recordReprint);
  const defaultPaper = useSettingsStore((s) => s.paperSize);
  const [size, setSize] = useState<ReceiptSize>(defaultPaper);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  const cashier = useAuthStore((s) => s.user?.name ?? 'Admin');

  const lines = useMemo(() => {
    if (!entry) return [];
    const own = ledgerEntries.filter((e) => e.studentSno === entry.studentSno);
    return allocationLabels(entry, chargeStateOf(own));
  }, [entry, ledgerEntries]);

  const handlePrint = () => {
    if (!entry?.reference) return;
    recordReprint(entry.reference);
    useAuditStore.getState().addLog({
      user: cashier,
      action: 'Receipt Reprint',
      studentSno: entry.studentSno,
      details: `Reprinted receipt ${entry.reference} · ${formatPKR(entry.amount)} · reprint ${row.reprints + 1} (§27.1)`,
    });
    window.print();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reprint receipt {row.label}</DialogTitle>
          <DialogDescription>
            A reprint carries the DUPLICATE mark and is counted — the receipt itself never changes (§27.1).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="flex items-center gap-2 print:hidden">
            <Button variant={size === '80mm' ? 'default' : 'outline'} size="sm" onClick={() => setSize('80mm')}>80 mm</Button>
            <Button variant={size === 'A4' ? 'default' : 'outline'} size="sm" onClick={() => setSize('A4')}>A4</Button>
            <span className="ml-auto text-micro text-ink-muted">
              Printed {row.reprints} {row.reprints === 1 ? 'time' : 'times'} already
            </span>
          </div>
          <div className="print-area">
            {entry && (
              <ReceiptDoc
                size={size}
                institute={institute}
                studentName={row.studentName}
                studentSno={entry.studentSno}
                receiptNo={row.label}
                date={entry.date}
                time={formatTime(entry.createdAt)}
                payment={entry.amount}
                mode={entry.paymentMode}
                lines={lines}
                receivedBy={entry.createdBy}
                mark="DUPLICATE"
              />
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handlePrint}>
            <Printer size={14} className="mr-1.5" /> Print duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Receipts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((s) => s.user?.role);

  const ledgerEntries = useLedgerStore((s) => s.entries);
  const storeStudents = useStudentStore((s) => s.students);
  const showTestRecords = useSettingsStore((s) => s.showTestRecords);
  const books = useReceiptBookStore((s) => s.books);
  const bookEvents = useReceiptBookStore((s) => s.events);
  const reprints = useReceiptBookStore((s) => s.reprints);
  const institute = {
    name: useSettingsStore((s) => s.instituteName),
    address: useSettingsStore((s) => s.instituteAddress),
    phone: useSettingsStore((s) => s.institutePhone),
  };

  const [search, setSearch] = useState(() => searchParams.get('sno') ?? '');
  const [status, setStatus] = useState<StatusFilter>('All');
  const [mode, setMode] = useState('All');
  const [counter, setCounter] = useState('All');
  const [when, setWhen] = useState<DateFilter>(() => (searchParams.get('date') === 'today' ? 'Today' : 'All'));
  const [reprintTarget, setReprintTarget] = useState<ReceiptRow | null>(null);
  const [voidTarget, setVoidTarget] = useState<LedgerEntry | null>(null);

  const canVoid = can(role, 'payment.void');
  const canReprint = can(role, 'payment.reprint');
  const counterFilter = role === 'Counter' ? useAuthStore.getState().user?.name ?? '' : null;

  const nameBySno = useMemo(() => new Map(storeStudents.map((s) => [s.sno, s.name] as const)), [storeStudents]);
  const testBySno = useMemo(() => new Map(storeStudents.map((s) => [s.sno, s.isTestRecord] as const)), [storeStudents]);
  const voidedIds = useMemo(() => reversedEntryIds(ledgerEntries), [ledgerEntries]);
  const reprintMap = useMemo(() => new Map(Object.entries(reprints)), [reprints]);

  const rows = useMemo(() => {
    const out: ReceiptRow[] = [];

    // Every book's issued numbers, so a receipt that predates the register still shows.
    for (const book of books) {
      for (const facts of receiptFactsOf(ledgerEntries, book, reprintMap)) {
        if (!facts.reference) continue;
        const entry = ledgerEntries.find((e) => e.type === 'Payment' && e.reference === facts.reference) ?? null;
        out.push({
          id: entry?.id ?? `facts-${facts.reference}`,
          label: facts.reference,
          status: facts.voided ? 'Void' : 'Used',
          date: facts.date,
          time: entry ? formatTime(entry.createdAt) : '',
          studentSno: facts.studentSno,
          studentName: nameBySno.get(facts.studentSno) ?? `SNO ${facts.studentSno}`,
          amount: facts.amount,
          mode: entry?.paymentMode ?? '',
          by: facts.by,
          reprints: facts.reprints,
          entry,
          reason: '',
        });
      }
    }

    // Numbers consumed without a receipt (§25 skipped, §27.3 spoiled).
    for (const event of bookEvents) {
      const book = books.find((b) => b.id === event.bookId);
      if (!book) continue;
      out.push({
        id: event.id,
        label: formatReceiptNo(book.prefix, event.number),
        status: event.kind as Exclude<StatusFilter, 'All'>,
        date: event.at.slice(0, 10),
        time: formatTime(event.at),
        studentSno: null,
        studentName: '—',
        amount: null,
        mode: '',
        by: event.by,
        reprints: 0,
        entry: null,
        reason: event.reason,
      });
    }

    return out.sort((a, b) => (a.date === b.date ? b.label.localeCompare(a.label) : b.date.localeCompare(a.date)));
  }, [books, bookEvents, ledgerEntries, reprintMap, nameBySno]);

  const counters = useMemo(() => [...new Set(rows.map((row) => row.by))].sort(), [rows]);

  const today = todayKey();
  const weekStart = useMemo(() => {
    const day = new Date(`${today}T00:00:00`);
    day.setDate(day.getDate() - 6);
    return day.toISOString().slice(0, 10);
  }, [today]);

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!showTestRecords && row.studentSno !== null && testBySno.get(row.studentSno)) return false;
    if (counterFilter && row.by !== counterFilter) return false;
    if (status !== 'All' && row.status !== status) return false;
    if (mode !== 'All' && row.mode !== mode) return false;
    if (counter !== 'All' && row.by !== counter) return false;
    if (when === 'Today' && row.date !== today) return false;
    if (when === 'Week' && row.date < weekStart) return false;
    if (!q) return true;
    const hay = `${row.label} ${row.studentName} ${row.studentSno ?? ''} ${row.amount ?? ''}`.toLowerCase();
    return hay.includes(q);
  });

  const clearParams = () => setSearchParams({});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-ui font-bold text-ink tracking-tight">Receipts</h1>
        <span className="text-micro text-ink-muted">{filtered.length} of {rows.length}</span>
        <div className="relative ml-auto min-w-[220px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Receipt number, student, SNO or amount"
            className="h-control-sm pl-7 text-meta"
          />
          {searchParams.size > 0 && (
            <button
              type="button"
              onClick={clearParams}
              className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-control border border-hairline bg-panel px-1.5 py-0.5 text-micro text-ink-secondary"
              title="Clear the link's filter"
            >
              Linked <X size={10} />
            </button>
          )}
        </div>
        <Select value={when} onValueChange={(v) => setWhen(v as DateFilter)}>
          <SelectTrigger className="w-[120px] h-control-sm text-meta" aria-label="Date"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All dates</SelectItem>
            <SelectItem value="Today">Today</SelectItem>
            <SelectItem value="Week">Last 7 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="w-[110px] h-control-sm text-meta" aria-label="Mode"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All modes</SelectItem>
            {['Cash', 'Bank', 'Online', 'Cheque'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={counter} onValueChange={setCounter}>
          <SelectTrigger className="w-[140px] h-control-sm text-meta" aria-label="Counter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All counters</SelectItem>
            {counters.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-[120px] h-control-sm text-meta" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(['All', 'Used', 'Void', 'Spoiled', 'Skipped'] as StatusFilter[]).map((s) => (
              <SelectItem key={s} value={s}>{s === 'All' ? 'All statuses' : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Date / time</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-meta text-ink-muted">
                    No receipt matches these filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.slice(0, 300).map((row) => {
                const struck = row.status === 'Void';
                return (
                  <TableRow key={row.id}>
                    <TableCell className={`num font-semibold ${struck ? 'text-ink-muted line-through' : 'text-ink'}`}>
                      {row.label}
                    </TableCell>
                    <TableCell className={struck ? 'text-ink-muted line-through' : 'text-ink'}>
                      {row.studentName}
                      {row.studentSno !== null && <span className="ml-1 text-micro text-ink-muted">SNO {row.studentSno}</span>}
                      {row.reason && <div className="text-micro text-ink-muted">{row.reason}</div>}
                    </TableCell>
                    <TableCell className="num text-right">{row.amount === null ? '—' : formatPKR(row.amount)}</TableCell>
                    <TableCell className="text-meta text-ink-secondary">{row.mode || '—'}</TableCell>
                    <TableCell className="text-meta text-ink-secondary whitespace-nowrap">
                      {formatDate(row.date)}{row.time ? ` · ${row.time}` : ''}
                    </TableCell>
                    <TableCell className="text-meta text-ink-secondary">{row.by}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                      {row.reprints > 0 && (
                        <div className="mt-0.5 text-micro text-ink-muted">Reprinted {row.reprints}×</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canReprint && row.entry && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-meta"
                            onClick={() => setReprintTarget(row)}
                            title="Reprint with the DUPLICATE mark (§27.1)"
                          >
                            <Printer size={12} className="mr-1" /> Reprint
                          </Button>
                        )}
                        {row.studentSno !== null && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-meta"
                            onClick={() => navigate(`/students/${row.studentSno}`)}
                          >
                            Open
                          </Button>
                        )}
                        {canVoid && row.entry && row.status === 'Used' && !voidedIds.has(row.entry.id) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-meta text-danger"
                            onClick={() => setVoidTarget(row.entry)}
                            title="Void this receipt — a linked reversal, never a deletion (§27.2)"
                          >
                            Void
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length > 300 && (
            <div className="border-t border-hairline-soft p-2 text-center text-micro text-ink-muted">
              Showing the newest 300 of {filtered.length} — narrow the filters to see the rest.
            </div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-micro text-ink-muted">
        <FileDown size={12} />
        Every number is accounted for: used, void, spoiled, skipped or unused (§23).
        The book itself is on the receipt register.
      </p>

      {reprintTarget && (
        <ReprintDialog row={reprintTarget} institute={institute} onClose={() => setReprintTarget(null)} />
      )}
      {voidTarget && <VoidReceiptDialog payment={voidTarget} onClose={() => setVoidTarget(null)} />}
    </div>
  );
}
