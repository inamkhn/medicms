// ============================================
// MediCMS Desktop — Finance: the §60.2 "Add bank entry" menu
// The bank ledger is built by the system — "Nobody types a deposit or a
// withdrawal by hand" (§20/§60). The four hand entries the doc allows are the
// only exception: Bank charge, Other receipt, Owner withdrawal (Admin) and Bank
// to bank transfer. The transfer rides its own screen, so this menu opens its
// three typed dialogs and links out for the fourth. Each dialog runs the §3/§77
// role-and-limit rule through the tested core before anything is posted, and
// posting still passes the store's own moneyEntryProblems.
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useMoneyStore, useSettingsStore } from '@/stores';
import {
  bankChargeEntry,
  handEntryProblems,
  nextActionNo,
  nextMoneyEntryNo,
  otherReceiptEntry,
  OTHER_RECEIPT_KINDS,
  ownerWithdrawalEntry,
  type HandEntryKind,
  type MoneyAccount,
  type MoneyEntry,
  type OtherReceiptKind,
} from '@/lib/finance';

type MenuAction = 'charge' | 'receipt' | 'withdrawal';

interface ActionMeta {
  kind: HandEntryKind;
  title: string;
  blurb: string;
  cta: string;
  needsReason: boolean;
  needsReceiptKind: boolean;
  destructive?: boolean;
}

const ACTIONS: Record<MenuAction, ActionMeta> = {
  charge: {
    kind: 'BankCharge',
    title: 'Bank charge',
    blurb: 'A fee the bank took out of this account. Money out, shown under the Bank charges category (§24, §60.2).',
    cta: 'Record bank charge',
    needsReason: false,
    needsReceiptKind: false,
  },
  receipt: {
    kind: 'OtherReceipt',
    title: 'Other receipt',
    blurb: 'A rare deposit that is not a student fee — bank profit, a vendor refund. Money in, kept outside fee income (§20).',
    cta: 'Record other receipt',
    needsReason: true,
    needsReceiptKind: true,
  },
  withdrawal: {
    kind: 'OwnerWithdrawal',
    title: 'Owner withdrawal',
    blurb: 'Money taken out for personal use. This is not a cost, and it shows on its own line in reports (§33).',
    cta: 'Record withdrawal',
    needsReason: true,
    needsReceiptKind: false,
    destructive: true,
  },
};

/** One dialog for the three typed hand entries — the fields that differ are a
 *  reason, an other-receipt kind, and the label the §71 table gives each. */
function HandEntryDialog({ account, action, onClose }: { account: MoneyAccount; action: MenuAction; onClose: () => void }) {
  const meta = ACTIONS[action];
  const limits = useSettingsStore((s) => s.financeLimits);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dayKey());
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [receiptKind, setReceiptKind] = useState<OtherReceiptKind>(OTHER_RECEIPT_KINDS[0]);
  const [problems, setProblems] = useState<string[]>([]);

  const amt = parseInt(amount, 10);
  const role = useAuthStore((s) => s.user?.role);

  const submit = () => {
    const state = useMoneyStore.getState();
    const createdBy = useAuthStore.getState().user?.name ?? 'Admin';
    const gate = handEntryProblems({ kind: meta.kind, role: role ?? '', amount: amt, reason }, limits);
    if (gate.length) { setProblems(gate); return; }

    const series = { entryNo: nextMoneyEntryNo(state.entries), actionNo: nextActionNo(state.entries), now: nowISO() };
    let entry: MoneyEntry;
    if (action === 'charge') {
      entry = bankChargeEntry({ accountId: account.id, amount: amt, note: note.trim() || undefined, date, createdBy }, series);
    } else if (action === 'receipt') {
      entry = otherReceiptEntry({ accountId: account.id, amount: amt, receiptKind, reason: reason.trim(), date, createdBy }, series);
    } else {
      entry = ownerWithdrawalEntry({ accountId: account.id, amount: amt, reason: reason.trim(), date, createdBy }, series);
    }

    const outcome = state.postEntries([entry], dayKey());
    if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); return; }
    useAuditStore.getState().addLog({
      user: createdBy,
      action: 'Finance Entry',
      details: `${meta.title} on ${account.name} · ${formatPKR(amt)} on ${date}${meta.needsReason ? ` — ${reason.trim()}` : ''}`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{meta.title} — {account.name}</DialogTitle>
          <DialogDescription>{meta.blurb}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" min={1} step={1} num inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {meta.needsReceiptKind && (
            <div className="space-y-1.5">
              <Label>Kind *</Label>
              <Select value={receiptKind} onValueChange={(v) => setReceiptKind(v as OtherReceiptKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OTHER_RECEIPT_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {action === 'charge' && (
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Statement fee, cheque book…" />
            </div>
          )}

          {meta.needsReason && (
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
                placeholder={action === 'withdrawal' ? 'Why the owner took this out…' : 'What this deposit was…'}
              />
            </div>
          )}

          {role === 'Accountant' && (
            <p className="text-micro text-slate-400">Your limit for this is {formatPKR(limits.accountantOtherEntryLimit)} — above it an Admin posts it (§3, §77).</p>
          )}

          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={meta.destructive ? 'destructive' : 'default'} onClick={submit} disabled={!Number.isInteger(amt) || amt <= 0}>
            {meta.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** §60.2: the bank page's "Add bank entry" menu — four items only. Owner
 *  withdrawal is Admin-only, so the item itself does not appear for others. */
export function BankEntryMenu({ account }: { account: MoneyAccount }) {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<MenuAction | null>(null);

  if (!can(role, 'finance.pay') || account.status !== 'Active') return null;
  const isBankish = account.type === 'bank' || account.type === 'wallet';
  if (!isBankish) return null;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-meta">
            Add bank entry <ChevronDown size={12} className="ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setOpen(false); setDialog('charge'); }}>Bank charge</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setOpen(false); setDialog('receipt'); }}>Other receipt</DropdownMenuItem>
          {role === 'Admin' && (
            <DropdownMenuItem onSelect={() => { setOpen(false); setDialog('withdrawal'); }}>Owner withdrawal</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { setOpen(false); navigate('/finance/transfer'); }}>Bank to bank transfer</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog && <HandEntryDialog account={account} action={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}
