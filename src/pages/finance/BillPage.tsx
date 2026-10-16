// ============================================
// MediCMS Desktop — Finance: Bill page (§62.2)
// One cost in full: what it is, what has been paid against it, and what is
// still owed — all derived (§27). Corrections are reversals with a reason (§34):
// an unpaid bill is Adjusted or Cancelled here; a paid one is fixed by voiding
// its vouchers on the voucher page (§29, §34). The Payments card lists the
// voucher allocations and links to each voucher.
// ============================================

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatPKR, formatDate } from '@/lib/utils';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useBillsStore } from '@/stores';
import {
  COST_GROUP_LABELS,
  VOUCHER_MODE_LABELS,
  adjustBill,
  billStatus,
  cancelBill,
  findCategory,
  paidFor,
  unpaidFor,
  type Bill,
  type BillStatus,
} from '@/lib/finance';

const STATUS_VARIANT: Record<BillStatus, BadgeVariant> = {
  Unpaid: 'secondary',
  'Part paid': 'default',
  Paid: 'cleared',
  Cancelled: 'struckoff',
};

function CancelDialog({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const submit = () => {
    const state = useBillsStore.getState();
    const result = cancelBill(bill, state.payments, reason);
    if (!result.ok) { setProblems(result.errors); return; }
    state.replaceBill(result.bill);
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Cancelled bill ${bill.no}: ${reason.trim()}` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel bill {bill.no}</DialogTitle>
          <DialogDescription>Only an unpaid bill cancels; a paid one is fixed by voiding its vouchers (§34).</DialogDescription>
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
          <Button variant="outline" onClick={onClose}>Keep bill</Button>
          <Button variant="destructive" onClick={submit} disabled={!reason.trim()}>Cancel bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const submit = () => {
    const state = useBillsStore.getState();
    const result = adjustBill(bill, parseInt(amount, 10) || 0, reason, userName, nowISO());
    if (!result.ok) { setProblems(result.errors); return; }
    state.replaceBill(result.bill);
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Adjusted bill ${bill.no} by ${amount}` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust bill {bill.no}</DialogTitle>
          <DialogDescription>A vendor discount or a correction to the amount. Needs a reason (§27).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount (rupees, negative reduces)</Label>
            <Input num value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-5,000" />
          </div>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!reason.trim() || !amount.trim()}>Save adjustment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BillPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const categories = useBillsStore((s) => s.categories);
  const vendors = useBillsStore((s) => s.vendors);
  const vouchers = useBillsStore((s) => s.vouchers);
  const role = useAuthStore((s) => s.user?.role);
  const canManage = can(role, 'finance.bills');

  const [cancelOpen, setCancelOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const bill = bills.find((b) => b.id === id);
  if (!bill) {
    return (
      <div className="space-y-4">
        <h1 className="text-section font-bold text-slate-900">Bill not found</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/finance/bills')}>
          <ArrowLeft size={12} className="mr-1.5" /> Back to Bills
        </Button>
      </div>
    );
  }

  const status = billStatus(bill, payments);
  const paid = paidFor(bill, payments);
  const unpaid = unpaidFor(bill, payments);
  const category = findCategory(categories, bill.categoryId);
  const payee = bill.vendorId ? vendors.find((v) => v.id === bill.vendorId)?.name : bill.payeeText;
  const applied = payments.filter((p) => p.billId === bill.id);
  // §62.2: a voided voucher leaves the payments but stays on the bill, struck
  // through — the number is never reused (§34).
  const voidedHere = vouchers.filter((v) => v.voided && v.allocations.some((a) => a.billId === bill.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/bills')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">
              {bill.no} · {payee ?? '—'}
              <Badge variant={STATUS_VARIANT[status]} className="ml-2">{status}</Badge>
            </h1>
            <p className="text-micro text-slate-500">{bill.description}</p>
          </div>
        </div>
        {canManage && status === 'Unpaid' && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setAdjustOpen(true)}>Adjust</Button>
            <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setCancelOpen(true)}>Cancel</Button>
          </div>
        )}
      </div>

      <p className="text-meta text-slate-500">
        Posted {formatDate(bill.date)}
        {bill.billDate && <> · Bill date {formatDate(bill.billDate)}</>}
        {bill.dueDate && <> · Due {formatDate(bill.dueDate)}</>}
        {category && <> · Category: {COST_GROUP_LABELS[category.group]} › {category.name}</>}
      </p>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500 mb-2">Amount</div>
          <div className="flex justify-between text-body"><span>Bill</span><b className="num">{formatPKR(bill.amount)}</b></div>
          {bill.adjustments.length > 0 && (
            <div className="flex justify-between text-body text-amber-600"><span>Adjustments</span><b className="num">{formatPKR(bill.adjustments.reduce((s, a) => s + a.amount, 0))}</b></div>
          )}
          <div className="flex justify-between text-body"><span>Paid</span><b className="num text-green-600">{formatPKR(paid)}</b></div>
          <div className="flex justify-between text-body border-t border-slate-100 mt-1 pt-1"><span>Unpaid</span><b className="num">{formatPKR(unpaid)}</b></div>
        </CardContent></Card>

        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500 mb-2">Payments</div>
          {applied.length === 0 ? (
            <p className="text-meta text-slate-400">(none yet — Pay out allocates a voucher here, §29)</p>
          ) : (
            <ul className="space-y-1 text-body">
              {applied.map((p, i) => {
                const voucher = p.voucherNo ? vouchers.find((v) => v.no === p.voucherNo) : undefined;
                return (
                  <li key={i} className="flex justify-between">
                    {voucher ? (
                      <button className="text-left text-blue-600 hover:underline" onClick={() => navigate(`/finance/vouchers/${voucher.id}`)}>
                        {voucher.no} <span className="text-meta text-slate-500">{formatDate(voucher.date)} · {VOUCHER_MODE_LABELS[voucher.mode]}</span>
                      </button>
                    ) : <span>Payment <span className="text-meta text-slate-500">{formatDate(bill.date)}</span></span>}
                    <b className="num">{formatPKR(p.amount)}</b>
                  </li>
                );
              })}
              {voidedHere.map((v) => (
                <li key={v.id} className="flex justify-between line-through text-struckoff">
                  <button className="text-left no-underline" onClick={() => navigate(`/finance/vouchers/${v.id}`)}>
                    {v.no} <span className="text-meta">{formatDate(v.date)} · {VOUCHER_MODE_LABELS[v.mode]} · void</span>
                  </button>
                  <b className="num">{formatPKR(v.allocations.filter((a) => a.billId === bill.id).reduce((sum, a) => sum + a.amount, 0))}</b>
                </li>
              ))}
            </ul>
          )}
          {unpaid > 0 && can(role, 'finance.pay') && (
            <Button variant="outline" size="sm" className="h-7 text-meta mt-2" onClick={() => navigate(`/finance/pay?vendor=${bill.vendorId ?? ''}`)}>
              Pay this bill
            </Button>
          )}
        </CardContent></Card>
      </div>

      {bill.attachments.length > 0 && (
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500 mb-2">Attachments</div>
          <div className="flex flex-wrap gap-1.5">
            {bill.attachments.map((a) => <span key={a} className="rounded-pill bg-hairline-soft px-2 py-0.5 text-micro">{a}</span>)}
          </div>
          {bill.reasonForNoImage && <p className="text-micro text-slate-400 mt-1">No image: {bill.reasonForNoImage}</p>}
        </CardContent></Card>
      )}

      {bill.note && <p className="text-meta text-slate-500">Note: {bill.note}</p>}
      {bill.status === 'Cancelled' && bill.cancelledReason && (
        <p className="text-meta text-struckoff">Cancelled — {bill.cancelledReason}</p>
      )}
      {bill.adjustments.length > 0 && (
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500 mb-2">Adjustments</div>
          <ul className="space-y-1 text-meta">
            {bill.adjustments.map((a, i) => <li key={i}>{formatPKR(a.amount)} — {a.reason} ({a.createdBy})</li>)}
          </ul>
        </CardContent></Card>
      )}

      {cancelOpen && <CancelDialog bill={bill} onClose={() => setCancelOpen(false)} />}
      {adjustOpen && <AdjustDialog bill={bill} onClose={() => setAdjustOpen(false)} />}
    </div>
  );
}
