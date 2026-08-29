// ============================================
// MediCMS Desktop v4.0 - Approvals (Principal)
// ============================================

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApprovalStore, DISCOUNT_APPROVAL_THRESHOLD, ADJUSTMENT_APPROVAL_THRESHOLD } from '@/stores/approvalStore';
import { useLedgerStore, getNextTxnNo, useAuditStore, useAuthStore, useBankStore, getNextBankSno, useReceiptBookStore } from '@/stores';
import { formatPKR, formatDateTime } from '@/lib/utils';
import { BANK_INFO } from '@/lib/constants';
import type { LedgerTransaction } from '@/types';

export default function Approvals() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const requests = useApprovalStore(s => s.requests);
  const decide = useApprovalStore(s => s.decide);
  const isPrincipal = user?.role === 'Principal' || user?.role === 'Admin';

  const pending = requests.filter(r => r.status === 'pending');
  const history = requests.filter(r => r.status !== 'pending');

  const handleApprove = (id: string) => {
    const req = useApprovalStore.getState().requests.find(r => r.id === id);
    if (!req) return;
    const decided = decide(id, 'approved', user?.name ?? 'Principal');
    if (!decided) return;
    const userName = user?.name ?? 'Principal';
    // Create ledger transaction based on type
    if (req.type === 'Discount' || req.type === 'OverPayment') {
      const p = req.payload;
      const allLedger = useLedgerStore.getState().transactions;
      const nextTxn = getNextTxnNo(allLedger, req.studentSno);
      const modeLabel = p.paymentMode === 'Bank' ? `Bank ${BANK_INFO.name} ${p.bankRef ? `Ref ${p.bankRef}` : ''}` : p.paymentMode || 'Cash';
      const tx: LedgerTransaction = {
        id: `tx-${req.studentSno}-${nextTxn}-${Date.now()}`,
        studentSno: req.studentSno,
        txnNo: nextTxn,
        date: new Date().toISOString().split('T')[0],
        type: 'Pay',
        fees: 0,
        discount: p.discountAmount || 0,
        payment: p.paymentAmount || 0,
        receiptNo: p.receiptNo || null,
        receivedBy: req.requestedBy,
        narration: p.narration || `${modeLabel}${p.discountAmount ? ` Discount: ${p.discountReason}` : ''}`,
        createdAt: new Date().toISOString(),
        createdBy: req.requestedBy,
        synced: false,
      };
      useLedgerStore.getState().addTransaction(tx);
      if (p.receiptNo) useReceiptBookStore.getState().useReceipt(p.receiptNo, req.requestedBy);
      if (p.paymentMode && p.paymentMode !== 'Cash') {
        const bankTxs = useBankStore.getState().transactions;
        const nextSno = getNextBankSno(bankTxs);
        const lastBalance = bankTxs.length ? bankTxs[bankTxs.length - 1].balance : 0;
        useBankStore.getState().addTransaction({
          sno: nextSno, date: new Date().toISOString().split('T')[0], deposit: p.paymentAmount, withdrawal: 0, balance: lastBalance + p.paymentAmount,
          narration: `Fee from ${req.studentName} (SNO:${req.studentSno}) · Rcpt ${p.receiptNo}${p.bankRef ? ` · ${p.bankRef}` : ''} · ${modeLabel} (approved)`,
          linkedExpenseId: null, isPersonal: false, synced: false,
        });
      }
      useAuditStore.getState().addLog({ user: userName, action: 'Payment', studentSno: req.studentSno, details: `Approved ${req.type} ${formatPKR(p.paymentAmount)}${p.discountAmount ? ` + Disc ${formatPKR(p.discountAmount)}` : ''} · Rcpt ${p.receiptNo} — ${req.reason} (by ${req.requestedBy})` });
    } else if (req.type === 'Adjustment') {
      const p = req.payload;
      const allLedger = useLedgerStore.getState().transactions;
      const nextTxn = getNextTxnNo(allLedger, req.studentSno);
      const isReduce = p.effect === 'reduce';
      const tx: LedgerTransaction = {
        id: `tx-${req.studentSno}-${nextTxn}-${Date.now()}`, studentSno: req.studentSno, txnNo: nextTxn, date: new Date().toISOString().split('T')[0], type: 'Adj', fees: 0, discount: isReduce ? p.adjAmount : -p.adjAmount, payment: 0, receiptNo: null, receivedBy: req.requestedBy, narration: `${p.adjType}${p.reference ? ` (Ref ${p.reference})` : ''} — ${p.reason} (approved by ${userName})`, createdAt: new Date().toISOString(), createdBy: req.requestedBy, synced: false,
      };
      useLedgerStore.getState().addTransaction(tx);
      useAuditStore.getState().addLog({ user: userName, action: 'Ledger Adjustment', studentSno: req.studentSno, details: `Approved ${p.adjType} ${formatPKR(p.adjAmount)} ${p.effect} — ${p.reason} (by ${req.requestedBy})` });
    }
  };

  const handleReject = (id: string) => {
    if (!window.confirm('Reject this request?')) return;
    decide(id, 'rejected', user?.name ?? 'Principal');
    const req = requests.find(r => r.id === id);
    if (req) useAuditStore.getState().addLog({ user: user?.name ?? 'Principal', action: 'Ledger Adjustment', studentSno: req.studentSno, details: `Rejected ${req.type} ${formatPKR(req.amount)} — ${req.reason}` });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}><ArrowLeft size={14} /></Button>
        <div>
          <h1 className="text-[15px] font-bold">Approvals</h1>
          <p className="text-[11px] text-slate-500">Discount &gt; {formatPKR(DISCOUNT_APPROVAL_THRESHOLD)} · Adj &gt; {formatPKR(ADJUSTMENT_APPROVAL_THRESHOLD)}</p>
        </div>
        <Badge variant="outline" className="ml-auto text-[11px]">{pending.length} pending</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock size={16} /> Pending Requests {pending.length === 0 && <span className="text-sm font-normal text-slate-400">— none</span>}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No pending approvals</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Student</TableHead><TableHead>Amount</TableHead><TableHead>Reason</TableHead><TableHead>By</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {pending.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(r.requestedAt)}</TableCell>
                    <TableCell><Badge variant="outline" className={r.type === 'Discount' ? 'bg-amber-50 text-amber-600 border-amber-100' : r.type === 'Adjustment' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-red-50 text-red-600 border-red-100'}>{r.type}</Badge></TableCell>
                    <TableCell><div className="font-medium">{r.studentName}</div><div className="text-xs text-slate-500">SNO:{r.studentSno}</div></TableCell>
                    <TableCell className="font-medium">{formatPKR(r.amount)}{r.discountAmount ? <div className="text-xs text-teal-600">Disc {formatPKR(r.discountAmount)}</div> : null}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{r.reason}</TableCell>
                    <TableCell className="text-xs">{r.requestedBy}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" disabled={!isPrincipal} onClick={() => handleApprove(r.id)}><Check size={14} className="mr-1" /> Approve</Button>
                        <Button size="sm" variant="outline" disabled={!isPrincipal} onClick={() => handleReject(r.id)}><X size={14} className="mr-1" /> Reject</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle>History</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Student</TableHead><TableHead>Status</TableHead><TableHead>Decided By</TableHead></TableRow></TableHeader>
              <TableBody>
                {history.slice(0,20).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{formatDateTime(r.requestedAt)}</TableCell>
                    <TableCell>{r.type}</TableCell>
                    <TableCell>{r.studentName} (SNO:{r.studentSno})</TableCell>
                    <TableCell><Badge variant="outline" className={r.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs">{r.decidedBy ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isPrincipal && <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3">Only Principal (or Admin acting as Principal) can approve — your role: {user?.role}</div>}
    </div>
  );
}
