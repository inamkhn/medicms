// ============================================
// MediCMS Desktop — Finance: Vendors (§25, §64)
// The payees a cost or a payment names. A vendor's payable is always derived
// from its bills (§27), never stored. A vendor with bills is never deleted — it
// is made Inactive (§25). The list links to the vendor page.
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useBillsStore, useSettingsStore } from '@/stores';
import {
  VENDOR_TYPE_LABELS,
  isOverdue,
  nextVendorId,
  vendorPayable,
  type Vendor,
  type VendorType,
} from '@/lib/finance';

const VENDOR_TYPES = Object.keys(VENDOR_TYPE_LABELS) as VendorType[];

// -------------------------------------------
// New vendor (§25)
// -------------------------------------------
function NewVendorDialog({ onClose }: { onClose: () => void }) {
  const limits = useSettingsStore((s) => s.financeLimits);
  const [name, setName] = useState('');
  const [type, setType] = useState<VendorType>('Vendor');
  // §25/§77: the terms box starts at the institute's default payment terms.
  const [terms, setTerms] = useState(String(limits.vendorDefaultTermsDays));
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const submit = () => {
    const state = useBillsStore.getState();
    const vendor: Vendor = {
      id: nextVendorId(state.vendors),
      name: name.trim(),
      type,
      termsDays: parseInt(terms, 10) || limits.vendorDefaultTermsDays,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      status: 'Active',
    };
    const errs = state.addVendor(vendor);
    if (errs.length) { setProblems(errs); return; }
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Added vendor ${vendor.name}` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New vendor</DialogTitle>
          <DialogDescription>A payee a cost or a payment can name (§25).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="City Teaching Hospital" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as VendorType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VENDOR_TYPES.map((t) => <SelectItem key={t} value={t}>{VENDOR_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment terms (days)</Label>
              <Input num value={terms} onChange={(e) => setTerms(e.target.value)} invalid={terms !== '' && !/^\d+$/.test(terms)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()}>Add vendor</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Vendors() {
  const navigate = useNavigate();
  const vendors = useBillsStore((s) => s.vendors);
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const role = useAuthStore((s) => s.user?.role);
  const canManage = can(role, 'finance.bills');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [newOpen, setNewOpen] = useState(false);
  const today = dayKey();

  const rows = vendors
    .map((v) => {
      const payable = vendorPayable(v, bills, payments);
      const overdue = bills.filter((b) => b.vendorId === v.id && isOverdue(b, payments, today)).length;
      return { vendor: v, payable, overdue };
    })
    .filter(({ vendor }) => {
      if (typeFilter !== 'all' && vendor.type !== typeFilter) return false;
      if (statusFilter !== 'all' && vendor.status !== statusFilter) return false;
      if (search && !vendor.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

  const totalPayable = rows.reduce((sum, r) => sum + r.payable, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-section font-bold text-slate-900">Vendors</h1>
          <p className="text-micro text-slate-500">The payees a cost names. A payable is derived from its bills (§25, §27).</p>
        </div>
        {canManage && (
          <Button size="sm" className="h-7 text-meta" onClick={() => setNewOpen(true)}>
            <Plus size={12} className="mr-1.5" /> New vendor
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="w-56" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {VENDOR_TYPES.map((t) => <SelectItem key={t} value={t}>{VENDOR_TYPE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="py-4">
        <div className="text-sm text-slate-500">Total payable</div>
        <div className="text-xl font-bold text-slate-900 mt-1">{formatPKR(totalPayable)}</div>
      </CardContent></Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Payable</TableHead>
            <TableHead className="text-right">Overdue</TableHead>
            <TableHead className="text-right">Terms</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-meta text-slate-400 py-6">No vendors yet.</TableCell></TableRow>
          )}
          {rows.map(({ vendor, payable, overdue }) => (
            <TableRow key={vendor.id} className="cursor-pointer" onClick={() => navigate(`/finance/vendors/${vendor.id}`)}>
              <TableCell className="font-medium text-slate-900">{vendor.name}</TableCell>
              <TableCell className="text-meta text-slate-500">{VENDOR_TYPE_LABELS[vendor.type]}</TableCell>
              <TableCell className="text-right num">{formatPKR(payable)}</TableCell>
              <TableCell className="text-right num">{overdue > 0 ? <Badge variant="danger">{overdue}</Badge> : '—'}</TableCell>
              <TableCell className="text-right text-meta text-slate-500">{vendor.termsDays} days</TableCell>
              <TableCell>{vendor.status === 'Active' ? <Badge variant="cleared">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {newOpen && <NewVendorDialog onClose={() => setNewOpen(false)} />}
    </div>
  );
}
