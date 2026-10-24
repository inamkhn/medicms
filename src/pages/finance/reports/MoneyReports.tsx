// ============================================
// MediCMS Desktop — Finance reports: the money view (§54.1–§54.3, §54.8)
// Money flow, account balances, the cash book and the voucher register. Every
// figure comes from the same core the overview and the account pages read, so a
// report can never disagree with the screen it drills into (§52, §56).
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPKR, formatDate } from '@/lib/utils';
import { addDays } from '@/lib/dates';
import {
  ACCOUNT_TYPE_LABELS,
  accountBalance,
  availableBalance,
  cashBookRows,
  isSystemAccount,
  moneyFlow,
  reconciledThroughMonth,
  unclearedIssuedTotal,
  VOUCHER_MODE_LABELS,
  type FlowLine,
  type MoneyEntry,
  type ReportDescriptor,
} from '@/lib/finance';
import { useBillsStore, useMoneyStore } from '@/stores';
import { comparisonRange, exportReport, monthName, useReportFilters } from './params';
import { AsAtBar, Figure, PeriodBar, ReportActions, ReportHeading } from './shared';

// -------------------------------------------
// 1. Money flow (§55.1, §70.2)
// -------------------------------------------

/** One side of the flow: a line, its figure, the compared figure, and its entries. */
function FlowTable({ title, lines, previous, openKey, onToggle, onOpenEntry, empty }: {
  title: string;
  lines: readonly FlowLine[];
  previous?: ReadonlyMap<string, number>;
  openKey: string;
  onToggle: (key: string) => void;
  onOpenEntry: (entry: MoneyEntry) => void;
  empty: string;
}) {
  return (
    <div>
      <p className="mb-1 text-micro font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      {lines.length === 0 && <p className="py-3 text-meta text-slate-400">{empty}</p>}
      {lines.map((line) => (
        <div key={line.key} className="border-b border-hairline-soft last:border-0">
          <button
            type="button"
            onClick={() => onToggle(line.key)}
            className="flex w-full items-center gap-1.5 py-1.5 text-left text-meta hover:bg-slate-50"
            aria-expanded={openKey === line.key}
          >
            {openKey === line.key ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
            <span className="min-w-0 flex-1 truncate text-slate-700">{line.label}</span>
            <span className="num font-medium text-slate-900">{formatPKR(line.amount)}</span>
            {previous && <span className="num w-24 text-right text-slate-400">{formatPKR(previous.get(line.key) ?? 0)}</span>}
          </button>
          {openKey === line.key && (
            <div className="mb-1.5 space-y-0.5 rounded-control bg-slate-50 px-2 py-1.5">
              {line.entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onOpenEntry(entry)}
                  className="flex w-full items-center gap-2 text-left text-micro text-slate-600 hover:text-slate-900"
                >
                  <span className="num w-20 shrink-0">{formatDate(entry.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.payee ?? entry.reference ?? entry.linkedDoc ?? entry.kind}</span>
                  <span className="num shrink-0">{formatPKR(entry.amount)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function MoneyFlowView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const [openKey, setOpenKey] = useState('');
  const entries = useMoneyStore((s) => s.entries);
  const accounts = useMoneyStore((s) => s.accounts);
  const categories = useBillsStore((s) => s.categories);

  const flow = moneyFlow({ entries, accounts, categories, from: filters.from, to: filters.to });
  const compared = comparisonRange(filters, filters.compare);
  const previous = compared ? moneyFlow({ entries, accounts, categories, from: compared.from, to: compared.to }) : undefined;
  const previousIn = new Map(previous?.in.map((line) => [line.key, line.amount] as const));
  const previousOut = new Map(previous?.out.map((line) => [line.key, line.amount] as const));

  // §70.2 "Show transfers": the two transfer lines, revealed on request and
  // never added to the totals (§55.1).
  const transfers = entries
    .filter((e) => e.cleared && (e.kind === 'TransferIn' || e.kind === 'TransferOut') && e.date >= filters.from && e.date <= filters.to)
    .sort((a, b) => a.date.localeCompare(b.date));

  const exportCsv = () => exportReport(report.name, filters, ['Side', 'Line', 'Amount'], [
    ...flow.in.map((line) => ['In', line.label, line.amount] as const),
    ['In', 'Total in', flow.totalIn],
    ...flow.out.map((line) => ['Out', line.label, line.amount] as const),
    ['Out', 'Total out', flow.totalOut],
    ['Net', 'Net movement', flow.net],
    ...(filters.showTransfers
      ? [['Transfers', 'Transfers in (left out of the totals)', flow.transfersIn] as const, ['Transfers', 'Transfers out (left out of the totals)', flow.transfersOut] as const]
      : []),
  ]);

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <PeriodBar filters={filters} onChange={setFilters} />
        <p className="text-micro text-slate-400">
          {formatDate(filters.from)} to {formatDate(filters.to)}
          {compared && ` · compared with ${formatDate(compared.from)} to ${formatDate(compared.to)}`}
        </p>
      </CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Money in" description="§17 — the route the money took.">
          <CardContent>
            <FlowTable
              title="In"
              lines={flow.in}
              previous={compared ? previousIn : undefined}
              openKey={openKey}
              onToggle={(key) => setOpenKey(openKey === key ? '' : key)}
              onOpenEntry={(entry) => navigate(`/finance/accounts/${entry.accountId}`)}
              empty="Nothing came in during this period."
            />
            <div className="mt-2 border-t border-hairline pt-1.5">
              <Figure label="Total in" amount={formatPKR(flow.totalIn)} tone="in" />
            </div>
          </CardContent>
        </Card>

        <Card title="Money out" description="§26 — by the purpose the bill carried.">
          <CardContent>
            <FlowTable
              title="Out"
              lines={flow.out}
              previous={compared ? previousOut : undefined}
              openKey={openKey}
              onToggle={(key) => setOpenKey(openKey === key ? '' : key)}
              onOpenEntry={(entry) => navigate(`/finance/accounts/${entry.accountId}`)}
              empty="Nothing went out during this period."
            />
            <div className="mt-2 border-t border-hairline pt-1.5">
              <Figure label="Total out" amount={formatPKR(flow.totalOut)} tone="out" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card><CardContent className="space-y-2">
        <Figure label="Net movement" amount={formatPKR(flow.net)} tone="total" />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline-soft pt-2">
          <span className="text-micro text-slate-500">
            Transfers of {formatPKR(flow.transfersIn + flow.transfersOut)} are left out — moving money between our own accounts is not income or a cost (§55.1).
          </span>
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setFilters({ showTransfers: !filters.showTransfers })}>
            {filters.showTransfers ? 'Hide transfers' : 'Show transfers'}
          </Button>
        </div>
        {filters.showTransfers && (
          <div className="space-y-1 pt-1">
            <Figure label="Transfers in (not in the totals)" amount={formatPKR(flow.transfersIn)} />
            <Figure label="Transfers out (not in the totals)" amount={formatPKR(flow.transfersOut)} />
            {transfers.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => navigate(`/finance/accounts/${entry.accountId}`)}
                className="flex w-full items-center gap-2 text-left text-micro text-slate-500 hover:text-slate-800"
              >
                <span className="num w-20 shrink-0">{formatDate(entry.date)}</span>
                <span className="min-w-0 flex-1 truncate">{entry.kind === 'TransferIn' ? 'Transfer in' : 'Transfer out'} · {entry.reference ?? entry.linkedDoc ?? '—'}</span>
                <span className="num shrink-0">{formatPKR(entry.amount)}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}

// -------------------------------------------
// 2. Account balances (§6, §53)
// -------------------------------------------

export function BalancesView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const issuedCheques = useMoneyStore((s) => s.issuedCheques);
  const reconciliations = useMoneyStore((s) => s.reconciliations);

  const asAt = filters.to;
  const rows = accounts.map((account) => ({
    account,
    balance: accountBalance(entries, account.id, asAt),
    available: account.type === 'bank' ? availableBalance(entries, issuedCheques, account.id, asAt) : undefined,
    issued: account.type === 'bank' ? unclearedIssuedTotal(issuedCheques, account.id) : 0,
    through: reconciledThroughMonth(reconciliations, account.id),
  }));
  const own = rows.filter((row) => !isSystemAccount(row.account) && row.account.type !== 'chequesInHand' && row.account.type !== 'issuedCheques');
  const total = own.reduce((sum, row) => sum + row.balance, 0);
  const availableTotal = rows.reduce((sum, row) => sum + (row.available ?? 0), 0);

  const exportCsv = () => exportReport(report.name, filters, ['Account', 'Type', 'Balance', 'Available', 'Reconciled through'], rows.map((row) => [
    row.account.name, ACCOUNT_TYPE_LABELS[row.account.type], row.balance, row.available ?? '', row.through ?? 'never',
  ]));

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <AsAtBar filters={filters} onChange={setFilters} />
        <p className="text-micro text-slate-400">Balances as at {formatDate(asAt)} — cleared entries only (§6.1).</p>
      </CardContent></Card>

      <Card><CardContent className="space-y-3">
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          <Figure label="Total in our own accounts" amount={formatPKR(total)} tone="total" />
          <Figure label="Available across banks" amount={formatPKR(availableTotal)} tone="total" />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Issued, not cleared</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead>Reconciled through</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.account.id} className="cursor-pointer" onClick={() => navigate(`/finance/accounts/${row.account.id}`)}>
                <TableCell className="font-medium text-slate-900">
                  {row.account.name}
                  {isSystemAccount(row.account) && <Badge variant="outline" className="ml-1.5 text-micro">system</Badge>}
                </TableCell>
                <TableCell className="text-meta text-slate-500">{ACCOUNT_TYPE_LABELS[row.account.type]}</TableCell>
                <TableCell className="text-right num">{formatPKR(row.balance)}</TableCell>
                <TableCell className="text-right num text-slate-500">{row.issued ? formatPKR(row.issued) : '—'}</TableCell>
                <TableCell className="text-right num text-slate-500">{row.available === undefined ? '—' : formatPKR(row.available)}</TableCell>
                <TableCell className="text-meta text-slate-500">{row.through ? monthName(row.through) : 'Never'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-micro text-slate-400">
          A system account holds money that is not ours — a cheque in hand or a cheque we issued — so it is never counted in the total (§5).
        </p>
      </CardContent></Card>
    </div>
  );
}

// -------------------------------------------
// 3. Cash book and bank book (§12, §14)
// -------------------------------------------

export function CashBookView({ report }: { report: ReportDescriptor }) {
  const [filters, setFilters] = useReportFilters();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);

  const account = accounts.find((a) => a.id === filters.accountId) ?? accounts[0];
  // §12: the running balance comes from the full books; the period only picks
  // which rows to print, so line n always carries the same figure.
  const all = account ? cashBookRows(entries, account.id) : [];
  const rows = all.filter(({ entry }) => entry.date >= filters.from && entry.date <= filters.to);
  const opening = account ? accountBalance(entries, account.id, addDays(filters.from, -1)) : 0;
  const closing = account ? accountBalance(entries, account.id, filters.to) : 0;

  const exportCsv = () => exportReport(report.name, filters, ['No', 'Date', 'Kind', 'Payee', 'Reference', 'In', 'Out', 'Running balance'], [
    ['', '', 'Opening balance', '', '', '', '', opening],
    ...rows.map(({ entry, runningBalance }) => [
      entry.no,
      entry.date,
      entry.kind,
      entry.payee ?? '',
      entry.reference ?? entry.linkedDoc ?? '',
      entry.direction === 'In' ? entry.amount : '',
      entry.direction === 'Out' ? entry.amount : '',
      runningBalance,
    ]),
    ['', '', 'Closing balance', '', '', '', '', closing],
  ]);

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <PeriodBar filters={filters} onChange={setFilters}>
          <div className="space-y-1">
            <span className="block text-micro text-slate-500">Account</span>
            <select
              value={account?.id ?? ''}
              onChange={(e) => setFilters({ accountId: e.target.value })}
              className="h-7 rounded-control border border-hairline bg-panel px-2 text-meta text-ink"
            >
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </PeriodBar>
        <p className="text-micro text-slate-400">
          Opening {formatPKR(opening)} at {formatDate(filters.from)} · closing {formatPKR(closing)} at {formatDate(filters.to)}. The filters pick rows, never the figures (§14).
        </p>
      </CardContent></Card>

      <Card><CardContent className="space-y-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>#</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Payee / reference</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6} className="text-meta font-medium text-slate-600">Opening balance</TableCell>
              <TableCell className="text-right num font-medium">{formatPKR(opening)}</TableCell>
            </TableRow>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-meta text-slate-400">No entries in this period.</TableCell></TableRow>
            )}
            {rows.map(({ entry, runningBalance }) => (
              <TableRow key={entry.id} className={entry.cleared ? '' : 'opacity-60'}>
                <TableCell>{formatDate(entry.date)}</TableCell>
                <TableCell className="text-meta text-slate-500">{entry.no}</TableCell>
                <TableCell>{entry.kind}{!entry.cleared && <span className="ml-1.5 text-micro text-amber-600">uncleared</span>}</TableCell>
                <TableCell className="text-slate-500">{entry.payee ?? entry.reference ?? entry.linkedDoc ?? '—'}</TableCell>
                <TableCell className="text-right num text-green-600">{entry.direction === 'In' ? formatPKR(entry.amount) : '—'}</TableCell>
                <TableCell className="text-right num text-red-600">{entry.direction === 'Out' ? formatPKR(entry.amount) : '—'}</TableCell>
                <TableCell className="text-right num">{formatPKR(runningBalance)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={6} className="text-meta font-semibold text-slate-900">Closing balance</TableCell>
              <TableCell className="text-right num font-bold">{formatPKR(closing)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// -------------------------------------------
// 4. Voucher register (§29, §54.8)
// -------------------------------------------

export function VouchersView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const vouchers = useBillsStore((s) => s.vouchers);
  const vendors = useBillsStore((s) => s.vendors);
  const accounts = useMoneyStore((s) => s.accounts);

  const inRange = vouchers
    .filter((v) => v.date >= filters.from && v.date <= filters.to)
    .filter((v) => !filters.vendorId || v.vendorId === filters.vendorId)
    .slice()
    .sort((a, b) => (a.date === b.date ? b.no.localeCompare(a.no) : b.date.localeCompare(a.date)));

  const live = inRange.filter((v) => !v.voided);
  const paid = live.reduce((sum, v) => sum + v.amount, 0);
  const byMode = new Map<string, number>();
  for (const v of live) byMode.set(v.mode, (byMode.get(v.mode) ?? 0) + v.amount);

  const exportCsv = () => exportReport(report.name, filters, ['Voucher', 'Date', 'Payee', 'Mode', 'Account', 'Amount', 'Bills paid', 'Prepared by', 'Approved by', 'Void'], inRange.map((v) => [
    v.no,
    v.date,
    v.payee,
    VOUCHER_MODE_LABELS[v.mode],
    accounts.find((a) => a.id === v.accountId)?.name ?? '',
    v.amount,
    v.allocations.length,
    v.preparedBy,
    v.approvedBy ?? '',
    v.voided ? `void — ${v.voidReason ?? ''}` : '',
  ]));

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <PeriodBar filters={filters} onChange={setFilters}>
          <div className="space-y-1">
            <span className="block text-micro text-slate-500">Vendor</span>
            <select
              value={filters.vendorId}
              onChange={(e) => setFilters({ vendorId: e.target.value })}
              className="h-7 rounded-control border border-hairline bg-panel px-2 text-meta text-ink"
            >
              <option value="">Every payee</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </PeriodBar>
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-3">
          <Figure label="Paid out (voids excluded)" amount={formatPKR(paid)} tone="total" />
          <Figure label="Vouchers" amount={String(inRange.length)} />
          <Figure label="Voided" amount={String(inRange.length - live.length)} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-meta text-slate-500">
          {[...byMode].map(([mode, amount]) => (
            <span key={mode}>{mode}: <b className="num text-slate-900">{formatPKR(amount)}</b></span>
          ))}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voucher</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Bills paid</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Prepared / approved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inRange.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-meta text-slate-400">No vouchers in this period.</TableCell></TableRow>
            )}
            {inRange.map((voucher) => (
              <TableRow
                key={voucher.id}
                className="cursor-pointer"
                onClick={() => navigate(`/finance/vouchers/${voucher.id}`)}
              >
                <TableCell className={`font-medium ${voucher.voided ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                  {voucher.no}
                  {voucher.voided && <Badge variant="struckoff" className="ml-1.5 text-micro">Void</Badge>}
                </TableCell>
                <TableCell>{formatDate(voucher.date)}</TableCell>
                <TableCell className={voucher.voided ? 'text-slate-400 line-through' : 'text-slate-700'}>{voucher.payee}</TableCell>
                <TableCell className="text-meta text-slate-500">{VOUCHER_MODE_LABELS[voucher.mode]}</TableCell>
                <TableCell className="text-meta text-slate-500">
                  {voucher.allocations.length === 0 ? 'No bill' : `${voucher.allocations.length} bill${voucher.allocations.length === 1 ? '' : 's'}`}
                </TableCell>
                <TableCell className={`text-right num ${voucher.voided ? 'text-slate-400 line-through' : ''}`}>{formatPKR(voucher.amount)}</TableCell>
                <TableCell className="text-meta text-slate-500">
                  {voucher.preparedBy}{voucher.approvedBy ? ` · approved ${voucher.approvedBy}` : ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
