// ============================================
// MediCMS Desktop — Finance: the reports hub (§54, §70.1)
// A grid of cards, each phrased as the question it answers, in the doc's four
// groups — Money, Costs, Fees, Control. Every card carries the view it reads
// (§52) and opens `/finance/reports/<name>`, which is also the name the catalog
// gives it, so a card cannot point at a report that does not exist (§70.1).
// ============================================

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { can } from '@/lib/permissions';
import { reportsInGroup, type ReportDescriptor, type ReportGroup } from '@/lib/finance';
import { useAuthStore } from '@/stores';

const GROUPS: { group: ReportGroup; title: string; blurb: string }[] = [
  { group: 'Money', title: 'Money', blurb: 'What came in, what went out and where it sits (§17, §53).' },
  { group: 'Costs', title: 'Costs', blurb: 'What we incurred, what we planned and what we still owe (§47, §54.5).' },
  { group: 'Fees', title: 'Fees', blurb: 'What students paid, what they still owe and what we hold for others (§19, §18).' },
  { group: 'Control', title: 'Control', blurb: 'Reconciliation, the month that was locked, and staff cost (§42, §48).' },
];

const VIEW_TONE: Record<ReportDescriptor['view'], string> = {
  Cash: 'text-green-700',
  Cost: 'text-amber-700',
  Ledger: 'text-slate-600',
  Both: 'text-slate-600',
};

/** §70.1 — one card: the question, its one-line answer, and the report it opens. */
function ReportCard({ report, locked, onOpen }: { report: ReportDescriptor; locked: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group rounded-card border border-hairline bg-panel p-3 text-left shadow-card transition hover:border-slate-400 hover:bg-slate-50"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 text-body font-semibold text-slate-900">{report.question}</span>
        {locked
          ? <Badge variant="outline" className="shrink-0"><Lock size={10} className="mr-1" /> Admin</Badge>
          : <Badge variant="outline" className={`shrink-0 ${VIEW_TONE[report.view]}`}>{report.view}</Badge>}
      </span>
      <span className="mt-1 block text-micro leading-snug text-slate-500">{report.description}</span>
      <span className="mt-2 flex items-center gap-1 text-meta text-slate-600 group-hover:text-slate-900">
        {report.title}
        <ArrowRight size={12} />
      </span>
    </button>
  );
}

export default function Reports() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  // §54.13 / §70.2: individual pay never appears for anyone except an Admin.
  const seesPay = can(role, 'payroll.compensation.view');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">Reports</h1>
            <p className="text-micro text-slate-500">
              Thirteen reports and the fees-owed list, each answered from the same books the screens read (§54, §56).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/budgets')}>Budgets</Button>
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => navigate('/finance/month-close')}>Month close</Button>
        </div>
      </div>

      {GROUPS.map(({ group, title, blurb }) => {
        const reports = reportsInGroup(group);
        if (reports.length === 0) return null;
        return (
          <section key={group} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-body font-semibold text-slate-900">{title}</h2>
              <p className="text-micro text-slate-400">{blurb}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {reports.map((report) => (
                <ReportCard
                  key={report.name}
                  report={report}
                  locked={Boolean(report.adminOnly) && !seesPay}
                  onOpen={() => navigate(`/finance/reports/${report.name}`)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <p className="text-micro text-slate-400">
        Filters are kept in the address, so a report can be bookmarked or sent as a link; every figure on a report opens the entries behind it (§70.2).
      </p>
    </div>
  );
}
