// ============================================
// MediCMS Desktop — Finance: Bills and expenses (§62.1)
// Every recorded cost is a bill (§26). The list shows the derived status and
// unpaid for each; the tabs and search ride in the page address so a filtered
// view is shareable and the "back" button returns to it (§62). Totals are
// calculated from the bills and payments, never stored (§27).
// ============================================

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import { formatPKR, formatDate } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { useAuthStore, useBillsStore } from '@/stores';
import {
  COST_GROUP_LABELS,
  billStatus,
  costTotals,
  findCategory,
  isOverdue,
  unpaidFor,
  type BillStatus,
} from '@/lib/finance';

const STATUS_VARIANT: Record<BillStatus, BadgeVariant> = {
  Unpaid: 'secondary',
  'Part paid': 'default',
  Paid: 'cleared',
  Cancelled: 'struckoff',
};

type Tab = 'all' | 'unpaid' | 'overdue' | 'paid';

export default function Bills() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const categories = useBillsStore((s) => s.categories);
  const vendors = useBillsStore((s) => s.vendors);
  const role = useAuthStore((s) => s.user?.role);

  const [search, setSearch] = useState(params.get('q') ?? '');
  const tab = (params.get('tab') as Tab) || 'all';
  const today = dayKey();

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('tab'); else p.set('tab', next);
    setParams(p, { replace: true });
  };

  const withMeta = bills
    .map((b) => ({
      bill: b,
      status: billStatus(b, payments),
      unpaid: unpaidFor(b, payments),
      overdue: isOverdue(b, payments, today),
    }))
    .sort((a, b) => (a.bill.date === b.bill.date ? b.bill.no.localeCompare(a.bill.no) : a.bill.date < b.bill.date ? 1 : -1));

  const counts = {
    all: withMeta.length,
    unpaid: withMeta.filter((m) => m.status === 'Unpaid' || m.status === 'Part paid').length,
    overdue: withMeta.filter((m) => m.overdue).length,
    paid: withMeta.filter((m) => m.status === 'Paid').length,
  };

  const filtered = withMeta.filter(({ bill, status, overdue }) => {
    if (tab === 'unpaid' && status !== 'Unpaid' && status !== 'Part paid') return false;
    if (tab === 'overdue' && !overdue) return false;
    if (tab === 'paid' && status !== 'Paid') return false;
    if (search) {
      const q = search.toLowerCase();
      const payee = bill.vendorId ? vendors.find((v) => v.id === bill.vendorId)?.name : bill.payeeText;
      const category = findCategory(categories, bill.categoryId)?.name;
      if (![bill.no, bill.description, payee, category, bill.billNo].some((f) => f?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const totals = costTotals(bills, payments);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-section font-bold text-slate-900">Bills and expenses</h1>
          <p className="text-micro text-slate-500">Every cost is a bill — recorded once, paid now or later (§26).</p>
        </div>
        {can(role, 'finance.bills') && (
          <Button size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/bills/new')}>
            <Plus size={12} className="mr-1.5" /> Record a cost
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Search payee, bill no, description..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="ml-auto flex gap-1.5">
          {(['all', 'unpaid', 'overdue', 'paid'] as Tab[]).map((t) => (
            <Button key={t} variant={tab === t ? 'default' : 'outline'} size="sm" className="h-7 text-meta capitalize" onClick={() => setTab(t)}>
              {t} {counts[t]}
            </Button>
          ))}
        </div>
      </div>

      <Card><CardContent className="py-4">
        <div className="grid grid-cols-3 gap-4">
          <div><div className="text-sm text-slate-500">Recorded</div><div className="text-xl font-bold text-slate-900 mt-1 num">{formatPKR(totals.recorded)}</div></div>
          <div><div className="text-sm text-slate-500">Paid</div><div className="text-xl font-bold text-green-600 mt-1 num">{formatPKR(totals.paid)}</div></div>
          <div><div className="text-sm text-slate-500">Total unpaid</div><div className="text-xl font-bold text-slate-900 mt-1 num">{formatPKR(totals.payable)}</div></div>
        </div>
      </CardContent></Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bill</TableHead>
            <TableHead>Posted</TableHead>
            <TableHead>Payee</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Unpaid</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-meta text-slate-400 py-6">No bills here.</TableCell></TableRow>
          )}
          {filtered.map(({ bill, status, unpaid, overdue }) => {
            const payee = bill.vendorId ? vendors.find((v) => v.id === bill.vendorId)?.name : bill.payeeText;
            const category = findCategory(categories, bill.categoryId);
            return (
              <TableRow key={bill.id} className="cursor-pointer" onClick={() => navigate(`/finance/bills/${bill.id}`)}>
                <TableCell className="font-medium text-slate-900">{bill.no}</TableCell>
                <TableCell className="text-meta text-slate-500">{formatDate(bill.date)}</TableCell>
                <TableCell>{payee ?? '—'}</TableCell>
                <TableCell className="text-meta text-slate-500">{category ? `${COST_GROUP_LABELS[category.group]} › ${category.name}` : '—'}</TableCell>
                <TableCell className="text-right num">{formatPKR(bill.amount)}</TableCell>
                <TableCell className="text-right num">{formatPKR(unpaid)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
                  {overdue && <Badge variant="danger" className="ml-1">Overdue</Badge>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
