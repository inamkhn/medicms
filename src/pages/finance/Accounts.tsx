// ============================================
// MediCMS Desktop — Finance: Accounts (§6, §58)
// The list of money accounts with the balance of each — always calculated,
// never stored (§6.1), so this figure and the account page's, the reports'
// and the dashboard's are the same number. New accounts carry the §6 fields;
// the opening balance is its own dated entry on the account page (§78.1).
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatPKR } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import { useAuditStore, useAuthStore, useMoneyStore } from '@/stores';
import {
  ACCOUNT_TYPE_LABELS,
  accountBalance,
  externalTotals,
  isSystemAccount,
  unclearedIssuedTotal,
  type MoneyAccount,
  type MoneyAccountType,
} from '@/lib/finance';

const NEW_IDENTITY_TYPES: MoneyAccountType[] = ['counterCash', 'pettyCash', 'bank', 'wallet'];

function NewAccountDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<MoneyAccountType>('bank');
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [responsible, setResponsible] = useState('');
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const isBankish = type === 'bank' || type === 'wallet';
  const isCashish = type === 'counterCash' || type === 'pettyCash';

  const submit = () => {
    const account: MoneyAccount = {
      id: useMoneyStore.getState().nextAccountId(),
      name: name.trim(),
      type,
      bankName: isBankish ? bankName.trim() : undefined,
      accountNo: isBankish ? accountNo.trim() : undefined,
      responsible: isCashish ? responsible.trim() || undefined : undefined,
      status: 'Active',
      notes: notes.trim() || undefined,
    };
    // The store holds the §5/§6 sentences; the screen adds the field rules.
    const fieldProblems: string[] = [];
    if (isBankish && !bankName.trim()) fieldProblems.push('A bank or wallet account carries the bank or wallet provider (§6).');
    const problems = [...fieldProblems, ...useMoneyStore.getState().addAccount(account)];
    if (problems.length) { setProblems(problems); return; }
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    useAuditStore.getState().addLog({ user: userName, action: 'Finance Entry', details: `Added money account ${account.name} (${ACCOUNT_TYPE_LABELS[account.type]})` });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>Cash, bank or wallet the institute's money sits in (§6).</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meezan, main account" invalid={problems.some((p) => p.includes('name'))} />
          </div>
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as MoneyAccountType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NEW_IDENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isBankish && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bank / wallet *</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Meezan Bank" />
              </div>
              <div className="space-y-1.5">
                <Label>Account number</Label>
                <Input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} placeholder="Last digits shown on screen (§6)" />
              </div>
            </div>
          )}
          {isCashish && (
            <div className="space-y-1.5">
              <Label>Responsible person</Label>
              <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Main counter" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-control border border-hairline bg-panel px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
              placeholder="Optional"
            />
          </div>
          <p className="text-meta text-slate-400">
            The opening balance is entered once on the account page, from the real statement or the cash count (§78.1).
          </p>
          {problems.length > 0 && (
            <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-meta text-red-700">
              {problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Add account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Accounts() {
  const navigate = useNavigate();
  const accounts = useMoneyStore((s) => s.accounts);
  const entries = useMoneyStore((s) => s.entries);
  const issuedCheques = useMoneyStore((s) => s.issuedCheques);
  const [dialogOpen, setDialogOpen] = useState(false);

  // §13: the institute's own money — system accounts hold money that is not a
  // balance (cheques held for the bank), so they show separately, never in the total.
  const totals = externalTotals(entries, accounts);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-section font-bold text-slate-900">Accounts</h1>
          <p className="text-micro text-slate-500">Every balance is calculated — the same figure on every screen (§6.1).</p>
        </div>
        <Button size="sm" className="h-7 text-meta" onClick={() => setDialogOpen(true)}>
          <Plus size={12} className="mr-1.5" /> New account
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Money with the institute</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{formatPKR(totals.closingTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Cheques in hand</div>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {formatPKR(accounts.filter((a) => a.type === 'chequesInHand').reduce((sum, a) => sum + accountBalance(entries, a.id), 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Issued, not cleared</div>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {formatPKR(unclearedIssuedTotal(issuedCheques))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All accounts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Responsible</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => navigate(`/finance/accounts/${a.id}`)}
                >
                  <TableCell className="font-medium text-slate-900">
                    {a.name}
                    {isSystemAccount(a) && <span className="ml-2 text-micro text-slate-400">system</span>}
                  </TableCell>
                  <TableCell className="text-slate-600">{ACCOUNT_TYPE_LABELS[a.type]}</TableCell>
                  <TableCell className="text-slate-500">
                    {a.bankName ?? '—'}
                    {a.accountNo ? ` ····${a.accountNo.slice(-4)}` : ''}
                  </TableCell>
                  <TableCell className="text-slate-500">{a.responsible ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={a.status === 'Active' ? 'text-emerald-600 border-emerald-100 bg-emerald-50' : 'text-slate-500 border-slate-200'}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatPKR(accountBalance(entries, a.id))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-micro text-slate-400">
        Counted a day's drawer? The day close lives under Fees · Day close — {dayKey()} is today's date.
      </p>

      {dialogOpen && <NewAccountDialog onClose={() => setDialogOpen(false)} />}
    </div>
  );
}
