// ============================================
// MediCMS Desktop — Finance: Month close (§48, §69)
// A month is Open, In review or Closed (§48.1). The seven checklist items are
// the doc's own, in its order, each with the reason it is not done and the
// screen that fixes it (§69); Close is enabled only when every required item is
// done and the earlier month is closed, and it saves the month-end report the
// moment the lock lands (§48.3). Reopening is an Admin's, with a reason, and
// whatever arrives afterwards is flagged "Added after close" (§48.4).
// ============================================

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, CircleAlert, Info, Lock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatPKR, formatDate } from '@/lib/utils';
import { addDays, addMonths, dayKey, thisMonthKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import {
  MONEY_ENTRY_LABELS,
  accountBalance,
  budgetReport,
  chequesInHandTotal,
  closeMonthProblems,
  closureOf,
  entriesAddedAfterClose,
  heldForOthers,
  incomingChequeRows,
  isStale,
  isSystemAccount,
  moneyFlow,
  monthChecklist,
  monthStateOf,
  payablesReport,
  pettyCountedInMonth,
  receivablesReport,
  reconcilableAccounts,
  reconciledThroughMonth,
  securityDepositsHeld,
  type DayClosing,
  type IssuedCheque,
  type MoneyAccount,
  type MoneyEntry,
  type MonthClosure,
  type MonthCloseFacts,
  type MonthReportSnapshot,
  type PettyCount,
  type Reconciliation,
  type StatementLine,
} from '@/lib/finance';
import {
  useAuditStore,
  useAuthStore,
  useBillsStore,
  useBudgetStore,
  useFeeTemplateStore,
  useLedgerStore,
  useMoneyStore,
  usePayrollStore,
  useSettingsStore,
  useStudentStore,
} from '@/stores';

function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** §69's own button label for each item's way out. */
const FIX_LABELS: Record<number, string> = {
  1: 'Reconcile',
  2: 'Day closing',
  3: 'Count',
  4: 'Vouchers',
  5: 'Open',
  6: 'Payroll',
  7: 'Cheques',
};

const STATE_VARIANT = { Open: 'outline', 'In review': 'dues', Closed: 'cleared' } as const;

/** §69: the facts the checklist reads, gathered from the books and the registers. */
function gatherFacts(input: {
  accounts: readonly MoneyAccount[];
  entries: readonly MoneyEntry[];
  closedDays: readonly DayClosing[];
  pettyCounts: readonly PettyCount[];
  statementLines: readonly StatementLine[];
  reconciliations: readonly Reconciliation[];
  monthClosures: readonly MonthClosure[];
  issuedCheques: readonly IssuedCheque[];
  month: string;
  monthEndDate: string;
  today: string;
  staleMonths: number;
  hasPayroll: boolean;
  payrollRuns: readonly { serviceMonth: string; approved: boolean; noPayrollReason?: string }[];
}): MonthCloseFacts {
  // 1. §48.2.1 — every bank and wallet reconciled through the month.
  const accountsToReconcile = reconcilableAccounts(input.accounts).filter((account) => {
    const through = reconciledThroughMonth(input.reconciliations, account.id);
    return !through || through < input.month;
  }).length;

  // 2. §48.2.2 — a day whose drawer took or paid money with no cash count.
  let openDays = 0;
  for (const counter of input.accounts.filter((a) => a.type === 'counterCash' && !isSystemAccount(a))) {
    const days = new Set(
      input.entries
        .filter((e) => e.accountId === counter.id && e.cleared && e.date.slice(0, 7) === input.month)
        .map((e) => e.date),
    );
    for (const day of days) {
      if (!input.closedDays.some((d) => d.date === day && d.accountId === counter.id)) openDays += 1;
    }
  }

  const monthRuns = input.payrollRuns.filter((run) => run.serviceMonth === input.month);

  return {
    month: input.month,
    entryMonths: input.entries.map((e) => e.date.slice(0, 7)),
    closedMonths: input.monthClosures.filter((c) => c.state === 'Closed').map((c) => c.month),
    closures: input.monthClosures,
    accountsToReconcile,
    openDays,
    pettyCounted: Boolean(pettyCountedInMonth(input.pettyCounts, input.month)),
    // §32: a voucher above the Accountant's limit cannot be saved without an
    // Admin's approval, so nothing can ever be waiting here.
    approvalsPending: 0,
    // 5. §48.2.5 — every statement line up to the month end is resolved.
    unresolvedLines: input.statementLines.filter(
      (line) => line.status === 'Unmatched' && line.date <= input.monthEndDate,
    ).length,
    payrollUsed: input.hasPayroll,
    payrollFinalised: monthRuns.some((run) => run.approved || Boolean(run.noPayrollReason)),
    staleCheques: input.issuedCheques.filter(
      (cheque) => cheque.status === 'Issued' && isStale(cheque, input.today, input.staleMonths),
    ).length,
  };
}

export default function MonthClose() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const closedDays = useMoneyStore((s) => s.closedDays);
  const pettyCounts = useMoneyStore((s) => s.pettyCounts);
  const statementLines = useMoneyStore((s) => s.statementLines);
  const reconciliations = useMoneyStore((s) => s.reconciliations);
  const monthClosures = useMoneyStore((s) => s.monthClosures);
  const issuedCheques = useMoneyStore((s) => s.issuedCheques);
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const vendors = useBillsStore((s) => s.vendors);
  const categories = useBillsStore((s) => s.categories);
  const budgets = useBudgetStore((s) => s.budgets);
  const students = useStudentStore((s) => s.students);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  const templates = useFeeTemplateStore((s) => s.templates);
  const runs = usePayrollStore((s) => s.runs);
  const limits = useSettingsStore((s) => s.financeLimits);
  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const month = params.get('month') || thisMonthKey();
  const monthStart = `${month}-01`;
  const monthEndDate = addDays(addMonths(monthStart, 1), -1);
  const today = dayKey();

  const isAdmin = can(role, 'settings.manage');
  const canReview = isAdmin || can(role, 'finance.reconcile');
  const state = monthStateOf(month, monthClosures);
  const closure = closureOf(month, monthClosures);

  const [closingOpen, setClosingOpen] = useState(false);
  const [checkedFigures, setCheckedFigures] = useState(false);
  const [closeError, setCloseError] = useState<string[]>([]);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [notes, setNotes] = useState(closure?.notes ?? '');

  // --- §69 the facts the checklist reads ------------------------------------

  const facts = gatherFacts({
    accounts,
    entries,
    closedDays,
    pettyCounts,
    statementLines,
    reconciliations,
    monthClosures,
    issuedCheques,
    month,
    monthEndDate,
    today,
    staleMonths: limits.chequeStaleMonths,
    hasPayroll: runs.length > 0,
    payrollRuns: runs.map((run) => ({
      serviceMonth: run.serviceMonth,
      approved: run.calculationState === 'Approved',
      noPayrollReason: run.noPayrollReason,
    })),
  });

  const checklist = monthChecklist(facts);
  const problems = closeMonthProblems(facts);
  const requiredLeft = checklist.filter((item) => item.required && !item.done).length;
  const flagged = entriesAddedAfterClose(entries, monthClosures);

  // --- §48.3 the month-end report, built at the moment of closing -----------

  const buildSnapshot = (): MonthReportSnapshot => {
    const flow = moneyFlow({ entries, accounts, categories, from: monthStart, to: monthEndDate });
    const payables = payablesReport({ bills, payments, vendors, today: monthEndDate });
    const receivables = receivablesReport({
      students: students.map((s) => ({
        sno: s.sno, name: s.name, struckOff: s.struckOff, completed: s.completed, onLeave: s.onLeave,
      })),
      entries: ledgerEntries,
      today: monthEndDate,
    });
    const budget = budgetReport({
      categories, lines: budgets, bills, payments, month,
      showStaff: role === 'Admin',
      noticePct: limits.budgetNoticePercent,
      warningPct: limits.budgetWarningPercent,
    });
    const depositsHeld = securityDepositsHeld({ students, templates, ledgerEntries });
    const chequesInHand = chequesInHandTotal(incomingChequeRows(accounts, entries));
    return {
      month,
      moneyIn: flow.totalIn,
      moneyOut: flow.totalOut,
      net: flow.net,
      balances: accounts
        .filter((a) => a.type !== 'chequesInHand' && a.type !== 'issuedCheques')
        .map((a) => ({ accountId: a.id, name: a.name, balance: accountBalance(entries, a.id, monthEndDate) })),
      payables: payables.totals.total,
      receivables: receivables.outstanding,
      heldForOthers: heldForOthers({
        creditHeld: receivables.creditHeld,
        depositsHeld,
        chequesInHand,
      }),
      budgetTotal: budget.total.budget,
      budgetUsed: budget.total.used,
      createdAt: nowISO(),
    };
  };

  const setMonth = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('month', value);
    setParams(next, { replace: true });
  };

  const markReviewed = () => {
    useMoneyStore.getState().saveMonthClosure({
      ...(closure ?? { month }),
      month,
      state: 'In review',
      notes: notes.trim() || undefined,
      reviewedBy: userName,
      reviewedAt: nowISO(),
    });
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `${monthName(month)} marked as reviewed${notes.trim() ? ` — ${notes.trim()}` : ''}`,
    });
  };

  const closeMonth = () => {
    if (problems.length) { setCloseError(problems); return; }
    const report = buildSnapshot();
    useMoneyStore.getState().saveMonthClosure({
      ...(closure ?? { month }),
      month,
      state: 'Closed',
      notes: notes.trim() || undefined,
      closedBy: userName,
      closedAt: report.createdAt,
      report,
    });
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Closed ${monthName(month)} — money in ${formatPKR(report.moneyIn)}, out ${formatPKR(report.moneyOut)}`,
    });
    setClosingOpen(false);
    setCheckedFigures(false);
  };

  const reopen = (reason: string) => {
    useMoneyStore.getState().reopenMonth(month, userName, reason, nowISO());
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Reopened ${monthName(month)} — ${reason}`,
    });
    setReopenOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">Month close</h1>
            <p className="text-micro text-slate-500">
              Check the seven items, mark the month reviewed, then close it so nothing can be dated into it (§48).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setMonth(addMonths(monthStart, -1).slice(0, 7))}>‹</Button>
          <span className="text-meta font-medium text-slate-700 w-36 text-center">{monthName(month)}</span>
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setMonth(addMonths(monthStart, 1).slice(0, 7))}>›</Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={STATE_VARIANT[state]}>{state}</Badge>
            <span className="text-meta text-slate-600">
              {closure?.reviewedBy
                ? `Reviewed by ${closure.reviewedBy}${closure.reviewedAt ? `, ${formatDate(closure.reviewedAt.slice(0, 10))}` : ''}.`
                : 'Not reviewed yet.'}
              {' '}
              {closure?.closedBy
                ? `Closed by ${closure.closedBy}${closure.closedAt ? `, ${formatDate(closure.closedAt.slice(0, 10))}` : ''}.`
                : ''}
            </span>
            {closure?.reopenedAt && (
              <span className="text-meta text-amber-700">
                Reopened by {closure.reopenedBy} — “{closure.reopenReason}”.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-micro text-slate-500">Review notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={state === 'Closed'}
              className="w-full max-w-2xl resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle disabled:bg-slate-50"
              placeholder="What the reviewer checked, and anything the Admin should know (§69)."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-meta"
              onClick={markReviewed}
              disabled={!canReview || state === 'Closed'}
            >
              <Check size={12} className="mr-1.5" /> Mark as reviewed
            </Button>
            <Button
              size="sm"
              className="h-7 text-meta"
              onClick={() => { setCloseError([]); setClosingOpen(true); }}
              disabled={!isAdmin || state === 'Closed' || problems.length > 0}
            >
              <Lock size={12} className="mr-1.5" /> Close month
            </Button>
            {state === 'Closed' && isAdmin && (
              <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setReopenOpen(true)}>
                <RotateCcw size={12} className="mr-1.5" /> Reopen
              </Button>
            )}
            {!canReview && (
              <span className="text-micro text-slate-400">Marking a month reviewed is an Accountant's or an Admin's (§48.1).</span>
            )}
            {canReview && !isAdmin && (
              <span className="text-micro text-slate-400">Closing a month is an Admin's (§48.1).</span>
            )}
            {isAdmin && state !== 'Closed' && problems.length > 0 && (
              <span className="text-micro text-slate-400">
                {requiredLeft === 0
                  ? 'The earlier month must be closed first (§48.1).'
                  : `${requiredLeft} checklist item(s) still open.`}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card title="Checklist" description="§48.2 — the seven items, each with the screen that fixes it.">
        <CardContent className="divide-y divide-hairline-soft p-0">
          {checklist.map((item) => (
            <div key={item.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className="mt-0.5 shrink-0">
                {item.done
                  ? <Check size={14} className="text-green-600" />
                  : item.required
                    ? <CircleAlert size={14} className="text-amber-600" />
                    : <Info size={14} className="text-slate-400" />}
              </span>
              <span className="w-4 shrink-0 text-micro text-slate-400 num">{item.id}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-body ${item.required && !item.done ? 'text-slate-900' : 'text-slate-600'}`}>
                  {item.label}
                </p>
                <p className="text-micro text-slate-500">
                  {item.done ? 'Done.' : item.required ? 'Not done.' : 'Information only.'}
                  {item.detail ? ` ${item.detail}.` : ''}
                  {!item.required && ' This item never blocks the close.'}
                </p>
              </div>
              {item.href && !item.done && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 text-meta"
                  onClick={() => navigate(item.href as string)}
                >
                  {FIX_LABELS[item.id] ?? 'Open'}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {state === 'Closed' && closure?.report && (
        <Card title="Month-end report" description="§48.3 — saved when the month was closed, and never recalculated.">
          <CardContent className="space-y-3">
            <p className="text-micro text-slate-500">Saved {formatDate(closure.report.createdAt.slice(0, 10))}.</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-4">
              {([
                ['Money in', closure.report.moneyIn],
                ['Money out', closure.report.moneyOut],
                ['Net', closure.report.net],
                ['Held for others', closure.report.heldForOthers],
                ['Owed to us', closure.report.receivables],
                ['We owe', closure.report.payables],
                ['Budget', closure.report.budgetTotal],
                ['Budget used', closure.report.budgetUsed],
              ] as [string, number][]).map(([label, amount]) => (
                <div key={label} className="flex items-center justify-between text-meta">
                  <span className="text-slate-500">{label}</span>
                  <span className="num font-medium text-slate-900">{formatPKR(amount)}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-micro font-semibold uppercase tracking-widest text-slate-400">Balances at {formatDate(monthEndDate)}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-3">
                {closure.report.balances.map((row) => (
                  <div key={row.accountId} className="flex items-center justify-between text-meta">
                    <span className="text-slate-500">{row.name}</span>
                    <span className="num font-medium text-slate-900">{formatPKR(row.balance)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => navigate(`/finance/reports/month-end?month=${month}`)}>
                Open the full month-end report
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {flagged.size > 0 && (
        <Card title="Added after close" description="§48.4 — entries dated in this month that were created after it was reopened.">
          <CardContent className="space-y-1.5">
            {entries
              .filter((entry) => flagged.has(entry.id) && entry.date.slice(0, 7) === month)
              .map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-meta">
                  <span className="text-slate-600">
                    {formatDate(entry.date)} · {MONEY_ENTRY_LABELS[entry.kind]}
                    {entry.payee ? ` · ${entry.payee}` : ''}
                  </span>
                  <span className="num font-medium text-slate-900">
                    {entry.direction === 'In' ? '+' : '−'}{formatPKR(entry.amount)}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {closeError.length > 0 && (
        <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
          {closeError.map((problem) => <p key={problem}>{problem}</p>)}
        </div>
      )}

      <Dialog open={closingOpen} onOpenChange={(open) => !open && setClosingOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close {monthName(month)}?</DialogTitle>
            <DialogDescription>
              After closing, nothing can be dated in this month, and payments cannot be back-dated into it.
              A month-end report will be saved (§48.3).
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <label className="flex items-start gap-2 text-meta text-slate-700">
              <input
                type="checkbox"
                checked={checkedFigures}
                onChange={(e) => setCheckedFigures(e.target.checked)}
                className="mt-0.5"
              />
              I have checked the figures.
            </label>
            {problems.length > 0 && (
              <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-meta text-amber-800">
                {problems.map((problem) => <p key={problem}>{problem}</p>)}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosingOpen(false)}>Cancel</Button>
            <Button onClick={closeMonth} disabled={!checkedFigures || problems.length > 0}>
              Close {monthName(month)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reopenOpen && (
        <ReopenDialog month={month} onClose={() => setReopenOpen(false)} onConfirm={reopen} />
      )}
    </div>
  );
}

/** §48.4 — a reason is required, and the warning says what will be flagged. */
function ReopenDialog({ month, onClose, onConfirm }: {
  month: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const problem = reason.trim().length < 10 ? 'A reopen needs a reason of at least 10 characters (§48.4).' : '';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen {monthName(month)}?</DialogTitle>
          <DialogDescription>
            The month unlocks so entries can be corrected. Anything added afterwards is flagged
            “Added after close”, and the month must be reviewed and closed again (§48.4).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label>Reason *</Label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
            placeholder="Why the month has to be reopened…"
          />
          {problem && <p className="text-micro text-slate-400">{problem}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => onConfirm(reason.trim())} disabled={Boolean(problem)}>
            Reopen month
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
