// ============================================
// MediCMS Desktop — Finance reports: fees, held money and control (§54.4,
// §54.9, §54.10, §54.11)
// The ledger side of §52 and the two control reports. Fee collection reads the
// ledger's own figures, receivables the same entry fold the ledger prints, held
// money what is not income (§18), and the month-end report is the snapshot saved
// at closing — never a recalculation (§48.3).
// ============================================

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPKR, formatDate } from '@/lib/utils';
import { PROGRAM_OPTIONS } from '@/lib/constants';
import {
  chequesInHandTotal,
  collectedByProgram,
  feeCollection,
  heldForOthers,
  incomingChequeRows,
  receivablesReport,
  reconcilableAccounts,
  reconciledThroughMonth,
  securityDepositsHeld,
  unresolvedLines,
  type ReportDescriptor,
} from '@/lib/finance';
import { useFeeTemplateStore, useLedgerStore, useMoneyStore, useStudentStore } from '@/stores';
import { exportReport, monthEnd, monthName, useReportFilters } from './params';
import { AsAtBar, Figure, MonthBar, PeriodBar, ReportActions, ReportHeading } from './shared';

// -------------------------------------------
// 4. Fee collection (§54.4)
// -------------------------------------------

const MODE_ORDER = ['Cash', 'Bank', 'Online', 'Cheque'] as const;

export function FeeCollectionView({ report }: { report: ReportDescriptor }) {
  const [filters, setFilters] = useReportFilters();
  const entries = useLedgerStore((s) => s.entries);
  const students = useStudentStore((s) => s.students);

  const programLabel = (code: string) => PROGRAM_OPTIONS.find((option) => option.value === code)?.label ?? code;
  const programOf = new Map(students.map((student) => [student.sno, programLabel(student.program)] as const));

  const collection = feeCollection(entries, filters.from, filters.to);
  const collected = collectedByProgram(entries, programOf, filters.from, filters.to);
  const programRows = [...collected].sort((a, b) => b[1] - a[1]);
  const byMode = new Map(collection.byMode.map((row) => [row.mode, row.amount] as const));

  const exportCsv = () => exportReport(report.name, filters, ['Figure', 'Amount'], [
    ['Billed', collection.billed],
    ['Concessions', collection.concessions],
    ['Collected', collection.collected],
    ['Refunded', collection.refunded],
    ['Outstanding today', collection.outstanding],
    ...MODE_ORDER.map((mode) => [`Collected: ${mode}`, byMode.get(mode) ?? 0] as const),
    ...programRows.map(([program, amount]) => [`Collected: ${program}`, amount] as const),
  ]);

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <PeriodBar filters={filters} onChange={setFilters} />
        <p className="text-micro text-slate-400">
          Billed, collected and refunded in the period; outstanding is today’s balance across every entry (§19). A reversed payment is not collected (§7.1).
        </p>
      </CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="The period" description="§54.4 — the ledger's own figures.">
          <CardContent className="space-y-1.5">
            <Figure label="Billed" amount={formatPKR(collection.billed)} />
            <Figure label="Concessions given" amount={formatPKR(collection.concessions)} />
            <Figure label="Collected" amount={formatPKR(collection.collected)} tone="in" />
            <Figure label="Refunded" amount={formatPKR(collection.refunded)} tone="out" />
            <Figure label="Outstanding today" amount={formatPKR(collection.outstanding)} tone="total" />
          </CardContent>
        </Card>

        <Card title="Collected by route" description="§32 — where the money came from.">
          <CardContent className="space-y-1.5">
            {MODE_ORDER.map((mode) => (
              <Figure key={mode} label={mode} amount={formatPKR(byMode.get(mode) ?? 0)} />
            ))}
            <Figure label="Total collected" amount={formatPKR(collection.collected)} tone="total" />
          </CardContent>
        </Card>
      </div>

      <Card title="Collected by program" description="§54.4 — the student's program, from the ledger's payments.">
        <CardContent className="space-y-1.5">
          {programRows.length === 0 && <p className="py-2 text-meta text-slate-400">No fee was collected in this period.</p>}
          {programRows.map(([program, amount]) => (
            <Figure key={program} label={program} amount={formatPKR(amount)} />
          ))}
        </CardContent>
      </Card>

      <p className="text-micro text-slate-400">
        Session, term and counter are not broken out here: a ledger payment carries its mode, and the account it landed in is a money-book fact the fee ledger does not store (§17).
      </p>
    </div>
  );
}

// -------------------------------------------
// Fees owed (§19, §55.3)
// -------------------------------------------

export function ReceivablesView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const students = useStudentStore((s) => s.students);
  const entries = useLedgerStore((s) => s.entries);

  const receivables = receivablesReport({
    students: students.map((s) => ({ sno: s.sno, name: s.name, struckOff: s.struckOff, completed: s.completed, onLeave: s.onLeave })),
    entries,
    today: filters.to,
  });

  const exportCsv = () => exportReport(report.name, filters, ['SNO', 'Student', 'Balance', 'Overdue', 'Active'], receivables.rows.map((row) => [
    row.sno, row.name, row.balance, row.overdue, row.active ? 'yes' : 'no',
  ]));

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <AsAtBar filters={filters} onChange={setFilters} />
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-3">
          <Figure label="Outstanding (active students)" amount={formatPKR(receivables.outstanding)} tone="total" />
          <Figure label="Of which overdue" amount={formatPKR(receivables.overdue)} tone={receivables.overdue > 0 ? 'out' : 'in'} />
          <Figure label="Struck-off dues" amount={formatPKR(receivables.struckOffDues)} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-meta text-slate-500">
          {([['Not yet due', receivables.ageing.notYetDue], ['1 to 30', receivables.ageing.d1to30], ['31 to 60', receivables.ageing.d31to60], ['61 to 90', receivables.ageing.d61to90], ['Over 90', receivables.ageing.over90]] as [string, number][]).map(([label, amount]) => (
            <span key={label}>{label}: <b className="num text-slate-900">{formatPKR(amount)}</b></span>
          ))}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SNO</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receivables.rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-6 text-center text-meta text-slate-400">No student has any ledger entry.</TableCell></TableRow>
            )}
            {receivables.rows.map((row) => (
              <TableRow key={row.sno} className="cursor-pointer" onClick={() => navigate(`/ledger/${row.sno}`)}>
                <TableCell className="num text-slate-500">{row.sno}</TableCell>
                <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                <TableCell className={`text-right num ${row.balance > 0 ? '' : 'text-green-600'}`}>{formatPKR(row.balance)}</TableCell>
                <TableCell className="text-right num text-red-600">{row.overdue ? formatPKR(row.overdue) : '—'}</TableCell>
                <TableCell>
                  <Badge variant={row.active ? 'outline' : 'struckoff'}>{row.active ? 'Active' : 'Not active'}</Badge>
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
// 9. Held money (§18, §55.3)
// -------------------------------------------

export function HeldMoneyView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const students = useStudentStore((s) => s.students);
  const templates = useFeeTemplateStore((s) => s.templates);
  const ledgerEntries = useLedgerStore((s) => s.entries);

  const receivables = receivablesReport({
    students: students.map((s) => ({ sno: s.sno, name: s.name, struckOff: s.struckOff, completed: s.completed, onLeave: s.onLeave })),
    entries: ledgerEntries,
    today: filters.to,
  });
  const depositsHeld = securityDepositsHeld({ students, templates, ledgerEntries });
  const cheques = incomingChequeRows(accounts, entries);
  const chequesInHand = chequesInHandTotal(cheques);
  const total = heldForOthers({ creditHeld: receivables.creditHeld, depositsHeld, chequesInHand });

  const exportCsv = () => exportReport(report.name, filters, ['Figure', 'Amount'], [
    ['Student credit', receivables.creditHeld],
    ['Security deposits held', depositsHeld],
    ['Incoming cheques in hand', chequesInHand],
    ['Total held', total],
  ]);

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <AsAtBar filters={filters} onChange={setFilters} />
        <p className="text-micro text-slate-400">
          Money we hold for someone else is never income. Student credit is a negative ledger balance, a deposit is the refundable part of a plan, and a cheque in hand is not ours until it clears (§5, §18).
        </p>
      </CardContent></Card>

      <Card><CardContent className="space-y-1.5">
        <Figure label="Student credit" amount={formatPKR(receivables.creditHeld)} />
        <Figure label="Security deposits held" amount={formatPKR(depositsHeld)} />
        <Figure label="Incoming cheques in hand" amount={formatPKR(chequesInHand)} />
        <Figure label="Total held for others" amount={formatPKR(total)} tone="total" />
      </CardContent></Card>

      <Card title="Cheques in hand" description="§18 — held until they clear, so never money in.">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cheques.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-meta text-slate-400">No cheque is sitting in hand.</TableCell></TableRow>
              )}
              {cheques.map((row) => (
                <TableRow key={row.held.id} className="cursor-pointer" onClick={() => navigate('/finance/cheques-incoming')}>
                  <TableCell>{formatDate(row.held.date)}</TableCell>
                  <TableCell className="text-slate-700">{row.held.payee ?? '—'}</TableCell>
                  <TableCell className="text-meta text-slate-500">{row.held.reference ?? '—'}</TableCell>
                  <TableCell className="text-meta text-slate-500">{row.status}</TableCell>
                  <TableCell className="text-right num">{formatPKR(row.held.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------------------------------
// 10. Reconciliation (§42, §54.10)
// -------------------------------------------

export function ReconciliationView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const accounts = useMoneyStore((s) => s.accounts);
  const reconciliations = useMoneyStore((s) => s.reconciliations);
  const statementLines = useMoneyStore((s) => s.statementLines);

  const month = filters.month;
  const last = monthEnd(month);
  const banks = reconcilableAccounts(accounts);
  const rows = banks.map((account) => {
    const record = reconciliations.find((rec) => rec.accountId === account.id && rec.month === month && !rec.reopenedAt);
    const lines = statementLines.filter((line) => line.accountId === account.id && line.date <= last);
    const open = unresolvedLines(lines).length;
    return { account, record, open, through: reconciledThroughMonth(reconciliations, account.id) };
  });
  const openLines = rows.reduce((sum, row) => sum + row.open, 0);
  const reconciled = rows.filter((row) => row.record).length;

  const exportCsv = () => exportReport(report.name, filters, ['Account', 'Reconciled through', 'This month', 'Statement balance', 'Book balance', 'Difference', 'Unmatched lines'], rows.map((row) => [
    row.account.name,
    row.through ?? '',
    row.record ? 'yes' : 'no',
    row.record?.statementClosing ?? '',
    row.record?.bookBalance ?? '',
    row.record?.difference ?? '',
    row.open,
  ]));

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        <ReportActions onExport={exportCsv} />
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <MonthBar month={month} onChange={(next) => setFilters({ month: next })} />
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-3">
          <Figure label="Bank accounts reconciled this month" amount={`${reconciled} of ${banks.length}`} />
          <Figure label="Statement lines still unmatched" amount={String(openLines)} tone={openLines > 0 ? 'out' : 'in'} />
          <Figure label="Month to" amount={formatDate(last)} />
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Reconciled through</TableHead>
              <TableHead>This month</TableHead>
              <TableHead className="text-right">Statement</TableHead>
              <TableHead className="text-right">Book</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead className="text-right">Unmatched</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-meta text-slate-400">No bank or wallet account is open.</TableCell></TableRow>
            )}
            {rows.map((row) => (
              <TableRow
                key={row.account.id}
                className="cursor-pointer"
                onClick={() => navigate(`/finance/reconcile/${row.account.id}/${month}`)}
              >
                <TableCell className="font-medium text-slate-900">{row.account.name}</TableCell>
                <TableCell className="text-meta text-slate-500">{row.through ? monthName(row.through) : 'Never'}</TableCell>
                <TableCell>
                  <Badge variant={row.record ? 'cleared' : 'dues'}>{row.record ? 'Reconciled' : 'Open'}</Badge>
                </TableCell>
                <TableCell className="text-right num">{row.record ? formatPKR(row.record.statementClosing) : '—'}</TableCell>
                <TableCell className="text-right num">{row.record ? formatPKR(row.record.bookBalance) : '—'}</TableCell>
                <TableCell className={`text-right num ${row.record && row.record.difference !== 0 ? 'text-red-600' : ''}`}>
                  {row.record ? formatPKR(row.record.difference) : '—'}
                </TableCell>
                <TableCell className={`text-right num ${row.open > 0 ? 'text-amber-600' : ''}`}>{row.open || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="px-3 py-2 text-micro text-slate-400">
          A row opens the reconciliation workspace for that account and month (§42).
        </p>
      </CardContent></Card>
    </div>
  );
}

// -------------------------------------------
// 11. Month-end report (§48.3, §54.11)
// -------------------------------------------

export function MonthEndView({ report }: { report: ReportDescriptor }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useReportFilters();
  const monthClosures = useMoneyStore((s) => s.monthClosures);
  const closure = monthClosures.find((c) => c.month === filters.month);
  const snapshot = closure?.state === 'Closed' ? closure.report : undefined;

  const exportCsv = () => {
    if (!snapshot) return;
    exportReport(report.name, filters, ['Figure', 'Amount'], [
      ['Money in', snapshot.moneyIn],
      ['Money out', snapshot.moneyOut],
      ['Net', snapshot.net],
      ['Owed to us', snapshot.receivables],
      ['We owe', snapshot.payables],
      ['Held for others', snapshot.heldForOthers],
      ['Budget', snapshot.budgetTotal],
      ['Budget used', snapshot.budgetUsed],
      ...snapshot.balances.map((row) => [`Balance: ${row.name}`, row.balance] as const),
    ]);
  };

  return (
    <div className="space-y-4">
      <ReportHeading report={report}>
        {snapshot && <ReportActions onExport={exportCsv} />}
      </ReportHeading>

      <Card><CardContent className="space-y-3">
        <MonthBar month={filters.month} onChange={(next) => setFilters({ month: next })}>
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => navigate(`/finance/month-close?month=${filters.month}`)}>
            Month close
          </Button>
        </MonthBar>
        <p className="text-micro text-slate-400">
          The report is created when the month is closed and never recalculated, so what was signed off stays signed off (§48.3).
        </p>
      </CardContent></Card>

      {!snapshot && (
        <Card><CardContent className="py-8 text-center text-body text-slate-500">
          {monthName(filters.month)} is not closed yet, so it has no month-end report.
          {' '}
          <button type="button" className="text-slate-700 underline-offset-2 hover:underline" onClick={() => navigate(`/finance/month-close?month=${filters.month}`)}>
            Open month close
          </button>
          .
        </CardContent></Card>
      )}

      {snapshot && closure && (
        <>
          <Card title={`${monthName(filters.month)} — the month`} description={`Saved ${formatDate(snapshot.createdAt.slice(0, 10))}${closure.closedBy ? ` by ${closure.closedBy}` : ''}.`}>
            <CardContent className="grid gap-x-8 gap-y-1 md:grid-cols-2">
              <Figure label="Money in" amount={formatPKR(snapshot.moneyIn)} tone="in" />
              <Figure label="Money out" amount={formatPKR(snapshot.moneyOut)} tone="out" />
              <Figure label="Net movement" amount={formatPKR(snapshot.net)} tone="total" />
              <Figure label="Held for others" amount={formatPKR(snapshot.heldForOthers)} />
              <Figure label="Owed to us" amount={formatPKR(snapshot.receivables)} />
              <Figure label="We owe" amount={formatPKR(snapshot.payables)} />
              <Figure label="Budget" amount={formatPKR(snapshot.budgetTotal)} />
              <Figure label="Budget used" amount={formatPKR(snapshot.budgetUsed)} />
            </CardContent>
          </Card>

          <Card title="Balances" description="§13 — every account on the last day of the month.">
            <CardContent className="space-y-1.5">
              {snapshot.balances.map((row) => (
                <Figure key={row.accountId} label={row.name} amount={formatPKR(row.balance)} />
              ))}
            </CardContent>
          </Card>

          <Card title="Review" description="§48.1 — who reviewed and closed the month, and what they noted.">
            <CardContent className="space-y-1 text-meta text-slate-600">
              <p>
                {closure.reviewedBy
                  ? `Reviewed by ${closure.reviewedBy}${closure.reviewedAt ? ` on ${formatDate(closure.reviewedAt.slice(0, 10))}` : ''}.`
                  : 'Not reviewed.'}
              </p>
              <p>{closure.notes ? `“${closure.notes}”` : 'No review notes.'}</p>
              {closure.reopenedAt && (
                <p className="text-amber-700">
                  Reopened by {closure.reopenedBy} — “{closure.reopenReason}”.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
