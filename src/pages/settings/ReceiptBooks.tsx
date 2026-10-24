// ============================================
// MediCMS Desktop — Receipt books (Settings, Admin only) (§57, §24)
//
// "Book · Counter · Range · Used · Left · Mode · Status" and one drawer to add
// the next one. The drawer refuses a range that overlaps another book and says
// so in the core's own words (`bookProblems`), and it warns when the counter
// already holds an Active book — §24 allows one at a time, and the new book only
// starts when the old one is full.
//
// A book can be closed early, with a reason; its unused numbers stay listed as
// Unused (§57). Nothing here prints a receipt: the counter does that, and the
// register explains every number it spent.
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { nowISO } from '@/lib/txn';
import { cn } from '@/lib/utils';
import {
  bookProblems,
  bookStateOf,
  bookSummaries,
  lowStockMessage,
  rangeLabel,
  receiptFactsOf,
  type BookDraft,
  type ReceiptBook,
} from '@/lib/receipts';
import { useAuditStore, useAuthStore, useLedgerStore, useReceiptBookStore, useUserStore } from '@/stores';

const UNASSIGNED = '__none__';

function NewBookDialog({ books, onClose }: { books: readonly ReceiptBook[]; onClose: () => void }) {
  const addBook = useReceiptBookStore((s) => s.addBook);
  const settings = useReceiptBookStore((s) => s.paymentSettings);
  const users = useUserStore((s) => s.users);
  const actor = useAuthStore((s) => s.user?.name ?? 'Admin');
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('R-');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [assignedTo, setAssignedTo] = useState(UNASSIGNED);
  const [mode, setMode] = useState<ReceiptBook['mode']>('Printed');

  const fromNumber = Math.trunc(Number(from) || 0);
  const toNumber = Math.trunc(Number(to) || 0);
  const draft: BookDraft = {
    name,
    prefix,
    from: fromNumber,
    to: toNumber,
    assignedTo: assignedTo === UNASSIGNED ? '' : assignedTo,
  };
  const problems = bookProblems(draft, books);
  // §57: the drawer warns when the counter already holds an Active book.
  const holder = assignedTo === UNASSIGNED ? null : users.find((u) => u.id === assignedTo);
  const activeForCounter = holder
    ? books.filter((b) => b.assignedTo === holder.id && b.status === 'Active').length
    : 0;
  const count = toNumber >= fromNumber && fromNumber > 0 ? toNumber - fromNumber + 1 : 0;

  const submit = () => {
    const id = addBook(draft, mode, actor, nowISO());
    if (!id) return;
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Settings Change',
      details: `New receipt book ${name.trim()} ${prefix}${fromNumber}–${prefix}${toNumber}${holder ? ` for ${holder.name}` : ''} (§57)`,
    });
    onClose();
    navigate(`/receipts/books/${id}`);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New receipt book</DialogTitle>
          <DialogDescription>
            One non-overlapping range for one counter. The next number is never stored — it is
            whatever the register has not consumed (§25).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Book 3" />
            </div>
            <div className="space-y-1.5">
              <Label>Prefix *</Label>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="R-" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>From *</Label>
              <Input type="number" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="1101" />
            </div>
            <div className="space-y-1.5">
              <Label>To *</Label>
              <Input type="number" value={to} onChange={(e) => setTo(e.target.value)} placeholder="1150" />
            </div>
            <div className="space-y-1.5">
              <Label>Receipts</Label>
              <div className="num flex h-9 items-center rounded-control border border-hairline-soft bg-panel-soft px-3 text-body text-ink">
                {count > 0 ? count : '—'}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assigned to</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue placeholder="Choose a counter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {users.filter((u) => u.status === 'Active').map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} — {u.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeForCounter > 0 && (
              <p className="text-micro text-ink-muted">
                {holder?.name} already holds {activeForCounter === 1 ? 'an Active book' : `${activeForCounter} Active books`}.
                This book starts when it is full.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <div className="flex gap-1.5">
              {(['Printed', 'PrePrinted'] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={mode === m ? 'default' : 'outline'}
                  className="h-7 text-meta"
                  onClick={() => setMode(m)}
                >
                  {m === 'Printed' ? 'Printed by app' : 'Pre-printed book'}
                </Button>
              ))}
            </div>
            <p className="text-micro text-ink-muted">
              {mode === 'Printed'
                ? 'The counter prints the number itself — nothing to type.'
                : 'The slips are already numbered; the counter types the slip it used (§25).'}
            </p>
          </div>
          {problems.length > 0 && (
            <div className="rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-meta text-danger">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
          <p className="text-micro text-ink-muted">
            A book alerts when fewer than {settings.lowStock} receipts are left (§24).
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={problems.length > 0}>Create book</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseBookDialog({ book, onClose }: { book: ReceiptBook; onClose: () => void }) {
  const closeBook = useReceiptBookStore((s) => s.closeBook);
  const actor = useAuthStore((s) => s.user?.name ?? 'Admin');
  const [reason, setReason] = useState('');

  const submit = () => {
    closeBook(book.id, reason, actor, nowISO());
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Settings Change',
      details: `Closed receipt book ${book.name} (${rangeLabel(book)}) — ${reason.trim()} (§57)`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close {book.name}?</DialogTitle>
          <DialogDescription>
            The book stops issuing numbers. Its unused numbers stay listed as Unused, and every
            number it already spent stays in the register (§57).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label>Reason *</Label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
            placeholder="Book finished, counter left, slips water damaged…"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Keep it open</Button>
          <Button variant="destructive" onClick={submit} disabled={reason.trim().length < 4}>Close book</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReceiptBooks() {
  const navigate = useNavigate();
  const books = useReceiptBookStore((s) => s.books);
  const events = useReceiptBookStore((s) => s.events);
  const reprints = useReceiptBookStore((s) => s.reprints);
  const settings = useReceiptBookStore((s) => s.paymentSettings);
  const assignBook = useReceiptBookStore((s) => s.assignBook);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  const users = useUserStore((s) => s.users);

  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState<ReceiptBook | null>(null);

  const reprintMap = useMemo(() => new Map(Object.entries(reprints)), [reprints]);
  const slots = useMemo(
    () => bookSummaries(
      books,
      books.flatMap((book) => receiptFactsOf(ledgerEntries, book, reprintMap)),
      events,
    ),
    [books, ledgerEntries, reprintMap, events],
  );

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? (id || 'Unassigned');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/settings')} title="Settings">
          <ArrowRight size={14} className="rotate-180" />
        </Button>
        <div>
          <h1 className="text-ui font-bold text-ink tracking-tight">Receipt books</h1>
          <p className="text-micro text-ink-muted">
            One numbered range per counter. A receipt number is never reused, even when its receipt is void (§25).
          </p>
        </div>
        <Button size="sm" className="ml-auto h-control-sm text-meta" onClick={() => setAdding(true)}>
          <Plus size={12} className="mr-1.5" /> New book
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Counter</TableHead>
                <TableHead>Range</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Left</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slots.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-meta text-ink-muted">
                    No receipt book yet. Add one before the counter records a payment — the number comes from the book (§24).
                  </TableCell>
                </TableRow>
              )}
              {slots.map(({ book, summary }) => {
                const status = bookStateOf(book, summary.nextNumber);
                const stock = lowStockMessage(book.name, summary.left, settings.lowStock);
                return (
                  <TableRow key={book.id} className={cn(status === 'Closed' && 'opacity-70')}>
                    <TableCell className="font-medium text-ink">{book.name}</TableCell>
                    <TableCell>
                      <Select value={book.assignedTo || UNASSIGNED} onValueChange={(v) => assignBook(book.id, v === UNASSIGNED ? '' : v)}>
                        <SelectTrigger className="h-7 w-[150px] text-meta" aria-label={`Assign ${book.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                          {users.filter((u) => u.status === 'Active').map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="num text-meta text-ink-secondary">{rangeLabel(book)}</TableCell>
                    <TableCell className="num text-right">{summary.issued}</TableCell>
                    <TableCell className="num text-right">
                      <span className={summary.left === 0 ? 'text-dues' : summary.left < settings.lowStock ? 'text-dues' : ''}>
                        {summary.left}
                      </span>
                    </TableCell>
                    <TableCell className="text-meta text-ink-secondary">
                      {book.mode === 'PrePrinted' ? 'Pre-printed' : 'Printed by app'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status === 'Active' ? 'cleared' : status === 'Full' ? 'dues' : 'secondary'}>{status}</Badge>
                      {book.status === 'Closed' && book.closeReason && (
                        <div className="mt-0.5 text-micro text-ink-muted">{book.closeReason}</div>
                      )}
                      {stock && status !== 'Closed' && <div className="mt-0.5 text-micro text-dues">{stock}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-meta" onClick={() => navigate(`/receipts/books/${book.id}`)}>
                          <BookOpen size={12} className="mr-1" /> Register
                        </Button>
                        {book.status !== 'Closed' && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-meta" onClick={() => setClosing(book)}>
                            <Lock size={12} className="mr-1" /> Close
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-micro text-ink-muted">
        Admin only (§3). A counter sees its own book, its next number and the warning when it runs
        low — never this screen.
      </p>
      {slots.length > 0 && (
        <p className="text-micro text-ink-muted">
          Assigned: {slots.map(({ book }) => `${book.name} → ${nameOf(book.assignedTo)}`).join(' · ')}
        </p>
      )}

      {adding && <NewBookDialog books={books} onClose={() => setAdding(false)} />}
      {closing && <CloseBookDialog book={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}
