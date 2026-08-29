// ============================================
// MediCMS Desktop v4.0 - Dashboard
// ============================================

import { useNavigate } from 'react-router-dom';
import { Users, UserX, IndianRupee, RefreshCw, Plus, CreditCard, Search, FileText, Wifi, Building2, Wallet, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore, useStudentStore, useLedgerStore, useBankStore, useExpenseStore, useApprovalStore, useSettingsStore } from '@/stores';
import { formatPKR, formatDate } from '@/lib/utils';
import { getSubCourseDef } from '@/lib/constants';
import { getStudentsWithBalance } from '@/lib/mockData';
import { useSyncStore } from '@/stores/syncStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const openSearch = useUIStore((s) => s.openSearch);
  const { setSyncing, syncComplete, pendingCount } = useSyncStore();
  const students = useStudentStore(s => s.students);
  const ledger = useLedgerStore(s => s.transactions);
  const bankTxs = useBankStore(s => s.transactions);
  const expenses = useExpenseStore(s => s.expenses);
  const approvals = useApprovalStore(s => s.requests);
  const showTestRecords = useSettingsStore(s => s.showTestRecords);

  const withBalance = getStudentsWithBalance(students).filter(s => showTestRecords || !s.isTestRecord);
  const activeStudents = withBalance.filter(s => !s.struckOff).length;
  const struckOffStudents = withBalance.filter(s => s.struckOff).length;
  const totalDues = withBalance.filter(s => s.computedBalance > 0 && !s.struckOff).reduce((sum, s) => sum + s.computedBalance, 0);
  const pendingApprovals = approvals.filter(a => a.status === 'pending').length;
  const bankBalance = bankTxs.length ? bankTxs[bankTxs.length - 1].balance : 0;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayPayments = ledger.filter(t => t.type === 'Pay' && t.date === todayStr && t.payment > 0).map(t => {
    const st = withBalance.find(s => s.sno === t.studentSno);
    return { receiptNo: t.receiptNo ?? `#${t.txnNo}`, name: st?.name ?? `SNO:${t.studentSno}`, amount: t.payment };
  });
  const totalToday = todayPayments.reduce((sum, p) => sum + p.amount, 0);
  const monthStr = new Date().toISOString().slice(0,7);
  const monthlyExpense = expenses.filter(e => e.date.startsWith(monthStr)).reduce((sum, e) => sum + e.amount, 0);

  const topDefaulters = withBalance
    .filter(s => s.computedBalance > 0 && !s.struckOff)
    .sort((a, b) => b.computedBalance - a.computedBalance)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Page Header — desktop compact */}
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <span className="text-[11px] text-slate-500">{formatDate(new Date())}</span>
      </div>

      {/* Stats Cards — desktop dense 4+3 */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="hover:shadow-sm cursor-pointer" onClick={() => navigate('/students')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center shrink-0">
                <Users className="text-white" size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-bold text-slate-900 leading-none">{activeStudents}</div>
                <div className="text-[11px] text-slate-500">Active</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-sm cursor-pointer" onClick={() => navigate('/students')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-slate-800 rounded-md flex items-center justify-center shrink-0">
                <UserX className="text-white" size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-bold text-slate-900 leading-none">{struckOffStudents}</div>
                <div className="text-[11px] text-slate-500">Struck Off</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-sm cursor-pointer" onClick={() => navigate('/reports')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-amber-500 rounded-md flex items-center justify-center shrink-0">
                <IndianRupee className="text-white" size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-slate-900 leading-none truncate">{formatPKR(totalDues)}</div>
                <div className="text-[11px] text-slate-500">Total Dues</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-sm cursor-pointer" onClick={() => navigate('/approvals')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-violet-600 rounded-md flex items-center justify-center shrink-0">
                <RefreshCw className="text-white" size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-bold text-slate-900 leading-none">{pendingCount + pendingApprovals}</div>
                <div className="text-[11px] text-slate-500">Pending · {pendingApprovals} appr.</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary — 3 compact */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="cursor-pointer hover:shadow-sm" onClick={() => navigate('/bank')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 bg-emerald-500 rounded-md flex items-center justify-center"><Building2 className="text-white" size={12} /></div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-slate-900 truncate">{formatPKR(bankBalance)}</div>
                <div className="text-[11px] text-slate-500">Bank</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-sm" onClick={() => navigate('/expenses')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 bg-orange-500 rounded-md flex items-center justify-center"><Wallet className="text-white" size={12} /></div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-slate-900 truncate">{formatPKR(monthlyExpense)}</div>
                <div className="text-[11px] text-slate-500">Expenses {monthStr}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-sm" onClick={() => navigate('/approvals')}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 bg-amber-500 rounded-md flex items-center justify-center"><Clock className="text-white" size={12} /></div>
              <div className="min-w-0">
                <div className="text-[16px] font-bold text-slate-900 leading-none">{pendingApprovals}</div>
                <div className="text-[11px] text-slate-500">Approvals</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions — desktop toolbar */}
      <Card>
        <CardHeader className="py-2.5">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="h-7 text-[12px]" onClick={() => navigate('/admissions/new')}>
              <Plus size={12} className="mr-1.5" />
              New Admission
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => navigate('/payments/record')}>
              <CreditCard size={12} className="mr-1.5" />
              Payment
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={openSearch}>
              <Search size={12} className="mr-1.5" />
              Find
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => navigate('/reports')}>
              <FileText size={12} className="mr-1.5" />
              Reports
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => navigate('/ledger/bulk-demand')}>
              <FileText size={12} className="mr-1.5" />
              Bulk
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => navigate('/approvals')}>
              <Clock size={12} className="mr-1.5" />
              Approvals {pendingApprovals>0 && `(${pendingApprovals})`}
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => { setSyncing(); setTimeout(() => syncComplete(0, 0), 1000); }}>
              <Wifi size={12} className="mr-1.5" />
              Sync
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Two Column — dense */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Today's Payments — live dense */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-2.5">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Today's Payments</CardTitle>
            <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => window.print()}>Print</Button>
          </CardHeader>
          <CardContent className="pt-0">
            {todayPayments.length === 0 ? (
              <div className="text-[12px] text-slate-400 py-4 text-center">No payments today — {todayStr}</div>
            ) : (
              <div className="space-y-0">
                {todayPayments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 text-[12px] truncate">{p.receiptNo}</div>
                      <div className="text-[11px] text-slate-500 truncate">{p.name}</div>
                    </div>
                    <div className="font-semibold text-slate-900 text-[12px]">{formatPKR(p.amount)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between items-center">
              <span className="text-[11px] font-medium text-slate-500">Total Today</span>
              <span className="font-semibold text-slate-900 text-[12px]">{formatPKR(totalToday)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Fee Defaulters — dense */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-2.5">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Top Defaulters</CardTitle>
            <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => navigate('/reports')}>
              View All
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-0">
              {topDefaulters.map((s) => (
                <div key={s.sno} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 text-[12px] truncate">{s.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      SNO:{s.sno} · {getSubCourseDef(s.program).sub.label}
                    </div>
                  </div>
                  <div className="text-amber-600 font-semibold text-[12px]">
                    {formatPKR(s.computedBalance)}
                  </div>
                </div>
              ))}
              {topDefaulters.length === 0 && <div className="text-[12px] text-slate-400 py-4 text-center">No defaulters</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer note — compact */}
      <div className="text-[11px] text-slate-400 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
        Live from ledger — Dues column is legacy cache.
      </div>
    </div>
  );
}
