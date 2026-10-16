// ============================================
// MediCMS Desktop — Finance: Payment vouchers register (§29, §63)
// Every payment out is a numbered PV. The register lists them newest first with
// the derived payee, amount, mode and status; a void stays in the list struck
// through and its number is never reused (§29, §34). Filters ride in the page
// address so a view is shareable and "back" returns to it (§62). Totals are
// calculated from the live vouchers, never stored.
// ============================================

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import { formatPKR, formatDate } from '@/lib/utils';
import { can } from '@/lib/permissions';
import { useAuthStore, useBillsStore } from '@/stores';
import { VOUCHER_MODE_LABELS } from '@/lib/finance';

type Tab = 'all' | 'live' | 'void';

export default function Vouchers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const vouchers = useBillsStore((s) => s.vouchers);
  const role = useAuthStore((s) => s.user?.role);

  const [search, setSearch] = useState(params.get('q') ?? '');
  const tab = (params.get('tab') as Tab) || 'all';

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('tab'); else p.set('tab', next);
    setParams(p, { replace: true });
  };

  const sorted = vouchers.slice().sort((a, b) => (a.date === b.date ? b.no.localeCompare(a.no) : a.date < b.date ? 1 : -1));

  const counts = {
    all: sorted.length,
    live: sorted.filter((v) => !v.voided).length,
    void: sorted.filter((v) => v.voided).length,
  };

  const filtered = sorted.filter((v) => {
    if (tab === 'live' && v.voided) return false;
    if (tab === 'void' && !v.voided) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![v.no, v.payee, v.reference, VOUCHER_MODE_LABELS[v.mode]].some((f) => f?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const paidTotal = filtered.filter((v) => !v.voided).reduce((sum, v) => sum + v.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-section font-bold text-slate-900">Payment vouchers</h1>
          <p className="text-micro text-slate-500">Every payment out carries a numbered PV (§29).</p>
        </div>
        {can(role, 'finance.pay') && (
          <Button size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/pay')}>
            <Plus size={12} className="mr-1.5" /> Pay out
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Search PV no, payee, reference..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="ml-auto flex gap-1.5">
          {(['all', 'live', 'void'] as Tab[]).map((t) => (
            <Button key={t} variant={tab === t ? 'default' : 'outline'} size="sm" className="h-7 text-meta capitalize" onClick={() => setTab(t)}>
              {t} {counts[t]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6 text-right">
        <div><div className="text-sm text-slate-500">Paid (this view)</div><div className="text-xl font-bold text-slate-900 mt-1 num">{formatPKR(paidTotal)}</div></div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Voucher</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Payee</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-meta text-slate-400 py-6">No vouchers here.</TableCell></TableRow>
          )}
          {filtered.map((v) => (
            <TableRow key={v.id} className="cursor-pointer" onClick={() => navigate(`/finance/vouchers/${v.id}`)}>
              <TableCell className="font-medium text-slate-900">{v.no}</TableCell>
              <TableCell className="text-meta text-slate-500">{formatDate(v.date)}</TableCell>
              <TableCell className={v.voided ? 'line-through text-struckoff' : undefined}>{v.payee}</TableCell>
              <TableCell className="text-meta text-slate-500">{VOUCHER_MODE_LABELS[v.mode]}</TableCell>
              <TableCell className={`text-right num ${v.voided ? 'line-through text-struckoff' : ''}`}>{formatPKR(v.amount)}</TableCell>
              <TableCell>{v.voided ? <Badge variant="struckoff">Void</Badge> : <Badge variant="cleared">Paid</Badge>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
