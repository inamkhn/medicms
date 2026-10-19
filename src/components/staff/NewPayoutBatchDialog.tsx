import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatPKR } from '@/lib/utils';
import { toastError, toastSuccess } from '@/lib/toast';
import { isCashLike } from '@/lib/finance';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { useMoneyStore } from '@/stores/moneyStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { PAYOUT_MODES } from '@/lib/payroll';
import type { PayoutMode } from '@/lib/payroll';

// ============================================
// NewPayoutBatchDialog — STAFF_PAYROLL_DESIGN §55 (/staff/payroll/:id/payouts)
// Assigns some of a run's unpaid lines to ONE batch — a single payout mode and a
// single existing Finance account (§55: one batch per mode+account). The amount
// per line defaults to whatever is still unplanned and may be cut for a partial
// hand-over; the cross-batch never-overpay guard (§64 integrity 7) lives in the
// pure core and the store, so this form only gathers intent. Authorizing pays no
// one — it only marks the batch ready; the money moves at execution in P14.
// ============================================

export interface BatchCandidate {
  payrollLineId: string;
  staffName: string;
  /** Approved net less paid and pending cheques and every other live batch's plan. */
  remaining: number;
}

interface Props {
  runId: string;
  serviceMonth: string;
  candidates: BatchCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewPayoutBatchDialog({ runId, serviceMonth, candidates, open, onOpenChange }: Props) {
  const user = useAuthStore((s) => s.user);
  const accounts = useMoneyStore((s) => s.accounts);
  const balanceOf = useMoneyStore((s) => s.balanceOf);
  const planPayoutBatch = usePayrollStore((s) => s.planPayoutBatch);

  const [mode, setMode] = useState<PayoutMode>('Bank transfer');
  const [chosenAccountId, setChosenAccountId] = useState<string>('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  // A batch draws on accounts of its mode's kind: cash hands from a cash box, a
  // bank transfer or a cheque draws on a bank account (§55).
  const activeAccounts = accounts.filter(
    (a) => a.status === 'Active' && (mode === 'Cash' ? isCashLike(a) : a.type === 'bank'),
  );
  const accountId = activeAccounts.some((a) => a.id === chosenAccountId)
    ? chosenAccountId
    : (activeAccounts[0]?.id ?? '');
  const account = activeAccounts.find((a) => a.id === accountId);

  const chosen = candidates.filter((c) => (amounts[c.payrollLineId] ?? '').trim() !== '');
  const batchTotal = chosen.reduce((sum, c) => sum + (Number(amounts[c.payrollLineId]) || 0), 0);
  const available = accountId ? balanceOf(accountId) : 0;

  function create() {
    const allocations = chosen.map((c) => ({ payrollLineId: c.payrollLineId, amount: Number(amounts[c.payrollLineId]) }));
    if (!accountId) {
      toastError({ title: 'Choose a payout account', description: 'A batch pays out of one existing Finance account (§55).' });
      return;
    }
    if (allocations.length === 0) {
      toastError({ title: 'Enter at least one amount', description: 'Type a rupee figure on a staff line to add it to the batch (§55).' });
      return;
    }
    // §60 the batch-number prefix is a Settings value read at mint time.
    const batchPrefix = useSettingsStore.getState().payrollSettings.batchPrefix;
    const problems = planPayoutBatch({ runId, mode, accountId, allocations }, user?.name ?? 'Unknown', new Date().toISOString(), batchPrefix);
    if (problems.batch === null) {
      toastError({ title: 'Batch not created', description: problems.problems[0] });
      return;
    }
    useAuditStore.getState().addLog({
      user: user?.name ?? 'Unknown',
      action: 'Staff Entry',
      details: `Planned payout batch ${problems.batch.batchNo} for ${serviceMonth} — ${mode}, ${allocations.length} line(s), ${formatPKR(batchTotal)} (§55).`,
    });
    toastSuccess({ title: `Batch ${problems.batch.batchNo} prepared`, description: 'Review the totals, then authorize. No money has moved (§55).' });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New payout batch</DialogTitle>
          <DialogDescription>One mode and one account per batch (§55). Authorizing marks it ready — it does not pay anyone yet.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pb-mode">Payout mode</Label>
              <Select value={mode} onValueChange={(v) => { setMode(v as PayoutMode); setChosenAccountId(''); }}>
                <SelectTrigger id="pb-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYOUT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pb-account">Account</Label>
              <Select value={accountId} onValueChange={setChosenAccountId}>
                <SelectTrigger id="pb-account"><SelectValue placeholder="Choose an account" /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {account && (
                <p className="text-micro text-ink-subtle">
                  Available now {formatPKR(available)}. A cash or bank payout that would overdraw is refused when it posts (§55, §26).
                </p>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff line</TableHead>
                    <TableHead num>Still unplanned</TableHead>
                    <TableHead num>Amount in this batch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => (
                    <TableRow key={c.payrollLineId}>
                      <TableCell>{c.staffName}</TableCell>
                      <TableCell num>{formatPKR(c.remaining)}</TableCell>
                      <TableCell num className="w-40">
                        <Input
                          inputMode="numeric"
                          className="num text-right"
                          placeholder={String(c.remaining)}
                          value={amounts[c.payrollLineId] ?? ''}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [c.payrollLineId]: e.target.value }))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between text-body">
            <span className="text-ink-muted">{chosen.length} line(s) in this batch</span>
            <span className="num font-semibold text-ink">Total {formatPKR(batchTotal)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={chosen.length === 0 || !accountId}>Create batch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
