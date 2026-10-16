// ============================================
// MediCMS Desktop — Finance: Record a cost (§26, §61)
// A full page for a new bill. Every cost is a bill (§26); this records it with
// its payee, category and amount. Money never leaves here — a payment is a
// voucher posted by Pay out (§29) — so saving a "pay now" cost records the bill
// and carries the user straight to Pay out with it already chosen. The §26 and
// §32 rules run through `recordCost` before anything is saved, so the form and
// the books never disagree.
// ============================================

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { nowISO } from '@/lib/txn';
import { can } from '@/lib/permissions';
import { useAuditStore, useAuthStore, useBillsStore, useMoneyStore, useSettingsStore } from '@/stores';
import {
  COST_GROUP_LABELS,
  acceptAttachments,
  attachmentKind,
  categoryGroups,
  categoriesInGroup,
  manualCostBlockReason,
  duplicateBillWarning,
  recordCost,
  type CostGroupId,
  type RecordCostContext,
  type RecordCostDraft,
} from '@/lib/finance';

export default function RecordCost() {
  const navigate = useNavigate();
  const categories = useBillsStore((s) => s.categories);
  const vendors = useBillsStore((s) => s.vendors);
  const bills = useBillsStore((s) => s.bills);
  const closedMonths = useMoneyStore((s) => s.closedMonths);
  const limits = useSettingsStore((s) => s.financeLimits);
  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name ?? 'Admin');

  const [payNow, setPayNow] = useState(false);
  const [payeeMode, setPayeeMode] = useState<'vendor' | 'text'>('vendor');
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '');
  const [payeeText, setPayeeText] = useState('');
  const [group, setGroup] = useState<CostGroupId | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dayKey());
  const [billDate, setBillDate] = useState('');
  const [billNo, setBillNo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [attachMsgs, setAttachMsgs] = useState<string[]>([]);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [reasonForNoImage, setReasonForNoImage] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const amt = parseInt(amount, 10) || 0;
  const groups = useMemo(() => categoryGroups(categories), [categories]);
  const groupCategories = group ? categoriesInGroup(categories, group) : [];
  const blocked = categoryId ? manualCostBlockReason(categories.find((c) => c.id === categoryId) ?? { id: '', group: 'other', name: '' }) : undefined;
  const needsImage = amt > limits.billImageRequiredAbove && attachments.length === 0;
  const inClosedMonth = closedMonths.includes(date.slice(0, 7));
  const duplicate = payeeMode === 'vendor' && vendorId
    ? duplicateBillWarning({ vendorId, categoryId, description, amount: amt, date, billNo, createdBy: userName }, bills)
    : undefined;

  const buildCtx = (): RecordCostContext => ({
    categories,
    vendors,
    bills,
    closedMonths,
    today: dayKey(),
    now: nowISO(),
    limits,
    // §26: an Accountant posts up to the §77 back-dating limit; Admin, any open day.
    maxBackDateDays: role === 'Accountant' ? limits.accountantBackDateDays : undefined,
  });

  const submit = () => {
    const state = useBillsStore.getState();
    const draft: RecordCostDraft = {
      vendorId: payeeMode === 'vendor' ? vendorId : undefined,
      payeeText: payeeMode === 'text' ? payeeText : undefined,
      categoryId,
      description,
      amount: amt,
      date,
      billDate: billDate || undefined,
      billNo: billNo || undefined,
      dueDate: dueDate || undefined,
      attachments,
      reasonForNoImage: reasonForNoImage || undefined,
      note: note || undefined,
      createdBy: userName,
    };
    const result = recordCost(draft, buildCtx());
    if (!result.ok) { setErrors(result.errors); return; }
    const errs = state.addBill(result.bill);
    if (errs.length) { setErrors(errs); return; }
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Recorded cost ${result.bill.no} ${formatPKR(result.bill.amount)}` });
    if (payNow) {
      // The bill is only recorded here; Pay out posts its voucher (§29).
      navigate(`/finance/pay?vendor=${result.bill.vendorId ?? ''}`);
    } else {
      navigate(`/finance/bills/${result.bill.id}`);
    }
  };

  const handleFiles = (list: FileList | File[]) => {
    const files = Array.from(list);
    const { accepted, problems } = acceptAttachments(attachments, files.map((f) => ({ name: f.name, size: f.size, mime: f.type })));
    setAttachMsgs(problems);
    if (!accepted.length) return;
    const acceptedNames = new Set(accepted.map((a) => a.name));
    // The stored attachment is the file's name; an image also gets a live
    // thumbnail from a session object URL (never persisted as bytes, §61).
    setPreviews((prev) => {
      const next = { ...prev };
      for (const f of files) {
        if (acceptedNames.has(f.name) && attachmentKind(f.name, f.type) === 'image') next[f.name] = URL.createObjectURL(f);
      }
      return next;
    });
    setAttachments((a) => [...a, ...accepted.map((x) => x.name)]);
  };

  const removeAttachment = (name: string) => {
    setPreviews((prev) => {
      const next = { ...prev };
      if (next[name]) { URL.revokeObjectURL(next[name]); delete next[name]; }
      return next;
    });
    setAttachments((a) => a.filter((x) => x !== name));
    setAttachMsgs([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/bills')}>
            <ArrowLeft size={14} />
          </Button>
          <h1 className="text-section font-bold text-slate-900">Record a cost</h1>
        </div>
      </div>

      {/* §61 What happens — a cost is paid now (a voucher from Pay out, §29) or left to pay later. */}
      <div className="flex gap-2">
        <Button variant={payNow ? 'default' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setPayNow(true)}>Pay now</Button>
        <Button variant={!payNow ? 'default' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setPayNow(false)}>Bill to pay later</Button>
      </div>

      <Card><CardContent className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-4">
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
              <Input value={payeeText} onChange={(e) => setPayeeText(e.target.value)} placeholder="Petty cash purchase" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={group} onValueChange={(v) => { setGroup(v as CostGroupId); setCategoryId(''); }}>
              <SelectTrigger><SelectValue placeholder="Choose group" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => <SelectItem key={g} value={g}>{COST_GROUP_LABELS[g]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {group && (
          <div className="space-y-1.5">
            <Label>Sub-category *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
              <SelectContent>
                {groupCategories.map((c) => {
                  const reason = manualCostBlockReason(c);
                  return <SelectItem key={c.id} value={c.id} disabled={!!reason}>{c.name}{reason ? ` — ${reason}` : ''}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            {blocked && <p className="text-micro text-amber-600">{blocked}</p>}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Description *</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the cost was for" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input num value={amount} onChange={(e) => setAmount(e.target.value)} invalid={amount !== '' && !/^\d+$/.test(amount)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Date (posting) *</Label>
            <Input type="date" value={date} max={dayKey()} onChange={(e) => setDate(e.target.value)} invalid={inClosedMonth} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Bill number</Label>
            <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="CTH-2210" />
          </div>
          <div className="space-y-1.5">
            <Label>Bill date</Label>
            <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <p className="text-micro text-slate-400">Due date defaults to the bill date plus the vendor's payment terms if left blank (§26).</p>

        {/* §61: drop or choose images / PDF — up to 3, 3 MB each, with a thumbnail preview. */}
        <div className="space-y-1.5">
          <Label>Attachments (images or PDF, up to 3, 3 MB each)</Label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            className="rounded-control border border-dashed border-hairline bg-slate-50 px-3 py-4 text-center text-meta text-slate-500"
          >
            Drop files here, or{' '}
            <button type="button" className="text-blue-600 hover:underline" onClick={() => attachInputRef.current?.click()}>choose</button>
            <input
              ref={attachInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
            />
          </div>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {attachments.map((a) => (
                <span key={a} className="inline-flex items-center gap-1.5 rounded-pill bg-hairline-soft px-2 py-0.5 text-micro">
                  {previews[a]
                    ? <img src={previews[a]} alt={a} className="h-8 w-8 rounded-control object-cover" />
                    : <FileText size={16} className="text-slate-400" />}
                  <span className="max-w-40 truncate">{a}</span>
                  <button className="text-slate-400 hover:text-slate-700" onClick={() => removeAttachment(a)} aria-label={`Remove ${a}`}>×</button>
                </span>
              ))}
            </div>
          )}
          {attachMsgs.length > 0 && (
            <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-meta text-amber-700">
              {attachMsgs.map((m) => <p key={m}>{m}</p>)}
            </div>
          )}
          {needsImage && (
            <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-meta text-amber-700">
              A cost above {formatPKR(limits.billImageRequiredAbove)} needs a bill image, or a reason (§26).
            </div>
          )}
          {needsImage && (
            <Input value={reasonForNoImage} onChange={(e) => setReasonForNoImage(e.target.value)} placeholder="Reason no image is attached" />
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {duplicate && (
          <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-meta text-amber-700">
            Possible duplicate — {duplicate.billNo} matches on {duplicate.reason} (§32).
          </div>
        )}
        {inClosedMonth && (
          <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
            {date.slice(0, 7)} is a closed month. An Admin must reopen it before a cost is dated there (§26).
          </div>
        )}
        {errors.length > 0 && (
          <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
            {errors.map((e) => <p key={e}>{e}</p>)}
          </div>
        )}
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/finance/bills')}>Cancel</Button>
        <Button onClick={submit} disabled={!can(role, 'finance.bills') || !description.trim() || !categoryId || amt <= 0 || inClosedMonth}>
          {payNow ? 'Save bill and pay' : 'Save bill'}
        </Button>
      </div>
    </div>
  );
}
