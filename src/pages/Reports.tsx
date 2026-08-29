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
      { name: 'Active Fee Defaulters', description: 'Balance > 0, Struck_Off = No', filters: ['course', 'program', 'batch', 'minDues'] },
      { name: 'Struck Off Students with Dues', description: 'Separate from active defaulters — for collection follow-up', filters: ['course', 'program', 'batch'] },
      { name: 'Students with Credit Balance', description: 'Computed balance < 0 — may owe refunds' },
      { name: 'Student Full Fee Statement', description: 'Complete transaction history for one student', filters: ['student'] },
      { name: 'Program-wise Collection Summary', description: 'Total demanded vs collected vs outstanding per course/sub-course', filters: ['course', 'program', 'batch', 'dateRange'] },
      { name: 'Discount Summary', description: 'All discount entries — who gave, how much, why', filters: ['dateRange', 'givenBy'] },
    ],
  },
  {
    title: 'Student Reports',
    reports: [
      { name: 'Student List (Program-wise)', description: 'All students filtered by course/sub-course and batch', filters: ['course', 'program', 'batch', 'status'] },
      { name: 'Struck Off Students', description: 'Includes SNO, Name, Date, Reason, Dues at time', filters: ['course', 'program', 'batch', 'reason'] },
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
    <div className="space-y-4">
      {/* Header — compact */}
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-bold text-slate-900">Reports</h1>
        <span className="text-[11px] text-slate-500">All offline · 16 reports</span>
      </div>

      {/* Report Categories — dense */}
      <div className="space-y-4">
        {REPORT_CATEGORIES.map((category) => (
          <div key={category.title}>
            <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
              {category.title}
            </h2>
            <div className="grid gap-1.5">
              {category.reports.map((report) => (
                <Card
                  key={report.name}
                  className="cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <CardContent className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 bg-slate-100 rounded-md flex items-center justify-center shrink-0">
                          <FileText size={13} className="text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-[12px] text-slate-900 truncate">{report.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">{report.description}</div>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Printer size={12} />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Download size={12} />
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
