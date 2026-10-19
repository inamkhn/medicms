import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatPKR } from '@/lib/utils';
import { useMoneyStore } from '@/stores/moneyStore';
import { usePayrollStore } from '@/stores/payrollStore';
import type { PayoutBatchState } from '@/lib/payroll';

// ============================================
// Payouts — STAFF_PAYROLL_DESIGN §56 (/staff/payouts)
// The payout register. Who may reach it (payroll.payout.summary) is Admin and the
// Accountant; both see only what is aggregate-safe: a batch's month, mode, account,
// how many recipients and the rupee total — never a named person's pay (§27, §43,
// integrity 8). The named allocations are revealed on the batch page, and only
// through the projection that drops them for a non-Admin. Count and total are
// derived from the allocations, so they can never drift (§64).
// ============================================

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

function batchText(state: PayoutBatchState): string {
  if (state === 'Executed') return 'text-cleared';
  if (state === 'Cancelled') return 'text-ink-subtle';
  if (state === 'Authorized' || state === 'Part executed') return 'text-dues';
  return 'text-ink';
}

export default function Payouts() {
  const navigate = useNavigate();
  const runs = usePayrollStore((s) => s.runs);
  const batches = usePayrollStore((s) => s.payoutBatches);
  const allocations = usePayrollStore((s) => s.payoutAllocations);
  const accounts = useMoneyStore((s) => s.accounts);

  const accountName = (accountId: string) => accounts.find((a) => a.id === accountId)?.name ?? accountId;

  const rows = batches.map((batch) => {
    const batchAllocations = allocations.filter((a) => a.batchId === batch.id);
    const run = runs.find((r) => r.id === batch.runId);
    return {
      batch,
      month: run ? monthLabel(run.serviceMonth) : '—',
      recipients: batchAllocations.length,
      total: batchAllocations.reduce((sum, a) => sum + a.authorizedAmount, 0),
    };
  }).sort((a, b) => (a.batch.batchNo < b.batch.batchNo ? 1 : -1));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-title font-semibold text-ink">Payouts</h1>
        <p className="text-meta text-ink-muted">Payout batches across every run. Counts and totals only — individual pay stays private (§27, §43).</p>
      </div>

      <Card>
        <CardContent className="p-4">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-body text-ink-muted">No payout batches yet. Plan one from an approved run (§55).</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Service month</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead num>Recipients</TableHead>
                  <TableHead num>Authorized total</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ batch, month, recipients, total }) => (
                  <TableRow key={batch.id} className="cursor-pointer" onClick={() => navigate(`/staff/payouts/${batch.id}`)}>
                    <TableCell className="num">{batch.batchNo}</TableCell>
                    <TableCell>{month}</TableCell>
                    <TableCell>{batch.mode}</TableCell>
                    <TableCell>{accountName(batch.accountId)}</TableCell>
                    <TableCell num>{recipients}</TableCell>
                    <TableCell num>{formatPKR(total)}</TableCell>
                    <TableCell><span className={batchText(batch.state)}>{batch.state}</span></TableCell>
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
