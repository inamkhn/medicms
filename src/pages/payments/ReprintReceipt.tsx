// ============================================
// MediCMS Desktop v4.0 - Reprint Receipt (Screen 5.6)
// ============================================

import { useState } from 'react';
import { Search, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { formatPKR, formatDate } from '@/lib/utils';
import { MOCK_LEDGER, getStudentsWithBalance } from '@/lib/mockData';

interface ReceiptItem {
  receiptNo: string;
  studentName: string;
  studentSno: number;
  amount: number;
  date: string;
}

export default function ReprintReceipt() {
  const [search, setSearch] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptItem | null>(null);

  // Build receipt list from ledger payments
  const allReceipts: ReceiptItem[] = MOCK_LEDGER
    .filter(t => t.receiptNo && t.payment > 0)
    .map(t => {
      const student = getStudentsWithBalance().find(s => s.sno === t.studentSno);
      return {
        receiptNo: t.receiptNo!,
        studentName: student?.name ?? 'Unknown',
        studentSno: t.studentSno,
        amount: t.payment,
        date: t.date,
      };
    });

  const filteredReceipts = search.length >= 1
    ? allReceipts.filter(r =>
        r.receiptNo.toLowerCase().includes(search.toLowerCase()) ||
        r.studentName.toLowerCase().includes(search.toLowerCase()) ||
        r.studentSno.toString().includes(search)
      )
    : allReceipts;

  return (
    <div className="w-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reprint Receipt</h1>
        <p className="text-sm text-slate-500">Ctrl+R shortcut</p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by receipt number or student name..."
              className="pl-9"
            />
          </div>

          {filteredReceipts.length > 0 && !selectedReceipt && (
            <div className="space-y-2">
              {filteredReceipts.map((receipt) => (
                <button
                  key={receipt.receiptNo}
                  onClick={() => setSelectedReceipt(receipt)}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100/60 hover:bg-slate-50 text-left"
                >
                  <div>
                    <div className="font-medium">Receipt {receipt.receiptNo}</div>
                    <div className="text-sm text-slate-500">
                      {receipt.studentName} (SNO:{receipt.studentSno}) · {formatDate(receipt.date)}
                    </div>
                  </div>
                  <span className="font-medium">{formatPKR(receipt.amount)}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receipt Preview */}
      {selectedReceipt && (
        <Card>
          <CardContent className="py-6">
            {/* Receipt print format */}
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 max-w-sm mx-auto text-center space-y-3">
              <div className="font-bold text-lg">PARAMEDICAL INSTITUTE</div>
              <div className="text-sm text-slate-500">Saidu Sharif, Swat</div>
              <div className="text-sm text-slate-500">Phone: 0946-XXXXXXX</div>
              <hr />
              <div className="font-semibold">PAYMENT RECEIPT</div>
              <div className="text-sm">Receipt No: {selectedReceipt.receiptNo}</div>
              <div className="text-sm">Date: {formatDate(selectedReceipt.date)}</div>
              <hr />
              <div className="text-left space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Student:</span>
                  <span className="font-medium">{selectedReceipt.studentName} (SNO: {selectedReceipt.studentSno})</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount Paid:</span>
                  <span className="font-bold">{formatPKR(selectedReceipt.amount)}</span>
                </div>
              </div>
              <hr />
              <div className="text-sm text-slate-500">Received by: Admin Khalid</div>
              <div className="mt-4 text-xs text-slate-400">
                Signature: _________________ Stamp: [ ]
              </div>
            </div>

            <div className="flex justify-center gap-3 mt-6">
              <Button variant="outline" onClick={() => setSelectedReceipt(null)}>
                ← Back
              </Button>
              <Button onClick={() => window.print()}>
                <Printer size={16} className="mr-1" />
                Print Receipt
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
