// ============================================
// MediCMS Desktop — Finance reports: the filters every report shares (§54, §70.2)
// A date range (or an "as at" date, or a month), a comparison with the previous
// period or the same period last year, and the CSV name. All of it lives in the
// page address, so a report can be bookmarked or sent as a link (§54), and this
// one hook reads it back so no report invents its own parameters.
// ============================================

import { useSearchParams } from 'react-router-dom';
import { addDays, addMonths, dayKey, daysBetween, thisMonthKey } from '@/lib/dates';
import { downloadCsv, type CsvCell } from '@/lib/csv';

/** §70.2 — Compare: None, Previous period, Same period last year. */
export type CompareMode = 'none' | 'previous' | 'lastYear';

export const COMPARE_LABELS: Record<CompareMode, string> = {
  none: 'No comparison',
  previous: 'Previous period',
  lastYear: 'Same period last year',
};

export interface ReportFilters {
  from: string;
  to: string;
  /** `YYYY-MM`, used by the month-based reports (budget, month-end, reconciliation). */
  month: string;
  compare: CompareMode;
  /** §70.2 Show transfers. */
  showTransfers: boolean;
  /** The report's own filters, by name: account, vendor. */
  accountId: string;
  vendorId: string;
}

/**
 * The filters in one shape. Defaults are the current month to date; a report
 * that is about a single day reads `to` as its "as at" date and ignores `from`.
 */
export function useReportFilters(): [ReportFilters, (patch: Partial<ReportFilters>) => void] {
  const [params, setParams] = useSearchParams();
  const filters: ReportFilters = {
    from: params.get('from') || `${thisMonthKey()}-01`,
    to: params.get('to') || dayKey(),
    month: params.get('month') || thisMonthKey(),
    compare: (params.get('compare') as CompareMode) || 'none',
    showTransfers: params.get('transfers') === '1',
    accountId: params.get('account') || '',
    vendorId: params.get('vendor') || '',
  };
  const set = (patch: Partial<ReportFilters>) => {
    const next = new URLSearchParams(params);
    const entries: [string, string | undefined][] = [
      ['from', patch.from],
      ['to', patch.to],
      ['month', patch.month],
      ['compare', patch.compare === 'none' ? undefined : patch.compare],
      ['transfers', patch.showTransfers ? '1' : patch.showTransfers === false ? undefined : undefined],
      ['account', patch.accountId || undefined],
      ['vendor', patch.vendorId || undefined],
    ];
    for (const [key, value] of entries) {
      if (value === undefined && key in patch) next.delete(key);
      else if (value !== undefined) next.set(key, value);
    }
    setParams(next, { replace: true });
  };
  return [filters, set];
}

/** §70.2: the same-length period immediately before, or the same period last year. */
export function comparisonRange(
  filters: ReportFilters,
  mode: CompareMode,
): { from: string; to: string } | undefined {
  if (mode === 'none') return undefined;
  if (mode === 'lastYear') return { from: addMonths(filters.from, -12), to: addMonths(filters.to, -12) };
  const span = daysBetween(filters.from, filters.to);
  const to = addDays(filters.from, -1);
  return { from: addDays(to, -span), to };
}

/** §54: a report exports to CSV under its own name and period. */
export function exportReport(
  name: string,
  filters: ReportFilters,
  header: readonly CsvCell[],
  rows: readonly (readonly CsvCell[])[],
): void {
  downloadCsv(`${name}-${filters.to}.csv`, header, rows);
}

/** A month reads "October 2026" wherever it is a heading (§59). */
export function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** The last day of a `YYYY-MM` month. */
export function monthEnd(month: string): string {
  return addDays(addMonths(`${month}-01`, 1), -1);
}
