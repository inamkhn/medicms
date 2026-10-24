// ============================================
// MediCMS Desktop — Finance: Money overview (§53, §59)
// One page answering "where is the money, and how are we doing?" (§51). Every
// figure is a calculation from the books — the cash view from money entries, the
// cost view from bills (§52) — so this page can never disagree with a report.
// The period rides in the address (§54 "filters are kept in the page address").
// ============================================

import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import { formatPKR, formatDate } from '@/lib/utils';
import { addDays, dayKey, thisMonthKey } from '@/lib/dates';
import { can } from '@/lib/permissions';
import {
  ACCOUNT_TYPE_LABELS,
  accountBalance,
  availableBalance,
  budgetReport,
  chequesInHandTotal,
  costByCategory,
  feeCollection,
  heldForOthers,
  incomingChequeRows,
  isLowOnFloat,
  moneyFlow,
  monthStateOf,
  payablesReport,
  pettyFloat,
  receivablesReport,
  reconciledThroughMonth,
  recurringDue,
  recurringNotice,
  securityDepositsHeld,
  unclearedIssuedTotal,
} from '@/lib/finance';
import {
  useAuthStore,
  useBillsStore,
  useBudgetStore,
  useFeeTemplateStore,
  useLedgerStore,
  useMoneyStore,
  useSettingsStore,
  useStudentStore,
} from '@/stores';

type Period = 'month' | 'last' | 'ytd';

const PERIOD_LABELS: Record<Period, string> = {
  month: 'This month',
  last: 'Last month',
  ytd: 'This year',
};

/** §59: a month reads "October 2026" wherever it is a heading. */
function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default function Overview() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const issuedCheques = useMoneyStore((s) => s.issuedCheques);
  const chequeDeposits = useMoneyStore((s) => s.chequeDeposits);
  const statementLines = useMoneyStore((s) => s.statementLines);
  const reconciliations = useMoneyStore((s) => s.reconciliations);
  const monthClosures = useMoneyStore((s) => s.monthClosures);
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const categories = useBillsStore((s) => s.categories);
  const vendors = useBillsStore((s) => s.vendors);
  const recurring = useBillsStore((s) => s.recurring);
  const budgets = useBudgetStore((s) => s.budgets);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  const students = useStudentStore((s) => s.students);
  const templates = useFeeTemplateStore((s) => s.templates);
  const limits = useSettingsStore((s) => s.financeLimits);
  const role = useAuthStore((s) => s.user?.role);

  const today = dayKey();
  const month = thisMonthKey();
  const period = (params.get('period') as Period) || 'month';
  const previousMonthEnd = addDays(`${month}-01`, -1);

  const range = {
    month: { from: `${month}-01`, to: today },
    last: { from: `${previousMonthEnd.slice(0, 7)}-01`, to: previousMonthEnd },
    ytd: { from: `${today.slice(0, 4)}-01-01`, to: today },
  }[period];
  const { from, to } = range;

  const setPeriod = (next: Period) => {
    const p = new URLSearchParams(params);
    if (next === 'month') p.delete('period');
    else p.set('period', next);
    setParams(p, { replace: true });
  };

  // §52/§55.1: the cash view for the period — transfers are counted apart.
  const flow = useMemo(
    () => moneyFlow({ entries, accounts, categories, from, to }),
    [entries, accounts, categories, from, to],
  );
  const cost = useMemo(
    () => costByCategory({ bills, payments, categories, from, to }),
    [bills, payments, categories, from, to],
  );
  const budget = useMemo(
    () => budgetReport({
      categories,
      lines: budgets,
      bills,
      payments,
      month,
      showStaff: role === 'Admin',
      noticePct: limits.budgetNoticePercent,
      warningPct: limits.budgetWarningPercent,
    }),
    [categories, budgets, bills, payments, month, role, limits],
  );
  const payables = useMemo(
    () => payablesReport({ bills, payments, vendors, today }),
    [bills, payments, vendors, today],
  );
  const receivables = useMemo(
    () => receivablesReport({
      students: students.map((s) => ({
        sno: s.sno,
        name: s.name,
        struckOff: s.struckOff,
        completed: s.completed,
        onLeave: s.onLeave,
      })),
      entries: ledgerEntries,
      today,
    }),
    [students, ledgerEntries, today],
  );
  const fees = useMemo(
    () => feeCollection(ledgerEntries, `${month}-01`, today),
    [ledgerEntries, month, today],
  );

  // §18 "Incoming cheques in hand" — held until cleared, so never money in.
  const chequeRows = useMemo(() => incomingChequeRows(accounts, entries, chequeDeposits), [accounts, entries, chequeDeposits]);
  const incoming = useMemo(() => chequesInHandTotal(chequeRows), [chequeRows]);
  const bounced = useMemo(() => chequeRows.filter((row) => row.status === 'Bounced').length, [chequeRows]);
  // §67 "Cheques ready to deposit": Received, not post-dated, held since a prior day.
  const readyToDeposit = useMemo(
    () => chequeRows.filter((row) => row.status === 'Received' && row.held.date < today
      && !(row.held.instrumentDate && row.held.instrumentDate > today)).length,
    [chequeRows, today],
  );
  // §18 "Security deposits held": the refundable part of each active student's
  // plan, priced the way the cancel screen prices it — never guessed (§5.2).
  const depositsHeld = useMemo(
    () => securityDepositsHeld({ students, templates, ledgerEntries }),
    [students, templates, ledgerEntries],
  );

  const balanceNow = accounts
    .filter((a) => a.type !== 'chequesInHand' && a.type !== 'issuedCheques')
    .reduce((sum, a) => sum + accountBalance(entries, a.id), 0);
  const availableNow = accounts
    .filter((a) => a.type === 'bank')
    .reduce((sum, a) => sum + availableBalance(entries, issuedCheques, a.id), 0);
  const issuedNotCleared = unclearedIssuedTotal(issuedCheques);
  const heldTotal = heldForOthers({ creditHeld: receivables.creditHeld, depositsHeld, chequesInHand: incoming });

  // §53 "Needs attention" — each item is a door to the screen that fixes it.
  const dues = recurringDue(recurring, { today });
  const unresolved = statementLines.filter((line) => line.status === 'Unmatched').length;
  const petty = accounts.find((a) => a.type === 'pettyCash');
  const pettyLow = petty ? isLowOnFloat(accountBalance(entries, petty.id), pettyFloat(petty), limits.pettyLowWarningPercent) : false;
  const awaitingReview = monthStateOf(month, monthClosures) === 'In review';
  const staleCheques = issuedCheques.filter((c) => c.status === 'Issued').length;
  const attention: { id: string; text: string; href: string; tone: 'danger' | 'warn' | 'info' }[] = [];
  if (payables.dueThisWeek > 0) {
    attention.push({ id: 'bills-week', text: `${formatPKR(payables.dueThisWeek)} of bills falls due in the next 7 days`, href: '/finance/bills?tab=unpaid', tone: 'warn' });
  }
  if (dues.length > 0) {
    attention.push({ id: 'recurring', text: recurringNotice(dues.length), href: '/finance/bills?tab=recurring', tone: 'info' });
  }
  if (unresolved > 0) {
    attention.push({ id: 'statement', text: `${unresolved} statement line${unresolved === 1 ? '' : 's'} still unmatched`, href: '/finance/reconcile', tone: 'warn' });
  }
  if (awaitingReview) {
    attention.push({ id: 'review', text: `${monthName(month)} is in review — close it when the checklist is done`, href: '/finance/month-close', tone: 'info' });
  }
  if (pettyLow) {
    attention.push({ id: 'petty', text: 'Petty cash is below its low-float warning — top it up', href: '/finance/petty-cash', tone: 'warn' });
  }
  if (staleCheques > 0) {
    attention.push({ id: 'cheques', text: `${staleCheques} issued cheque${staleCheques === 1 ? '' : 's'} not cleared yet`, href: '/finance/cheques', tone: 'info' });
  }
  if (bounced > 0) {
    attention.push({ id: 'bounced', text: `${bounced} incoming cheque${bounced === 1 ? '' : 's'} bounced`, href: '/finance/cheques-incoming', tone: 'danger' });
  }
  if (readyToDeposit > 0) {
    attention.push({ id: 'deposit', text: `${readyToDeposit} cheque${readyToDeposit === 1 ? '' : 's'} ready to deposit`, href: '/finance/cheques-incoming', tone: 'info' });
  }

  const budgetPct = budget.total.budget > 0 ? Math.round((budget.total.used / budget.total.budget) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-section font-bold text-slate-900">Money</h1>
          <p className="text-micro text-slate-500">
            Where the money is and how the month is going — every figure comes from the books (§53).
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/accounts')}>
            Accounts
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/month-close')}>
            Month close
          </Button>
          <Button size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/reports')}>
            Reports
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-meta"
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABELS[p]}
          </Button>
        ))}
        <span className="ml-2 text-micro text-slate-400">
          {formatDate(from)} to {formatDate(to)}
        </span>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Money in</div>
          <div className="text-xl font-bold text-green-600 mt-1 num">{formatPKR(flow.totalIn)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Money out</div>
          <div className="text-xl font-bold text-red-600 mt-1 num">{formatPKR(flow.totalOut)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Net movement</div>
          <div className={`text-xl font-bold mt-1 num ${flow.net < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatPKR(flow.net)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Balance now</div>
          <div className="text-xl font-bold text-slate-900 mt-1 num">{formatPKR(balanceNow)}</div>
          <div className="text-micro text-slate-400 mt-0.5">Available {formatPKR(availableNow)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Fees outstanding</div>
          <div className="text-xl font-bold text-amber-600 mt-1 num">{formatPKR(receivables.outstanding)}</div>
          <div className="text-micro text-slate-400 mt-0.5">Overdue {formatPKR(receivables.overdue)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">You owe</div>
          <div className="text-xl font-bold text-slate-900 mt-1 num">{formatPKR(payables.totals.total)}</div>
          <div className="text-micro text-slate-400 mt-0.5">
            {payables.nextDue ? `Next ${formatDate(payables.nextDue.date)}` : 'Nothing due'}
          </div>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Where the money is" description="Section 6 — the balance of every account, and what a bank still has free (§31.3).">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead>Reconciled through</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const isBank = account.type === 'bank';
                  const through = reconciledThroughMonth(reconciliations, account.id);
                  return (
                    <TableRow
                      key={account.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/finance/accounts/${account.id}`)}
                    >
                      <TableCell className="font-medium text-slate-900">{account.name}</TableCell>
                      <TableCell className="text-meta text-slate-500">{ACCOUNT_TYPE_LABELS[account.type]}</TableCell>
                      <TableCell className="text-right num">{formatPKR(accountBalance(entries, account.id))}</TableCell>
                      <TableCell className="text-right num text-slate-500">
                        {isBank ? formatPKR(availableBalance(entries, issuedCheques, account.id)) : '—'}
                      </TableCell>
                      <TableCell className="text-meta text-slate-500">
                        {isBank ? (through ? monthName(through) : 'Never') : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card title="Needs attention" description="§53 — each line opens the screen that clears it.">
          <CardContent className="space-y-2">
            {attention.length === 0 && (
              <p className="text-meta text-slate-400">Nothing needs attention.</p>
            )}
            {attention.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.href)}
                className="flex w-full items-start justify-between gap-2 rounded-control border border-hairline px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="flex items-start gap-2 text-meta text-slate-700">
                  {item.tone === 'danger'
                    ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-600" />
                    : <Megaphone size={14} className="mt-0.5 shrink-0 text-slate-400" />}
                  {item.text}
                </span>
                <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-300" />
              </button>
            ))}
            <div className="pt-1 text-micro text-slate-400">
              Issued cheques not cleared: {formatPKR(issuedNotCleared)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Owed to you" description="§19 — fees outstanding, from the ledger.">
          <CardContent className="space-y-1.5">
            {([
              ['Outstanding (active)', receivables.outstanding],
              ['Of which overdue', receivables.overdue],
              ['Struck-off dues', receivables.struckOffDues],
              ['Not yet due', receivables.ageing.notYetDue],
              ['1 to 30 days', receivables.ageing.d1to30],
              ['31 to 60 days', receivables.ageing.d31to60],
              ['61 to 90 days', receivables.ageing.d61to90],
              ['Over 90 days', receivables.ageing.over90],
            ] as [string, number][]).map(([label, amount]) => (
              <div key={label} className="flex items-center justify-between text-meta">
                <span className="text-slate-500">{label}</span>
                <span className="num font-medium text-slate-900">{formatPKR(amount)}</span>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/reports/receivables')}>
              Open the receivables report
            </Button>
          </CardContent>
        </Card>

        <Card title="You owe" description="§27 — unpaid bills by how late they are.">
          <CardContent className="space-y-1.5">
            {([
              ['Not yet due', payables.totals.notYetDue],
              ['1 to 30 days', payables.totals.d1to30],
              ['31 to 60 days', payables.totals.d31to60],
              ['61 to 90 days', payables.totals.d61to90],
              ['Over 90 days', payables.totals.over90],
              ['Due this week', payables.dueThisWeek],
            ] as [string, number][]).map(([label, amount]) => (
              <div key={label} className="flex items-center justify-between text-meta">
                <span className="text-slate-500">{label}</span>
                <span className="num font-medium text-slate-900">{formatPKR(amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-hairline-soft pt-1.5 text-meta">
              <span className="font-medium text-slate-700">Total unpaid</span>
              <span className="num font-bold text-slate-900">{formatPKR(payables.totals.total)}</span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/reports/payables')}>
              Open the payables report
            </Button>
          </CardContent>
        </Card>

        <Card title="Held for others" description="§18 — money that is not income.">
          <CardContent className="space-y-1.5">
            {([
              ['Student credit', receivables.creditHeld],
              ['Security deposits held', depositsHeld],
              ['Incoming cheques in hand', incoming],
            ] as [string, number][]).map(([label, amount]) => (
              <div key={label} className="flex items-center justify-between text-meta">
                <span className="text-slate-500">{label}</span>
                <span className="num font-medium text-slate-900">{formatPKR(amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-hairline-soft pt-1.5 text-meta">
              <span className="font-medium text-slate-700">Total held</span>
              <span className="num font-bold text-slate-900">{formatPKR(heldTotal)}</span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/reports/held-money')}>
              Open the held-money report
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card
        title={`Costs and budget — ${monthName(month)}`}
        description="§52 — the cost view: a bill counts when it is recorded, paid or not."
        actions={
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/budgets')}>
            {can(role, 'settings.manage') ? 'Edit budgets' : 'View budgets'}
          </Button>
        }
      >
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-slate-500">Costs recorded</div>
              <div className="text-xl font-bold text-slate-900 mt-1 num">{formatPKR(cost.totalBilled)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Fees billed this month</div>
              <div className="text-xl font-bold text-slate-900 mt-1 num">{formatPKR(fees.billed)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Fees collected this month</div>
              <div className="text-xl font-bold text-green-600 mt-1 num">{formatPKR(fees.collected)}</div>
            </div>
          </div>

          {budget.total.budget > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-meta">
                <span className="text-slate-500">
                  Budget used {formatPKR(budget.total.used)} of {formatPKR(budget.total.budget)}
                </span>
                <Badge variant={budgetPct >= limits.budgetWarningPercent ? 'danger' : budgetPct >= limits.budgetNoticePercent ? 'dues' : 'cleared'}>
                  {budgetPct}%
                </Badge>
              </div>
              <div className="h-2 rounded-pill bg-slate-100">
                <div
                  className={`h-2 rounded-pill ${budgetPct >= limits.budgetWarningPercent ? 'bg-red-500' : budgetPct >= limits.budgetNoticePercent ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, budgetPct)}%` }}
                />
              </div>
            </div>
          )}

          {cost.rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Still owed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cost.rows.slice(0, 6).map((row) => (
                  <TableRow key={row.categoryId}>
                    <TableCell className="text-slate-700">{row.name}</TableCell>
                    <TableCell className="text-right num">{formatPKR(row.billed)}</TableCell>
                    <TableCell className="text-right num text-green-600">{formatPKR(row.paid)}</TableCell>
                    <TableCell className="text-right num text-amber-600">{formatPKR(row.unpaid)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
