// ============================================
// MediCMS Desktop — Receipt register, one book (§56.2, §28)
//
// "Every number from first to last, each with its status": a chip per number,
// U used · V void · S spoiled · K skipped · . unused, and the counts that must
// add up to the range. A number at or below the issuing point with no status at
// all is highlighted "Unaccounted number" — that should never appear, and it is
// a warning sign if it does (§56.2).
//
// Clicking a chip opens the receipt, or pulls out the reason a spoiled or
// skipped number was consumed (§27.3, §25).
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate, formatPKR, cn } from '@/lib/utils';
import { downloadCsv } from '@/lib/csv';
import {
  bookStateOf,
  formatReceiptNo,
  lowStockMessage,
  rangeLabel,
  receiptFactsOf,
  receiptRegister,
  type ReceiptStatus,
} from '@/lib/receipts';
import { useLedgerStore, useReceiptBookStore, useStudentStore } from '@/stores';

/** §56.2's legend letters — a chip is never identified by colour alone (P4). */
const LETTER: Record<ReceiptStatus, string> = {
  Used: 'U',
  Void: 'V',
  Spoiled: 'S',
  Skipped: 'K',
  Unused: '.',
};

const CHIP: Record<ReceiptStatus, string> = {
  Used: 'border-cleared/30 bg-cleared-soft text-cleared',
  Void: 'border-hairline-strong bg-hairline-soft text-ink-muted line-through',
  Spoiled: 'border-dues/30 bg-dues-soft text-dues',
  Skipped: 'border-danger/40 bg-panel text-danger',
  Unused: 'border-hairline-soft bg-panel text-ink-muted',
};

const STATUS_VARIANT: Record<ReceiptStatus, BadgeVariant> = {
  Used: 'cleared',
  Void: 'secondary',
  Spoiled: 'dues',
  Skipped: 'danger',
  Unused: 'outline',
};

export default function ReceiptRegister() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const books = useReceiptBookStore((s) => s.books);
  const bookEvents = useReceiptBookStore((s) => s.events);
  const reprints = useReceiptBookStore((s) => s.reprints);
  const settings = useReceiptBookStore((s) => s.paymentSettings);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  const students = useStudentStore((s) => s.students);

  const book = books.find((b) => b.id === id) ?? null;
  const [selected, setSelected] = useState<number | null>(null);

  const reprintMap = useMemo(() => new Map(Object.entries(reprints)), [reprints]);
  const nameBySno = useMemo(() => new Map(students.map((s) => [s.sno, s.name] as const)), [students]);

  const summary = useMemo(
    () => (book ? receiptRegister(book, receiptFactsOf(ledgerEntries, book, reprintMap), bookEvents) : null),
    [book, ledgerEntries, reprintMap, bookEvents],
  );

  if (!book || !summary) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings/receipt-books')}>
          <ArrowLeft size={14} className="mr-1" /> Receipt books
        </Button>
        <Card><CardContent className="py-10 text-center text-meta text-ink-muted">
          That book no longer exists. Its numbers may have been closed with it.
        </CardContent></Card>
      </div>
    );
  }

  const status = bookStateOf(book, summary.nextNumber);
  const gapSet = new Set(summary.gaps);
  const stock = lowStockMessage(book.name, summary.left, settings.lowStock);
  const row = selected === null ? null : summary.rows.find((r) => r.number === selected) ?? null;

  const exportCsv = () => {
    downloadCsv(
      `${book.name.replace(/\s+/g, '-').toLowerCase()}-register.csv`,
      ['Number', 'Status', 'Date', 'Student SNO', 'Student', 'Amount', 'By', 'Reprints', 'Reason'],
      summary.rows.map((r) => [
        r.label,
        r.status,
        r.receipt?.date ?? r.event?.at.slice(0, 10) ?? '',
        r.receipt?.studentSno ?? '',
        r.receipt ? nameBySno.get(r.receipt.studentSno) ?? '' : '',
        r.receipt?.amount ?? '',
        r.receipt?.by ?? r.event?.by ?? '',
        r.receipt?.reprints ?? '',
        r.event?.reason ?? (gapSet.has(r.number) ? 'Unaccounted number' : ''),
      ]),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/settings/receipt-books')} title="Receipt books">
          <ArrowLeft size={14} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-ui font-bold text-ink tracking-tight">{book.name} — {rangeLabel(book)}</h1>
          <p className="text-micro text-ink-muted">
            {book.assignedTo || 'Unassigned'} · {book.mode === 'PrePrinted' ? 'Pre-printed book' : 'Printed by the app'} ·{' '}
            {status}
          </p>
        </div>
        <Badge variant={status === 'Active' ? 'cleared' : status === 'Full' ? 'dues' : 'secondary'} className="ml-1">{status}</Badge>
        <div className="ml-auto flex gap-1.5 print:hidden">
          <Button variant="outline" size="sm" className="h-control-sm text-meta" onClick={exportCsv}>
            <Download size={12} className="mr-1.5" /> Export
          </Button>
          <Button variant="outline" size="sm" className="h-control-sm text-meta" onClick={() => window.print()}>
            <Printer size={12} className="mr-1.5" /> Print
          </Button>
        </div>
      </div>

      {/* §28 counts — the five statuses plus the range's own arithmetic. */}
      <Card>
        <CardContent className="space-y-3 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta">
            <span><b className="num text-ink">{summary.counts.Used}</b> <span className="text-ink-muted">used</span></span>
            <span><b className="num text-ink">{summary.counts.Void}</b> <span className="text-ink-muted">void</span></span>
            <span><b className="num text-ink">{summary.counts.Spoiled}</b> <span className="text-ink-muted">spoiled</span></span>
            <span><b className="num text-ink">{summary.counts.Skipped}</b> <span className="text-ink-muted">skipped</span></span>
            <span><b className="num text-ink">{summary.counts.Unused}</b> <span className="text-ink-muted">unused</span></span>
            <span className="ml-auto text-ink-muted">
              {summary.nextNumber === null
                ? 'No number left in this book'
                : `Next ${formatReceiptNo(book.prefix, summary.nextNumber)}`}
            </span>
          </div>
          {stock && <p className="text-micro text-dues">{stock}</p>}
          {summary.gaps.length > 0 && (
            <p className="text-micro text-danger">
              Unaccounted number{summary.gaps.length === 1 ? '' : 's'}: {summary.gaps.map((n) => formatReceiptNo(book.prefix, n)).join(', ')} — a gap
              below the issuing point is a warning sign (§56.2).
            </p>
          )}

          {/* §56.2 chips: one per number, legend letters carried in the title. */}
          <div className="flex flex-wrap gap-1">
            {summary.rows.map((r) => (
              <button
                key={r.number}
                type="button"
                onClick={() => setSelected(r.number === selected ? null : r.number)}
                className={cn(
                  'num flex h-7 min-w-[52px] items-center justify-center gap-1 rounded-control border px-1.5 text-micro font-medium',
                  gapSet.has(r.number) ? 'border-danger bg-danger-soft text-danger' : CHIP[r.status],
                  selected === r.number && 'ring-2 ring-accent ring-offset-1',
                )}
                title={`${r.label} — ${gapSet.has(r.number) ? 'Unaccounted' : r.status}${r.receipt ? ` · ${formatPKR(r.receipt.amount)}` : ''}${r.event ? ` · ${r.event.reason}` : ''}`}
              >
                {String(r.number).slice(-4)}
                <span className="text-micro opacity-70">{gapSet.has(r.number) ? '!' : LETTER[r.status]}</span>
              </button>
            ))}
          </div>
          <p className="text-micro text-ink-muted">
            U used · V void · S spoiled · K skipped · . unused
          </p>
        </CardContent>
      </Card>

      {/* What one chip means, without leaving the register (§56.2). */}
      {row && (
        <Card>
          <CardContent className="space-y-2 py-3">
            <div className="flex items-center gap-2">
              <span className="num text-ui font-bold text-ink">{row.label}</span>
              <Badge variant={gapSet.has(row.number) ? 'danger' : STATUS_VARIANT[row.status]}>
                {gapSet.has(row.number) ? 'Unaccounted' : row.status}
              </Badge>
              {row.receipt && row.receipt.reprints > 0 && (
                <span className="text-micro text-ink-muted">Reprinted {row.receipt.reprints}×</span>
              )}
            </div>
            {row.receipt && (
              <div className="grid grid-cols-2 gap-2 text-meta text-ink-secondary sm:grid-cols-4">
                <div>
                  <div className="text-micro text-ink-muted uppercase tracking-wide">Student</div>
                  <div className="font-medium text-ink">
                    {nameBySno.get(row.receipt.studentSno) ?? `SNO ${row.receipt.studentSno}`}
                  </div>
                </div>
                <div>
                  <div className="text-micro text-ink-muted uppercase tracking-wide">Amount</div>
                  <div className="num font-medium text-ink">{formatPKR(row.receipt.amount)}</div>
                </div>
                <div>
                  <div className="text-micro text-ink-muted uppercase tracking-wide">Date</div>
                  <div className="font-medium text-ink">{formatDate(row.receipt.date)}</div>
                </div>
                <div>
                  <div className="text-micro text-ink-muted uppercase tracking-wide">Issued by</div>
                  <div className="font-medium text-ink">{row.receipt.by}</div>
                </div>
              </div>
            )}
            {row.event && (
              <p className="text-meta text-ink-secondary">
                {row.event.kind} on {formatDate(row.event.at.slice(0, 10))} by {row.event.by} — “{row.event.reason}”
              </p>
            )}
            {!row.receipt && !row.event && !gapSet.has(row.number) && (
              <p className="text-meta text-ink-muted">This number has not been used yet.</p>
            )}
            <div className="flex gap-1.5 print:hidden">
              {row.receipt && (
                <Button size="sm" variant="outline" className="h-7 text-meta"
                  onClick={() => navigate(`/receipts?sno=${row.receipt?.studentSno ?? ''}`)}>
                  Find on the receipts list
                </Button>
              )}
              {row.receipt && (
                <Button size="sm" variant="ghost" className="h-7 text-meta"
                  onClick={() => navigate(`/students/${row.receipt?.studentSno ?? ''}`)}>
                  Open student
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
