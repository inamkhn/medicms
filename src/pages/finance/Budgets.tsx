// ============================================
// MediCMS Desktop — Finance: Budgets (§47, §68)
// A plan per cost category per month. What is "used" is the cost view — bills
// posted that month — with the unpaid part counted as committed, so delaying a
// bill cannot save a budget (§46). Alerts at 80 and 100 percent inform, never
// block (§47). Only an Admin edits (§3); everyone else reads, with the Staff
// group collapsed to a hidden row (§47, §68).
// ============================================

import { Fragment, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, Download, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatPKR } from '@/lib/utils';
import { addMonths, thisMonthKey } from '@/lib/dates';
import { downloadCsv } from '@/lib/csv';
import { can } from '@/lib/permissions';
import {
  budgetOf,
  budgetReport,
  findCategory,
  monthStateOf,
  previousMonth,
  sameMonthLastYear,
  type BudgetRow,
} from '@/lib/finance';
import { useAuthStore, useBillsStore, useBudgetStore, useMoneyStore, useSettingsStore } from '@/stores';

function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

const YEAR_MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));

export default function Budgets() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const categories = useBillsStore((s) => s.categories);
  const bills = useBillsStore((s) => s.bills);
  const payments = useBillsStore((s) => s.payments);
  const budgets = useBudgetStore((s) => s.budgets);
  const setBudget = useBudgetStore((s) => s.setBudget);
  const copyMonth = useBudgetStore((s) => s.copyMonth);
  const monthClosures = useMoneyStore((s) => s.monthClosures);
  const limits = useSettingsStore((s) => s.financeLimits);
  const role = useAuthStore((s) => s.user?.role);

  const month = params.get('month') || thisMonthKey();
  const view = params.get('view') === 'year' ? 'year' : 'month';
  const isAdmin = can(role, 'settings.manage');
  const locked = monthStateOf(month, monthClosures) === 'Closed';
  const editable = isAdmin && !locked;

  const [spreadOpen, setSpreadOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState('');
  const [draftAmount, setDraftAmount] = useState('');

  const report = budgetReport({
    categories,
    lines: budgets,
    bills,
    payments,
    month,
    showStaff: role === 'Admin',
    noticePct: limits.budgetNoticePercent,
    warningPct: limits.budgetWarningPercent,
  });

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value); else p.delete(key);
    setParams(p, { replace: true });
  };

  const barColour = (row: BudgetRow) =>
    row.level === 'warning' ? 'bg-red-500' : row.level === 'notice' ? 'bg-amber-500' : 'bg-green-500';

  const exportCsv = () => {
    downloadCsv(
      `budgets-${month}.csv`,
      ['Category', 'Group', 'Budget', 'Paid', 'Unpaid', 'Used', 'Percent'],
      report.rows.map((row) => [row.name, row.group, row.budget, row.paid, row.unpaid, row.used, row.pct]),
    );
  };

  const addLine = () => {
    const amount = parseInt(draftAmount, 10);
    if (!draftCategory || !Number.isFinite(amount)) return;
    setBudget(draftCategory, month, amount);
    setDraftCategory('');
    setDraftAmount('');
  };

  const year = Number(month.slice(0, 4));
  const yearReports = view === 'year'
    ? YEAR_MONTHS.map((mm) => budgetReport({
        categories,
        lines: budgets,
        bills,
        payments,
        month: `${year}-${mm}`,
        showStaff: role === 'Admin',
        noticePct: limits.budgetNoticePercent,
        warningPct: limits.budgetWarningPercent,
      }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/finance')}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-section font-bold text-slate-900">Budgets</h1>
            <p className="text-micro text-slate-500">
              What we planned, and what the cost view says we have used — unpaid bills count (§46, §47).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setParam('month', previousMonth(month))}>‹</Button>
          <span className="text-meta font-medium text-slate-700 w-36 text-center">{monthName(month)}</span>
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={() => setParam('month', addMonths(`${month}-01`, 1).slice(0, 7))}>›</Button>
          <Button variant={view === 'month' ? 'default' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setParam('view', '')}>Month</Button>
          <Button variant={view === 'year' ? 'default' : 'outline'} size="sm" className="h-7 text-meta" onClick={() => setParam('view', 'year')}>Year</Button>
          <Button variant="outline" size="sm" className="h-7 text-meta" onClick={exportCsv}>
            <Download size={12} className="mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {locked && (
        <div className="flex items-center gap-2 rounded-control border border-hairline bg-slate-50 px-3 py-2 text-meta text-slate-600">
          <Lock size={14} /> {monthName(month)} is closed — budgets here are read-only until the month is reopened (§48).
        </div>
      )}

      {view === 'month' ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            {editable && (
              <>
                <div className="space-y-1">
                  <Label className="text-micro text-slate-500">Copy from</Label>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-meta"
                      onClick={() => copyMonth(previousMonth(month), month)}
                    >
                      <Copy size={12} className="mr-1.5" /> Previous month
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-meta"
                      onClick={() => copyMonth(sameMonthLastYear(month), month)}
                    >
                      Same month last year
                    </Button>
                  </div>
                </div>
                <div className="ml-auto flex items-end gap-1.5">
                  <div className="space-y-1">
                    <Label className="text-micro text-slate-500">Category</Label>
                    <Select value={draftCategory} onValueChange={setDraftCategory}>
                      <SelectTrigger className="w-56"><SelectValue placeholder="Choose category" /></SelectTrigger>
                      <SelectContent>
                        {categories.filter((c) => !c.disabled).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}{budgetOf(budgets, c.id, month) > 0 ? ' (set)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-micro text-slate-500">Amount</Label>
                    <Input num className="w-28" value={draftAmount} onChange={(e) => setDraftAmount(e.target.value)} placeholder="0" />
                  </div>
                  <Button size="sm" className="h-8 text-meta" onClick={addLine} disabled={!draftCategory || !draftAmount}>
                    Set budget
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-meta" onClick={() => setSpreadOpen(true)}>
                    Spread a year
                  </Button>
                </div>
              </>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Unpaid</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="w-48">Used against plan</TableHead>
                    <TableHead className="text-right">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-meta text-slate-400">
                        Nothing budgeted and no cost posted in {monthName(month)} yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {report.groups.map((group) => (
                    <Fragment key={`g-${group.group}`}>
                      <TableRow className="bg-slate-50/70">
                        <TableCell className="text-micro font-semibold uppercase tracking-widest text-slate-500">
                          {group.label}
                        </TableCell>
                        <TableCell className="text-right num text-slate-500">{formatPKR(group.budget)}</TableCell>
                        <TableCell className="text-right num text-slate-500">{formatPKR(group.paid)}</TableCell>
                        <TableCell className="text-right num text-slate-500">{formatPKR(group.unpaid)}</TableCell>
                        <TableCell className="text-right num text-slate-500">{formatPKR(group.used)}</TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                      {report.rows.filter((row) => row.group === group.group).map((row) => {
                        const usedPct = row.budget > 0 ? Math.min(100, Math.round((row.used / row.budget) * 100)) : 0;
                        const paidShare = row.budget > 0 ? Math.round((row.paid / row.budget) * 100) : 0;
                        return (
                          <TableRow key={row.categoryId}>
                            <TableCell className="pl-6 text-slate-700">{row.name}</TableCell>
                            <TableCell className="text-right num">{formatPKR(row.budget)}</TableCell>
                            <TableCell className="text-right num text-green-600">{formatPKR(row.paid)}</TableCell>
                            <TableCell className="text-right num text-amber-600">{formatPKR(row.unpaid)}</TableCell>
                            <TableCell className="text-right num font-medium">{formatPKR(row.used)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 overflow-hidden rounded-pill bg-slate-100">
                                  <div className={`h-2 ${barColour(row)}`} style={{ width: `${usedPct}%` }}>
                                    <div className="h-2 bg-black/20" style={{ width: `${Math.min(100, paidShare)}%` }} />
                                  </div>
                                </div>
                                <span className="w-10 text-right text-micro num text-slate-500">{row.pct}%</span>
                                {row.level !== 'ok' && (
                                  <Badge variant={row.level === 'warning' ? 'danger' : 'dues'} className="text-micro">
                                    {row.level === 'warning' ? 'over' : 'near'}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {editable ? (
                                <Input
                                  key={`${row.categoryId}-${row.budget}`}
                                  num
                                  className="w-24 text-right"
                                  defaultValue={row.budget || ''}
                                  placeholder="0"
                                  onBlur={(e) => {
                                    const value = parseInt(e.target.value, 10);
                                    if (Number.isFinite(value) && value !== row.budget) setBudget(row.categoryId, month, value);
                                  }}
                                />
                              ) : (
                                <span className="text-micro text-slate-400">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                  {report.hiddenStaffRows > 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-micro text-slate-400">
                        Staff — {report.hiddenStaffRows} row{report.hiddenStaffRows === 1 ? '' : 's'} hidden (§47).
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className="border-t-2 border-hairline">
                    <TableCell className="font-semibold text-slate-900">Total</TableCell>
                    <TableCell className="text-right num font-semibold">{formatPKR(report.total.budget)}</TableCell>
                    <TableCell className="text-right num font-semibold">{formatPKR(report.total.paid)}</TableCell>
                    <TableCell className="text-right num font-semibold">{formatPKR(report.total.unpaid)}</TableCell>
                    <TableCell className="text-right num font-semibold">{formatPKR(report.total.used)}</TableCell>
                    <TableCell className="text-micro text-slate-500">
                      {report.total.budget > 0 ? `${Math.round((report.total.used / report.total.budget) * 100)}% of plan` : 'No plan set'}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card title={`${year} — plan by month`} description="§68 year view — months across, categories down.">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  {YEAR_MONTHS.map((mm) => <TableHead key={mm} className="text-right">{mm}</TableHead>)}
                  <TableHead className="text-right">Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.filter((c) => role === 'Admin' || c.group !== 'staff').map((category) => {
                  const amounts = yearReports.map((rep) => rep.rows.find((row) => row.categoryId === category.id)?.budget ?? 0);
                  const total = amounts.reduce((sum, amount) => sum + amount, 0);
                  if (total === 0 && yearReports.every((rep) => !rep.rows.some((row) => row.categoryId === category.id))) return null;
                  return (
                    <TableRow key={category.id}>
                      <TableCell className="text-slate-700">{category.name}</TableCell>
                      {amounts.map((amount, index) => (
                        <TableCell key={YEAR_MONTHS[index]} className="text-right num text-meta text-slate-600">
                          {amount > 0 ? formatPKR(amount) : '—'}
                        </TableCell>
                      ))}
                      <TableCell className="text-right num font-medium">{formatPKR(total)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 border-hairline">
                  <TableCell className="font-semibold text-slate-900">Total</TableCell>
                  {yearReports.map((rep, index) => (
                    <TableCell key={YEAR_MONTHS[index]} className="text-right num font-semibold">{formatPKR(rep.total.budget)}</TableCell>
                  ))}
                  <TableCell className="text-right num font-semibold">
                    {formatPKR(yearReports.reduce((sum, rep) => sum + rep.total.budget, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {spreadOpen && (
        <Dialog open onOpenChange={(o) => !o && setSpreadOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Spread a yearly amount</DialogTitle>
              <DialogDescription>§68 — one category's yearly figure, divided evenly across the twelve months of {year}.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select value={draftCategory} onValueChange={setDraftCategory}>
                  <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                  <SelectContent>
                    {categories.filter((c) => !c.disabled).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Yearly amount *</Label>
                <Input num value={draftAmount} onChange={(e) => setDraftAmount(e.target.value)} placeholder="0" />
                {draftCategory && draftAmount && (
                  <p className="text-micro text-slate-400">
                    {formatPKR(Math.trunc((parseInt(draftAmount, 10) || 0) / 12))} in each month ·
                    currently {formatPKR(budgetOf(budgets, draftCategory, month))} for {monthName(month)}
                  </p>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSpreadOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  useBudgetStore.getState().spreadYear(draftCategory, year, parseInt(draftAmount, 10) || 0);
                  setSpreadOpen(false);
                  setDraftCategory('');
                  setDraftAmount('');
                }}
                disabled={!draftCategory || !draftAmount}
              >
                Spread across {year}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <p className="text-micro text-slate-400">
        {report.rows.length} categor{report.rows.length === 1 ? 'y' : 'ies'} with a plan or a cost this month ·
        alerts inform at {limits.budgetNoticePercent}% and {limits.budgetWarningPercent}%, never block (§47) ·
        {findCategory(categories, 'cat-other') ? ' Other costs stay on their own line.' : ''}
      </p>
    </div>
  );
}
