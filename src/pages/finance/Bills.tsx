// ============================================
// MediCMS Desktop — Finance: Bills and expenses (§62.1, §28)
// Every recorded cost is a bill (§26). The list shows the derived status and
// unpaid for each; the tabs and search ride in the page address so a filtered
// view is shareable and the "back" button returns to it (§62). Totals are
// calculated from the bills and payments, never stored (§27). The Recurring tab
// is §28: the reminders that are open, and the templates behind them — the
// reminder opens a bill already filled in, and nothing is ever posted by itself.
// ============================================

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPKR, formatDate } from '@/lib/utils';
import { PROGRAM_OPTIONS } from '@/lib/constants';
import { dayKey, isThisMonth } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useBillsStore } from '@/stores';
import {
  COST_GROUP_LABELS,
  billStatus,
  costTotals,
  findCategory,
  isOverdue,
  manualCostBlockReason,
  recurringDue,
  recurringNotice,
  unpaidFor,
  type BillStatus,
  type RecurringBill,
} from '@/lib/finance';

const STATUS_VARIANT: Record<BillStatus, BadgeVariant> = {
  Unpaid: 'secondary',
  'Part paid': 'default',
  Paid: 'cleared',
  Cancelled: 'struckoff',
};

type Tab = 'all' | 'unpaid' | 'overdue' | 'paid' | 'recurring';

// The program summary drills in with the label it showed (§54.12); a bill keeps
// the code, so search must understand both spellings.
const programLabel = (code: string) => PROGRAM_OPTIONS.find((option) => option.value === code)?.label ?? code;

export default function Bills() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const categories = useBillsStore((s) => s.categories);
  const vendors = useBillsStore((s) => s.vendors);
  const recurring = useBillsStore((s) => s.recurring);
  const role = useAuthStore((s) => s.user?.role);
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);

  const [search, setSearch] = useState(params.get('q') ?? '');
  const tab = (params.get('tab') as Tab) || 'all';
  // §16: the dashboard's "Expenses this month" click-through arrives as ?month=this
  // and must land on exactly that list.
  const monthThis = params.get('month') === 'this';
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

  // §28: the reminders that are open — a template whose bill for the month is
  // still not recorded, from a few days before its day.
  const dues = recurringDue(recurring, { today });
  const payeeOf = (template: RecurringBill) =>
    template.vendorId ? vendors.find((v) => v.id === template.vendorId)?.name ?? '—' : template.payeeText ?? '—';
  const categoryOf = (template: RecurringBill) => findCategory(categories, template.categoryId)?.name ?? '—';

  const filtered = withMeta.filter(({ bill, status, overdue }) => {
    if (tab === 'unpaid' && status !== 'Unpaid' && status !== 'Part paid') return false;
    if (tab === 'overdue' && !overdue) return false;
    if (tab === 'paid' && status !== 'Paid') return false;
    if (monthThis && !isThisMonth(bill.date)) return false;
    if (search) {
      const q = search.toLowerCase();
      const payee = bill.vendorId ? vendors.find((v) => v.id === bill.vendorId)?.name : bill.payeeText;
      const category = findCategory(categories, bill.categoryId)?.name;
      const program = bill.program ? [bill.program, programLabel(bill.program)] : [];
      if (![bill.no, bill.description, payee, category, bill.billNo, ...program].some((f) => f?.toLowerCase().includes(q))) return false;
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
        {monthThis && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-meta"
            onClick={() => {
              const p = new URLSearchParams(params);
              p.delete('month');
              setParams(p, { replace: true });
            }}
          >
            This month <X size={12} className="ml-1" />
          </Button>
        )}
        <div className="ml-auto flex gap-1.5">
          {(['all', 'unpaid', 'overdue', 'paid', 'recurring'] as Tab[]).map((t) => (
            <Button key={t} variant={tab === t ? 'default' : 'outline'} size="sm" className="h-7 text-meta capitalize" onClick={() => setTab(t)}>
              {t} {t === 'recurring' ? dues.length : counts[t]}
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

      {tab === 'recurring' && (
        <div className="space-y-4">
          <Card
            title="Due now"
            description="§28 — nothing is posted by itself; a reminder opens a bill already filled in."
            actions={can(role, 'finance.bills') && (
              <Button size="sm" className="h-7 text-meta" onClick={() => setNewTemplateOpen(true)}>
                <Plus size={12} className="mr-1.5" /> New recurring bill
              </Button>
            )}
          >
            <CardContent className="space-y-0">
              {dues.length === 0 && <p className="text-meta text-slate-400">{recurringNotice(0)}</p>}
              {dues.map((due) => (
                <div key={`${due.template.id}-${due.month}`} className="flex items-center justify-between gap-3 border-b border-hairline-soft py-2 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-slate-900">{due.template.description}</p>
                    <p className="text-micro text-slate-500">
                      {payeeOf(due.template)} · {categoryOf(due.template)} · expected {formatDate(due.dueDate)}
                      {due.late && <span className="text-amber-700"> · late</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="num text-meta text-slate-600">
                      {due.amount === undefined ? 'Enter the amount' : formatPKR(due.amount)}
                    </span>
                    <Button
                      size="sm"
                      className="h-7 text-meta"
                      disabled={!can(role, 'finance.bills')}
                      onClick={() => navigate(`/finance/bills/new?recurring=${due.template.id}&date=${due.dueDate}`)}
                    >
                      Enter the bill
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card title="Templates" description="§28 — a payee, a cost category, a fixed amount or “enter each time”, and the day of the month.">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>What</TableHead>
                    <TableHead>Payee</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Day</TableHead>
                    <TableHead>Last entered</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurring.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-6 text-center text-meta text-slate-400">No recurring bill is set up.</TableCell></TableRow>
                  )}
                  {recurring.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium text-slate-900">{template.description}</TableCell>
                      <TableCell>{payeeOf(template)}</TableCell>
                      <TableCell className="text-meta text-slate-500">{categoryOf(template)}</TableCell>
                      <TableCell className="text-right num">{template.amount === undefined ? 'Each time' : formatPKR(template.amount)}</TableCell>
                      <TableCell className="text-right num">{template.dayOfMonth}</TableCell>
                      <TableCell className="text-meta text-slate-500">{template.lastUsedMonth ?? 'Never'}</TableCell>
                      <TableCell>
                        <Badge variant={template.active ? 'cleared' : 'outline'}>{template.active ? 'Active' : 'Retired'}</Badge>
                        {can(role, 'finance.bills') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-1 h-7 text-meta"
                            onClick={() => {
                              useBillsStore.getState().setRecurringActive(template.id, !template.active);
                              useAuditStore.getState().addLog({
                                user: useAuthStore.getState().user?.name ?? 'Admin',
                                action: 'Finance Entry',
                                details: `${template.active ? 'Retired' : 'Reactivated'} the recurring bill ${template.description} (§28)`,
                              });
                            }}
                          >
                            {template.active ? 'Retire' : 'Reactivate'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-3 py-2 text-micro text-slate-400">A retired template keeps its history; it simply stops reminding (§28).</p>
            </CardContent>
          </Card>

          {newTemplateOpen && <NewRecurringDialog onClose={() => setNewTemplateOpen(false)} />}
        </div>
      )}

      {tab !== 'recurring' && (
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
      )}
    </div>
  );
}

/** §28 — a regular cost: a payee, a cost category, a fixed amount or “enter each
 *  time”, and the day of the month the reminder counts down to. */
function NewRecurringDialog({ onClose }: { onClose: () => void }) {
  const categories = useBillsStore((s) => s.categories);
  const vendors = useBillsStore((s) => s.vendors);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const [payeeMode, setPayeeMode] = useState<'vendor' | 'text'>('vendor');
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '');
  const [payeeText, setPayeeText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [lead, setLead] = useState('3');
  const [errors, setErrors] = useState<string[]>([]);

  const submit = () => {
    const store = useBillsStore.getState();
    const template: RecurringBill = {
      id: store.nextRecurringId(),
      vendorId: payeeMode === 'vendor' ? vendorId || undefined : undefined,
      payeeText: payeeMode === 'text' ? payeeText.trim() || undefined : undefined,
      categoryId,
      description: description.trim(),
      // Blank means “enter each time” (§28).
      amount: amount.trim() === '' ? undefined : parseInt(amount, 10) || 0,
      dayOfMonth: parseInt(dayOfMonth, 10) || 0,
      remindDaysBefore: lead.trim() === '' ? undefined : parseInt(lead, 10) || 0,
      active: true,
      createdBy: userName,
      createdAt: nowISO(),
    };
    const problems = store.addRecurring(template);
    if (problems.length) { setErrors(problems); return; }
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Finance Entry',
      details: `Set up the recurring bill ${template.description} for day ${template.dayOfMonth} (§28)`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New recurring bill</DialogTitle>
          <DialogDescription>
            A template only raises a reminder (§28). The bill itself is still recorded by a person, with its image.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Payee *</Label>
            <div className="flex gap-2">
              <Button variant={payeeMode === 'vendor' ? 'subtle' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setPayeeMode('vendor')}>Vendor</Button>
              <Button variant={payeeMode === 'text' ? 'subtle' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setPayeeMode('text')}>Free text</Button>
            </div>
            {payeeMode === 'vendor' ? (
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Choose vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.filter((v) => v.status === 'Active').map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={payeeText} onChange={(e) => setPayeeText(e.target.value)} placeholder="Landlord" />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Cost category *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => {
                  const reason = manualCostBlockReason(c);
                  return (
                    <SelectItem key={c.id} value={c.id} disabled={!!reason}>
                      {COST_GROUP_LABELS[c.group]} › {c.name}{reason ? ` — ${reason}` : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>What the reminder says *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Monthly rent" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Fixed amount</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter each time" />
            </div>
            <div className="space-y-1.5">
              <Label>Day of month *</Label>
              <Input value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} placeholder="1" />
            </div>
            <div className="space-y-1.5">
              <Label>Remind days before</Label>
              <Input value={lead} onChange={(e) => setLead(e.target.value)} placeholder="3" />
            </div>
          </div>

          {errors.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {errors.map((e) => <p key={e}>{e}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
