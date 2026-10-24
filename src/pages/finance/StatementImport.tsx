// ============================================
// MediCMS Desktop — Finance: Import a bank statement (§40, §67.1)
// Four stages in one page — Upload, Check columns, Preview, Done. The columns
// are guessed from the header (§40 "column names are flexible"), bad rows are
// named and skipped, lines before go-live and lines already stored are counted
// rather than added, so importing the same file twice changes nothing (§79.25).
// ============================================

import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import { formatPKR, formatDate } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import {
  accountBalance,
  guessColumns,
  parseStatementCsv,
  reconciledThroughMonth,
  splitCsvRow,
  type StatementLine,
} from '@/lib/finance';
import { useAuditStore, useAuthStore, useMoneyStore } from '@/stores';

export default function StatementImport() {
  const { accountId = '' } = useParams();
  const navigate = useNavigate();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const statementLines = useMoneyStore((s) => s.statementLines);
  const reconciliations = useMoneyStore((s) => s.reconciliations);
  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const account = accounts.find((a) => a.id === accountId);
  const existing = useMemo(
    () => statementLines.filter((line) => line.accountId === accountId),
    [statementLines, accountId],
  );
  // §40/§78.1: the books start at go-live — the earliest opening balance.
  const goLiveDate = useMemo(
    () => entries.filter((e) => e.kind === 'OpeningBalance').map((e) => e.date).sort()[0],
    [entries],
  );

  const parsed = useMemo(
    () => (text.trim() ? parseStatementCsv(text, { goLiveDate, existing }) : null),
    [text, goLiveDate, existing],
  );
  const headerCells = useMemo(() => {
    const first = text.split(/\r?\n/).map((row) => row.trim()).find((row) => row.length > 0);
    return first ? splitCsvRow(first) : [];
  }, [text]);
  const columns = useMemo(() => guessColumns(headerCells), [headerCells]);

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

  if (!can(role, 'finance.reconcile')) {
    return (
      <div className="space-y-4">
        <h1 className="text-section font-bold text-slate-900">Import statement: {account.name}</h1>
        <p className="text-meta text-slate-500">Importing and reconciling is an Admin or Accountant task (§3).</p>
        <Button variant="outline" size="sm" onClick={() => navigate(`/finance/accounts/${account.id}`)}>
          <ArrowLeft size={12} className="mr-1.5" /> Back to the account
        </Button>
      </div>
    );
  }

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setFileName(file.name);
    };
    reader.readAsText(file);
  };

  const stage = !text.trim() ? 1 : parsed && parsed.lines.length === 0 && parsed.errors.length > 0 ? 2 : 3;

  const startMatching = () => {
    if (!parsed || parsed.lines.length === 0) return;
    const state = useMoneyStore.getState();
    const startNo = Number(state.nextStatementLineId().split('-')[1]);
    const lines: Omit<StatementLine, 'id'>[] = parsed.lines.map((line) => ({
      accountId: account.id,
      date: line.date,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
      balance: line.balance,
      reference: line.reference,
      status: 'Unmatched',
    }));
    const ids = lines.map((_, index) => `sl-${startNo + index}`);
    const added = state.addStatementLines(lines);
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Imported ${added} statement lines for ${account.name} (${ids[0]}–${ids[ids.length - 1]})`,
    });
    const month = parsed.lines.map((line) => line.date).sort().slice(-1)[0].slice(0, 7);
    navigate(`/finance/reconcile/${account.id}/${month}`);
  };

  const columnLabel = (index: number) => (index >= 0 ? headerCells[index] ?? `Column ${index + 1}` : 'not in the file');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/finance/accounts/${account.id}`)}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">Import statement: {account.name}</h1>
            <p className="text-micro text-slate-500">
              Stage {stage} of 4 — {stage === 1 ? 'Upload' : stage === 2 ? 'Check columns' : 'Preview'}
              {existing.length > 0 && ` · ${existing.length} lines already stored`}
              {` · reconciled through ${reconciledThroughMonth(reconciliations, account.id) ?? 'never'}`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-micro text-slate-400">Book balance</div>
          <div className="text-body font-bold text-slate-900 num">{formatPKR(accountBalance(entries, account.id))}</div>
        </div>
      </div>

      <Card title="Upload" description={`Paste the CSV the bank gave you, or choose the file (§40). Rows dated before ${goLiveDate ?? 'go-live'} are ignored with a count.`}>
        <CardContent className="space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) readFile(file);
            }}
            className="rounded-control border border-dashed border-hairline bg-slate-50 px-3 py-4 text-center text-meta text-slate-500"
          >
            Drop the CSV here, or{' '}
            <button type="button" className="text-blue-600 hover:underline" onClick={() => fileRef.current?.click()}>choose a file</button>
            {fileName && <span className="ml-2 text-slate-600">({fileName})</span>}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) readFile(file);
                e.target.value = '';
              }}
            />
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setFileName(''); }}
            rows={6}
            placeholder="Date,Description,Debit,Credit,Balance,Reference"
            className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 font-mono text-meta text-ink placeholder:text-ink-subtle"
          />
        </CardContent>
      </Card>

      {headerCells.length > 0 && (
        <Card title="Check columns" description="§40 — the header is matched by name, so a bank's own words are enough.">
          <CardContent className="grid gap-2 text-meta sm:grid-cols-2 lg:grid-cols-3">
            {([
              ['Date', columns.date],
              ['Description', columns.description],
              ['Debit (money out)', columns.debit],
              ['Credit (money in)', columns.credit],
              ['Balance', columns.balance],
              ['Reference', columns.reference],
            ] as [string, number][]).map(([label, index]) => (
              <div key={label} className="flex items-center justify-between gap-2 rounded-control border border-hairline px-3 py-1.5">
                <span className="text-slate-500">{label}</span>
                <Badge variant={index >= 0 ? 'outline' : 'danger'} className="text-micro">{columnLabel(index)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {parsed && (
        <Card
          title="Preview"
          description={`Lines ${parsed.lines.length + parsed.duplicates + parsed.skippedBeforeGoLive} · Valid ${parsed.lines.length} · Errors ${parsed.errors.length} · Duplicates ${parsed.duplicates} · Before go-live ${parsed.skippedBeforeGoLive}`}
        >
          <CardContent className="space-y-4 p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Money out</TableHead>
                  <TableHead className="text-right">Money in</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-meta text-slate-400">
                      Nothing to import from this file yet.
                    </TableCell>
                  </TableRow>
                )}
                {parsed.lines.slice(0, 8).map((line, index) => (
                  <TableRow key={`${line.date}-${index}`}>
                    <TableCell className="text-meta text-slate-500">{formatDate(line.date)}</TableCell>
                    <TableCell>{line.description || '—'}</TableCell>
                    <TableCell className="text-meta text-slate-500">{line.reference ?? '—'}</TableCell>
                    <TableCell className="text-right num">{line.debit > 0 ? formatPKR(line.debit) : '—'}</TableCell>
                    <TableCell className="text-right num">{line.credit > 0 ? formatPKR(line.credit) : '—'}</TableCell>
                    <TableCell className="text-right num text-slate-500">{line.balance === undefined ? '—' : formatPKR(line.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {parsed.lines.length > 8 && (
              <p className="px-6 text-micro text-slate-400">…and {parsed.lines.length - 8} more lines.</p>
            )}
            {parsed.errors.length > 0 && (
              <div className="mx-6 rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-meta text-amber-700">
                {parsed.errors.map((error) => <p key={`${error.row}-${error.message}`}>{error.message}</p>)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(`/finance/accounts/${account.id}`)}>Cancel</Button>
        <Button onClick={startMatching} disabled={!parsed || parsed.lines.length === 0}>
          <FileUp size={14} className="mr-1.5" />
          Import {parsed?.lines.length ?? 0} line{(parsed?.lines.length ?? 0) === 1 ? '' : 's'} and start matching
        </Button>
      </div>

      <p className="text-micro text-slate-400">
        Imported on {formatDate(dayKey())} — lines are stored, never edited; one that does not belong is ignored with a reason (§41.3).
        <span className="ml-1">Logged {nowISO().slice(0, 10)}.</span>
      </p>
    </div>
  );
}
