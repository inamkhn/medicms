// ============================================
// MediCMS Desktop — Ledger check (§7.3, §10, §66 case 20)
//
// "The balance is always calculated from entries. If a stored copy is kept for
// speed, it is rebuilt automatically and can be checked with the ledger check
// tool (Admin), which recalculates every student and lists any difference."
//
// Admin only (§3). It recalculates from `runLedgerCheck` and changes nothing: a
// difference names the student and the entry where the stored copy parted
// company with the arithmetic, and a broken rule is reported entry by entry.
// ============================================

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatPKR, cn } from '@/lib/utils';
import { todayKey } from '@/lib/dates';
import { runLedgerCheck } from '@/lib/ledger';
import { useLedgerStore, useStudentStore } from '@/stores';

export default function LedgerCheck() {
  const navigate = useNavigate();
  const students = useStudentStore((s) => s.students);
  const entries = useLedgerStore((s) => s.entries);

  const today = todayKey();
  const result = useMemo(
    () => runLedgerCheck(students.map((s) => ({ sno: s.sno, name: s.name })), entries, { today }),
    [students, entries, today],
  );

  const nameOf = (sno: number) => students.find((s) => s.sno === sno)?.name ?? `SNO ${sno}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/ledger')} title="Ledger">
          <ArrowLeft size={14} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-ui font-bold text-ink tracking-tight">Ledger check</h1>
          <p className="text-micro text-ink-muted">
            Every student recalculated from their entries. Any difference is named, never silently fixed (§7.3).
          </p>
        </div>
        <Badge variant={result.ok ? 'cleared' : 'danger'} className="ml-1">
          {result.checked} {result.checked === 1 ? 'student' : 'students'} checked
        </Badge>
      </div>

      {/* §10: "reports zero differences on correct data and names any student that differs". */}
      <Card>
        <CardContent className={cn('flex items-center gap-3 py-3', result.ok ? 'text-cleared' : 'text-danger')}>
          {result.ok ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
          <div>
            <div className="text-body font-semibold">
              {result.ok
                ? 'Zero differences — every stored balance matches the arithmetic.'
                : `${result.differences.length} ${result.differences.length === 1 ? 'balance differs' : 'balances differ'} and ${result.problems.length} ${result.problems.length === 1 ? 'rule is' : 'rules are'} broken.`}
            </div>
            <div className="text-micro text-ink-muted">
              {result.ok
                ? 'Nothing to fix. The tool reads and recalculates; it never writes (§7.3).'
                : 'Nothing here was changed. Fix each entry with a reversal, or rebuild the stored copy (§7.3).'}
            </div>
          </div>
        </CardContent>
      </Card>

      {result.differences.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-hairline-soft px-3 py-2 text-meta font-semibold text-ink">
              Balance differences
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead className="text-right">Stored</TableHead>
                  <TableHead className="text-right">Recomputed</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead className="text-right">At entry</TableHead>
                  <TableHead className="text-right">Closing balance</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.differences.map((row) => (
                  <TableRow key={row.studentSno}>
                    <TableCell className="text-meta text-ink">{row.name}</TableCell>
                    <TableCell className="num text-right text-meta">{formatPKR(row.stored)}</TableCell>
                    <TableCell className="num text-right text-meta text-ink">{formatPKR(row.recomputed)}</TableCell>
                    <TableCell className={cn('num text-right text-meta font-medium', row.delta > 0 ? 'text-dues' : 'text-credit')}>
                      {row.delta > 0 ? '+' : ''}{formatPKR(row.delta)}
                    </TableCell>
                    <TableCell className="num text-right text-meta text-ink-secondary">{row.atEntryNo}</TableCell>
                    <TableCell className={cn('num text-right text-meta font-medium', row.closingBalance > 0 ? 'text-dues' : 'text-credit')}>
                      {formatPKR(row.closingBalance)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-meta" onClick={() => navigate(`/ledger/${row.studentSno}`)}>
                        Open ledger
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {result.problems.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-hairline-soft px-3 py-2 text-meta font-semibold text-ink">
              Entry rules broken
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>What is wrong</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.problems.map((problem, index) => (
                  <TableRow key={`${problem.entryId}-${index}`}>
                    <TableCell className="text-meta text-ink">{nameOf(problem.studentSno)}</TableCell>
                    <TableCell className="text-meta text-ink-secondary">
                      <button type="button" className="underline-offset-2 hover:underline" onClick={() => navigate(`/ledger/${problem.studentSno}?highlight=${problem.entryId}`)}>
                        {problem.entryId}
                      </button>
                    </TableCell>
                    <TableCell className="text-meta text-ink-secondary">{problem.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-micro text-ink-muted">
        Admin only (§3). The check reads the entries, rebuilds each balance and reports — an entry that breaks a §5 / §6 /
        §7 rule, a link that crosses students, and two entries sharing a number all appear above.
      </p>
    </div>
  );
}
