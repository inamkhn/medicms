// ============================================
// MediCMS Desktop v4.0 - Add Special Charge (Screen 4.3)
// ============================================

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHARGE_TYPES } from '@/lib/constants';
import { formatPKR } from '@/lib/utils';
import { nowISO, todayISO } from '@/lib/txn';
import { addDays } from '@/lib/dates';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { DEFAULT_TERM_DUE_DAYS, entryId, entryProblems, postingBlocker } from '@/lib/ledger';
import { toastSuccess } from '@/lib/toast';
import { useStudentStore, useLedgerStore, useAuditStore, useAuthStore } from '@/stores';
import { SignedAmount } from '@/components/ledger/SignedAmount';
import type { LedgerEntry } from '@/types';

export default function AddCharge() {
  const { sno } = useParams<{ sno: string }>();
  const navigate = useNavigate();

  const storeStudents = useStudentStore(s => s.students);
  const ledgerEntries = useLedgerStore(s => s.entries);
  const student = getStudentsWithBalanceLive(storeStudents, ledgerEntries).find(s => s.sno.toString() === sno);
  const [chargeType, setChargeType] = useState<string>(CHARGE_TYPES[0].value);
  const [amount, setAmount] = useState('2700');
  const [date, setDate] = useState(todayISO);
  // A charge without a due date cannot be chased (§24.1), so the screen starts one and
  // re-bases it when the posting day moves.
  const [dueDate, setDueDate] = useState(() => addDays(todayISO(), DEFAULT_TERM_DUE_DAYS));
  const [narration, setNarration] = useState<string>(CHARGE_TYPES[0].defaultNarration);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Concurrent-edit guard (§5)
  const [openCount] = useState(() => useLedgerStore.getState().entries.filter(e => e.studentSno === Number(sno)).length);

  if (!student) {
    return <div className="p-8 text-center text-slate-400">Student not found (SNO: {sno})</div>;
  }

  const chargeAmount = parseFloat(amount) || 0;
  const newBalance = student.computedBalance + chargeAmount;

  const handleTypeChange = (value: string) => {
    setChargeType(value);
    const ct = CHARGE_TYPES.find(c => c.value === value);
    if (ct) setNarration(ct.defaultNarration);
  };

  const handleSubmit = async () => {
    setError('');
    if (chargeAmount <= 0) { setError('Amount must be greater than zero.'); return; }
    if (!narration.trim()) { setError('Description is required for every charge — it appears in the audit trail.'); return; }
    const all = useLedgerStore.getState().entries;
    if (all.filter(e => e.studentSno === student.sno).length !== openCount) {
      setError("This student's ledger has changed since you opened this page — go back, refresh and review before posting.");
      return;
    }
    // §7.6: a struck-off student is not charged more. §7.7 lets a certificate-style
    // special charge through for a student who has finished, which is why only the
    // struck-off case is passed here.
    const blocker = postingBlocker('SpecialCharge', { struckOff: student.struckOff, completed: false });
    if (blocker) { setError(blocker); return; }
    setLoading(true);
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const label = CHARGE_TYPES.find(c => c.value === chargeType)?.label ?? chargeType;
    // One positive SpecialCharge entry (§6). It used to be stored as a negative
    // discount, which is how a fine and a concession became the same column (§7.10).
    const entryNo = useLedgerStore.getState().nextEntryNo(student.sno);
    const entry: LedgerEntry = {
      id: entryId(student.sno, entryNo),
      studentSno: student.sno,
      entryNo,
      date,
      type: 'SpecialCharge',
      amount: Math.round(chargeAmount),
      description: narration.trim(),
      dueDate,
      createdBy: userName,
      createdAt: nowISO(),
      // Stamped by the store from the running balance the ledger check re-derives (§7.3).
      balanceAfter: 0,
    };
    const today = todayISO();
    const problems = entryProblems(entry, { today, all: [...all, entry] });
    if (problems.length) { setError(problems.join(' ')); setLoading(false); return; }
    const outcome = useLedgerStore.getState().postEntries([entry], today);
    if (!outcome.ok) {
      setError(outcome.rejected.flatMap(r => r.problems).join(' '));
      setLoading(false);
      return;
    }
    useAuditStore.getState().addLog({ user: userName, action: 'Charge Added', studentSno: student.sno, details: `${label} · ${formatPKR(entry.amount)} — ${entry.description}` });
    toastSuccess({ title: `${label} charged`, description: `${formatPKR(entry.amount)} added to ${student.name} (entry #${entry.entryNo}).` });
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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Add Special Charge</h1>
          <p className="text-sm text-slate-500 mt-1">
            {student.name} (SNO: {student.sno})
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Charge Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Charge Type — segmented, fixed consequential set */}
          <div>
            <Label>Charge Type *</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2" role="radiogroup" aria-label="Charge type">
              {CHARGE_TYPES.map(ct => {
                const active = chargeType === ct.value;
                return (
                  <button
                    key={ct.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => handleTypeChange(ct.value)}
                    className={`rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#2451B8] ${
                      active ? 'border-[#2451B8] bg-blue-50 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[13px] font-medium">{ct.label}</div>
                    {ct.defaultNarration && (
                      <div className="text-[11px] font-normal text-slate-500 truncate">{ct.defaultNarration}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Amount (PKR) *</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); setDueDate(addDays(e.target.value, DEFAULT_TERM_DUE_DAYS)); }}
              />
            </div>
          </div>

          <div>
            <Label>Due Date *</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">
              A charge has to be due sometime — ageing and the defaulter list read it from here (§24.1).
            </p>
          </div>

          <div>
            <Label>Description *</Label>
            <Input
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Required — e.g. Board exam fee Sem 3"
              className={!narration.trim() ? 'border-red-300' : ''}
            />
            {!narration.trim() && (
              <p className="text-xs text-red-500 mt-1">Description is required — a charge without one creates an ambiguous audit entry.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="py-5">
          <div className="text-sm text-blue-600 font-medium mb-2">Preview — What this adds to ledger:</div>
          <div className="text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span>Type: {CHARGE_TYPES.find(c => c.value === chargeType)?.label}</span>
              <SignedAmount value={chargeAmount} />
            </div>
            <div className="font-medium">
              New Balance: {formatPKR(student.computedBalance)} → {formatPKR(newBalance)}
              <span className="text-amber-500 ml-2">(charge increases balance)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading || chargeAmount <= 0 || !narration.trim()}>
          {loading ? 'Adding...' : `Add Charge ${formatPKR(chargeAmount)}`}
        </Button>
      </div>
    </div>
  );
}
