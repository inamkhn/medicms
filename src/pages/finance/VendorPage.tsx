// ============================================
// MediCMS Desktop — Finance: Vendor page (§64.2)
// One vendor's derived payable, its ageing, and the bills behind it (§27).
// Everything is calculated from the bills and payments — nothing is stored.
// "Pay out" opens the voucher flow for this vendor (§29, §63); here a vendor is
// only viewed or made Inactive (a vendor with bills is never deleted, §25).
// ============================================

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import { formatPKR, formatDate } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useBillsStore } from '@/stores';
import {
  VENDOR_TYPE_LABELS,
  ageingBuckets,
  billStatus,
  costTotals,
  unpaidFor,
  vendorPayable,
  type BillStatus,
} from '@/lib/finance';

const STATUS_VARIANT: Record<BillStatus, 'secondary' | 'default' | 'cleared' | 'struckoff'> = {
  Unpaid: 'secondary',
  'Part paid': 'default',
  Paid: 'cleared',
  Cancelled: 'struckoff',
};

export default function VendorPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const vendors = useBillsStore((s) => s.vendors);
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const setVendorStatus = useBillsStore((s) => s.setVendorStatus);
  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');
  const canManage = can(role, 'finance.bills');
  const canPay = can(role, 'finance.pay');
  const [busy, setBusy] = useState(false);

  const vendor = vendors.find((v) => v.id === id);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-section font-bold text-slate-900">Vendor not found</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/finance/vendors')}>
          <ArrowLeft size={12} className="mr-1.5" /> Back to Vendors
        </Button>
      </div>
    );
  }

  const today = dayKey();
  const theirBills = bills.filter((b) => b.vendorId === vendor.id);
  const payable = vendorPayable(vendor, bills, payments);
  const ageing = ageingBuckets(bills, payments, vendor.id, today);
  const lifetime = costTotals(theirBills, payments).paid;
  const overdue = theirBills.filter((b) => billStatus(b, payments) !== 'Paid' && billStatus(b, payments) !== 'Cancelled' && b.dueDate && today > b.dueDate).length;

  const toggleStatus = () => {
    setBusy(true);
    const next = vendor.status === 'Active' ? 'Inactive' : 'Active';
    setVendorStatus(vendor.id, next);
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Set vendor ${vendor.name} ${next}` });
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/vendors')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">
              {vendor.name}
              <Badge variant="outline" className="ml-2 text-micro">{VENDOR_TYPE_LABELS[vendor.type]}</Badge>
              {vendor.status === 'Inactive' && <Badge variant="outline" className="ml-1.5 text-micro text-slate-500">Inactive</Badge>}
            </h1>
            <p className="text-micro text-slate-500">Terms {vendor.termsDays} days · payable derived from its bills (§27)</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {canPay && payable > 0 && (
            <Button size="sm" className="h-7 text-meta" onClick={() => navigate(`/finance/pay?vendor=${vendor.id}`)}>Pay out</Button>
          )}
          {canManage && (
            <Button variant="outline" size="sm" className="h-7 text-meta" disabled={busy} onClick={toggleStatus}>
              {vendor.status === 'Active' ? 'Make inactive' : 'Re-activate'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Payable</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatPKR(payable)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Overdue</div>
          <div className={`text-xl font-bold mt-1 ${overdue > 0 ? 'text-red-600' : 'text-slate-900'}`}>{overdue}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Lifetime paid</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatPKR(lifetime)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-sm text-slate-500">Opening payable</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatPKR(vendor.openingPayable ?? 0)}</div>
        </CardContent></Card>
      </div>

      {/* §64.2 — the ageing of what is owed, by how far past due each bill is. */}
      <Card><CardContent className="py-4">
        <div className="text-sm text-slate-500 mb-2">Ageing</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-meta">
          <span>Not yet due <b className="num">{formatPKR(ageing.notYetDue)}</b></span>
          <span>1–30 <b className="num">{formatPKR(ageing.d1to30)}</b></span>
          <span>31–60 <b className="num">{formatPKR(ageing.d31to60)}</b></span>
          <span>61–90 <b className="num">{formatPKR(ageing.d61to90)}</b></span>
          <span>Over 90 <b className="num">{formatPKR(ageing.over90)}</b></span>
        </div>
      </CardContent></Card>

      <div>
        <h2 className="text-section font-semibold text-slate-900 mb-2">Bills</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Unpaid</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {theirBills.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-meta text-slate-400 py-6">No bills for this vendor.</TableCell></TableRow>
            )}
            {theirBills.map((b) => {
              const status = billStatus(b, payments);
              return (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => navigate(`/finance/bills/${b.id}`)}>
                  <TableCell className="font-medium text-slate-900">{b.no}</TableCell>
                  <TableCell className="text-meta text-slate-500">{formatDate(b.date)}</TableCell>
                  <TableCell className="text-meta text-slate-500">{b.dueDate ? formatDate(b.dueDate) : '—'}</TableCell>
                  <TableCell className="text-right num">{formatPKR(b.amount)}</TableCell>
                  <TableCell className="text-right num">{formatPKR(unpaidFor(b, payments))}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[status]}>{status}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
