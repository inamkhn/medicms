// ============================================
// MediCMS Desktop — Finance: Petty cash (§10, §58, §66)
// The petty float: what it is, what is on hand, the suggested top-up and the
// below-25% flag. A purchase is a short voucher form (payee, category, amount up
// to the per-voucher limit) that rides the payment-voucher machinery, so it is
// capped, spend-checked and voidable exactly like any other voucher (§29, §77).
// A top-up is a bank-to-petty transfer (§9); a count brings the account to the
// cash through a Cash difference entry (§10). The register is derived from the
// books — no balance is ever stored (§6.1).
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Plus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApproverDialog } from '@/components/finance/ApproverDialog';
import { formatPKR, formatDate } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useBillsStore, useMoneyStore, useSettingsStore } from '@/stores';
import {
  approvalRequired,
  createPaymentVoucher,
  nextActionNo,
  nextMoneyEntryNo,
  nextVoucherNo,
  pettyCountPosting,
  pettyFloat,
  pettyVoucherProblems,
  pettyVoucherRows,
  postTransfer,
  suggestedTopUp,
  isLowOnFloat,
  type MoneyAccount,
  type PayOutContext,
} from '@/lib/finance';

export default function PettyCash() {
  const navigate = useNavigate();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const role = useAuthStore((s) => s.user?.role);
  const limits = useSettingsStore((s) => s.financeLimits);

  const [dialog, setDialog] = useState<'none' | 'voucher' | 'topup' | 'count' | 'float'>('none');

  const petty = accounts.find((a) => a.type === 'pettyCash' && a.status === 'Active')
    ?? accounts.find((a) => a.type === 'pettyCash');
  const bankAccounts = accounts.filter((a) => a.type === 'bank' && a.status === 'Active');
  const pettyIds = accounts.filter((a) => a.type === 'pettyCash').map((a) => a.id);
  const rows = pettyVoucherRows(entries, pettyIds);

  if (!petty) {
    return (
      <div className="space-y-4">
        <h1 className="text-section font-bold text-slate-900">Petty cash</h1>
        <Card><CardContent className="py-8 text-center text-slate-500">
          <p>Petty cash is optional and this institute does not keep one yet (§10).</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/finance/accounts')}>
            Add a petty cash account
          </Button>
        </CardContent></Card>
      </div>
    );
  }

  const balance = entries.reduce((sum, e) => (e.accountId === petty.id && e.cleared ? sum + (e.direction === 'In' ? e.amount : -e.amount) : sum), 0);
  const float = pettyFloat(petty);
  const suggested = suggestedTopUp(float, balance);
  const low = isLowOnFloat(balance, float, limits.pettyLowWarningPercent);
  const writable = can(role, 'finance.petty') && petty.status === 'Active';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/accounts')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">
              <Wallet size={18} className="mr-1.5 inline-block text-slate-400" />
              {petty.name}
              {petty.status === 'Closed' && <Badge variant="outline" className="ml-1.5 text-micro text-slate-500">Closed</Badge>}
            </h1>
            <p className="text-micro text-slate-500">A small float for daily purchases — the balance is calculated, never stored (§10, §6.1).</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {can(role, 'finance.transfer') && petty.status === 'Active' && (
            <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setDialog('topup')}>
              <ArrowLeftRight size={12} className="mr-1.5" /> Top up
            </Button>
          )}
          {writable && (
            <>
              <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setDialog('count')}>Count cash</Button>
              <Button size="sm" className="h-7 text-meta" onClick={() => setDialog('voucher')}>
                <Plus size={12} className="mr-1.5" /> New voucher
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">Float</div>
            {writable && <Button variant="ghost" size="sm" className="h-6 text-micro" onClick={() => setDialog('float')}>Set</Button>}
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">{float > 0 ? formatPKR(float) : <span className="text-slate-400">not set</span>}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Balance on hand</div>
          <div className={`text-xl font-bold mt-1 ${balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatPKR(balance)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Suggested top-up</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{float > 0 ? formatPKR(suggested) : <span className="text-slate-400">—</span>}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Vouchers</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{rows.length}</div>
        </CardContent></Card>
      </div>

      {low && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm text-amber-800">Below {limits.pettyLowWarningPercent}% of the float — top up to bring petty cash back to {formatPKR(float)} (§66, §77).</span>
          {can(role, 'finance.transfer') && petty.status === 'Active' && (
            <Button variant="outline" size="sm" onClick={() => setDialog('topup')}>Top up {formatPKR(suggested)}</Button>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-8">No petty vouchers yet — a new one appears here (§66).</TableCell>
                </TableRow>
              )}
              {rows.map(({ entry, reversed }) => (
                <TableRow key={entry.id} className={reversed ? 'opacity-60' : ''}>
                  <TableCell>{formatDate(entry.date)}</TableCell>
                  <TableCell>
                    <span className={reversed ? 'line-through text-slate-400' : 'font-medium text-slate-700'}>{entry.linkedDoc ?? '—'}</span>
                    {reversed && <span className="ml-1.5 text-micro text-red-500">voided</span>}
                  </TableCell>
                  <TableCell className="text-slate-500">{entry.payee ?? '—'}</TableCell>
                  <TableCell className="text-slate-500">{entry.category ?? '—'}</TableCell>
                  <TableCell className="text-right text-red-600 font-medium">{formatPKR(entry.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dialog === 'voucher' && <NewVoucherDialog petty={petty} onClose={() => setDialog('none')} />}
      {dialog === 'topup' && <TopUpDialog petty={petty} banks={bankAccounts} suggested={suggested} onClose={() => setDialog('none')} />}
      {dialog === 'count' && <CountDialog petty={petty} onClose={() => setDialog('none')} />}
      {dialog === 'float' && <SetFloatDialog petty={petty} onClose={() => setDialog('none')} />}
    </div>
  );
}

/** §66: the short voucher form — payee, category, amount within the limit. */
function NewVoucherDialog({ petty, onClose }: { petty: MoneyAccount; onClose: () => void }) {
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const closedMonths = useMoneyStore((s) => s.closedMonths);
  const vouchers = useBillsStore((s) => s.vouchers);
  const categories = useBillsStore((s) => s.categories);
  const limits = useSettingsStore((s) => s.financeLimits);
  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const balance = entries.reduce((sum, e) => (e.accountId === petty.id && e.cleared ? sum + (e.direction === 'In' ? e.amount : -e.amount) : sum), 0);
  const pickable = categories.filter((c) => !c.disabled && !c.payrollOnly && !c.automatic);

  const [payee, setPayee] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dayKey());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [approver, setApprover] = useState<string | null>(null);

  const amt = parseInt(amount, 10) || 0;

  const buildCtx = (): PayOutContext => ({
    accounts, entries, bills: [], payments: [], vendors: [], vouchers,
    chequebooks: [], cheques: [], closedMonths,
    role: role ?? '', today: dayKey(), now: nowISO(), limits,
    maxBackDateDays: role === 'Accountant' ? limits.accountantBackDateDays : undefined,
    series: { entryNo: nextMoneyEntryNo(entries), actionNo: nextActionNo(entries), voucherNo: nextVoucherNo(vouchers) },
  });

  const post = (approvedBy?: string) => {
    const result = createPaymentVoucher(
      { vendorId: undefined, payeeText: payee, category, amount: amt, date, mode: 'Cash', accountId: petty.id, reference: note.trim() || undefined, preparedBy: userName, approvedBy },
      buildCtx(),
    );
    if (!result.ok) { setErrors(result.errors); return; }
    if (result.moneyEntry) {
      const outcome = useMoneyStore.getState().postEntries([result.moneyEntry], dayKey());
      if (!outcome.ok) { setErrors(outcome.rejected.flatMap((r) => r.problems)); return; }
    }
    const state = useBillsStore.getState();
    const verrs = state.addVoucher(result.voucher);
    if (verrs.length) { setErrors(verrs); return; }
    state.addPayments(result.payments);
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Petty voucher ${result.voucher.no} ${formatPKR(result.voucher.amount)} · ${result.voucher.payee}${result.voucher.approvedBy ? ` (approved by ${result.voucher.approvedBy})` : ''}` });
    onClose();
  };

  const submit = () => {
    const gate = pettyVoucherProblems({ amount: amt, balance }, limits);
    if (!payee.trim() || !category) gate.unshift('A petty voucher names a payee and a category (§66).');
    if (gate.length) { setErrors(gate); return; }
    if (approvalRequired(role ?? '', amt, limits)) {
      setApprover(`Paying ${formatPKR(amt)} is above your limit of ${formatPKR(limits.accountantPayoutLimit)} — an Admin must approve (§32).`);
      return;
    }
    post();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New petty voucher</DialogTitle>
          <DialogDescription>A purchase out of petty cash, up to {formatPKR(limits.pettyVoucherLimit)} per voucher. It is paid now and appears in the register (§66).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Payee *</Label>
            <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Stationery shop, tea and snacks…" />
          </div>
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Choose a cost category" /></SelectTrigger>
              <SelectContent>
                {pickable.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Up to ${limits.pettyVoucherLimit}`} />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note / bill reference</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="The bill image is attached from the record screen (§61, §66)."
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
            />
          </div>
          <p className="text-micro text-slate-500">Cash on hand {formatPKR(balance)} — a voucher cannot take petty below zero (§10).</p>
          {errors.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {errors.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save voucher</Button>
        </DialogFooter>
      </DialogContent>
      {approver !== null && (
        <ApproverDialog
          title="Admin approval"
          blurb={approver}
          onApprove={(name) => { setApprover(null); post(name); }}
          onClose={() => setApprover(null)}
        />
      )}
    </Dialog>
  );
}

/** §66/§9: a top-up is a bank-to-petty transfer at the suggested amount. */
function TopUpDialog({ petty, banks, suggested, onClose }: { petty: MoneyAccount; banks: MoneyAccount[]; suggested: number; onClose: () => void }) {
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const closedMonths = useMoneyStore((s) => s.closedMonths);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : '');
  const [date, setDate] = useState(dayKey());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const submit = () => {
    const amt = parseInt(amount, 10) || 0;
    if (!bankId) { setErrors(['A top-up comes from a bank account — none is set up yet (§9).']); return; }
    if (amt <= 0) { setErrors(['Enter the amount to move into petty cash (§9).']); return; }
    const result = postTransfer(
      { accounts, entries, closedMonths, now: nowISO() },
      { fromAccountId: bankId, toAccountId: petty.id, amount: amt, date, note: note.trim() || undefined, createdBy: userName },
    );
    if (!result.ok) { setErrors(result.errors); return; }
    const outcome = useMoneyStore.getState().postEntries(result.entries, dayKey());
    if (!outcome.ok) { setErrors(outcome.rejected.flatMap((r) => r.problems)); return; }
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Top-up of petty cash ${formatPKR(amt)} from bank` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Top up petty cash</DialogTitle>
          <DialogDescription>Money from the bank back to the float — a transfer, never income or expense (§9, §10).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>From bank account</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger><SelectValue placeholder="Choose a bank" /></SelectTrigger>
              <SelectContent>
                {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {suggested > 0 && (
                <button type="button" className="text-micro text-blue-600 hover:underline" onClick={() => setAmount(String(suggested))}>
                  Suggested {formatPKR(suggested)}
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
          {errors.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {errors.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Top up</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** §10: count the cash; any difference needs a note and makes a Cash difference entry. */
function CountDialog({ petty, onClose }: { petty: MoneyAccount; onClose: () => void }) {
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const closedMonths = useMoneyStore((s) => s.closedMonths);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const expected = entries.reduce((sum, e) => (e.accountId === petty.id && e.cleared ? sum + (e.direction === 'In' ? e.amount : -e.amount) : sum), 0);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const countedNum = parseInt(counted, 10);
  const difference = Number.isFinite(countedNum) ? countedNum - expected : 0;

  const submit = () => {
    const result = pettyCountPosting(
      { accounts, entries, closedMonths, today: dayKey() },
      { accountId: petty.id, counted: Number.isFinite(countedNum) ? countedNum : NaN, note: note.trim() || undefined, date: dayKey(), createdBy: userName },
      { entryNo: nextMoneyEntryNo(entries), actionNo: nextActionNo(entries), now: nowISO() },
    );
    if (result.errors.length) { setErrors(result.errors); return; }
    if (result.entries.length) {
      const outcome = useMoneyStore.getState().postEntries(result.entries, dayKey());
      if (!outcome.ok) { setErrors(outcome.rejected.flatMap((r) => r.problems)); return; }
    }
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Petty cash count ${formatPKR(countedNum)} · difference ${formatPKR(result.difference)}` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Count petty cash</DialogTitle>
          <DialogDescription>Compare the counted cash with what the books expect; a difference makes a Cash difference entry (§10).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex justify-between text-body">
            <span className="text-slate-500">Expected balance</span>
            <b className="num">{formatPKR(expected)}</b>
          </div>
          <div className="space-y-1.5">
            <Label>Counted cash *</Label>
            <Input type="text" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} />
          </div>
          {difference !== 0 && (
            <div className={`rounded-control border px-3 py-2 text-meta ${difference < 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              {difference < 0 ? `Short by ${formatPKR(-difference)}` : `Over by ${formatPKR(difference)}`} — a note is required (§10).
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Note {difference !== 0 && '*'}</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
            />
          </div>
          {errors.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {errors.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save count</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** §10: set the fixed amount the float is kept at. */
function SetFloatDialog({ petty, onClose }: { petty: MoneyAccount; onClose: () => void }) {
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');
  const [float, setFloat] = useState(petty.float ? String(petty.float) : '');
  const [error, setError] = useState('');

  const submit = () => {
    const value = parseInt(float, 10);
    if (!Number.isInteger(value) || value < 0) { setError('The float is a whole number of rupees (§10).'); return; }
    useMoneyStore.getState().updateAccount(petty.id, { float: value });
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Petty cash float set to ${formatPKR(value)}` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set the float</DialogTitle>
          <DialogDescription>The fixed amount petty cash is kept at, for example 75,000 (§10).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Float</Label>
            <Input type="text" inputMode="numeric" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="75000" />
          </div>
          {error && <p className="text-meta text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
