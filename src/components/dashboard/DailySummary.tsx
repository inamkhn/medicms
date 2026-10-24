// ============================================
// MediCMS Desktop v4.0 — Daily Summary printout (Feature 2 §19)
// A purpose-built one-page A4 layout, NOT a screenshot of the dashboard. It prints
// the institute header, the date, who printed it, today's collection split by mode,
// the day's receipt list, and the closing counts. Rendered in a `.print-area` that
// is hidden on screen; the whole dashboard body carries `print:hidden` so a plain
// window.print() emits only this sheet.
// ============================================

import type { DashboardMetrics } from '@/lib/dashboardMetrics';
import { formatPKR } from '@/lib/utils';
import { longDate } from '@/lib/dates';

interface Props {
  metrics: DashboardMetrics;
  institute: { name: string; address: string; phone: string };
  printedBy: string;
  role: string;
}

export function DailySummary({ metrics, institute, printedBy, role }: Props) {
  const m = metrics;
  return (
    <div className="hidden print:block print-area w-full text-meta leading-snug text-black">
      {/* Header */}
      <div className="border-b-2 border-black pb-2">
        <div className="text-ui font-bold uppercase">{institute.name}</div>
        <div className="text-micro">{institute.address} · {institute.phone}</div>
        <div className="mt-1 flex justify-between text-micro">
          <span className="font-semibold">Daily Summary</span>
          <span>{longDate()}</span>
        </div>
        <div className="text-micro">Printed by: {printedBy} ({role})</div>
      </div>

      {/* Collection by mode */}
      <table className="mt-3 w-full border-collapse text-meta">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 font-semibold">Today&apos;s collection</th>
            <th className="py-1 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-black/40"><td className="py-1">Cash</td><td className="py-1 text-right">{formatPKR(m.cashToday)}</td></tr>
          <tr className="border-b border-black/40"><td className="py-1">Bank / Online / Cheque</td><td className="py-1 text-right">{formatPKR(m.bankToday)}</td></tr>
          <tr className="border-b border-black font-semibold"><td className="py-1">Total collected</td><td className="py-1 text-right">{formatPKR(m.collectedToday)}</td></tr>
          <tr><td className="py-1">Receipts issued</td><td className="py-1 text-right">{m.receiptsToday}</td></tr>
        </tbody>
      </table>

      {/* Receipt list */}
      <div className="mt-4 text-micro font-semibold uppercase tracking-wide">Receipts today</div>
      <table className="mt-1 w-full border-collapse text-micro">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 font-semibold">Receipt</th>
            <th className="py-1 font-semibold">Student</th>
            <th className="py-1 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {m.todayReceipts.length === 0 ? (
            <tr><td colSpan={3} className="py-2 text-center text-black/60">No receipts recorded today.</td></tr>
          ) : (
            m.todayReceipts.map((r, i) => (
              <tr key={i} className="border-b border-black/30">
                <td className="py-0.5">{r.receiptNo}</td>
                <td className="py-0.5">{r.name}</td>
                <td className="py-0.5 text-right">{formatPKR(r.amount)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Closing counts */}
      <table className="mt-4 w-full border-collapse text-meta">
        <caption className="mb-1 text-left text-micro font-semibold uppercase tracking-wide">Position at close</caption>
        <tbody>
          <tr className="border-b border-black/40"><td className="py-1">Active students</td><td className="py-1 text-right">{m.activeCount}</td></tr>
          <tr className="border-b border-black/40"><td className="py-1">Struck off</td><td className="py-1 text-right">{m.struckOffCount}</td></tr>
          <tr className="border-b border-black/40"><td className="py-1">Total students</td><td className="py-1 text-right">{m.totalCount}</td></tr>
          <tr className="border-b border-black/40"><td className="py-1">Outstanding dues (active)</td><td className="py-1 text-right">{formatPKR(m.outstandingDues)}</td></tr>
          <tr className="border-b border-black/40"><td className="py-1">Of which overdue</td><td className="py-1 text-right">{formatPKR(m.overdueDues)}</td></tr>
          <tr className="border-b border-black/40"><td className="py-1">Credit held</td><td className="py-1 text-right">{formatPKR(m.creditHeld)}</td></tr>
          <tr className="border-b border-black/40"><td className="py-1">Struck-off dues</td><td className="py-1 text-right">{formatPKR(m.struckOffDues)}</td></tr>
          <tr className="border-b border-black/40"><td className="py-1">Collected this month</td><td className="py-1 text-right">{formatPKR(m.collectedThisMonth)}</td></tr>
          {m.bankBalance !== null && (
            <tr><td className="py-1">Bank balance</td><td className="py-1 text-right">{formatPKR(m.bankBalance)}</td></tr>
          )}
        </tbody>
      </table>

      <div className="mt-6 flex justify-between border-t border-black pt-2 text-micro">
        <span>Accountant: ______________________</span>
        <span>Signature: ______________________</span>
      </div>
    </div>
  );
}
