import { formatPKR } from '@/lib/utils';

// ============================================
// PayslipDoc — STAFF_PAYROLL_DESIGN §59.1 (A4, Admin only)
// A pure presentational payslip, rendered inside a `.print-area` so the print CSS
// flattens it to black-on-white (§ print conventions). Every figure is re-derived
// from the frozen approved line by the caller — the doc stores nothing. It carries
// the CONFIDENTIAL banner, the snapshot provenance note, and — when a settling
// cheque has not cleared — the `CHEQUE SUBJECT TO CLEARANCE` line (§59.1). It is
// deliberately NOT a receipt, a voucher, or proof a transfer cleared.
// ============================================

export interface PayslipDocProps {
  instituteName: string;
  instituteLocation: string;
  serviceMonthLabel: string;
  runNumber: string;
  printedAt: string;
  printedBy: string;
  staffName: string;
  staffNo: string;
  designation: string;
  department?: string;
  /** The additive earnings components that made up the gross. */
  earnings: readonly { label: string; amount: number }[];
  reductions: number;
  gross: number;
  recoveries: readonly { label: string; amount: number }[];
  net: number;
  /** The payout mode/reference that settled (or will settle) the line, masked. */
  paymentLabel?: string;
  /** Approved net less cleared and pending — still to disburse. */
  remaining: number;
  /** A settling cheque has not cleared yet (§59.1). */
  pendingCheque: boolean;
  zeroPayReason?: string;
}

export function PayslipDoc(props: PayslipDocProps) {
  const recoveryTotal = props.recoveries.reduce((sum, r) => sum + r.amount, 0);
  return (
    <div className="mx-auto max-w-[720px] border border-hairline-strong bg-surface p-8 text-ink">
      <div className="flex items-start justify-between border-b-2 border-hairline-strong pb-3">
        <div>
          <div className="text-page font-semibold">{props.instituteName}</div>
          <div className="text-meta text-ink-muted">{props.instituteLocation}</div>
        </div>
        <div className="text-right">
          <div className="text-section font-semibold">PAYSLIP</div>
          <div className="text-micro font-semibold uppercase tracking-wide text-ink-subtle">Confidential</div>
          <div className="text-meta">Service month: {props.serviceMonthLabel}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-1 py-4 text-body">
        <div className="flex justify-between"><span className="text-ink-muted">Staff</span><span>{props.staffName}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">Staff #</span><span className="num">{props.staffNo}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">Designation</span><span>{props.designation}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">Department</span><span>{props.department ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">Run</span><span className="num">{props.runNumber}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">Printed</span><span>{props.printedAt} by {props.printedBy}</span></div>
      </div>

      <div className="border-t border-hairline pt-3">
        <div className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Earnings</div>
        {props.earnings.map((e) => (
          <div key={e.label} className="flex justify-between text-body"><span>{e.label}</span><span className="num">{formatPKR(e.amount)}</span></div>
        ))}
        {props.reductions > 0 && (
          <div className="flex justify-between text-body"><span>Reductions</span><span className="num">− {formatPKR(props.reductions)}</span></div>
        )}
        {props.zeroPayReason && (
          <div className="flex justify-between text-body italic"><span>Zero pay</span><span>{props.zeroPayReason}</span></div>
        )}
        <div className="mt-1 flex justify-between border-t border-hairline pt-1 font-semibold"><span>Gross</span><span className="num">{formatPKR(props.gross)}</span></div>
      </div>

      {props.recoveries.length > 0 && (
        <div className="mt-3 border-t border-hairline pt-3">
          <div className="mb-1 text-micro font-semibold uppercase tracking-wide text-ink-subtle">Recoveries</div>
          {props.recoveries.map((r) => (
            <div key={r.label} className="flex justify-between text-body"><span>{r.label}</span><span className="num">({formatPKR(r.amount)})</span></div>
          ))}
          <div className="flex justify-between text-body text-ink-muted"><span>Total recovery</span><span className="num">({formatPKR(recoveryTotal)})</span></div>
        </div>
      )}

      <div className="mt-3 flex justify-between border-t-2 border-hairline-strong pt-2 text-section font-semibold">
        <span>NET PAYABLE</span>
        <span className="num">{formatPKR(props.net)}</span>
      </div>

      <div className="mt-2 text-body">
        <div className="flex justify-between"><span className="text-ink-muted">Payments / mode</span><span>{props.paymentLabel ?? 'Not yet paid'}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">Remaining payable</span><span className="num">{formatPKR(props.remaining)}</span></div>
      </div>

      {props.pendingCheque && (
        <div className="mt-3 border border-hairline-strong p-2 text-center text-meta font-semibold uppercase tracking-wide">
          Cheque subject to clearance
        </div>
      )}

      <p className="mt-4 border-t border-hairline pt-3 text-micro text-ink-muted">
        Generated from the approved payroll snapshot. Any later correction appears as a linked supplemental payslip, not a rewrite of this one (§59.1).
      </p>
    </div>
  );
}
