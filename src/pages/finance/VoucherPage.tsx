// ============================================
// MediCMS Desktop — Finance: Payment voucher page (§29, §34, §63)
// One PV in full: the payee, the mode and account the money left, the bills it
// covered and any vendor credit it left. A live voucher can be voided here: the
// money entry is reversed (or an uncleared cheque cancelled), the bills return
// to unpaid, and the number stays struck through — never reused (§34). Above
// the Accountant's limit the void needs an Admin to approve, like the payment
// itself (§32). Print gives the counter a copy for the payee (§63).
// ============================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ApproverDialog } from '@/components/finance/ApproverDialog';
import { formatPKR, formatDate } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useBillsStore, useMoneyStore, useSettingsStore } from '@/stores';
import {
  VOUCHER_MODE_LABELS,
  reversalApprovalRequired,
  voidVoucher,
  type PaymentVoucher,
  type VoidResult,
} from '@/lib/finance';

function VoidDialog({
  voucher, onClose,
}: { voucher: PaymentVoucher; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [approver, setApprover] = useState<string | null>(null);

  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');
  const limits = useSettingsStore((s) => s.financeLimits);

  const applyVoid = (approvedBy?: string) => {
    const money = useMoneyStore.getState();
    const bills = useBillsStore.getState();
    const result: VoidResult = voidVoucher(
      voucher,
      { accounts: money.accounts, entries: money.entries, closedMonths: money.closedMonths, now: nowISO() },
      money.issuedCheques,
      { reason, date: dayKey(), createdBy: userName, role: role ?? '', limits, approvedBy },
    );
    if (!result.ok) { setProblems(result.errors); return; }
    // All-or-nothing (§29/§34): reverse the money first; if that is refused, nothing else moves.
    if (result.reversal) {
      const outcome = money.postEntries([result.reversal], dayKey());
      if (!outcome.ok) { setProblems(outcome.rejected.flatMap((r) => r.problems)); return; }
    }
    if (result.cancelChequeId) {
      if (!money.cancelIssuedCheque(result.cancelChequeId, `Void ${voucher.no}: ${reason.trim()}`)) {
        setProblems(['The cheque could not be cancelled — it may already have cleared (§34).']);
        return;
      }
    }
    if (!bills.voidVoucher(voucher.no, reason.trim())) {
      setProblems(['This voucher is already void (§34).']);
      return;
    }
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Voided ${voucher.no} ${formatPKR(voucher.amount)}: ${reason.trim()}${approvedBy ? ` (approved by ${approvedBy})` : ''}`,
    });
    onClose();
  };

  const submit = () => {
    // §3/§32: reversing above the Accountant's reversal limit needs an Admin too.
    if (reversalApprovalRequired(role ?? '', voucher.amount, limits)) {
      setApprover(`Voiding ${voucher.no} (${formatPKR(voucher.amount)}) is above your reversal limit of ${formatPKR(limits.accountantOtherEntryLimit)} — an Admin must approve (§32).`);
      return;
    }
    applyVoid();
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Void voucher {voucher.no}</DialogTitle>
            <DialogDescription>
              {voucher.mode === 'Cheque'
                ? 'Cancels the cheque and returns the bills to unpaid. A cheque already cleared is fixed by reversing its bank entry instead (§34).'
                : 'Reverses the money that left and returns the bills to unpaid. The number stays, struck through (§34).'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Entered in error" />
            </div>
            {problems.length > 0 && (
              <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
                {problems.map((p) => <p key={p}>{p}</p>)}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Keep voucher</Button>
            <Button variant="destructive" onClick={submit} disabled={!reason.trim()}>Void voucher</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {approver !== null && (
        <ApproverDialog
          title="Admin approval"
          blurb={approver}
          onClose={() => setApprover(null)}
          onApprove={(name) => { setApprover(null); applyVoid(name); }}
        />
      )}
    </>
  );
}

export default function VoucherPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const printed = useRef(false);
  const vouchers = useBillsStore((s) => s.vouchers);
  const bills = useBillsStore((s) => s.bills);
  const vendors = useBillsStore((s) => s.vendors);
  const accounts = useMoneyStore((s) => s.accounts);
  const issuedCheques = useMoneyStore((s) => s.issuedCheques);
  const role = useAuthStore((s) => s.user?.role);
  const canPay = can(role, 'finance.pay');

  const [voidOpen, setVoidOpen] = useState(false);

  // §63: a payment prints its voucher on success. The dialog opens itself only
  // when the address asks for it, so an ordinary visit never steals one.
  useEffect(() => {
    if (params.get('print') === '1' && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [params]);

  const voucher = vouchers.find((v) => v.id === id);
  if (!voucher) {
    return (
      <div className="space-y-4">
        <h1 className="text-section font-bold text-slate-900">Voucher not found</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/finance/vouchers')}>
          <ArrowLeft size={12} className="mr-1.5" /> Back to Vouchers
        </Button>
      </div>
    );
  }

  const account = voucher.accountId ? accounts.find((a) => a.id === voucher.accountId) : undefined;
  const cheque = voucher.chequeId ? issuedCheques.find((c) => c.id === voucher.chequeId) : undefined;
  const vendor = voucher.vendorId ? vendors.find((v) => v.id === voucher.vendorId) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/vouchers')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">
              {voucher.no} · {voucher.payee}
              {voucher.voided
                ? <Badge variant="struckoff" className="ml-2">Void</Badge>
                : <Badge variant="cleared" className="ml-2">Paid</Badge>}
            </h1>
            <p className="text-micro text-slate-500">{VOUCHER_MODE_LABELS[voucher.mode]} payment · {formatDate(voucher.date)}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => window.print()}>
            <Printer size={12} className="mr-1.5" /> Print
          </Button>
          {canPay && !voucher.voided && (
            <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setVoidOpen(true)}>Void</Button>
          )}
        </div>
      </div>

      {voucher.voided && voucher.voidReason && (
        <p className="text-meta text-struckoff">Voided — {voucher.voidReason}</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500 mb-2">Payment</div>
          <div className="flex justify-between text-body"><span>Amount</span><b className={`num ${voucher.voided ? 'line-through text-struckoff' : ''}`}>{formatPKR(voucher.amount)}</b></div>
          <div className="flex justify-between text-body"><span>Mode</span><span>{VOUCHER_MODE_LABELS[voucher.mode]}</span></div>
          {account && <div className="flex justify-between text-body"><span>Account</span><span>{account.name}</span></div>}
          {cheque && <div className="flex justify-between text-body"><span>Cheque</span><span>{cheque.chequeNo} · {cheque.status}</span></div>}
          {voucher.reference && <div className="flex justify-between text-body"><span>Reference</span><span>{voucher.reference}</span></div>}
          {vendor && <div className="flex justify-between text-body"><span>Vendor</span><span>{vendor.name}</span></div>}
        </CardContent></Card>

        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500 mb-2">Prepared / approved</div>
          <div className="flex justify-between text-body"><span>Prepared by</span><span>{voucher.preparedBy}</span></div>
          {voucher.approvedBy && <div className="flex justify-between text-body"><span>Approved by</span><span>{voucher.approvedBy}</span></div>}
          <div className="flex justify-between text-body"><span>Posted</span><span className="text-meta text-slate-500">{formatDate(voucher.createdAt.slice(0, 10))}</span></div>
          {(voucher.creditUsed ?? 0) > 0 && (
            <div className="flex justify-between text-body border-t border-slate-100 mt-1 pt-1"><span>From standing credit</span><b className="num text-green-600">{formatPKR(voucher.creditUsed ?? 0)}</b></div>
          )}
          {voucher.credit > 0 && (
            <div className="flex justify-between text-body border-t border-slate-100 mt-1 pt-1"><span>Vendor credit left</span><b className="num text-amber-600">{formatPKR(voucher.credit)}</b></div>
          )}
        </CardContent></Card>
      </div>

      <Card><CardContent className="py-4">
        <div className="text-sm text-slate-500 mb-2">Bills covered</div>
        {voucher.allocations.length === 0 ? (
          <p className="text-meta text-slate-400">(a petty or credit payment — no bill split)</p>
        ) : (
          <ul className="space-y-1 text-body">
            {voucher.allocations.map((a, i) => {
              const b = bills.find((x) => x.id === a.billId);
              return <li key={i} className="flex justify-between"><span>{b ? b.no : a.billId}</span><b className="num">{formatPKR(a.amount)}</b></li>;
            })}
          </ul>
        )}
      </CardContent></Card>

      {voidOpen && <VoidDialog voucher={voucher} onClose={() => setVoidOpen(false)} />}
    </div>
  );
}
