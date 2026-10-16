// ============================================
// MediCMS Desktop — Finance: reverse an entry from the book (§34, §6.5)
// Nothing is edited or deleted; a mistake is fixed with a reversal (§34). The
// bank book and cash book are where a wrong hand or setup entry is visible, so
// that is where it is corrected: a lone entry reverses itself, a transfer
// reverses as a pair. The pure posting helpers decide what stands and the
// store's postEntries re-checks the whole book before anything is appended. An
// opening balance, or a reversal above the Accountant's limit, needs an Admin
// (§3, §32, §6.5, §77) who approves with their own password.
// ============================================

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ApproverDialog } from '@/components/finance/ApproverDialog';
import { formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { useAuditStore, useAuthStore, useMoneyStore, useSettingsStore } from '@/stores';
import {
  correctionNeedsAdmin,
  correctionRoute,
  MONEY_ENTRY_LABELS,
  reverseMoneyEntry,
  reverseTransfer,
  type MoneyAccount,
  type MoneyEntry,
  type PostingContext,
} from '@/lib/finance';

export function ReverseEntryDialog({ account, entry, onClose }: { account: MoneyAccount; entry: MoneyEntry; onClose: () => void }) {
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const closedMonths = useMoneyStore((s) => s.closedMonths);
  const limits = useSettingsStore((s) => s.financeLimits);
  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [approver, setApprover] = useState<string | null>(null);

  const route = correctionRoute(entry.kind);
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const baseDraft = (approvedBy?: string) => ({
    targetEntryId: entry.id,
    date: dayKey(),
    reason: reason.trim(),
    createdBy: userName,
    approvedBy,
  });
  const context = (): PostingContext => ({ accounts, entries, closedMonths, now: nowISO() });

  // §34 "shows its effect first" — run the pure reversal so the dialog can read
  // out exactly what will be appended before anything is written.
  const preview = useMemo(() => {
    const draft = baseDraft();
    return route === 'transfer' ? reverseTransfer(context(), draft) : reverseMoneyEntry(context(), draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, entry.id, accounts, entries, closedMonths, reason]);

  const post = (approvedBy?: string) => {
    const result = route === 'transfer' ? reverseTransfer(context(), baseDraft(approvedBy)) : reverseMoneyEntry(context(), baseDraft(approvedBy));
    if (!result.ok) { setProblems(result.errors); setApprover(null); return; }
    const outcome = useMoneyStore.getState().postEntries(result.entries, dayKey());
    if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); setApprover(null); return; }
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Reversed ${MONEY_ENTRY_LABELS[entry.kind]} ${entry.id} on ${account.name} · ${formatPKR(entry.amount)} — ${reason.trim()}${approvedBy ? ` (approved by ${approvedBy})` : ''}`,
    });
    onClose();
  };

  const submit = () => {
    if (!reason.trim()) { setProblems(['A reversal needs a reason (§34).']); return; }
    // §3/§32/§6.5/§77: an opening balance, or a reversal above the limit, needs
    // an Admin's own password before the pair or entry is written.
    if (correctionNeedsAdmin(role ?? '', entry.kind, entry.amount, limits)) {
      setApprover(
        entry.kind === 'OpeningBalance'
          ? `Changing the opening balance of ${account.name} needs an Admin (§6.5).`
          : `Reversing ${formatPKR(entry.amount)} is above your limit of ${formatPKR(limits.accountantOtherEntryLimit)} — an Admin must approve (§32).`,
      );
      return;
    }
    post();
  };

  const effectOk = preview.ok;

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse — {MONEY_ENTRY_LABELS[entry.kind]}</DialogTitle>
            <DialogDescription>
              {route === 'transfer'
                ? 'A transfer is reversed as a pair: both sides stand back together, so no money is created or lost (§34, §9).'
                : 'The entry stays as history; a matching entry in the opposite direction is appended (§34).'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-control border border-hairline bg-slate-50 px-3 py-2 text-meta text-slate-600">
              <div className="flex justify-between"><span>Reversing</span><b className="num">{formatPKR(entry.amount)} · {account.name}</b></div>
              <div className="flex justify-between"><span>Original</span><span>{MONEY_ENTRY_LABELS[entry.kind]} · {entry.date}</span></div>
            </div>

            {/* The effect, read out before it is written (§34). */}
            {effectOk ? (
              <div className="space-y-1">
                <p className="text-meta font-semibold text-slate-700">This will append:</p>
                {preview.entries.map((r) => (
                  <div key={r.id} className="flex justify-between text-body">
                    <span>{r.direction === 'In' ? 'Money in' : 'Money out'} — {accountName(r.accountId)}</span>
                    <b className={`num ${r.direction === 'In' ? 'text-green-600' : 'text-red-600'}`}>{formatPKR(r.amount)}</b>
                  </div>
                ))}
                {preview.warnings.length > 0 && (
                  <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-meta text-amber-800">
                    {preview.warnings.map((w) => <p key={w}>{w}</p>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
                {preview.errors.map((e) => <p key={e}>{e}</p>)}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
                placeholder="Entered in error…"
              />
            </div>

            {problems.length > 0 && (
              <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
                {problems.map((p) => <p key={p}>{p}</p>)}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Keep it</Button>
            <Button variant="destructive" onClick={submit} disabled={!reason.trim() || !effectOk}>
              Post reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {approver !== null && (
        <ApproverDialog
          title="Admin approval"
          blurb={approver}
          onClose={() => setApprover(null)}
          onApprove={(name) => { setApprover(null); post(name); }}
        />
      )}
    </>
  );
}
