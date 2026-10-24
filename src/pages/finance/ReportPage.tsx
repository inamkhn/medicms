// ============================================
// MediCMS Desktop — Finance: one report's page (§54, §70.2)
// The address `/finance/reports/<name>` is looked up in the catalog and drawn by
// the view that owns it, so the hub, the router and the report can never
// disagree about what exists. The period is carried in the address (§54); the
// page adds the print header the screen heading cannot print (§72.2), and masks
// the payroll report for anyone who is not an Admin (§54.13).
// ============================================

import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileQuestion, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { can } from '@/lib/permissions';
import { reportByName, type ReportDescriptor } from '@/lib/finance';
import { useAuthStore, useSettingsStore } from '@/stores';
import { monthName, useReportFilters } from './reports/params';
import { BalancesView, CashBookView, MoneyFlowView, VouchersView } from './reports/MoneyReports';
import { BudgetView, CostsView, PayablesView, PayrollView, ProgramsView } from './reports/CostReports';
import { FeeCollectionView, HeldMoneyView, MonthEndView, ReceivablesView, ReconciliationView } from './reports/FeeReports';

/** §70.2 — the period line a printed report carries under its title. */
function periodLine(report: ReportDescriptor, filters: { from: string; to: string; month: string }): string {
  if (report.range === 'asAt') return `As at ${formatDate(filters.to)}`;
  if (report.range === 'month') return monthName(filters.month);
  return `${formatDate(filters.from)} to ${formatDate(filters.to)}`;
}

/** The one view that answers this report. */
function ReportBody({ report }: { report: ReportDescriptor }) {
  switch (report.name) {
    case 'money-flow': return <MoneyFlowView report={report} />;
    case 'balances': return <BalancesView report={report} />;
    case 'cash-book': return <CashBookView report={report} />;
    case 'vouchers': return <VouchersView report={report} />;
    case 'costs': return <CostsView report={report} />;
    case 'budget': return <BudgetView report={report} />;
    case 'payables': return <PayablesView report={report} />;
    case 'fee-collection': return <FeeCollectionView report={report} />;
    case 'receivables': return <ReceivablesView report={report} />;
    case 'held-money': return <HeldMoneyView report={report} />;
    case 'programs': return <ProgramsView report={report} />;
    case 'reconciliation': return <ReconciliationView report={report} />;
    case 'month-end': return <MonthEndView report={report} />;
    case 'payroll': return <PayrollView report={report} />;
    default: return null;
  }
}

export default function ReportPage() {
  const navigate = useNavigate();
  const { name = '' } = useParams();
  const [filters] = useReportFilters();
  const role = useAuthStore((s) => s.user?.role);
  const instituteName = useSettingsStore((s) => s.instituteName);
  const instituteAddress = useSettingsStore((s) => s.instituteAddress);
  const institutePhone = useSettingsStore((s) => s.institutePhone);

  const report = reportByName(name);
  const masked = Boolean(report?.adminOnly) && !can(role, 'payroll.compensation.view');

  if (!report) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/reports')}>
            <ArrowLeft size={14} />
          </Button>
          <h1 className="text-section font-bold text-slate-900">Report not found</h1>
        </div>
        <Card><CardContent className="flex items-center gap-3 py-8 text-body text-slate-500">
          <FileQuestion size={18} className="shrink-0 text-slate-400" />
          <span>
            There is no report called “{name}”.
            {' '}
            <button type="button" className="text-slate-700 underline-offset-2 hover:underline" onClick={() => navigate('/finance/reports')}>
              Back to the reports hub
            </button>
            .
          </span>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* §72.2 — the header that repeats on a printed page. */}
      <div className="hidden print:block print-area text-center text-black">
        <div className="text-lg font-bold">{instituteName}</div>
        <div className="text-sm">{instituteAddress} · {institutePhone}</div>
        <div className="mt-1 font-bold">{report.title}</div>
        <div className="text-sm">{periodLine(report, filters)}</div>
      </div>

      <div className="flex items-center gap-2 print:hidden">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance/reports')}>
          <ArrowLeft size={14} />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-section font-bold text-slate-900">{report.title}</h1>
          <p className="text-micro text-slate-500">{periodLine(report, filters)} · {report.view === 'Both' ? 'both views' : `${report.view.toLowerCase()} view`} (§52)</p>
        </div>
      </div>

      {masked ? (
        <Card><CardContent className="flex items-center gap-3 py-8 text-body text-slate-500">
          <Lock size={18} className="shrink-0 text-slate-400" />
          <span>
            This report shows individual pay, so only an Admin may open it (§54.13).
            {' '}
            {can(role, 'payroll.reports.view') && (
              <>
                <button type="button" className="text-slate-700 underline-offset-2 hover:underline" onClick={() => navigate('/staff/reports')}>
                  The payroll reports
                </button>
                {' '}give the same totals as batches.
              </>
            )}
          </span>
        </CardContent></Card>
      ) : (
        <div className="print-area">
          <ReportBody report={report} />
        </div>
      )}
    </div>
  );
}
