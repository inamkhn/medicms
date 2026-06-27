// ============================================
// MediCMS Desktop v4.0 - Dashboard
// ============================================

import { useNavigate } from 'react-router-dom';
import { Users, UserX, IndianRupee, RefreshCw, Plus, CreditCard, Search, FileText, AlertTriangle, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/stores';
import { formatPKR, formatDate } from '@/lib/utils';
import { MOCK_DASHBOARD, getStudentsWithBalance } from '@/lib/mockData';
import { useSyncStore } from '@/stores/syncStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const openSearch = useUIStore((s) => s.openSearch);
  
  const stats = MOCK_DASHBOARD;
  const { setSyncing, syncComplete } = useSyncStore();
  const topDefaulters = getStudentsWithBalance()
    .filter(s => s.computedBalance > 0 && !s.struckOff)
    .sort((a, b) => b.computedBalance - a.computedBalance)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">{formatDate(new Date())}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="transition-shadow hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-100 to-blue-50 rounded-xl">
                <Users className="text-blue-600" size={22} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{stats.activeStudents}</div>
                <div className="text-sm text-slate-500 mt-0.5">Active Students</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-red-100 to-red-50 rounded-xl">
                <UserX className="text-red-500" size={22} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{stats.struckOffStudents}</div>
                <div className="text-sm text-slate-500 mt-0.5">Struck Off</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-amber-100 to-amber-50 rounded-xl">
                <IndianRupee className="text-amber-600" size={22} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{formatPKR(stats.totalDues)}</div>
                <div className="text-sm text-slate-500 mt-0.5">Total Dues</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-purple-100 to-purple-50 rounded-xl">
                <RefreshCw className="text-purple-500" size={22} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{stats.pendingSync}</div>
                <div className="text-sm text-slate-500 mt-0.5">Pending Sync</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate('/admissions/new')}>
              <Plus size={16} className="mr-2" />
              New Admission
            </Button>
            <Button variant="outline" onClick={() => navigate('/payments/record')}>
              <CreditCard size={16} className="mr-2" />
              Record Payment
            </Button>
            <Button variant="outline" onClick={openSearch}>
              <Search size={16} className="mr-2" />
              Find Student
            </Button>
            <Button variant="outline" onClick={() => navigate('/reports')}>
              <FileText size={16} className="mr-2" />
              Daily Report
            </Button>
            <Button variant="outline" onClick={() => navigate('/reports')}>
              <AlertTriangle size={16} className="mr-2" />
              Fee Defaulters
            </Button>
            <Button variant="outline" onClick={() => { setSyncing(); setTimeout(() => syncComplete(0, 0), 1000); }}>
              <Wifi size={16} className="mr-2" />
              Sync Now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Today's Payments</CardTitle>
            <Button variant="ghost" size="sm">Print Day Report</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {stats.todayPayments.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div>
                    <div className="font-medium text-slate-900 text-sm">{p.receiptNo}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{p.name}</div>
                  </div>
                  <div className="font-semibold text-slate-900">{formatPKR(p.amount)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
              <span className="text-sm font-medium text-slate-500">Total Today</span>
              <span className="font-semibold text-slate-900">{formatPKR(stats.todayPayments.reduce((sum, p) => sum + p.amount, 0))}</span>
            </div>
          </CardContent>
        </Card>

        {/* Fee Defaulters */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Fee Defaulters (Top 5)</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {topDefaulters.map((s) => (
                <div key={s.sno} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div>
                    <div className="font-medium text-slate-900 text-sm">{s.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      SNO: {s.sno} · {s.program}
                    </div>
                  </div>
                  <div className="text-amber-500 font-semibold text-sm">
                    {formatPKR(s.computedBalance)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warning Note */}
      <div className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl border border-slate-100/60">
        Total Dues computed live from ledger — not from Dues column.
        Dues column is legacy/cache only — never used for display.
      </div>
    </div>
  );
}
