// ============================================
// MediCMS Desktop v4.0 - Ledger Adjustment (Screen 4.4)
// ============================================

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPKR, formatBalanceDisplay } from '@/lib/utils';
import { nowISO, todayISO } from '@/lib/txn';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { REASON_MIN_LENGTH, entryId, entryProblems } from '@/lib/ledger';
import { confirmDialog } from '@/lib/confirm';
import { toastSuccess } from '@/lib/toast';
import { useStudentStore, useLedgerStore, useAuditStore, useAuthStore } from '@/stores';
import { AuditWarningBanner } from '@/components/ledger/AuditWarningBanner';
import { SignedAmount } from '@/components/ledger/SignedAmount';
import type { LedgerEntry } from '@/types';

export default function LedgerAdjustment() {
  const { sno } = useParams<{ sno: string }>();
  const navigate = useNavigate();

  const storeStudents = useStudentStore(s => s.students);
  const ledgerEntries = useLedgerStore(s => s.entries);
  const student = getStudentsWithBalanceLive(storeStudents, ledgerEntries).find(s => s.sno.toString() === sno);
  const [amount, setAmount] = useState('');
  const [effect, setEffect] = useState<'reduce' | 'increase'>('reduce');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reasonOk = reason.trim().length >= REASON_MIN_LENGTH;
  // Concurrent-edit guard (§5)
  const [openCount] = useState(() => useLedgerStore.getState().entries.filter(e => e.studentSno === Number(sno)).length);

  if (!student) {
    return <div className="p-8 text-center text-slate-400">Student not found (SNO: {sno})</div>;
  }

  const adjAmount = parseFloat(amount) || 0;
  const balanceDisplay = formatBalanceDisplay(student.computedBalance);
  const newBalance = effect === 'reduce'
    ? student.computedBalance - adjAmount
    : student.computedBalance + adjAmount;

  const handleSubmit = async () => {
    setError('');
    if (adjAmount <= 0 || !reasonOk) return;
    const all = useLedgerStore.getState().entries;
    if (all.filter(e => e.studentSno === student.sno).length !== openCount) {
      setError("This student's ledger has changed since you opened this page — go back, refresh and review before posting.");
      return;
    }
    // The explicit direction is the entry type (§6) — no signed discount to read back.
    const type = effect === 'reduce' ? 'AdjustmentReduce' : 'AdjustmentAdd';
    // Second confirmation restating the exact effect (spec §3.4)
    const verb = effect === 'reduce' ? 'decreases' : 'increases';
    const ok = await confirmDialog({
      title: effect === 'reduce' ? 'Decrease the balance' : 'Increase the balance',
      effect: `An ${type === 'AdjustmentReduce' ? 'Adjustment (reduce)' : 'Adjustment (add)'} entry of ${formatPKR(adjAmount)} is posted to ${student.name}'s ledger and ${verb} the balance from ${formatPKR(student.computedBalance)} to ${formatPKR(newBalance)}. The reason is stored on the entry; entries are append-only, so a mistake here is corrected with a reversal (§7.1).`,
      tone: 'money',
      confirmLabel: 'Post adjustment',
    });
    if (!ok) return;
    setLoading(true);
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const date = todayISO();
    const entryNo = useLedgerStore.getState().nextEntryNo(student.sno);
    const entry: LedgerEntry = {
      id: entryId(student.sno, entryNo),
      studentSno: student.sno,
      entryNo,
      date,
      type,
      amount: Math.round(adjAmount),
      description: `${effect === 'reduce' ? 'Balance reduced' : 'Balance added'} — ${reason.trim()}`,
      reference: reference.trim() || null,
      reason: reason.trim(),
      // §5: an Adjustment (add) is a charge and needs a due date; a correction posted
      // today is due today. A reduce is not a charge and has none.
      dueDate: type === 'AdjustmentAdd' ? date : null,
      createdBy: userName,
      createdAt: nowISO(),
      balanceAfter: 0,
    };
    const problems = entryProblems(entry, { today: date, all: [...all, entry] });
    if (problems.length) {
      setError(problems.join(' '));
      setLoading(false);
      return;
    }
    const outcome = useLedgerStore.getState().postEntries([entry], date);
    if (!outcome.ok) {
      setError(outcome.rejected.flatMap(r => r.problems).join(' '));
      setLoading(false);
      return;
    }
    useAuditStore.getState().addLog({ user: userName, action: 'Ledger Adjustment', studentSno: student.sno, details: `${type} · ${formatPKR(entry.amount)}${reference ? ` · Ref ${reference}` : ''} — ${reason.trim()}` });
    toastSuccess({ title: 'Adjustment posted', description: `Entry #${entry.entryNo} · ${formatPKR(entry.amount)} ${effect === 'reduce' ? 'off' : 'onto'} the balance.` });
    setLoading(false);
    navigate(`/ledger/${student.sno}?highlight=${entry.id}`);
  };

  return (
    <div className="w-auto space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Ledger Adjustment</h1>
          <p className="text-sm text-slate-500 mt-1">
            {student.name} (SNO: {student.sno})
          </p>
        </div>
      </div>

      {/* Current Balance */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="py-5 flex justify-between items-center">
          <span className="text-blue-600 text-sm font-medium">Current Balance</span>
          <span className={`text-xl font-bold ${balanceDisplay.color}`}>{balanceDisplay.label}</span>
        </CardContent>
      </Card>

      <AuditWarningBanner />

      <Card>
        <CardHeader>
          <CardTitle>Adjustment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Amount */}
          <div>
            <Label>Adjustment Amount (PKR) *</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Effect — explicit +/− toggle, amount stays positive-only */}
          <div>
            <Label>Direction *</Label>
            <div className="grid grid-cols-2 gap-2 mt-2" role="radiogroup" aria-label="Adjustment direction">
              {(['reduce', 'increase'] as const).map((v) => {
                const active = effect === v;
                const sign = v === 'reduce' ? '−' : '+';
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setEffect(v)}
                    className={`rounded-md border px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#2451B8] ${
                      active ? 'border-[#2451B8] bg-blue-50 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {sign} {v === 'reduce' ? 'Decrease balance' : 'Increase balance'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reference */}
          <div>
            <Label>Reference (original wrong ledger row Txn#)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
            />
          </div>

          {/* Reason (required, min 10 characters) */}
          <div>
            <Label>Reason * (min {REASON_MIN_LENGTH} characters)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Reversing entry #4 double-posted demand"
            />
            {!reasonOk && (
              <p className="text-xs text-red-500 mt-1">
                {reason.trim() ? `Reason needs ${REASON_MIN_LENGTH - reason.trim().length} more characters — one-word reasons defeat the audit trail.` : 'Reason is required (min ' + REASON_MIN_LENGTH + ' characters)'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {adjAmount > 0 && (
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="py-5">
            <div className="text-sm text-blue-600 font-medium mb-3">Preview:</div>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>Current balance</span>
                <span className="tabular-nums">{formatPKR(student.computedBalance)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Adjustment</span>
                <SignedAmount value={effect === 'reduce' ? -adjAmount : adjAmount} />
              </div>
              <div className="flex justify-between font-bold pt-3 border-t border-slate-100">
                <span>After adjustment</span>
                <span className={`tabular-nums ${newBalance <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {formatPKR(newBalance)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading || adjAmount <= 0 || !reasonOk}>
          {loading ? 'Applying...' : 'Apply Adjustment'}
        </Button>
      </div>
    </div>
  );
}
