// ============================================
// MediCMS Desktop v4.0 - Bank Account
// Module 8, Screen 8.1 - Bank ledger with deposit/withdrawal tracking
// ============================================

import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, Link2, User, Building2, AlertTriangle, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import { formatPKR, formatDate } from '@/lib/utils';
import { BANK_INFO } from '@/lib/constants';
import { useBankStore, getNextBankSno, useAuditStore, useAuthStore } from '@/stores';
import type { BankTransaction } from '@/types';

export default function BankAccount() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showPersonal, setShowPersonal] = useState(false);
  const bankTransactions = useBankStore(s => s.transactions);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<BankTransaction[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    let data = bankTransactions;
    if (!showPersonal) {
      data = data.filter((t) => !t.isPersonal);
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (t) =>
          t.narration.toLowerCase().includes(q) ||
          t.sno.toString().includes(q) ||
          t.date.includes(q)
      );
    }
    return data;
  }, [bankTransactions, search, showPersonal]);

  // Summary calculations
  const totalDeposits = filtered.reduce((sum, t) => sum + t.deposit, 0);
  const totalWithdrawals = filtered.reduce((sum, t) => sum + t.withdrawal, 0);
  const currentBalance = filtered.length > 0 ? filtered[filtered.length - 1].balance : 0;
  const untaggedCount = filtered.filter(
    (t) => t.withdrawal > 0 && !t.linkedExpenseId && !t.isPersonal
  ).length;

  return (
    <div className="space-y-6">
      {/* Header — compact */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-[15px] font-bold text-slate-900">Bank Account</h1>
            <p className="text-[11px] text-slate-500">
              {BANK_INFO.name} — {BANK_INFO.branch} · {BANK_INFO.accountNo}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => fileRef.current?.click()}>
            <Upload size={12} className="mr-1.5" /> Import
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const text = reader.result as string;
              const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
              if (lines.length < 2) { alert('CSV needs header + rows'); return; }
              const split = (line: string) => {
                const out: string[]=[]; let cur=''; let inQ=false;
                for(let i=0;i<line.length;i++){const c=line[i]; if(c==='"'){if(inQ && line[i+1]==='"'){cur+='"';i++;} else inQ=!inQ;} else if(c===',' && !inQ){out.push(cur);cur='';} else cur+=c;}
                out.push(cur); return out.map(s=>s.trim().replace(/^"|"$/g,''));
              };
              const header = split(lines[0]).map(h=>h.toLowerCase());
              const idxDate = header.findIndex(h=>h.includes('date'));
              const idxNarr = header.findIndex(h=>h.includes('narr')||h.includes('desc')||h.includes('particular'));
              const idxDep = header.findIndex(h=>h.includes('deposit')||h.includes('credit'));
              const idxWith = header.findIndex(h=>h.includes('withdraw')||h.includes('debit')||h.includes('amount'));
              const idxBal = header.findIndex(h=>h.includes('balance'));
              const rows: BankTransaction[] = [];
              let lastBal = bankTransactions.length ? bankTransactions[bankTransactions.length-1].balance : 0;
              let nextSno = getNextBankSno(bankTransactions);
              for(let i=1;i<lines.length;i++){
                const cols = split(lines[i]);
                const date = idxDate>=0 ? cols[idxDate] : new Date().toISOString().split('T')[0];
                const narration = idxNarr>=0 ? cols[idxNarr] : cols[1] || 'Imported';
                let deposit=0, withdrawal=0;
                if (idxDep>=0 && idxWith>=0) { deposit = parseFloat(cols[idxDep].replace(/,/g,''))||0; withdrawal = parseFloat(cols[idxWith].replace(/,/g,''))||0; }
                else if (idxDep>=0) { const v=parseFloat(cols[idxDep].replace(/,/g,''))||0; if(v>=0) deposit=v; else withdrawal=Math.abs(v); }
                else if (idxWith>=0) { const v=parseFloat(cols[idxWith].replace(/,/g,''))||0; if(v>=0) withdrawal=v; else deposit=Math.abs(v); }
                else { const amt=parseFloat(cols[2]?.replace(/,/g,'')||'0')||0; if(amt>=0) deposit=amt; else withdrawal=Math.abs(amt); }
                const bal = idxBal>=0 ? parseFloat(cols[idxBal].replace(/,/g,''))|| (lastBal + deposit - withdrawal) : lastBal + deposit - withdrawal;
                lastBal = bal;
                rows.push({ sno: nextSno++, date: date.includes('/') ? new Date(date).toISOString().split('T')[0] : date, deposit, withdrawal, balance: bal, narration: narration || 'Imported', linkedExpenseId: null, isPersonal: false, synced: false });
              }
              setImportRows(rows);
              setImportOpen(true);
            };
            reader.readAsText(file);
            e.target.value='';
          }} />
          <Button size="sm" className="h-7 text-[12px]" onClick={() => navigate('/bank/add')}>
            <Plus size={12} className="mr-1.5" /> Add
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Current Balance</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{formatPKR(currentBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Total Deposits</div>
            <div className="text-xl font-bold text-green-600 mt-1">{formatPKR(totalDeposits)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Total Withdrawals</div>
            <div className="text-xl font-bold text-red-600 mt-1">{formatPKR(totalWithdrawals)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-slate-500">Untagged Withdrawals</div>
            <div className={`text-xl font-bold mt-1 ${untaggedCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {untaggedCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Untagged Warning */}
      {untaggedCount > 0 && (
        <div className="flex items-center justify-between bg-amber-50/50 border border-amber-100 rounded-xl p-3">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle size={16} />
            <span className="text-sm">
              {untaggedCount} withdrawal{untaggedCount > 1 ? 's' : ''} not linked to any expense — may cause double-counting
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/expenses/tag-from-bank')}>
            Tag Now
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search by narration, #, or date..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showPersonal}
            onChange={(e) => setShowPersonal(e.target.checked)}
          />
          Show personal transactions
        </label>
        <Button variant="outline" size="sm" onClick={() => {
          const header = ['#','Date','Narration','Deposit','Withdrawal','Balance','Status'];
          const rows = filtered.map(t=> [t.sno, t.date, t.narration, t.deposit, t.withdrawal, t.balance, t.isPersonal?'Personal': t.withdrawal>0 && t.linkedExpenseId?'Tagged': t.withdrawal>0?'Untagged':'Deposit']);
          const csv = [header, ...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
          const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`bank-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
        }}><Download size={14} className="mr-1" /> Export CSV</Button>
      </div>

      {/* Import Preview */}
      {importOpen && (
        <Card className="border-blue-100">
          <CardHeader><CardTitle>Import Preview — {importRows.length} transactions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-slate-500">Expected header: date, narration/description, deposit/credit, withdrawal/debit, balance (flexible). First 10 preview:</div>
            <div className="max-h-60 overflow-auto border rounded-xl">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-left text-slate-500"><th className="p-2">Date</th><th className="p-2">Narration</th><th className="p-2 text-right">Deposit</th><th className="p-2 text-right">Withdrawal</th><th className="p-2 text-right">Balance</th></tr></thead>
                <tbody>{importRows.slice(0,10).map(r=> <tr key={r.sno} className="border-t"><td className="p-2">{r.date}</td><td className="p-2 truncate max-w-[200px]">{r.narration}</td><td className="p-2 text-right">{r.deposit?formatPKR(r.deposit):'—'}</td><td className="p-2 text-right">{r.withdrawal?formatPKR(r.withdrawal):'—'}</td><td className="p-2 text-right">{formatPKR(r.balance)}</td></tr>)}</tbody>
              </table>
            </div>
            {importRows.length>10 && <div className="text-xs text-slate-400">...and {importRows.length-10} more</div>}
            <div className="text-xs text-slate-500">Template: <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={()=>{
              const csv='date,narration,deposit,withdrawal,balance\n2026-03-20,Fee collection,50000,0,50000\n2026-03-21,Salary payment,0,20000,30000';
              const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='bank-template.csv'; a.click(); URL.revokeObjectURL(url);
            }}>Download Template</Button></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setImportOpen(false)}>Cancel</Button>
              <Button onClick={()=>{
                const userName = useAuthStore.getState().user?.name ?? 'Admin';
                importRows.forEach(r=> useBankStore.getState().addTransaction(r));
                useAuditStore.getState().addLog({ user: userName, action: 'Bank Entry', details: `Bank CSV import ${importRows.length} transactions` });
                setImportOpen(false); setImportRows([]);
              }}>Import {importRows.length} Transactions</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bank Ledger Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead className="text-right">Deposit</TableHead>
                <TableHead className="text-right">Withdrawal</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((txn) => (
                <TableRow key={txn.sno} className={txn.isPersonal ? 'bg-slate-50/50' : ''}>
                  <TableCell className="font-medium text-slate-500">{txn.sno}</TableCell>
                  <TableCell>{formatDate(txn.date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {txn.isPersonal && <User size={14} className="text-slate-400" />}
                      {txn.narration}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {txn.deposit > 0 ? (
                      <span className="text-green-600 font-medium">{formatPKR(txn.deposit)}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {txn.withdrawal > 0 ? (
                      <span className="text-red-600 font-medium">{formatPKR(txn.withdrawal)}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatPKR(txn.balance)}</TableCell>
                  <TableCell>
                    {txn.isPersonal ? (
                      <Badge variant="outline" className="text-slate-500 border-slate-100">
                        <User size={12} className="mr-1" />
                        Personal
                      </Badge>
                    ) : txn.withdrawal > 0 && txn.linkedExpenseId ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-100 bg-emerald-50">
                        <Link2 size={12} className="mr-1" />
                        Tagged
                      </Badge>
                    ) : txn.withdrawal > 0 ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-100 bg-amber-50">
                        <AlertTriangle size={12} className="mr-1" />
                        Untagged
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-blue-600 border-blue-100 bg-blue-50">
                        <Building2 size={12} className="mr-1" />
                        Deposit
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
