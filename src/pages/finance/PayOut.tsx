// ============================================
// MediCMS Desktop — Finance: Pay out (§29, §30, §63)
// One page that pays one or more bills of a payee, or a petty payment. It pays
// by cash, bank transfer, cheque or wallet (§30): cash/bank/wallet move money
// out at once; a cheque pays the bill now but leaves the bank balance to
// clearing (§31.2). The amount is allocated across the payee's bills oldest due
// first, or across the bills you choose, and an overpayment becomes vendor
// credit (§27). Above the Accountant's limit an Admin approves with a password
// (§32). One click saves the voucher, its allocation, its money entry (or
// cheque) and the audit entry together, or not at all (§29).
// ============================================

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApproverDialog } from '@/components/finance/ApproverDialog';
import { formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useBillsStore, useMoneyStore, useSettingsStore } from '@/stores';
import {
  ACCOUNT_TYPE_LABELS,
  VOUCHER_MODE_LABELS,
  allocatePayment,
  approvalRequired,
  availableBalance,
  accountBalance,
  createPaymentVoucher,
  nextActionNo,
  nextChequeNo,
  nextMoneyEntryNo,
  nextVoucherNo,
  splitCredit,
  standingVendorCredit,
  unpaidFor,
  vendorPayable,
  type PayOutContext,
  type PayOutDraft,
  type VoucherMode,
} from '@/lib/finance';

const MODES: VoucherMode[] = ['Cash', 'Bank', 'Cheque', 'Wallet'];

export default function PayOut() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const closedMonths = useMoneyStore((s) => s.closedMonths);
  const chequebooks = useMoneyStore((s) => s.chequebooks);
  const issuedCheques = useMoneyStore((s) => s.issuedCheques);
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const vendors = useBillsStore((s) => s.vendors);
  const vouchers = useBillsStore((s) => s.vouchers);
  const limits = useSettingsStore((s) => s.financeLimits);
  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  // §63: the payee is a vendor whose bills are on hand; a free-text payee is the
  // petty payment the user switches to by hand.
  const [payeeMode, setPayeeMode] = useState<'vendor' | 'text'>('vendor');
  const [vendorId, setVendorId] = useState(params.get('vendor') ?? vendors[0]?.id ?? '');
  const [payeeText, setPayeeText] = useState('');
  const [allocMode, setAllocMode] = useState<'oldest' | 'choose'>('oldest');
  const [perBill, setPerBill] = useState<Record<string, string>>({});
  const [amountInput, setAmountInput] = useState('');
  const [date, setDate] = useState(dayKey());
  const [mode, setMode] = useState<VoucherMode>('Cash');
  const [accountId, setAccountId] = useState(() => accounts.find((a) => a.status === 'Active' && (a.type === 'counterCash' || a.type === 'pettyCash'))?.id ?? '');
  const [reference, setReference] = useState('');
  const [chequebookId, setChequebookId] = useState(chequebooks.find((b) => b.status === 'Active')?.id ?? '');
  const [chequeDate, setChequeDate] = useState(dayKey());
  const [acPayee, setAcPayee] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [approver, setApprover] = useState<string | null>(null);
  /** §63: after saving, this page shows the success screen for that voucher. */
  const [savedNo, setSavedNo] = useState<string | null>(null);

  const vendor = vendors.find((v) => v.id === vendorId);
  const activeBooks = chequebooks.filter((b) => b.status === 'Active');
  const book = activeBooks.find((b) => b.id === chequebookId);
  const suggestedCheque = book ? nextChequeNo(book, issuedCheques) : undefined;

  const unpaidBills = (vendor ? bills.filter((b) => b.vendorId === vendor.id) : [])
    .filter((b) => b.status !== 'Cancelled' && unpaidFor(b, payments) > 0);

  const modeAccounts = accounts.filter((a) => {
    if (a.status !== 'Active') return false;
    if (mode === 'Cash') return a.type === 'counterCash' || a.type === 'pettyCash';
    if (mode === 'Bank') return a.type === 'bank';
    if (mode === 'Wallet') return a.type === 'wallet';
    return false;
  });

  const chosenBillIds = Object.keys(perBill).filter((id) => (parseInt(perBill[id], 10) || 0) > 0);
  const perBillNumbers = Object.fromEntries(chosenBillIds.map((id) => [id, parseInt(perBill[id], 10) || 0]));
  const totalAmount = allocMode === 'choose'
    ? Object.values(perBillNumbers).reduce((s, n) => s + n, 0)
    : parseInt(amountInput, 10) || 0;

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const payable = vendor ? vendorPayable(vendor, bills, payments) : 0;
  // §27: the payee's standing credit, shown beside the payable as §63 does.
  const standing = vendor ? standingVendorCredit(vouchers, vendor.id) : 0;

  // §27/§63 preview — what each bill goes to, how much of it the standing credit
  // covers and what is left as credit, worked with the same allocation and the
  // same split the save will use; the header balance never moves.
  const preview = (() => {
    const allocated = allocatePayment(unpaidBills, payments, totalAmount + standing, allocMode === 'choose' ? { billIds: chosenBillIds } : {});
    const appliedTotal = allocated.applied.reduce((sum, a) => sum + a.amount, 0);
    return { applied: allocated.applied, ...splitCredit(appliedTotal, standing, totalAmount) };
  })();
  const creditAfter = standing - preview.creditUsed + preview.credit;
  const bankAvailableAfter = (() => {
    if (mode === 'Bank' && selectedAccount) return accountBalance(entries, selectedAccount.id) - totalAmount;
    if (mode === 'Cheque' && book) return availableBalance(entries, issuedCheques, book.bankAccountId) - totalAmount;
    return undefined;
  })();

  const buildDraft = (approvedBy?: string): PayOutDraft => ({
    vendorId: payeeMode === 'vendor' ? vendorId : undefined,
    payeeText: payeeMode === 'text' ? payeeText : undefined,
    amount: totalAmount,
    date,
    mode,
    accountId: mode === 'Cheque' ? undefined : accountId,
    reference: reference.trim() || undefined,
    chequebookId: mode === 'Cheque' ? chequebookId : undefined,
    chequeNo: mode === 'Cheque' ? (suggestedCheque ?? '') : undefined,
    chequeDate: mode === 'Cheque' ? chequeDate : undefined,
    acPayee: mode === 'Cheque' ? acPayee : undefined,
    perBill: allocMode === 'choose' ? perBillNumbers : undefined,
    preparedBy: userName,
    approvedBy,
  });

  const buildCtx = (): PayOutContext => ({
    accounts, entries, bills, payments, vendors, vouchers,
    chequebooks, cheques: issuedCheques, closedMonths,
    role: role ?? '',
    today: dayKey(), now: nowISO(), limits,
    maxBackDateDays: role === 'Accountant' ? limits.accountantBackDateDays : undefined,
    series: { entryNo: nextMoneyEntryNo(entries), actionNo: nextActionNo(entries), voucherNo: nextVoucherNo(vouchers) },
  });

  const post = (approvedBy?: string) => {
    const result = createPaymentVoucher(buildDraft(approvedBy), buildCtx());
    if (!result.ok) { setErrors(result.errors); return; }
    // All-or-nothing (§29): the riskiest write (money out) goes first.
    if (result.moneyEntry) {
      const outcome = useMoneyStore.getState().postEntries([result.moneyEntry], dayKey());
      if (!outcome.ok) { setErrors(outcome.rejected.flatMap((r) => r.problems)); return; }
    }
    if (result.cheque) {
      const errs = useMoneyStore.getState().addIssuedCheque(result.cheque);
      if (errs.length) { setErrors(errs); return; }
    }
    const state = useBillsStore.getState();
    const verrs = state.addVoucher(result.voucher);
    if (verrs.length) { setErrors(verrs); return; }
    state.addPayments(result.payments);
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Paid ${result.voucher.no} ${formatPKR(result.voucher.amount)} · ${result.voucher.payee} · ${VOUCHER_MODE_LABELS[result.voucher.mode]}${result.voucher.approvedBy ? ` (approved by ${result.voucher.approvedBy})` : ''}`,
    });
    setErrors([]);
    setSavedNo(result.voucher.no);
  };

  // §32/§63: above the Accountant's limit the button asks for approval instead
  // of paying, and the approver box is what it opens.
  const needsApproval = approvalRequired(role ?? '', totalAmount, limits);

  const clickPay = () => {
    // §32/§79.20: above the Accountant's limit an Admin approves before anything posts.
    if (needsApproval) {
      setApprover(`Paying ${formatPKR(totalAmount)} is above your limit of ${formatPKR(limits.accountantPayoutLimit)} — an Admin must approve (§32).`);
      return;
    }
    post();
  };

  const setModeNext = (next: VoucherMode) => {
    setMode(next);
    const first = accounts.find((a) => {
      if (a.status !== 'Active') return false;
      if (next === 'Cash') return a.type === 'counterCash' || a.type === 'pettyCash';
      if (next === 'Bank') return a.type === 'bank';
      if (next === 'Wallet') return a.type === 'wallet';
      return false;
    });
    if (first) setAccountId(first.id);
    if (next === 'Cheque' && !chequebookId) setChequebookId(activeBooks[0]?.id ?? '');
  };

  const canPay = can(role, 'finance.pay') && totalAmount > 0 && !closedMonths.includes(date.slice(0, 7))
    && ((mode === 'Cheque' && !!suggestedCheque) || (mode !== 'Cheque' && !!selectedAccount));

  // §63 success screen: the saved voucher, what the payee still owes, and the
  // three ways on. Read from the store, so the figures are the books' own.
  const saved = savedNo ? vouchers.find((v) => v.no === savedNo) : undefined;
  if (saved) {
    const savedBill = saved.allocations.length ? bills.find((b) => b.id === saved.allocations[0].billId) : undefined;
    const stillOwes = saved.vendorId
      ? vendorPayable(vendors.find((v) => v.id === saved.vendorId) ?? { id: saved.vendorId, name: saved.payee, type: 'Other', termsDays: 0, status: 'Active' }, bills, payments)
      : 0;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-section font-bold text-slate-900">{saved.no} saved</h1>
          <p className="text-micro text-slate-500">The voucher, its allocation and its money entry posted together (§29).</p>
        </div>
        <Card><CardContent className="space-y-1 py-4">
          <div className="flex justify-between text-body"><span>Payee</span><b>{saved.payee}</b></div>
          <div className="flex justify-between text-body"><span>Paid</span><b className="num">{formatPKR(saved.amount)}</b></div>
          <div className="flex justify-between text-body"><span>Mode</span><span>{VOUCHER_MODE_LABELS[saved.mode]}</span></div>
          {saved.credit > 0 && <div className="flex justify-between text-body text-amber-600"><span>Vendor credit</span><b className="num">{formatPKR(saved.credit)}</b></div>}
          <div className="flex justify-between text-body border-t border-slate-100 mt-1 pt-1"><span>Still payable</span><b className="num">{formatPKR(stillOwes)}</b></div>
        </CardContent></Card>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/finance/vouchers/${saved.id}?print=1`)}>Print again</Button>
          <Button variant="outline" onClick={() => { setSavedNo(null); setAmountInput(''); setPerBill({}); }}>
            {savedBill ? 'Pay another bill' : 'Pay another'}
          </Button>
          {savedBill && <Button onClick={() => navigate(`/finance/bills/${savedBill.id}`)}>Open bill</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/bills')}>
          <ArrowLeft size={14} />
        </Button>
        <div>
          <h1 className="text-section font-bold text-slate-900">Pay out</h1>
          <p className="text-micro text-slate-500">Pay one or more bills, or make a petty payment, with a numbered voucher (§29).</p>
        </div>
      </div>

      {/* Payee (§63): a vendor with its payable, or a free-text petty payee. */}
      <Card><CardContent className="space-y-4 py-4">
        <div className="flex gap-2">
          <Button variant={payeeMode === 'vendor' ? 'subtle' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setPayeeMode('vendor')}>Vendor</Button>
          <Button variant={payeeMode === 'text' ? 'subtle' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setPayeeMode('text')}>Petty / free text</Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Payee *</Label>
            {payeeMode === 'vendor' ? (
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Choose vendor" /></SelectTrigger>
                <SelectContent>{vendors.filter((v) => v.status === 'Active').map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Input value={payeeText} onChange={(e) => setPayeeText(e.target.value)} placeholder="Petty cash purchase" />
            )}
          </div>
          <div className="flex items-end justify-end gap-6 text-right">
            <div><div className="text-micro text-slate-500">Payable</div><div className="text-body font-semibold num">{formatPKR(payable)}</div></div>
            <div><div className="text-micro text-slate-500">Vendor credit</div><div className="text-body font-semibold num">{formatPKR(standing)}</div></div>
          </div>
        </div>
      </CardContent></Card>

      {/* Bills to pay — oldest due first, or choose bills (§27/§63). */}
      {vendor && unpaidBills.length > 0 && (
        <Card><CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <div className="text-body font-semibold text-slate-800">Bills to pay</div>
            <div className="flex gap-2">
              <Button variant={allocMode === 'oldest' ? 'subtle' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setAllocMode('oldest')}>Oldest due first</Button>
              <Button variant={allocMode === 'choose' ? 'subtle' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setAllocMode('choose')}>Choose bills</Button>
            </div>
          </div>
          {allocMode === 'choose' ? (
            <ul className="space-y-2">
              {unpaidBills.map((b) => (
                <li key={b.id} className="flex items-center gap-3 text-body">
                  <Checkbox
                    checked={(parseInt(perBill[b.id] ?? '0', 10) || 0) > 0}
                    onCheckedChange={(v) => setPerBill((p) => {
                      const next = { ...p };
                      if (v === true) next[b.id] = next[b.id] || String(unpaidFor(b, payments));
                      else delete next[b.id];
                      return next;
                    })}
                  />
                  <span className="w-24 font-medium">{b.no}</span>
                  <span className="w-40 text-meta text-slate-500">{b.dueDate ? `Due ${b.dueDate}` : ''} · unpaid {formatPKR(unpaidFor(b, payments))}</span>
                  <Input num className="w-32" value={perBill[b.id] ?? ''} onChange={(e) => setPerBill((p) => ({ ...p, [b.id]: e.target.value }))} placeholder="Pay" disabled={!((parseInt(perBill[b.id] ?? '0', 10) || 0) > 0) && perBill[b.id] === undefined} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-1 text-meta text-slate-500">
              {unpaidBills.slice(0, 5).map((b) => <li key={b.id}>{b.no} · unpaid {formatPKR(unpaidFor(b, payments))}</li>)}
            </ul>
          )}
        </CardContent></Card>
      )}

      {/* Amount, date and mode (§30/§63). */}
      <Card><CardContent className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            {allocMode === 'choose' ? (
              <Input num value={String(totalAmount)} readOnly className="bg-slate-50" />
            ) : (
              <Input num value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="Whole rupees" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} invalid={closedMonths.includes(date.slice(0, 7))} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Mode *</Label>
          <div className="flex gap-2">
            {MODES.map((m) => <Button key={m} variant={mode === m ? 'default' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setModeNext(m)}>{VOUCHER_MODE_LABELS[m]}</Button>)}
          </div>
        </div>

        {mode !== 'Cheque' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{mode === 'Cash' ? 'Paid from' : `${VOUCHER_MODE_LABELS[mode]} account`} *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  {modeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {ACCOUNT_TYPE_LABELS[a.type]}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedAccount && <p className="text-micro text-slate-400">Balance {formatPKR(accountBalance(entries, selectedAccount.id))}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={mode === 'Bank' ? 'Transaction ID' : 'Optional'} />
            </div>
          </div>
        )}

        {mode === 'Cheque' && (
          <div className="space-y-3">
            {activeBooks.length === 0 ? (
              <p className="text-meta text-amber-700">No chequebook yet — add one under Issued cheques to pay by cheque (§31.1).</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Chequebook *</Label>
                    <Select value={chequebookId} onValueChange={setChequebookId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{activeBooks.map((b) => { const bank = accounts.find((x) => x.id === b.bankAccountId); return <SelectItem key={b.id} value={b.id}>{b.fromNo}–{b.toNo} · {bank?.name ?? b.bankAccountId}</SelectItem>; })}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cheque number</Label>
                    <Input value={suggestedCheque ?? ''} readOnly className="bg-slate-50" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Cheque date *</Label>
                    <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                    {chequeDate > dayKey() && (
                      <p className="text-micro text-amber-700">Post-dated — it leaves the available balance from its own date (§31.2).</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payee name</Label>
                    <Input value={payeeMode === 'vendor' ? (vendor?.name ?? '') : payeeText} readOnly className="bg-slate-50" />
                  </div>
                  <label className="flex items-center gap-2 pt-6 text-body text-slate-700">
                    <Checkbox checked={acPayee} onCheckedChange={(v) => setAcPayee(v === true)} />
                    A/C payee only (§30)
                  </label>
                </div>
                <p className="text-micro text-slate-400">The bill is paid now; the bank balance changes when the cheque clears (§31.2).</p>
              </>
            )}
          </div>
        )}
      </CardContent></Card>

      {/* Preview (§63): each bill before and after, credit, and available balance. */}
      {totalAmount > 0 && (
        <Card><CardContent className="space-y-1 py-4">
          <div className="text-body font-semibold text-slate-800 mb-1">Preview</div>
          {preview.applied.map((a) => {
            const b = unpaidBills.find((x) => x.id === a.billId);
            if (!b) return null;
            return <div key={a.billId} className="flex justify-between text-body"><span>{b.no}</span><span className="num">{formatPKR(unpaidFor(b, payments))} → {formatPKR(unpaidFor(b, payments) - a.amount)}</span></div>;
          })}
          {preview.creditUsed > 0 && (
            <div className="flex justify-between text-body text-green-600"><span>Standing credit applied</span><b className="num">{formatPKR(preview.creditUsed)}</b></div>
          )}
          {preview.credit > 0 && (
            <div className="flex justify-between text-body text-amber-600">
              <span>This leaves {formatPKR(preview.credit)} as vendor credit. It will be applied to the next bill.</span>
            </div>
          )}
          <div className="flex justify-between text-meta text-slate-500"><span>Vendor credit after</span><b className="num">{formatPKR(creditAfter)}</b></div>
          {bankAvailableAfter !== undefined && <div className="flex justify-between text-meta text-slate-500"><span>Available balance after</span><b className="num">{formatPKR(bankAvailableAfter)}</b></div>}
          {limits.accountantPayoutLimit > 0 && totalAmount <= limits.accountantPayoutLimit && role === 'Accountant' && (
            <div className="text-meta text-green-600 pt-1">({formatPKR(totalAmount)}) is within your limit.</div>
          )}
        </CardContent></Card>
      )}

      {needsApproval && totalAmount > 0 && (
        <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-meta text-amber-800">
          {formatPKR(totalAmount)} is above your payout limit of {formatPKR(limits.accountantPayoutLimit)} — an Admin approves with their password (§32, §77).
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
          {errors.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/finance/bills')}>Cancel</Button>
        <Button onClick={clickPay} disabled={!canPay}>{needsApproval ? 'Request approval' : 'Pay and print voucher'}</Button>
      </div>

      {approver !== null && (
        <ApproverDialog
          title="Admin approval"
          blurb={approver}
          onClose={() => setApprover(null)}
          onApprove={(name) => { setApprover(null); post(name); }}
        />
      )}
    </div>
  );
}
