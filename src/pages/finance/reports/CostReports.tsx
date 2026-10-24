// ============================================
// MediCMS Desktop — Finance reports: costs, budgets, payables and payroll
// (§54.5–§54.7, §54.12, §54.13)
// The cost view side of §52: a bill counts the day it is recorded. Costs by
// category are proved against the cash view with the §52 bridge, the budget grid
// is the month's own, payables age by how late each bill is, and the program and
// payroll summaries report money by the batch it belonged to.
// ============================================

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPKR, formatDate } from '@/lib/utils';
import { PROGRAM_OPTIONS } from '@/lib/constants';
import {
  ageingBuckets,
  billStatus,
  budgetReport,
  collectedByProgram,
  costByCategory,
  costCashBridge,
  moneyFlow,
  paidFor,
  payablesReport,
  programSummary,
  unpaidFor,
  vendorPayable,
  type ReportDescriptor,
} from '@/lib/finance';
import { computeRunTotals, type PayrollRun } from '@/lib/payroll';
import { useAuthStore, useBillsStore, useBudgetStore, useLedgerStore, useMoneyStore, usePayrollStore, useSettingsStore, useStudentStore } from '@/stores';
import { comparisonRange, exportReport, monthName, useReportFilters } from './params';
import { AsAtBar, Figure, MonthBar, PeriodBar, ReportActions, ReportHeading } from './shared';

// -------------------------------------------
// 5. Costs by category (§54.5), proved by the §52 bridge
// -------------------------------------------

export function CostsView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const categories = useBillsStore((s) => s.categories);
  const entries = useMoneyStore((s) => s.entries);
  const accounts = useMoneyStore((s) => s.accounts);

  const cost = costByCategory({ bills, payments, categories, from: filters.from, to: filters.to });
  const flow = moneyFlow({ entries, accounts, categories, from: filters.from, to: filters.to });
  const inRange = (date: string) => date >= filters.from && date <= filters.to;
  const payrollPaid = entries.filter((e) => e.cleared && e.kind === 'PayrollPayment' && inRange(e.date)).reduce((sum, e) => sum + e.amount, 0);
  const refunds = entries.filter((e) => e.cleared && e.kind === 'RefundToStudent' && inRange(e.date)).reduce((sum, e) => sum + e.amount, 0);
  const bridge = costCashBridge({ costs: cost.totalBilled, unpaidBills: cost.totalUnpaid, payrollPaid, refunds });
  // §52: anything the cash view pays that no bill accounts for — a bank charge,
  // an owner withdrawal, a cash difference — is the honest difference, not a bug.
  const outsideBridge = flow.totalOut - bridge.moneyOut;
  const compared = comparisonRange(filters, filters.compare);
  const previous = compared ? costByCategory({ bills, payments, categories, from: compared.from, to: compared.to }) : undefined;
  const previousByName = new Map(previous?.rows.map((row) => [row.name, row.billed] as const));

  const exportCsv = () => exportReport(report.name, filters, ['Category', 'Billed', 'Paid', 'Still owed', 'Previous billed'], [
    ...cost.rows.map((row) => [row.name, row.billed, row.paid, row.unpaid, compared ? previousByName.get(row.name) ?? 0 : '']),
    ['Total', cost.totalBilled, cost.totalPaid, cost.totalUnpaid, compared ? previous?.totalBilled ?? 0 : ''],
  ]);

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <PeriodBar filters={filters} onChange={setFilters} />
        <p className="text-micro text-slate-400">
          A bill counts in the period it was posted, paid or not (§52)
          {compared && ` · compared with ${formatDate(compared.from)} to ${formatDate(compared.to)}`}.
        </p>
      </CardContent></Card>

      <Card><CardContent className="space-y-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Billed</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Still owed</TableHead>
              {compared && <TableHead className="text-right">Previous</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cost.rows.length === 0 && (
              <TableRow><TableCell colSpan={compared ? 5 : 4} className="py-6 text-center text-meta text-slate-400">No costs were recorded in this period.</TableCell></TableRow>
            )}
            {cost.rows.map((row) => (
              <TableRow key={row.categoryId} className="cursor-pointer" onClick={() => navigate(`/finance/bills?q=${encodeURIComponent(row.name)}`)}>
                <TableCell className="text-slate-700">{row.name}</TableCell>
                <TableCell className="text-right num">{formatPKR(row.billed)}</TableCell>
                <TableCell className="text-right num text-green-600">{formatPKR(row.paid)}</TableCell>
                <TableCell className="text-right num text-amber-600">{formatPKR(row.unpaid)}</TableCell>
                {compared && <TableCell className="text-right num text-slate-400">{formatPKR(previousByName.get(row.name) ?? 0)}</TableCell>}
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold text-slate-900">Total</TableCell>
              <TableCell className="text-right num font-bold">{formatPKR(cost.totalBilled)}</TableCell>
              <TableCell className="text-right num font-bold text-green-600">{formatPKR(cost.totalPaid)}</TableCell>
              <TableCell className="text-right num font-bold text-amber-600">{formatPKR(cost.totalUnpaid)}</TableCell>
              {compared && <TableCell className="text-right num font-bold text-slate-400">{formatPKR(previous?.totalBilled ?? 0)}</TableCell>}
            </TableRow>
          </TableBody>
        </Table>
        <p className="text-micro text-slate-400">Every row opens the bills behind it.</p>
      </CardContent></Card>

      <Card title="Cost view to cash view" description="§52 — the bridge that proves the month reconciles to itself.">
        <CardContent className="space-y-1">
          <Figure label="Costs recorded (cost view)" amount={formatPKR(bridge.costs)} />
          <Figure label="Minus bills not yet paid" amount={formatPKR(-bridge.lessUnpaid)} />
          <Figure label="Plus payroll paid" amount={formatPKR(bridge.plusPayroll)} />
          <Figure label="Plus student refunds" amount={formatPKR(bridge.plusRefunds)} />
          <Figure label="Money out (bridge)" amount={formatPKR(bridge.moneyOut)} tone="total" />
          <Figure label="Money out (cash view, §55.1)" amount={formatPKR(flow.totalOut)} tone="total" />
          <p className={`text-micro ${outsideBridge === 0 ? 'text-slate-400' : 'text-amber-700'}`}>
            {outsideBridge === 0
              ? 'The two views agree to the rupee.'
              : `${formatPKR(outsideBridge)} of cash left that no bill accounts for — bank charges, owner withdrawals or cash differences (§52).`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------------------------------
// 6. Budget versus actual (§47, §54.6)
// -------------------------------------------

const LEVEL_VARIANT = { ok: 'cleared', notice: 'dues', warning: 'danger' } as const;

export function BudgetView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const categories = useBillsStore((s) => s.categories);
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const budgets = useBudgetStore((s) => s.budgets);
  const limits = useSettingsStore((s) => s.financeLimits);
  const role = useAuthStore((s) => s.user?.role);

  const month = filters.month;
  const budget = budgetReport({
    categories,
    lines: budgets,
    bills,
    payments,
    month,
    showStaff: role === 'Admin',
    noticePct: limits.budgetNoticePercent,
    warningPct: limits.budgetWarningPercent,
  });
  const remaining = budget.total.budget - budget.total.used;

  const exportCsv = () => exportReport(report.name, filters, ['Group', 'Category', 'Budget', 'Paid', 'Committed', 'Used', 'Percent'], [
    ...budget.groups.map((group) => [group.label, '', group.budget, group.paid, group.unpaid, group.used, '']),
    ...budget.rows.map((row) => ['', row.name, row.budget, row.paid, row.unpaid, row.used, row.pct]),
    ['Total', '', budget.total.budget, budget.total.paid, budget.total.unpaid, budget.total.used, ''],
  ]);

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <MonthBar month={month} onChange={(next) => setFilters({ month: next })}>
          <button type="button" className="text-meta text-slate-500 underline-offset-2 hover:underline" onClick={() => navigate('/finance/budgets')}>
            Open the budget grid
          </button>
        </MonthBar>
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-3">
          <Figure label="Budget" amount={formatPKR(budget.total.budget)} />
          <Figure label="Used (paid + committed)" amount={formatPKR(budget.total.used)} tone="total" />
          <Figure label={remaining < 0 ? 'Over budget' : 'Remaining'} amount={formatPKR(remaining)} tone={remaining < 0 ? 'out' : 'in'} />
        </div>
      </CardContent></Card>

      <Card title={`Budget versus actual — ${monthName(month)}`} description="§47 — unpaid bills are committed money and count.">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Committed</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budget.rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-meta text-slate-400">No budget or cost is set for {monthName(month)}.</TableCell></TableRow>
              )}
              {budget.rows.map((row) => (
                <TableRow key={row.categoryId}>
                  <TableCell className="text-slate-700">{row.name}</TableCell>
                  <TableCell className="text-right num">{formatPKR(row.budget)}</TableCell>
                  <TableCell className="text-right num text-green-600">{formatPKR(row.paid)}</TableCell>
                  <TableCell className="text-right num text-amber-600">{formatPKR(row.unpaid)}</TableCell>
                  <TableCell className="text-right num font-medium">{formatPKR(row.used)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={row.budget > 0 ? LEVEL_VARIANT[row.level] : 'outline'}>{row.budget > 0 ? `${row.pct}%` : '—'}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold text-slate-900">Total</TableCell>
                <TableCell className="text-right num font-bold">{formatPKR(budget.total.budget)}</TableCell>
                <TableCell className="text-right num font-bold text-green-600">{formatPKR(budget.total.paid)}</TableCell>
                <TableCell className="text-right num font-bold text-amber-600">{formatPKR(budget.total.unpaid)}</TableCell>
                <TableCell className="text-right num font-bold">{formatPKR(budget.total.used)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {budget.hiddenStaffRows > 0 && (
        <p className="text-micro text-slate-400">
          {budget.hiddenStaffRows} staff budget row(s) are hidden — individual pay is an Admin's (§47, §54).
        </p>
      )}
    </div>
  );
}

// -------------------------------------------
// 7. Payables and vendor statement (§55.2, §72.2)
// -------------------------------------------

export function PayablesView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const vendors = useBillsStore((s) => s.vendors);
  const categories = useBillsStore((s) => s.categories);

  const asAt = filters.to;
  const payables = payablesReport({ bills, payments, vendors, today: asAt });
  const vendor = filters.vendorId ? vendors.find((v) => v.id === filters.vendorId) : undefined;

  const statement = vendor
    ? bills
        .filter((bill) => bill.vendorId === vendor.id && bill.status !== 'Cancelled')
        .filter((bill) => bill.date >= filters.from && bill.date <= filters.to)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const exportCsv = () => exportReport(
    report.name,
    filters,
    vendor ? ['Bill', 'Posted', 'Due', 'Description', 'Amount', 'Paid', 'Unpaid', 'Status'] : ['Vendor', 'Not yet due', '1 to 30', '31 to 60', '61 to 90', 'Over 90', 'Total'],
    vendor
      ? statement.map((bill) => [bill.no, bill.date, bill.dueDate ?? '', bill.description, bill.amount, paidFor(bill, payments), unpaidFor(bill, payments), billStatus(bill, payments)])
      : payables.rows.map((row) => [row.name, row.notYetDue, row.d1to30, row.d31to60, row.d61to90, row.over90, row.total]),
  );

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <AsAtBar filters={filters} onChange={setFilters}>
          <div className="space-y-1">
            <span className="block text-micro text-slate-500">Vendor statement</span>
            <select
              value={filters.vendorId}
              onChange={(e) => setFilters({ vendorId: e.target.value })}
              className="h-7 rounded-control border border-hairline bg-panel px-2 text-meta text-ink"
            >
              <option value="">Every vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </AsAtBar>
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-3">
          <Figure label="Total owed" amount={formatPKR(payables.totals.total)} tone="total" />
          <Figure label="Overdue" amount={formatPKR(payables.overdue)} tone={payables.overdue > 0 ? 'out' : 'in'} />
          <Figure label="Due this week" amount={formatPKR(payables.dueThisWeek)} />
        </div>
        {payables.nextDue && (
          <p className="text-micro text-slate-400">
            Next due {formatDate(payables.nextDue.date)} — {payables.nextDue.vendor}, {formatPKR(payables.nextDue.amount)}.
          </p>
        )}
      </CardContent></Card>

      {!vendor && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Not yet due</TableHead>
                <TableHead className="text-right">1–30</TableHead>
                <TableHead className="text-right">31–60</TableHead>
                <TableHead className="text-right">61–90</TableHead>
                <TableHead className="text-right">Over 90</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payables.rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-6 text-center text-meta text-slate-400">Nothing is owed on this date.</TableCell></TableRow>
              )}
              {payables.rows.map((row) => (
                <TableRow key={row.vendorId} className="cursor-pointer" onClick={() => navigate(`/finance/vendors/${row.vendorId}`)}>
                  <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                  <TableCell className="text-right num">{formatPKR(row.notYetDue)}</TableCell>
                  <TableCell className="text-right num">{row.d1to30 ? formatPKR(row.d1to30) : '—'}</TableCell>
                  <TableCell className="text-right num">{row.d31to60 ? formatPKR(row.d31to60) : '—'}</TableCell>
                  <TableCell className="text-right num">{row.d61to90 ? formatPKR(row.d61to90) : '—'}</TableCell>
                  <TableCell className="text-right num text-red-600">{row.over90 ? formatPKR(row.over90) : '—'}</TableCell>
                  <TableCell className="text-right num font-semibold">{formatPKR(row.total)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold text-slate-900">Total</TableCell>
                <TableCell className="text-right num font-bold">{formatPKR(payables.totals.notYetDue)}</TableCell>
                <TableCell className="text-right num font-bold">{formatPKR(payables.totals.d1to30)}</TableCell>
                <TableCell className="text-right num font-bold">{formatPKR(payables.totals.d31to60)}</TableCell>
                <TableCell className="text-right num font-bold">{formatPKR(payables.totals.d61to90)}</TableCell>
                <TableCell className="text-right num font-bold text-red-600">{formatPKR(payables.totals.over90)}</TableCell>
                <TableCell className="text-right num font-bold">{formatPKR(payables.totals.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {vendor && (
        <Card title={`${vendor.name} — statement`} description={`§72.2 — bills posted between ${formatDate(filters.from)} and ${formatDate(filters.to)}.`}>
          <CardContent className="space-y-3">
            <div className="grid gap-x-8 gap-y-1 md:grid-cols-3">
              <Figure label="Payable now" amount={formatPKR(vendorPayable(vendor, bills, payments))} tone="total" />
              <Figure label="Opening payable" amount={formatPKR(vendor.openingPayable ?? 0)} />
              <Figure label="Terms" amount={`${vendor.termsDays} days`} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-meta text-slate-500">
              {Object.entries(ageingBuckets(bills, payments, vendor.id, asAt)).map(([bucket, amount]) => (
                <span key={bucket}>{BUCKET_LABELS[bucket] ?? bucket}: <b className="num text-slate-900">{formatPKR(amount)}</b></span>
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Unpaid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-6 text-center text-meta text-slate-400">No bills in this period.</TableCell></TableRow>
                )}
                {statement.map((bill) => (
                  <TableRow key={bill.id} className="cursor-pointer" onClick={() => navigate(`/finance/bills/${bill.id}`)}>
                    <TableCell className="font-medium text-slate-900">{bill.no}</TableCell>
                    <TableCell>{formatDate(bill.date)}</TableCell>
                    <TableCell>{bill.dueDate ? formatDate(bill.dueDate) : '—'}</TableCell>
                    <TableCell className="text-meta text-slate-500">
                      {categories.find((c) => c.id === bill.categoryId)?.name ?? bill.description}
                    </TableCell>
                    <TableCell className="text-right num">{formatPKR(bill.amount)}</TableCell>
                    <TableCell className="text-right num text-green-600">{formatPKR(paidFor(bill, payments))}</TableCell>
                    <TableCell className="text-right num text-amber-600">{formatPKR(unpaidFor(bill, payments))}</TableCell>
                    <TableCell className="text-meta text-slate-500">{billStatus(bill, payments)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-micro text-slate-400">
              The statement is in the address (§54) — the same link can be bookmarked or sent.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const BUCKET_LABELS: Record<string, string> = {
  notYetDue: 'Not yet due',
  d1to30: '1 to 30 days',
  d31to60: '31 to 60 days',
  d61to90: '61 to 90 days',
  over90: 'Over 90 days',
};

// -------------------------------------------
// 12. Program summary (§54.12)
// -------------------------------------------

export function ProgramsView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const bills = useBillsStore((s) => s.bills);
  const students = useStudentStore((s) => s.students);
  const ledgerEntries = useLedgerStore((s) => s.entries);

  // Both sides must speak the same program name, so the label the student record
  // shows is the label a bill carries (§26).
  const programLabel = (code: string) => PROGRAM_OPTIONS.find((option) => option.value === code)?.label ?? code;
  const programOf = new Map(students.map((student) => [student.sno, programLabel(student.program)] as const));

  // A bill carries the program's code; the ledger side speaks the same label the
  // student record shows, so both sides meet under one name (§26, §54.12).
  const periodBills = bills
    .filter((bill) => bill.date >= filters.from && bill.date <= filters.to)
    .map((bill) => (bill.program ? { ...bill, program: programLabel(bill.program) } : bill));
  const collected = collectedByProgram(ledgerEntries, programOf, filters.from, filters.to);
  const rows = programSummary({ bills: periodBills, collectedByProgram: collected });

  const exportCsv = () => exportReport(report.name, filters, ['Program', 'Fees collected', 'Costs tagged', 'Difference'], rows.map((row) => [
    row.program, row.collected, row.costs, row.difference,
  ]));

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <PeriodBar filters={filters} onChange={setFilters} />
        <p className="text-micro text-slate-400">
          Fees come from the ledger, costs from bills tagged to a program (§26). A bill carries its tag from Record a cost.
        </p>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Program</TableHead>
              <TableHead className="text-right">Fees collected</TableHead>
              <TableHead className="text-right">Costs tagged</TableHead>
              <TableHead className="text-right">Difference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-6 text-center text-meta text-slate-400">No program collected fees or carried costs in this period.</TableCell></TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.program} className="cursor-pointer" onClick={() => navigate(`/finance/bills?q=${encodeURIComponent(row.program)}`)}>
                <TableCell className="font-medium text-slate-900">{row.program}</TableCell>
                <TableCell className="text-right num text-green-600">{formatPKR(row.collected)}</TableCell>
                <TableCell className="text-right num">{formatPKR(row.costs)}</TableCell>
                <TableCell className={`text-right num font-medium ${row.difference < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {formatPKR(row.difference)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// -------------------------------------------
// 13. Payroll summary (§54.13) — Admin only
// -------------------------------------------

export function PayrollView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const runs = usePayrollStore((s) => s.runs);
  const lines = usePayrollStore((s) => s.lines);

  const inPeriod = (run: PayrollRun) => run.serviceMonth >= filters.from.slice(0, 7) && run.serviceMonth <= filters.to.slice(0, 7);
  const rows = runs
    .filter(inPeriod)
    .slice()
    .sort((a, b) => a.serviceMonth.localeCompare(b.serviceMonth) || a.runNumber.localeCompare(b.runNumber))
    .map((run) => ({
      run,
      totals: run.totals ?? computeRunTotals(lines.filter((line) => line.runId === run.id)),
    }));
  const gross = rows.reduce((sum, row) => sum + (row.run.calculationState === 'Approved' ? row.totals.gross : 0), 0);
  const net = rows.reduce((sum, row) => sum + (row.run.calculationState === 'Approved' ? row.totals.netPayable : 0), 0);
  const paid = rows.reduce((sum, row) => sum + (row.run.calculationState === 'Approved' ? row.totals.paid : 0), 0);
  const still = rows.reduce((sum, row) => sum + (row.run.calculationState === 'Approved' ? row.totals.stillPayable : 0), 0);

  const exportCsv = () => exportReport(report.name, filters, ['Run', 'Service month', 'Kind', 'State', 'Gross', 'Net payable', 'Paid', 'Still payable'], rows.map((row) => [
    row.run.runNumber,
    row.run.serviceMonth,
    row.run.kind,
    row.run.calculationState,
    row.totals.gross,
    row.totals.netPayable,
    row.totals.paid,
    row.totals.stillPayable,
  ]));

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <PeriodBar filters={filters} onChange={setFilters} />
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-4">
          <Figure label="Gross (approved runs)" amount={formatPKR(gross)} />
          <Figure label="Net payable" amount={formatPKR(net)} tone="total" />
          <Figure label="Paid" amount={formatPKR(paid)} tone="in" />
          <Figure label="Still to pay" amount={formatPKR(still)} tone={still > 0 ? 'out' : 'in'} />
        </div>
        <button type="button" className="text-meta text-slate-500 underline-offset-2 hover:underline" onClick={() => navigate('/staff/reports')}>
          Open the payroll reports for named lines
        </button>
      </CardContent></Card>

      <Card title="Pay runs" description="§54.13 — batch totals only; no individual pay appears here.">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Service month</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net payable</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Still to pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-6 text-center text-meta text-slate-400">No pay run falls in this period.</TableCell></TableRow>
              )}
              {rows.map((row) => (
                <TableRow
                  key={row.run.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/staff/payroll/${row.run.id}`)}
                >
                  <TableCell className="font-medium text-slate-900">{row.run.runNumber}</TableCell>
                  <TableCell>{monthName(row.run.serviceMonth)}</TableCell>
                  <TableCell>
                    <Badge variant={row.run.calculationState === 'Approved' ? 'cleared' : 'outline'}>{row.run.calculationState}</Badge>
                    {row.run.noPayrollReason && <span className="ml-1.5 text-micro text-slate-400">no payroll</span>}
                  </TableCell>
                  <TableCell className="text-right num">{formatPKR(row.totals.gross)}</TableCell>
                  <TableCell className="text-right num">{formatPKR(row.totals.netPayable)}</TableCell>
                  <TableCell className="text-right num text-green-600">{formatPKR(row.totals.paid)}</TableCell>
                  <TableCell className="text-right num text-amber-600">{formatPKR(row.totals.stillPayable)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
