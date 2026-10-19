import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime, formatDate, formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { toastError, toastSuccess } from '@/lib/toast';
import { useAuditStore } from '@/stores/auditStore';
import { useAuthStore } from '@/stores/authStore';
import { useMoneyStore } from '@/stores/moneyStore';
import { usePayrollStore } from '@/stores/payrollStore';
import { availableBalance, accountBalance, isCashLike, nextActionNo, nextMoneyEntryNo } from '@/lib/finance';
import { advanceSummary, buildAdvancePayment } from '@/lib/payroll';
import type { AdvanceStatus, PayoutMode } from '@/lib/payroll';

// ============================================
// AdvanceDetailDrawer — STAFF_PAYROLL_DESIGN §51.3 / §15 / §67
// The balance is calculated from the linked movement events, never edited here
// (§17). Approve and Pending disbursement move no money. Disbursing does: the
// screen builds the posting with the pure `buildAdvancePayment`, posts the
// StaffAdvance money-out through Finance's `moneyStore.postEntries`, and only
// then applies the payroll side — a failed save posts nothing (§56.2 spirit).
// A cheque advance is issued through the Finance cheque register instead
// (§57.2). Recovery events come from an approved pay run (P11). A cancel is an
// Admin decision with a reason and is refused once any money has moved (§15).
// ============================================

function statusText(state: AdvanceStatus): string {
  if (state === 'Recovered') return 'text-cleared';
  if (state === 'Cancelled') return 'text-ink-subtle';
  if (state === 'Active') return 'text-ink';
  if (state === 'Approved' || state === 'Pending disbursement') return 'text-dues';
  return 'text-ink-muted';
}

function Row({ label, value }: { label: string; value?: ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline-soft py-1.5 last:border-0">
      <span className="text-meta text-ink-muted">{label}</span>
      <span className="text-right text-body text-ink">{value}</span>
    </div>
  );
}

export interface AdvanceDetailDrawerProps {
  open: boolean;
  /** Read live from the store so a status change updates the actions (§51.3). */
  advanceId: string;
  onOpenChange: (open: boolean) => void;
}

export function AdvanceDetailDrawer({ open, advanceId, onOpenChange }: AdvanceDetailDrawerProps) {
  const user = useAuthStore((s) => s.user);
  const advance = usePayrollStore((s) => s.advances.find((a) => a.id === advanceId));
  const staffName = usePayrollStore((s) => s.staff.find((st) => st.id === advance?.staffId)?.fullName ?? '—');
  const events = usePayrollStore((s) => s.advanceEvents);
  const accounts = useMoneyStore((s) => s.accounts);
  const logs = useAuditStore((s) => s.logs);
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [payMode, setPayMode] = useState(false);
  const [payMethod, setPayMethod] = useState<PayoutMode>('Bank transfer');
  const [payAccount, setPayAccount] = useState('');
  const [payDate, setPayDate] = useState(dayKey());
  const [payReference, setPayReference] = useState('');

  if (!advance) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Advance</DialogTitle>
            <DialogDescription>This advance is no longer available.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const mine = events.filter((e) => e.advanceId === advance.id);
  const summary = advanceSummary(mine);
  const disbursed = mine.filter((e) => e.kind === 'Disbursed');
  const recoveries = mine.filter((e) => e.kind !== 'Disbursed');
  const history = logs.filter((l) => l.details.includes(advance.advanceNo)).slice(0, 50);

  const canApprove = advance.status === 'Draft';
  const canPending = advance.status === 'Approved';
  const canCancel = advance.status === 'Draft' || advance.status === 'Approved' || advance.status === 'Pending disbursement';
  const canPay = advance.status === 'Pending disbursement';

  // A non-optional capture for the closures below: past the guard `advance` is
  // defined, but control-flow narrowing does not cross into a function body.
  const rec = advance;

  function transition(to: AdvanceStatus, reason?: string) {
    const actor = user?.name ?? 'Unknown';
    const problems = usePayrollStore.getState().transitionAdvance(rec.id, to, actor, new Date().toISOString());
    if (problems.length) {
      toastError({ title: 'Action refused', description: problems[0] });
      return;
    }
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Staff Entry',
      details: `Advance ${rec.advanceNo} → ${to}${reason ? ` · reason: ${reason}` : ''} (§15)`,
    });
    toastSuccess({ title: `Advance ${to.toLowerCase()}`, description: rec.advanceNo });
    setCancelMode(false);
    setCancelReason('');
  }

  // §15/§67 the only advance action that moves money: the pure core produces
  // the StaffAdvance posting, Finance posts it, and the payroll side applies
  // only after the posting succeeded — a failed save is "Nothing was saved".
  function disburse() {
    const actor = user?.name ?? 'Unknown';
    const m = useMoneyStore.getState();
    const p = usePayrollStore.getState();
    const account = m.accounts.find((a) => a.id === payAccount);
    const available = account
      ? account.type === 'bank'
        ? availableBalance(m.entries, m.issuedCheques, account.id)
        : accountBalance(m.entries, account.id)
      : 0;
    const result = buildAdvancePayment({
      advance: rec,
      method: payMethod,
      accountId: payAccount,
      paymentDate: payDate,
      today: dayKey(),
      account,
      accountAvailable: available,
      reference: payReference,
      series: { entryNo: nextMoneyEntryNo(m.entries), actionNo: nextActionNo(m.entries), now: nowISO() },
      actor,
    });
    if (!result.ok || !result.moneyEntry || !result.event) {
      toastError({ title: 'Nothing was saved (§15)', description: result.problems[0] ?? 'The advance cannot be paid.' });
      return;
    }
    const post = m.postEntries([result.moneyEntry], dayKey());
    if (!post.ok) {
      toastError({ title: 'Nothing was saved (§15)', description: post.rejected.flatMap((r) => r.problems).join(' ') });
      return;
    }
    const applied = p.applyAdvancePayment(rec.id, result.event, result.advancePatch ?? {});
    if (applied.length) {
      toastError({ title: 'The Finance entry posted but the advance did not settle — tell an Admin (§15).', description: `${result.moneyEntry.id}: ${applied[0]}` });
      return;
    }
    useAuditStore.getState().addLog({
      user: actor,
      action: 'Finance Entry',
      details: `Advance ${rec.advanceNo} disbursed — ${formatPKR(result.event.amount)} out of ${account?.name ?? payAccount} on ${payDate} (§15, §67)`,
    });
    if (result.warnings.length) toastError({ title: 'Posted with a warning', description: result.warnings.join(' ') });
    toastSuccess({ title: 'Advance disbursed', description: `${rec.advanceNo} is Active; recovery starts ${rec.startRecoveryMonth} (§15).` });
    setPayMode(false);
    setPayReference('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{advance.advanceNo} — {staffName}</DialogTitle>
          <DialogDescription>
            {advance.status === 'Approved' && summary.balance === 0
              ? 'Approved — awaiting payment. Not yet counted as an outstanding advance (§51.2).'
              : 'Balance is rebuilt from its movement events, never typed (§14, §17).'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview">
          <TabsList className="mx-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="disbursements">Disbursements</TabsTrigger>
            <TabsTrigger value="recoveries">Recoveries</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <div className="max-h-[52vh] overflow-y-auto p-4">
            <TabsContent value="overview">
              <Card>
                <CardContent className="space-y-0 p-4">
                  <Row label="State" value={<span className={statusText(advance.status)}>{advance.status}</span>} />
                  <Row label="Requested" value={formatPKR(advance.requestedAmount)} />
                  <Row label="Approved" value={advance.approvedAmount !== undefined ? formatPKR(advance.approvedAmount) : undefined} />
                  <Row label="Reason" value={advance.reason} />
                  <Row label="Recovery policy" value={advance.recoveryPolicy} />
                  <Row label="Fixed monthly recovery" value={advance.fixedRecoveryAmount !== undefined ? formatPKR(advance.fixedRecoveryAmount) : undefined} />
                  <Row label="Start recovery" value={advance.startRecoveryMonth} />
                  <Row label="Payment mode" value={advance.method} />
                  <Row label="Payment date" value={advance.paymentDate ? formatDate(advance.paymentDate) : undefined} />
                </CardContent>
              </Card>
              <div className="mt-3 rounded-control border border-hairline bg-surface p-3">
                <div className="space-y-0.5 text-body">
                  <div className="flex justify-between"><span className="text-ink-muted">Disbursed</span><span className="num text-ink">{formatPKR(summary.disbursed)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-muted">Recovered</span><span className="num text-ink">{formatPKR(summary.recovered)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-muted">Recovery reversals</span><span className="num text-ink">{formatPKR(summary.reversed)}</span></div>
                  <div className="flex justify-between border-t border-hairline-soft pt-0.5"><span className="text-ink-muted">Outstanding balance</span><span className="num font-semibold text-ink">{formatPKR(summary.balance)}</span></div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="disbursements">
              {disbursed.length === 0 ? (
                <p className="text-body text-ink-muted">No disbursement yet — the money-out is recorded through Finance (§15, §67).</p>
              ) : (
                <ul className="space-y-2">
                  {disbursed.map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between border-b border-hairline-soft pb-2 text-body last:border-0">
                      <span className="text-ink">{formatDate(e.date)}</span>
                      <span className="num text-ink">{formatPKR(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="recoveries">
              {recoveries.length === 0 ? (
                <p className="text-body text-ink-muted">No recoveries yet — these are committed when an approved pay run recovers the advance (§15, P11).</p>
              ) : (
                <ul className="space-y-2">
                  {recoveries.map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between border-b border-hairline-soft pb-2 text-body last:border-0">
                      <span className="text-ink">{e.kind} · {formatDate(e.date)}</span>
                      <span className="num text-ink">{formatPKR(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="history">
              {history.length === 0 ? (
                <p className="text-body text-ink-muted">No recorded actions for this advance.</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((l) => (
                    <li key={l.id} className="border-b border-hairline-soft pb-2 last:border-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-body text-ink">{l.action}</span>
                        <span className="num text-meta text-ink-subtle">{formatDateTime(l.timestamp)}</span>
                      </div>
                      <p className="text-meta text-ink-muted">{l.user} — {l.details}</p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </div>
        </Tabs>

        {payMode && (
          <div className="mx-4 mb-3 space-y-2 rounded-control border border-hairline bg-surface p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-meta text-ink-muted">Method</span>
                <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PayoutMode)}>
                  <SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank transfer">Bank transfer</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <span className="text-meta text-ink-muted">Payout account *</span>
                <Select value={payAccount} onValueChange={setPayAccount}>
                  <SelectTrigger aria-label="Payout account"><SelectValue placeholder="Choose account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.status === 'Active' && (a.type === 'bank' || isCashLike(a))).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <span className="text-meta text-ink-muted">Payment date *</span>
                <Input type="date" max={dayKey()} value={payDate} onChange={(e) => setPayDate(e.target.value)} aria-label="Payment date" />
              </div>
              <div className="space-y-1">
                <span className="text-meta text-ink-muted">Reference</span>
                <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="Optional" aria-label="Reference" />
              </div>
            </div>
            <p className="text-micro text-ink-subtle">
              Posts {formatPKR(advance.approvedAmount ?? advance.requestedAmount)} out through Finance as a staff advance (§67); a cheque advance is written in the Finance cheque register (§57.2).
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayMode(false)}>Cancel</Button>
              <Button onClick={disburse} disabled={!payAccount}>Confirm disbursement</Button>
            </div>
          </div>
        )}

        {cancelMode && (
          <div className="mx-4 mb-2 flex items-center gap-2">
            <Input
              aria-label="Cancel reason"
              placeholder="Reason for cancelling (§15)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <Button
              variant="destructive"
              disabled={!cancelReason.trim()}
              onClick={() => transition('Cancelled', cancelReason.trim())}
            >
              Confirm
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {canCancel && !cancelMode && !payMode && (
            <Button variant="ghost" onClick={() => setCancelMode(true)}>Cancel advance</Button>
          )}
          {canPay && !cancelMode && !payMode && <Button onClick={() => setPayMode(true)}>Disburse advance</Button>}
          {canPending && !cancelMode && !payMode && <Button variant="subtle" onClick={() => transition('Pending disbursement')}>Mark pending disbursement</Button>}
          {canApprove && !cancelMode && !payMode && <Button onClick={() => transition('Approved')}>Approve advance</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
