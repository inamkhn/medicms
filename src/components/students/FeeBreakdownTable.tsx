// Student module — receipt-style fee breakdown (spec §5).
// Read-only template lines; concession is the ONLY editable input.
//
// The lines are the heads derived from the student's fee template components
// (FEE_TEMPLATES_AND_ADMISSION_DESIGN §5), not a stored eight-head row: this table
// renders whatever `termHeadsOf` produced for the term being billed, so a template
// with an extra component shows it under "Other Fees" instead of losing the money.

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPKR } from '@/lib/utils';
import { HEAD_KEYS, HEAD_LABELS, OTHER_FEES_LABEL, type HeadKey } from '@/lib/fee/templateCompat';
import type { LegacyFeeHeads } from '@/types';

/** Heads that belong to every admission, so they are shown even at zero. */
const ALWAYS_SHOWN: readonly HeadKey[] = ['admissionFee', 'tuitionFee', 'idCardFee', 'securityFee', 'enrollmentFee'];

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <span className="flex-1 border-b border-dotted border-slate-300" />
      <span className="tabular-nums text-slate-900">{formatPKR(amount)}</span>
    </div>
  );
}

export function FeeBreakdownTable({ lines, total, totalLabel, concession, onConcession, recurring, net }: {
  lines: LegacyFeeHeads;
  total: number;
  /** Which term this charge is for; the label used to read "Semester 1 Total". */
  totalLabel?: string;
  concession: number;
  onConcession: (v: number) => void;
  recurring: number;
  net: number;
}) {
  const headRows = HEAD_KEYS
    .filter((key) => ALWAYS_SHOWN.includes(key) || lines[key] > 0)
    .map((key) => ({ key, label: HEAD_LABELS[key], amount: lines[key] }));

  return (
    <div className="space-y-2">
      {headRows.map((row) => <Row key={row.key} label={row.label} amount={row.amount} />)}
      {lines.otherFees > 0 && <Row label={OTHER_FEES_LABEL} amount={lines.otherFees} />}
      <div className="flex items-baseline gap-2 text-sm font-semibold pt-1 border-t border-slate-200">
        <span>{totalLabel ?? 'Term Total'}</span>
        <span className="flex-1 border-b border-dotted border-slate-300" />
        <span className="tabular-nums">{formatPKR(total)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1">
        <Label htmlFor="concession">Concession (optional)</Label>
        <Input
          id="concession"
          type="number"
          min={0}
          max={total}
          value={concession || ''}
          onChange={(e) => onConcession(Math.max(0, parseInt(e.target.value) || 0))}
          placeholder="PKR ____"
          className="w-[140px] text-right tabular-nums"
        />
      </div>
      <div className="flex items-baseline gap-2 text-sm font-bold pt-1 border-t border-slate-200">
        <span>Net Payable</span>
        <span className="flex-1 border-b border-dotted border-slate-300" />
        <span className="tabular-nums">{formatPKR(net)}</span>
      </div>
      <p className="text-xs text-slate-500">
        Locked promotion fee (next term's charge): <strong className="tabular-nums">{formatPKR(recurring)}</strong>
      </p>
    </div>
  );
}
