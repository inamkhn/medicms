// ============================================
// MediCMS Desktop v4.0 - Reports
// ============================================

import { FileText, Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ReportCategory {
  title: string;
  reports: { name: string; description: string; filters?: string[] }[];
}

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    title: 'Daily Reports',
    reports: [
      { name: 'Daily Cash Collection', description: 'Payments of type "payment" only — demands and discounts excluded', filters: ['date'] },
      { name: 'Fee Register (Print Format)', description: 'Batch-wise register with all students and fee columns', filters: ['batch', 'semester'] },
    ],
  },
  {
    title: 'Fee Reports',
    reports: [
      { name: 'Active Fee Defaulters', description: 'Balance > 0, Struck_Off = No', filters: ['program', 'batch', 'minDues'] },
      { name: 'Struck Off Students with Dues', description: 'Separate from active defaulters — for collection follow-up', filters: ['program', 'batch'] },
      { name: 'Students with Credit Balance', description: 'Computed balance < 0 — may owe refunds' },
      { name: 'Student Full Fee Statement', description: 'Complete transaction history for one student', filters: ['student'] },
      { name: 'Program-wise Collection Summary', description: 'Total demanded vs collected vs outstanding per program', filters: ['program', 'batch', 'dateRange'] },
      { name: 'Discount Summary', description: 'All discount entries — who gave, how much, why', filters: ['dateRange', 'givenBy'] },
    ],
  },
  {
    title: 'Student Reports',
    reports: [
      { name: 'Student List (Program-wise)', description: 'All students filtered by program and batch', filters: ['program', 'batch', 'status'] },
      { name: 'Struck Off Students', description: 'Includes SNO, Name, Date, Reason, Dues at time', filters: ['program', 'batch', 'reason'] },
      { name: 'Admission Register', description: 'All students enrolled in a date range', filters: ['dateRange'] },
    ],
  },
  {
    title: 'Expense Reports',
    reports: [
      { name: 'Expense Summary by Category', description: 'Excludes bank-linked expenses to avoid double-counting', filters: ['category', 'dateRange'] },
      { name: 'Monthly Expense Report', description: 'All expenses for a specific month', filters: ['month', 'year'] },
    ],
  },
  {
    title: 'Bank Reports',
    reports: [
      { name: 'Bank Statement', description: 'Expense-linked withdrawals shown with [Expense] tag', filters: ['dateRange'] },
      { name: 'Personal Transactions Report', description: 'All bank entries flagged as Personal/Non-operational' },
    ],
  },
  {
    title: 'Sync',
    reports: [
      { name: 'Pending Sync Log', description: 'Records with synced = 0 in local SQLite' },
    ],
  },
];

export default function Reports() {

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">All generated offline ✅</p>
      </div>

      {/* Report Categories */}
      <div className="space-y-6">
        {REPORT_CATEGORIES.map((category) => (
          <div key={category.title}>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {category.title}
            </h2>
            <div className="grid gap-3">
              {category.reports.map((report) => (
                <Card
                  key={report.name}
                  className="cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all"
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText size={20} className="text-slate-400" />
                        <div>
                          <div className="font-medium">{report.name}</div>
                          <div className="text-sm text-slate-500">{report.description}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">
                          <Printer size={16} />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download size={16} />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
