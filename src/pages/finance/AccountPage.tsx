// ============================================
// MediCMS Desktop — Finance: Account page (§12, §58)
// The cash book or the bank book of one account: every entry in date order
// with a running balance calculated from the start, so searching or filtering
// the list never changes the balance shown (§12, §14). Money arrives by
// itself from the flows (§8) and transfers (§9); the only entries typed by hand
// are the go-live opening balance on a cash page (§78.1) and the §60.2 "Add bank
// entry" menu on a bank or wallet page.
// ============================================

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Building2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { can } from '@/lib/permissions';
import { formatPKR, formatDate } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { useAuditStore, useAuthStore, useMoneyStore } from '@/stores';
import {
  ACCOUNT_TYPE_LABELS,
  MONEY_ENTRY_LABELS,
  accountBalance,
  availableBalance,
  cashBookRows,
  moneyEntryProblems,
  nextActionNo,
  nextMoneyEntryNo,
  reversibleEntry,
  summariseAccount,
  unclearedIssuedTotal,
  type MoneyEntry,
} from '@/lib/finance';
import { BankEntryMenu } from './BankEntryMenu';
import { ReverseEntryDialog } from './ReverseEntryDialog';

/** §78.1: the opening balance is entered once, as any other dated entry. */
function OpeningBalanceDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dayKey());
  const [problems, setProblems] = useState<string[]>([]);

  const submit = () => {
    const state = useMoneyStore.getState();
    const amt = parseInt(amount, 10);
    const entry: MoneyEntry = {
      id: `me-${nextMoneyEntryNo(state.entries)}`,
      no: nextMoneyEntryNo(state.entries),
      date,
      accountId,
      direction: 'In',
      amount: Number.isFinite(amt) ? amt : 0,
      kind: 'OpeningBalance',
      actionId: `a-${nextActionNo(state.entries)}`,
      createdBy: useAuthStore.getState().user?.name ?? 'Admin',
      cleared: true,
      reconciled: false,
      createdAt: nowISO(),
    };
    const checked = moneyEntryProblems(entry, {
      accounts: state.accounts,
      entries: state.entries,
      closedMonths: state.closedMonths,
    });
    if (checked.length) { setProblems(checked); return; }
    const outcome = state.postEntries([entry], dayKey());
    if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); return; }
    useAuditStore.getState().addLog({ user: entry.createdBy, action: 'Finance Entry', details: `Opening balance ${formatPKR(entry.amount)} dated ${entry.date}` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record opening balance</DialogTitle>
          <DialogDescription>From the real statement or the counted cash, at the go-live date (§78.1). Entered once; a later change needs a reversal (§6).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Whole rupees" />
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} />
          </div>
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Record balance</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const closedDays = useMoneyStore((s) => s.closedDays);
  const issuedCheques = useMoneyStore((s) => s.issuedCheques);
  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [closeProblems, setCloseProblems] = useState<string[]>([]);
  const [reverseTarget, setReverseTarget] = useState<MoneyEntry | null>(null);

  const account = accounts.find((a) => a.id === id);
  if (!account) {
    return (
      <div className="space-y-4">
        <h1 className="text-section font-bold text-slate-900">Account not found</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/finance/accounts')}>
          <ArrowLeft size={12} className="mr-1.5" /> Back to Accounts
        </Button>
      </div>
    );
  }

  const balance = accountBalance(entries, account.id);
  const summary = summariseAccount(entries, account);
  const isBankish = account.type === 'bank' || account.type === 'wallet';
  const canPay = can(role, 'finance.pay');
  // §31.3: a bank page shows the cleared balance, the issued cheques not yet
  // cleared, and the available balance — the money still free to commit.
  const issuedNotCleared = account.type === 'bank' ? unclearedIssuedTotal(issuedCheques, account.id) : 0;
  const available = account.type === 'bank' ? availableBalance(entries, issuedCheques, account.id) : balance;
  const hasOpening = entries.some((e) => e.accountId === account.id && e.kind === 'OpeningBalance');
  const undeposited = closedDays.filter((d) => d.accountId === account.id && !(d.depositRefs ?? []).length);

  // §12: the running balance comes from the FULL books; the filters only pick
  // which rows to show, never which figure a row carries.
  const rows = cashBookRows(entries, account.id).filter(({ entry }) => {
    if (fromDate && entry.date < fromDate) return false;
    if (toDate && entry.date > toDate) return false;
    if (search) {
      const q = search.toLowerCase();
      return [entry.payee, entry.reference, entry.linkedDoc, entry.note, entry.reason, MONEY_ENTRY_LABELS[entry.kind]]
        .some((field) => field?.toLowerCase().includes(q));
    }
    return true;
  });

  const exportCsv = () => {
    const header = ['No', 'Date', 'Kind', 'Payee', 'Category', 'Reference', 'In', 'Out', 'Running balance', 'Reconciled'];
    const body = rows.map((r) => [
      r.entry.no, r.entry.date, MONEY_ENTRY_LABELS[r.entry.kind], r.entry.payee ?? '', r.entry.category ?? '',
      r.entry.reference ?? '', r.entry.direction === 'In' ? r.entry.amount : '', r.entry.direction === 'Out' ? r.entry.amount : '',
      r.runningBalance, r.entry.reconciled ? 'yes' : '',
    ]);
    const csv = [header, ...body].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${account.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${dayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tryClose = () => {
    const problems = useMoneyStore.getState().closeAccount(account.id);
    setCloseProblems(problems);
    if (!problems.length) {
      useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Closed account ${account.name}` });
      navigate('/finance/accounts');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/accounts')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">
              {account.name}
              <Badge variant="outline" className="ml-2 text-micro">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
              {account.status === 'Closed' && <Badge variant="outline" className="ml-1.5 text-micro text-slate-500">Closed</Badge>}
              {isBankish && account.accountNo && <span className="ml-2 text-micro font-normal text-slate-400">····{account.accountNo.slice(-4)}</span>}
            </h1>
            <p className="text-micro text-slate-500">
              {isBankish ? 'Bank book' : 'Cash book'} — the balance is calculated from the start (§12)
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {/* §60.2: a bank or wallet page offers the four hand entries through an
              "Add bank entry" menu; a cash page keeps its transfer/deposit buttons. */}
          {isBankish ? (
            <BankEntryMenu account={account} />
          ) : (
            can(role, 'finance.transfer') && account.status === 'Active' && (
              <>
                <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/transfer')}>
                  <ArrowLeftRight size={12} className="mr-1.5" /> Transfer
                </Button>
                {account.type === 'counterCash' && (
                  <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/deposit')}>
                    <Building2 size={12} className="mr-1.5" /> Cash deposit
                  </Button>
                )}
              </>
            )
          )}
          {account.status === 'Active' && !hasOpening && !isBankish && (
            <Button size="sm" className="h-7 text-meta" onClick={() => setOpeningOpen(true)}>
              Record opening balance
            </Button>
          )}
        </div>
      </div>

      {/* The §13 row for this account — opening separate, so the filters above
          the list cannot make the figure disagree with any other screen (§6.1). */}
      <div className={`grid gap-4 ${account.type === 'bank' ? 'grid-cols-2 lg:grid-cols-6' : 'grid-cols-4'}`}>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Opening</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatPKR(summary.opening)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Money in</div>
          <div className="text-xl font-bold text-green-600 mt-1">{formatPKR(summary.moneyIn)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Money out</div>
          <div className="text-xl font-bold text-red-600 mt-1">{formatPKR(summary.moneyOut)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Balance</div>
          <div className={`text-xl font-bold mt-1 ${balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatPKR(balance)}</div>
        </CardContent></Card>
        {account.type === 'bank' && (
          <>
            <Card><CardContent className="py-4">
              <div className="text-sm text-slate-500">Issued, not cleared</div>
              <div className="text-xl font-bold text-amber-600 mt-1">{formatPKR(issuedNotCleared)}</div>
            </CardContent></Card>
            <Card><CardContent className="py-4">
              <div className="text-sm text-slate-500">Available</div>
              <div className={`text-xl font-bold mt-1 ${available < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatPKR(available)}</div>
            </CardContent></Card>
          </>
        )}
      </div>

      {account.type === 'counterCash' && undeposited.length > 0 && (
        <div className="flex items-center justify-between bg-amber-50/50 border border-amber-100 rounded-xl p-3">
          <span className="text-sm text-amber-700">
            {undeposited.length} closed day{undeposited.length > 1 ? 's' : ''} counted this counter — {formatPKR(undeposited.reduce((s, d) => s + d.counted, 0))} not yet deposited (§9)
          </span>
          {can(role, 'finance.transfer') && (
            <Button variant="outline" size="sm" onClick={() => navigate('/finance/deposit')}>Deposit now</Button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Search payee, reference, kind…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
        <Button variant="outline" size="sm" onClick={exportCsv}><Download size={14} className="mr-1" /> Export CSV</Button>
        <span className="text-micro text-slate-400 ml-auto">Filtering shows rows; the balances stay the books' own (§12).</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Payee / reference</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                {isBankish && <TableHead>Reconciled</TableHead>}
                {canPay && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={(isBankish ? 8 : 7) + (canPay ? 1 : 0)} className="text-center text-slate-400 py-8">
                    No entries match — the balance above is the account's own, not the list's (§12).
                  </TableCell>
                </TableRow>
              )}
              {rows.map(({ entry, runningBalance }) => (
                <TableRow key={entry.id} className={entry.cleared ? '' : 'opacity-60'}>
                  <TableCell className="font-medium text-slate-500">{entry.no}</TableCell>
                  <TableCell>{formatDate(entry.date)}</TableCell>
                  <TableCell>
                    {MONEY_ENTRY_LABELS[entry.kind]}
                    {!entry.cleared && <span className="ml-1.5 text-micro text-amber-600">uncleared</span>}
                  </TableCell>
                  <TableCell className="text-slate-500">
                    <div>{entry.payee ?? '—'}</div>
                    <div className="text-micro text-slate-400">{entry.reference ?? entry.linkedDoc ?? ''}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.direction === 'In' ? <span className="text-green-600 font-medium">{formatPKR(entry.amount)}</span> : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.direction === 'Out' ? <span className="text-red-600 font-medium">{formatPKR(entry.amount)}</span> : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatPKR(runningBalance)}</TableCell>
                  {isBankish && (
                    <TableCell>
                      {entry.reconciled
                        ? <Badge variant="outline" className="text-emerald-600 border-emerald-100 bg-emerald-50">Matched</Badge>
                        : <span className="text-slate-300">—</span>}
                    </TableCell>
                  )}
                  {/* §34: a hand or setup entry is corrected here; a receipt or
                      a bill payment is voided from the screen that owns it. */}
                  {canPay && (
                    <TableCell className="text-right">
                      {reversibleEntry(entry, entries) && (
                        <Button variant="ghost" size="sm" className="h-7 text-meta text-red-600" onClick={() => setReverseTarget(entry)}>
                          Reverse
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* §6.4: an account with entries is never deleted; at a zero balance it closes. */}
      {account.status === 'Active' && !isBankish && !['chequesInHand', 'issuedCheques'].includes(account.type) && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Edit details</Button>
          <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={tryClose}>
            Close account
          </Button>
          {closeProblems.length > 0 && (
            <span className="text-meta text-red-600">{closeProblems.join(' ')}</span>
          )}
        </div>
      )}
      {editOpen && <EditDetailsDialog accountId={account.id} onClose={() => setEditOpen(false)} />}
      {openingOpen && <OpeningBalanceDialog accountId={account.id} onClose={() => setOpeningOpen(false)} />}
      {reverseTarget && <ReverseEntryDialog account={account} entry={reverseTarget} onClose={() => setReverseTarget(null)} />}
    </div>
  );
}

function EditDetailsDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const account = useMoneyStore((s) => s.accounts.find((a) => a.id === accountId));
  const [name, setName] = useState(account?.name ?? '');
  const [bankName, setBankName] = useState(account?.bankName ?? '');
  const [accountNo, setAccountNo] = useState(account?.accountNo ?? '');
  const [responsible, setResponsible] = useState(account?.responsible ?? '');
  const [notes, setNotes] = useState(account?.notes ?? '');
  const [error, setError] = useState('');
  if (!account) return null;

  const isBankish = account.type === 'bank' || account.type === 'wallet';
  const submit = () => {
    if (!name.trim()) { setError('An account needs a name (§6).'); return; }
    // id, type and status may not change (§6) — the store refuses them by shape.
    useMoneyStore.getState().updateAccount(account.id, {
      name: name.trim(),
      bankName: isBankish ? bankName.trim() : undefined,
      accountNo: isBankish ? accountNo.trim() : undefined,
      responsible: responsible.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    useAuditStore.getState().addLog({ user: useAuthStore.getState().user?.name ?? 'Admin', action: 'Finance Entry', details: `Edited account ${account.id} details` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>Names and details can be corrected; the type and the status cannot (§6).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {isBankish && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bank / wallet</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Account number</Label>
                <Input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Responsible person</Label>
            <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
            />
          </div>
          {error && <p className="text-meta text-danger">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
