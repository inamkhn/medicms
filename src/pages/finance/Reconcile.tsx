// ============================================
// MediCMS Desktop — Finance: Reconciliation workspace (§41, §42, §67.2)
// Two panes: what the bank says on the left, what the books say on the right.
// A line is matched to one or more entries (§41.2); a line that does not belong
// is ignored with a reason (§41.3), never deleted. The check panel is §42 step 5
// verbatim, and Finish is enabled only when every line is resolved and the
// difference is zero (§67.2). Everything is stored on confirm, so a half-done
// reconciliation survives a reload.
// ============================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, Link2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatPKR, formatDate } from '@/lib/utils';
import { addDays, dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import {
  MONEY_ENTRY_LABELS,
  accountBalance,
  dayGap,
  matchedEntryIds,
  reconciliationCheck,
  reconciliationProblems,
  reconcilableAccounts,
  reconciledThroughMonth,
  suggestMatches,
  unresolvedLines,
  type MoneyEntry,
  type StatementLine,
} from '@/lib/finance';
import { useAuditStore, useAuthStore, useBillsStore, useMoneyStore, useSettingsStore } from '@/stores';
import { HandEntryDialog, type MenuAction } from './BankEntryMenu';

/** The last day of a `YYYY-MM` month, as a date. */
function monthEnd(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return addDays(`${m === 12 ? year + 1 : year}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
}

const CONFIDENCE_VARIANT = { Exact: 'cleared', Likely: 'default', Possible: 'outline' } as const;

export default function Reconcile() {
  const { accountId = '', month = '' } = useParams();
  const navigate = useNavigate();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const statementLines = useMoneyStore((s) => s.statementLines);
  const reconciliations = useMoneyStore((s) => s.reconciliations);
  const vendors = useBillsStore((s) => s.vendors);
  const limits = useSettingsStore((s) => s.financeLimits);
  const autoAccept = useSettingsStore((s) => s.financeAutoAcceptMatches);
  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const [pickedEntries, setPickedEntries] = useState<string[]>([]);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [ignoreTarget, setIgnoreTarget] = useState<StatementLine | null>(null);
  const [createAction, setCreateAction] = useState<MenuAction | null>(null);
  const [statementClosing, setStatementClosing] = useState<number | null>(null);
  const [closeError, setCloseError] = useState<string[]>([]);
  const autoApplied = useRef('');

  const account = accounts.find((a) => a.id === accountId);
  const reconciliationId = account ? `rec-${account.id}-${month}` : '';
  const monthLines = useMemo(
    () => statementLines.filter((line) => line.accountId === accountId && line.date.slice(0, 7) === month),
    [statementLines, accountId, month],
  );
  const accountLines = useMemo(
    () => statementLines.filter((line) => line.accountId === accountId),
    [statementLines, accountId],
  );
  const accountEntries = useMemo(() => entries.filter((e) => e.accountId === accountId), [entries, accountId]);
  const matched = useMemo(() => matchedEntryIds(accountLines), [accountLines]);
  const open = useMemo(() => unresolvedLines(monthLines), [monthLines]);

  const end = monthEnd(month || dayKey().slice(0, 7));
  const today = dayKey();
  const bookBalance = account ? accountBalance(entries, accountId, end) : 0;

  // §42 step 5: entries the statement has not shown yet, split by direction.
  const notShown = accountEntries.filter(
    (entry) => !matched.has(entry.id) && entry.kind !== 'OpeningBalance' && entry.date <= end,
  );
  const depositsInTransit = notShown.filter((e) => e.direction === 'In').reduce((sum, e) => sum + e.amount, 0);
  const paymentsInTransit = notShown.filter((e) => e.direction === 'Out').reduce((sum, e) => sum + e.amount, 0);

  const closing = statementClosing
    ?? [...monthLines].reverse().find((line) => line.balance !== undefined)?.balance
    ?? bookBalance;
  const check = reconciliationCheck({ statementClosing: closing, depositsInTransit, paymentsInTransit, bookBalance });
  const problems = reconciliationProblems(check, monthLines);
  const saved = reconciliations.find((r) => r.id === reconciliationId);

  const suggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof suggestMatches>>();
    for (const line of open) {
      map.set(line.id, suggestMatches(line, accountEntries, { alreadyMatched: matched }));
    }
    return map;
  }, [open, accountEntries, matched]);

  // §77 "Accept exact statement matches automatically" — applied once per month.
  useEffect(() => {
    if (!autoAccept || !account) return;
    const key = `${account.id}|${month}`;
    if (autoApplied.current === key) return;
    autoApplied.current = key;
    const matcher = useMoneyStore.getState();
    for (const line of open) {
      const suggestion = suggestions.get(line.id);
      if (suggestion?.confidence === 'Exact') matcher.matchStatementLine(line.id, suggestion.entryIds);
    }
  }, [autoAccept, account, month, open, suggestions]);

  if (!accountId) {
    // §67.2 has no account in the address: choose one, with where it stands.
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-section font-bold text-slate-900">Reconcile</h1>
          <p className="text-micro text-slate-500">Choose a bank account or wallet, then import its statement and match it (§41, §42).</p>
        </div>
        <Card title="Bank accounts and wallets">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Book balance</TableHead>
                  <TableHead>Reconciled through</TableHead>
                  <TableHead className="text-right">Unmatched lines</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconcilableAccounts(accounts).map((option) => {
                  const open = statementLines.filter((line) => line.accountId === option.id && line.status === 'Unmatched').length;
                  return (
                    <TableRow key={option.id}>
                      <TableCell className="font-medium text-slate-900">{option.name}</TableCell>
                      <TableCell className="text-right num">{formatPKR(accountBalance(entries, option.id))}</TableCell>
                      <TableCell className="text-meta text-slate-500">{reconciledThroughMonth(reconciliations, option.id) ?? 'Never'}</TableCell>
                      <TableCell className="text-right num">{open}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-meta"
                          onClick={() => navigate(`/finance/reconcile/${option.id}/${dayKey().slice(0, 7)}`)}
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  const canReconcile = can(role, 'finance.reconcile');
  const isBankish = account.type === 'bank' || account.type === 'wallet';
  const entryById = new Map(entries.map((e) => [e.id, e] as const));

  const entryLabel = (entry: MoneyEntry) => {
    const vendor = vendors.find((v) => v.name === entry.payee)?.name;
    return `${MONEY_ENTRY_LABELS[entry.kind]}${entry.payee ? ` · ${vendor ?? entry.payee}` : ''}`;
  };

  const matchLine = (line: StatementLine, entryIds: string[]) => {
    if (!entryIds.length) return;
    useMoneyStore.getState().matchStatementLine(line.id, entryIds);
    setPickedEntries([]);
    setSelectedLine(null);
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Matched statement line ${line.id} on ${account.name} to ${entryIds.join(', ')}`,
    });
  };

  const confirmAllExact = () => {
    let count = 0;
    for (const line of open) {
      const suggestion = suggestions.get(line.id);
      if (suggestion?.confidence === 'Exact') {
        useMoneyStore.getState().matchStatementLine(line.id, suggestion.entryIds);
        count += 1;
      }
    }
    if (count) {
      useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Accepted ${count} exact statement matches on ${account.name}` });
    }
  };

  const finish = () => {
    if (problems.length) { setCloseError(problems); return; }
    useMoneyStore.getState().saveReconciliation({
      id: reconciliationId,
      accountId: account.id,
      month,
      statementClosing: check.statementClosing,
      bookBalance: check.bookBalance,
      difference: check.difference,
      depositsInTransit: check.depositsInTransit,
      paymentsInTransit: check.paymentsInTransit,
      createdBy: userName,
      createdAt: nowISO(),
    });
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Reconciled ${account.name} for ${month} — statement ${formatPKR(check.statementClosing)}, difference 0`,
    });
    navigate(`/finance/accounts/${account.id}`);
  };

  if (!isBankish) {
    const options = reconcilableAccounts(accounts);
    return (
      <div className="space-y-4">
        <h1 className="text-section font-bold text-slate-900">{account.name} is not reconciled this way</h1>
        <p className="text-meta text-slate-500">Only a bank account or a wallet posts a statement (§39, §60.2). Choose one:</p>
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Button key={option.id} variant="outline" size="sm" onClick={() => navigate(`/finance/reconcile/${option.id}/${month || dayKey().slice(0, 7)}`)}>
              {option.name}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/finance/accounts/${account.id}`)}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">
              Reconcile: {account.name}, {month}
              {saved && !saved.reopenedAt && <Badge variant="cleared" className="ml-2 text-micro">Reconciled</Badge>}
              {saved?.reopenedAt && <Badge variant="dues" className="ml-2 text-micro">Reopened</Badge>}
            </h1>
            <p className="text-micro text-slate-500">
              {open.length} of {monthLines.length} lines unresolved · book balance to {formatDate(end)} is {formatPKR(bookBalance)}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => navigate(`/finance/bank/${account.id}/import`)}>
            Import statement
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-meta">
                Create entry <ChevronDown size={12} className="ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setCreateAction('charge')}>Bank charge</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCreateAction('receipt')}>Other receipt</DropdownMenuItem>
              {role === 'Admin' && (
                <DropdownMenuItem onSelect={() => setCreateAction('withdrawal')}>Owner withdrawal</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/finance/pay')}>Record a payment out</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate('/payments/record')}>Record a student payment</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="h-7 text-meta" onClick={finish} disabled={!canReconcile || problems.length > 0}>
            <Check size={12} className="mr-1.5" /> Finish reconciliation
          </Button>
        </div>
      </div>

      {problems.length > 0 && (
        <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-meta text-amber-800">
          {problems.map((problem) => <p key={problem}>{problem}</p>)}
        </div>
      )}
      {closeError.length > 0 && (
        <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
          {closeError.map((problem) => <p key={problem}>{problem}</p>)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={`Statement lines (${monthLines.length})`}
          description="§41 — what the bank says happened."
          actions={
            <Button variant="outline" size="sm" className="h-7 text-meta" onClick={confirmAllExact} disabled={!canReconcile}>
              <Sparkles size={12} className="mr-1.5" /> Confirm all exact
            </Button>
          }
        >
          <CardContent className="space-y-2">
            {monthLines.length === 0 && (
              <p className="text-meta text-slate-400">
                No statement lines for {month} yet — import the file first (§40).
              </p>
            )}
            {[...monthLines].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1)).map((line) => {
              const suggestion = suggestions.get(line.id);
              const isSelected = selectedLine === line.id;
              return (
                <div
                  key={line.id}
                  onClick={() => canReconcile && setSelectedLine(isSelected ? null : line.id)}
                  className={`rounded-control border px-3 py-2 ${isSelected ? 'border-blue-300 bg-blue-50/40' : 'border-hairline'} ${canReconcile ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-meta">
                        <span className="text-slate-500">{formatDate(line.date)}</span>
                        <span className="font-medium text-slate-900">{line.description || 'Statement line'}</span>
                      </div>
                      <div className="text-micro text-slate-400">
                        {line.reference ? `Ref ${line.reference} · ` : ''}
                        {line.debit > 0 ? `Out ${formatPKR(line.debit)}` : `In ${formatPKR(line.credit)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {line.status === 'Matched' && <Badge variant="cleared" className="text-micro">Matched</Badge>}
                      {line.status === 'Ignored' && <Badge variant="secondary" className="text-micro">Ignored</Badge>}
                      {line.status === 'Unmatched' && <Badge variant="outline" className="text-micro">Unmatched</Badge>}
                    </div>
                  </div>

                  {line.status === 'Matched' && (
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="text-micro text-slate-500">
                        {(line.matchedEntryIds ?? []).map((id) => {
                          const entry = entryById.get(id);
                          return entry ? <div key={id}>#{entry.no} {entryLabel(entry)} · {formatPKR(entry.amount)}</div> : null;
                        })}
                      </div>
                      {canReconcile && (
                        <Button variant="ghost" size="sm" className="h-6 text-micro" onClick={(e) => { e.stopPropagation(); useMoneyStore.getState().unmatchStatementLine(line.id); }}>
                          Unmatch
                        </Button>
                      )}
                    </div>
                  )}

                  {line.status === 'Ignored' && (
                    <p className="mt-1 text-micro text-slate-500">Ignored: {line.ignoredReason}</p>
                  )}

                  {line.status === 'Unmatched' && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {suggestion ? (
                        <>
                          <Badge variant={CONFIDENCE_VARIANT[suggestion.confidence]} className="text-micro">{suggestion.confidence}</Badge>
                          <span className="text-micro text-slate-500">
                            {suggestion.entryIds.map((id) => {
                              const entry = entryById.get(id);
                              return entry ? `#${entry.no} ${entryLabel(entry)} (${Math.abs(dayGap(line.date, entry.date))}d)` : id;
                            }).join(', ')}
                          </span>
                          {canReconcile && (
                            <Button variant="subtle" size="sm" className="h-6 text-micro" onClick={(e) => { e.stopPropagation(); matchLine(line, suggestion.entryIds); }}>
                              Confirm
                            </Button>
                          )}
                        </>
                      ) : (
                        <span className="text-micro text-slate-400">No close match — match it by hand, create an entry, or ignore it.</span>
                      )}
                      {canReconcile && line.status === 'Unmatched' && (
                        <Button variant="ghost" size="sm" className="h-6 text-micro text-slate-500" onClick={(e) => { e.stopPropagation(); setIgnoreTarget(line); }}>
                          Ignore
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card
          title={`App entries not yet matched (${notShown.length})`}
          description="§41.4 — a book entry the statement has not shown yet."
          actions={
            <Button
              variant="subtle"
              size="sm"
              className="h-7 text-meta"
              disabled={!selectedLine || pickedEntries.length === 0 || !canReconcile}
              onClick={() => {
                const line = monthLines.find((l) => l.id === selectedLine);
                if (line) matchLine(line, pickedEntries);
              }}
            >
              <Link2 size={12} className="mr-1.5" /> Match selected
            </Button>
          }
        >
          <CardContent className="space-y-2">
            {notShown.length === 0 && <p className="text-meta text-slate-400">Every entry on this account is on the statement.</p>}
            {notShown.map((entry) => {
              const inTransit = Math.abs(dayGap(entry.date, today)) <= limits.statementInTransitDays;
              const picked = pickedEntries.includes(entry.id);
              return (
                <label
                  key={entry.id}
                  className={`flex items-start gap-2 rounded-control border px-3 py-2 ${picked ? 'border-blue-300 bg-blue-50/40' : 'border-hairline'} ${canReconcile ? 'cursor-pointer' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={picked}
                    disabled={!canReconcile}
                    onChange={() => setPickedEntries((ids) => (ids.includes(entry.id) ? ids.filter((id) => id !== entry.id) : [...ids, entry.id]))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-meta">
                      <span className="text-slate-500">{formatDate(entry.date)}</span>
                      <span className={`num font-medium ${entry.direction === 'In' ? 'text-green-600' : 'text-red-600'}`}>{formatPKR(entry.amount)}</span>
                    </span>
                    <span className="block text-micro text-slate-500">#{entry.no} {entryLabel(entry)}</span>
                    <span className="block text-micro text-slate-400">
                      {inTransit ? 'in transit' : 'needs attention'}
                      {entry.reference ? ` · ${entry.reference}` : ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card title="Check" description="§42 step 5 — the statement, adjusted for what the books have not yet shown, must equal the books.">
        <CardContent className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Statement closing balance *</Label>
              <Input
                num
                value={String(closing)}
                onChange={(e) => setStatementClosing(parseInt(e.target.value, 10) || 0)}
                disabled={!canReconcile}
              />
            </div>
            <div>
              <div className="text-sm text-slate-500">+ Deposits in transit</div>
              <div className="text-body font-medium num mt-1">{formatPKR(check.depositsInTransit)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">− Payments in transit</div>
              <div className="text-body font-medium num mt-1">{formatPKR(check.paymentsInTransit)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">= Adjusted statement</div>
              <div className="text-body font-medium num mt-1">{formatPKR(check.adjustedStatement)}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-hairline-soft pt-2 text-meta">
            <span className="text-slate-500">Book balance <span className="num font-medium text-slate-900">{formatPKR(check.bookBalance)}</span></span>
            <span className="text-slate-500">
              Difference{' '}
              <span className={`num font-bold ${check.difference === 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPKR(check.difference)}</span>
            </span>
            {check.difference === 0 && <Badge variant="cleared" className="text-micro">Balanced</Badge>}
            {saved && !saved.reopenedAt && (
              <span className="ml-auto text-micro text-slate-400">
                Saved by {saved.createdBy} — statement {formatPKR(saved.statementClosing)}, difference {formatPKR(saved.difference)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {ignoreTarget && (
        <IgnoreDialog
          line={ignoreTarget}
          onClose={() => setIgnoreTarget(null)}
          onIgnore={(reason) => {
            useMoneyStore.getState().ignoreStatementLine(ignoreTarget.id, reason);
            useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Ignored statement line ${ignoreTarget.id} — ${reason}` });
            setIgnoreTarget(null);
          }}
        />
      )}
      {createAction && (
        <HandEntryDialog
          account={account}
          action={createAction}
          prefill={{
            amount: (() => {
              const line = monthLines.find((l) => l.id === selectedLine) ?? open[0];
              return line ? (line.debit > 0 ? line.debit : line.credit) : undefined;
            })(),
            date: (monthLines.find((l) => l.id === selectedLine) ?? open[0])?.date,
          }}
          onClose={() => setCreateAction(null)}
        />
      )}
    </div>
  );
}

/** §41.3: a line that does not belong keeps its reason, never disappears. */
function IgnoreDialog({ line, onClose, onIgnore }: { line: StatementLine; onClose: () => void; onIgnore: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const ready = reason.trim().length >= 5;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ignore this statement line?</DialogTitle>
          <DialogDescription>
            {formatDate(line.date)} · {line.description || 'Statement line'} · {formatPKR(line.debit > 0 ? line.debit : line.credit)}
            — it stays on the list with your reason (§41.3).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why this line is not part of the books…"
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
            />
            <p className="text-micro text-slate-400">At least 5 characters.</p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onIgnore(reason.trim())} disabled={!ready}>Ignore line</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
