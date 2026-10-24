// ============================================
// MediCMS Desktop — Finance reports: the pieces every report page draws (§70.2)
// The period control, the month stepper, Export CSV and Print, and the two
// shapes every report repeats (its heading and its figure rows). Components
// only — the filters and the period arithmetic are in `./params`.
// ============================================

import type { ReactNode } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addDays, addMonths, dayKey, thisMonthKey } from '@/lib/dates';
import type { ReportDescriptor } from '@/lib/finance';
import { COMPARE_LABELS, type CompareMode, type ReportFilters } from './params';

/** The period control: two dates and the comparison (§70.2). */
export function PeriodBar({ filters, onChange, children }: {
  filters: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  children?: ReactNode;
}) {
  const monthStart = `${filters.month}-01`;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <span className="block text-micro text-slate-500">From</span>
        <Input type="date" value={filters.from} onChange={(e) => onChange({ from: e.target.value })} className="h-7 w-36 text-meta" />
      </div>
      <div className="space-y-1">
        <span className="block text-micro text-slate-500">To</span>
        <Input type="date" value={filters.to} onChange={(e) => onChange({ to: e.target.value })} className="h-7 w-36 text-meta" />
      </div>
      <div className="space-y-1">
        <span className="block text-micro text-slate-500">Compare</span>
        <Select value={filters.compare} onValueChange={(v) => onChange({ compare: v as CompareMode })}>
          <SelectTrigger className="h-7 w-48 text-meta"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(COMPARE_LABELS) as CompareMode[]).map((mode) => (
              <SelectItem key={mode} value={mode}>{COMPARE_LABELS[mode]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {children}
      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => onChange({ from: monthStart, to: addDays(addMonths(monthStart, 1), -1) })}>
          Whole month
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => onChange({ from: `${thisMonthKey()}-01`, to: dayKey() })}>
          Month to date
        </Button>
      </div>
    </div>
  );
}

/** One date, for the reports that are a position rather than a flow (§53). */
export function AsAtBar({ filters, onChange, children }: {
  filters: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <span className="block text-micro text-slate-500">As at</span>
        <Input type="date" value={filters.to} onChange={(e) => onChange({ to: e.target.value })} className="h-7 w-36 text-meta" />
      </div>
      {children}
    </div>
  );
}

/** A month stepper, for the reports that are about one month (§47, §48, §42). */
export function MonthBar({ month, onChange, children }: {
  month: string;
  onChange: (month: string) => void;
  children?: ReactNode;
}) {
  const monthStart = `${month}-01`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => onChange(addMonths(monthStart, -1).slice(0, 7))}>‹</Button>
      <Input type="month" value={month} onChange={(e) => onChange(e.target.value || thisMonthKey())} className="h-7 w-40 text-meta" />
      <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => onChange(addMonths(monthStart, 1).slice(0, 7))}>›</Button>
      {children}
    </div>
  );
}

/** §70.2 — Export CSV and Print, the pair every report page carries. */
export function ReportActions({ onExport }: { onExport: () => void }) {
  return (
    <div className="flex items-center gap-1.5 print:hidden">
      <Button variant="outline" size="sm" className="h-7 text-meta" onClick={onExport}>
        <Download size={12} className="mr-1.5" /> Export CSV
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => window.print()}>
        <Printer size={12} className="mr-1.5" /> Print
      </Button>
      <span className="text-micro text-slate-400">PDF comes from Print (§54).</span>
    </div>
  );
}

/** One report's heading and question, above the figures it prints. */
export function ReportHeading({ report, children }: { report: ReportDescriptor; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
      <div>
        <h2 className="text-title font-semibold text-slate-900">{report.title}</h2>
        <p className="text-meta text-slate-500">{report.question}</p>
      </div>
      {children}
    </div>
  );
}

/** A label with its figure — the shape every summary block in these reports uses. */
export function Figure({ label, amount, tone }: { label: string; amount: string; tone?: 'in' | 'out' | 'total' }) {
  const colour = tone === 'in' ? 'text-green-600' : tone === 'out' ? 'text-red-600' : 'text-slate-900';
  const weight = tone === 'total' ? 'font-bold' : 'font-medium';
  return (
    <div className={`flex items-center justify-between gap-3 text-meta ${tone === 'total' ? 'border-t border-hairline-soft pt-1.5' : ''}`}>
      <span className={tone === 'total' ? 'font-medium text-slate-700' : 'text-slate-500'}>{label}</span>
      <span className={`num ${weight} ${colour}`}>{amount}</span>
    </div>
  );
}
