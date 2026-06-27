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
import { getStudentsWithBalance } from '@/lib/mockData';

export default function AddCharge() {
  const { sno } = useParams<{ sno: string }>();
  const navigate = useNavigate();

  const student = getStudentsWithBalance().find(s => s.sno.toString() === sno);
  const [chargeType, setChargeType] = useState<string>(CHARGE_TYPES[0].value);
  const [amount, setAmount] = useState('2700');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState<string>(CHARGE_TYPES[0].defaultNarration);
  const [receiptNo, setReceiptNo] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (chargeAmount <= 0) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    navigate(`/ledger/${student.sno}`);
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
          {/* Charge Type */}
          <div>
            <Label>Charge Type</Label>
            <div className="space-y-2 mt-2">
              {CHARGE_TYPES.map(ct => (
                <label key={ct.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="chargeType"
                    value={ct.value}
                    checked={chargeType === ct.value}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="accent-blue-500 w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">{ct.label}</span>
                  {ct.defaultNarration && (
                    <span className="text-xs text-slate-400">({ct.defaultNarration})</span>
                  )}
                </label>
              ))}
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
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Narration</Label>
            <Input
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Auto-filled based on type — editable"
            />
          </div>

          <div>
            <Label>Receipt No.</Label>
            <Input
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
              placeholder="If receipt issued for this charge"
            />
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="py-5">
          <div className="text-sm text-blue-600 font-medium mb-2">Preview — What this adds to ledger:</div>
          <div className="text-sm space-y-1">
            <div>Type: {CHARGE_TYPES.find(c => c.value === chargeType)?.label} · Fees: 0 · Discount: −{formatPKR(chargeAmount)} · Payment: 0</div>
            <div className="font-medium">
              New Balance: {formatPKR(student.computedBalance)} → {formatPKR(newBalance)}
              <span className="text-amber-500 ml-2">(charge increases balance)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading || chargeAmount <= 0}>
          {loading ? 'Adding...' : 'Add Charge to Ledger'}
        </Button>
      </div>
    </div>
  );
}
