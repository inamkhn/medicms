// ============================================
// MediCMS Desktop v4.0 - Dashboard (Feature 2)
// Layout is the design doc's §13, figure-for-figure: a greeting header, TODAY's
// collection, the Students / Fees / Money columns, Needs attention, Top defaulters
// beside Today's payments, and quick actions. No arithmetic lives here — every
// number comes from lib/dashboardMetrics so its definition is stated once.
// ============================================

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Printer, Plus, CreditCard, Search, FileText,
  RefreshCw, Layers, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatPKR } from '@/lib/utils';
import { greeting, longDate, dayKey } from '@/lib/dates';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { computeDashboardMetrics, type AttentionItem, type ReceiptStock } from '@/lib/dashboardMetrics';
import { bookSummaries, receiptFactsOf } from '@/lib/receipts';
import { can } from '@/stores';
import {
  useUIStore, useAuthStore, useStudentStore, useLedgerStore, useBankStore,
  useExpenseStore, useBudgetStore, useReceiptBookStore, useBatchStore, useSettingsStore,
  useFeeTemplateStore,
} from '@/stores';
import { DailySummary } from '@/components/dashboard/DailySummary';

/** A figure you can click. §13: "make every number clickable". */
function StatTile({
  label, value, hint, onClick, tone = 'ink',
}: {
  label: string;
  value: string | number;
  hint?: string;
  onClick?: () => void;
  tone?: 'ink' | 'dues' | 'credit' | 'muted';
}) {
  const toneClass = {
    ink: 'text-ink',
    dues: 'text-dues',
    credit: 'text-credit',
    muted: 'text-ink-muted',
  }[tone];

  const inner = (
    <>
      <div className="text-micro font-medium uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className={cn('mt-1 truncate text-ui font-semibold leading-tight', toneClass)}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-micro text-ink-muted">{hint}</div>}
    </>
  );

  if (!onClick) {
    return <div className="min-w-0 flex-1 px-3 py-2.5">{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 flex-1 cursor-pointer rounded-control px-3 py-2.5 text-left transition-colors duration-120 ease-standard hover:bg-accent-soft"
    >
      {inner}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-micro font-semibold uppercase tracking-widest text-ink-subtle">{children}</div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const openSearch = useUIStore((s) => s.openSearch);
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const students = useStudentStore((s) => s.students);
  const ledger = useLedgerStore((s) => s.entries);
  const bankTxs = useBankStore((s) => s.transactions);
  const expenses = useExpenseStore((s) => s.expenses);
  const budgets = useBudgetStore((s) => s.budgets);
  const books = useReceiptBookStore((s) => s.books);
  const bookEvents = useReceiptBookStore((s) => s.events);
  const reprints = useReceiptBookStore((s) => s.reprints);
  const batches = useBatchStore((s) => s.batches);
  const templates = useFeeTemplateStore((s) => s.templates);
  const showTestRecords = useSettingsStore((s) => s.showTestRecords);
  // Select primitives individually. A selector returning a fresh object literal
  // (`{ name, address, phone }`) breaks under zustand v5 + React 19: getSnapshot
  // is never "cached", so it re-renders in an infinite loop and the page dies.
  const instituteName = useSettingsStore((s) => s.instituteName);
  const instituteAddress = useSettingsStore((s) => s.instituteAddress);
  const institutePhone = useSettingsStore((s) => s.institutePhone);

  // Overdue is measured against the local calendar day — the same `today` the
  // directory and the ledger use (§15).
  const today = dayKey();

  const metrics = useMemo(() => {
    const withBalance = getStudentsWithBalanceLive(students, ledger).filter(
      (s) => showTestRecords || !s.isTestRecord,
    );
    // §24 the low-stock warning reads the register, so "8 receipts left" means the
    // same thing here, on the receipts screen and at the payment counter.
    const bookStock: ReceiptStock[] = bookSummaries(
      books,
      books.flatMap((book) => receiptFactsOf(ledger, book, new Map(Object.entries(reprints)))),
      bookEvents,
    ).map((slot) => ({ id: slot.book.id, name: slot.book.name, left: slot.summary.left }));
    return computeDashboardMetrics({
      // §18 scopes the dashboard to the counter operator only: they see their own
      // receipts and no money-in-the-bank figures. A Viewer sees every figure but
      // gets no quick actions (handled below via the permission matrix). Which
      // pages each role may OPEN stays governed by the one shared rule set (§3).
      seesOwnOnly: role === 'Counter',
      seesMoney: role !== 'Counter',
      userName: user?.name ?? '',
      today,
      students: withBalance,
      ledger,
      bank: bankTxs,
      expenses,
      budgets,
      books: bookStock,
      batches,
      templates,
    });
  }, [students, ledger, bankTxs, expenses, budgets, books, bookEvents, reprints, batches, templates, showTestRecords, role, user?.name, today]);

  const m = metrics;
  const canAct = can(role, 'student.admit'); // Viewer has no write capability at all (§18)

  const go = (path: string) => () => navigate(path);

  const quickActions: { label: string; icon: typeof Plus; perm: Parameters<typeof can>[1]; run: () => void }[] = [
    { label: 'New admission', icon: Plus, perm: 'student.admit', run: go('/admissions/new') },
    { label: 'Record payment', icon: CreditCard, perm: 'payment.record', run: go('/payments/record') },
    { label: 'Search', icon: Search, perm: 'student.view', run: openSearch },
    { label: 'Reports', icon: FileText, perm: 'reports.view', run: go('/reports') },
    { label: 'Batch promotion', icon: RefreshCw, perm: 'ledger.adjust', run: go('/ledger/bulk-demand') },
    { label: 'Batches', icon: Layers, perm: 'batch.manage', run: go('/batches') },
  ];

  return (
    <>
    <div className="print:hidden space-y-4">
      {/* ============================================ Header (§13) */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-page font-semibold tracking-tight text-ink">
            {greeting()}, {user?.name?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="mt-0.5 text-meta text-ink-muted">{longDate()}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer size={14} className="mr-1.5" />
          Print summary
        </Button>
      </div>

      {/* ============================================ TODAY (§13) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-2">
          <SectionLabel>Today</SectionLabel>
          <span className="text-micro text-ink-subtle">{longDate()}</span>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-2 p-2 pt-0">
          <StatTile
            label="Collected today"
            value={formatPKR(m.collectedToday)}
            onClick={go('/payments/reprint?date=today')}
          />
          <div className="h-auto w-px self-stretch bg-hairline" />
          <StatTile
            label="Receipts"
            value={m.receiptsToday}
            hint={role === 'Counter' ? 'issued by you' : undefined}
            onClick={go('/payments/reprint?date=today')}
          />
          <div className="h-auto w-px self-stretch bg-hairline" />
          <StatTile label="Cash" value={formatPKR(m.cashToday)} />
          <div className="h-auto w-px self-stretch bg-hairline" />
          <StatTile label="Bank / Online / Cheque" value={formatPKR(m.bankToday)} />
        </CardContent>
      </Card>

      {/* ============================================ Students | Fees | Money (§13) */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="px-4 py-2">
            <SectionLabel>Students</SectionLabel>
          </CardHeader>
          <CardContent className="flex flex-col gap-0.5 p-2 pt-0">
            <StatTile label="Active" value={m.activeCount} onClick={go('/students?status=active')} />
            <StatTile label="Struck off" value={m.struckOffCount} tone="muted" onClick={go('/students?status=struck_off')} />
            <StatTile label="Total" value={m.totalCount} onClick={go('/students')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 py-2">
            <SectionLabel>Fees</SectionLabel>
          </CardHeader>
          <CardContent className="flex flex-col gap-0.5 p-2 pt-0">
            <StatTile
              label="Outstanding"
              value={formatPKR(m.outstandingDues)}
              tone="dues"
              onClick={go('/students?status=dues&sort=balance')}
            />
            <StatTile
              label="Of which overdue"
              value={formatPKR(m.overdueDues)}
              tone="dues"
              onClick={go('/students?status=overdue&sort=balance')}
            />
            <StatTile
              label="Credit held"
              value={formatPKR(m.creditHeld)}
              tone="credit"
              onClick={go('/students?status=credit')}
            />
            <StatTile
              label="Struck-off dues"
              value={formatPKR(m.struckOffDues)}
              tone="muted"
              onClick={go('/students?status=struck_off')}
            />
            <StatTile label="Collected this month" value={formatPKR(m.collectedThisMonth)} />
          </CardContent>
        </Card>

        {m.bankBalance !== null && (
          <Card>
            <CardHeader className="px-4 py-2">
              <SectionLabel>Money</SectionLabel>
            </CardHeader>
            <CardContent className="flex flex-col gap-0.5 p-2 pt-0">
              <StatTile label="Bank balance" value={formatPKR(m.bankBalance)} onClick={go('/bank')} />
              <StatTile
                label="Expenses this month"
                value={formatPKR(m.expensesThisMonth ?? 0)}
                onClick={go('/expenses?month=this')}
              />
              {m.budgetUsedPct !== null ? (
                <StatTile label="Budget used" value={`${m.budgetUsedPct}%`} tone={m.budgetUsedPct > 100 ? 'dues' : 'ink'} />
              ) : (
                <StatTile label="Budget used" value="No budget set" tone="muted" />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ============================================ Needs attention (§17) */}
      {m.attention.length > 0 && (
        <Card>
          <CardHeader className="px-4 py-2">
            <SectionLabel>Needs attention</SectionLabel>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            {m.attention.map((a) => (
              <AttentionRow key={a.id} item={a} onOpen={go(a.href)} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ============================================ Defaulters | Today's payments (§13) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-2">
            <SectionLabel>Top defaulters (active)</SectionLabel>
            <Button variant="ghost" size="sm" onClick={go('/students?status=overdue&sort=balance')}>
              View all
              <ChevronRight size={14} className="ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            {m.topDefaulters.length === 0 ? (
              <EmptyRow>No active student has overdue dues right now.</EmptyRow>
            ) : (
              m.topDefaulters.map((s) => (
                <button
                  key={s.sno}
                  type="button"
                  onClick={go(`/ledger/${s.sno}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-control px-2 py-1.5 text-left transition-colors duration-120 ease-standard hover:bg-accent-soft"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body font-medium text-ink">{s.name}</span>
                    <span className="block truncate text-micro text-ink-muted">
                      SNO:{s.sno} · {s.batch} · {s.semester} term
                    </span>
                  </span>
                  <span className="flex-none text-right">
                    <span className="block text-body font-semibold text-dues">{formatPKR(s.overdue)}</span>
                    <span className="block text-micro text-ink-muted">{s.daysOverdue} days</span>
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-2">
            <SectionLabel>Today&apos;s payments</SectionLabel>
            <Button variant="ghost" size="sm" onClick={go('/payments/reprint?date=today')}>
              Receipts
              <ChevronRight size={14} className="ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            {m.todayReceipts.length === 0 ? (
              <EmptyRow>Nothing collected today.</EmptyRow>
            ) : (
              m.todayReceipts.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-2 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-body font-medium text-ink">{r.name}</span>
                    <span className="block truncate text-micro text-ink-muted">
                      R-{r.receiptNo}{r.mode ? ` · ${r.mode}` : ''}
                    </span>
                  </span>
                  <span className="flex-none text-body font-semibold text-ink">{formatPKR(r.amount)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============================================ Quick actions (§13/§18) */}
      {canAct && (
        <Card>
          <CardHeader className="px-4 py-2">
            <SectionLabel>Quick actions</SectionLabel>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="flex flex-wrap gap-1.5">
              {quickActions.filter((a) => can(role, a.perm)).map(({ label, icon: Icon, run }) => (
                <Button key={label} variant="outline" size="sm" onClick={run}>
                  <Icon size={14} className="mr-1.5" />
                  {label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>

      {/* §19 — the printout is a purpose-built sheet, never a screenshot of the
          screen above. It must be a SIBLING of the print:hidden wrapper: an
          ancestor's display:none suppresses even a `print:block` descendant. */}
      <DailySummary
        metrics={m}
        institute={{ name: instituteName, address: instituteAddress, phone: institutePhone }}
        printedBy={user?.name ?? 'Unknown'}
        role={role ?? 'Unknown'}
      />
    </>
  );
}

function AttentionRow({ item, onOpen }: { item: AttentionItem; onOpen: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-hairline-soft">
      <span className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={14} className="flex-none text-dues" />
        <Badge variant="outline" className="flex-none">
          {item.count}
        </Badge>
        <span className="truncate text-body text-ink-secondary">{item.label}</span>
      </span>
      <Button variant="subtle" size="sm" className="flex-none" onClick={onOpen}>
        {item.action}
      </Button>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-4 text-center text-meta text-ink-subtle">{children}</div>;
}
