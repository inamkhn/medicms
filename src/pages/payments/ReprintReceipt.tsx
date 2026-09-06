// ============================================
// MediCMS - Reprint Receipt (fixed keys, amounts, print)
// ============================================

import { useState } from 'react';
import { Search, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ReceiptDoc, type ReceiptSize } from '@/components/receipts/ReceiptDoc';
import { formatPKR, formatDate } from '@/lib/utils';
import { getSubCourseDef } from '@/lib/constants';
import { getStudentsWithBalance } from '@/lib/mockData';
import { useStudentStore, useLedgerStore, useSettingsStore } from '@/stores';
import type { LedgerTransaction } from '@/types';

export default function ReprintReceipt() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const storeStudents = useStudentStore((s) => s.students);
  const allLedger = useLedgerStore((s) => s.transactions);
  const showTestRecords = useSettingsStore((s) => s.showTestRecords);
  const paperDefault = useSettingsStore((s) => s.paperSize);
  const [size, setSize] = useState<ReceiptSize>(paperDefault);
  const institute = {
    name: useSettingsStore((s) => s.instituteName),
    address: useSettingsStore((s) => s.instituteAddress),
    phone: useSettingsStore((s) => s.institutePhone),
  };

  // Only Pay txns with receipt numbers; key by txn id (receiptNo may repeat across books)
  const allReceipts: LedgerTransaction[] = allLedger.filter(
    (t) => t.type === 'Pay' && t.receiptNo && (t.payment > 0 || t.discount !== 0)
  );

  const filtered = (search.length >= 1
    ? allReceipts.filter((t) => {
        const student = getStudentsWithBalance(storeStudents).find((s) => s.sno === t.studentSno);
        const hay = `${t.receiptNo ?? ''} ${student?.name ?? ''} ${t.studentSno}`.toLowerCase();
        return hay.includes(search.toLowerCase());
      })
    : allReceipts
  ).filter((t) => {
    if (showTestRecords) return true;
    const student = storeStudents.find((s) => s.sno === t.studentSno);
    return !student?.isTestRecord;
  });

  const selected = selectedId ? allLedger.find((t) => t.id === selectedId) ?? null : null;
  const selectedStudent = selected
    ? getStudentsWithBalance(storeStudents).find((s) => s.sno === selected.studentSno)
    : null;

  return (
    <div className="w-auto space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-slate-900">Reprint Receipt</h1>
        <p className="text-sm text-slate-500">Ctrl+R shortcut · payment receipts only (demands have no receipt)</p>
      </div>

      {!selected && (
        <Card className="print:hidden">
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
            {filtered.length > 0 && (
              <div className="space-y-2">
                {filtered.slice(0, 50).map((t) => {
                  const student = getStudentsWithBalance(storeStudents).find((s) => s.sno === t.studentSno);
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedId(t.id); setSize(useSettingsStore.getState().paperSize); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100/60 hover:bg-slate-50 text-left"
                    >
                      <div>
                        <div className="font-medium">Receipt {t.receiptNo}</div>
                        <div className="text-sm text-slate-500">
                          {student?.name ?? `SNO:${t.studentSno}`} (SNO:{t.studentSno}) · {formatDate(t.date)}
                        </div>
                      </div>
                      <span className="font-medium">{formatPKR(t.payment)}{t.discount > 0 && <span className="text-teal-600 text-xs"> +{formatPKR(t.discount)}</span>}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {filtered.length === 0 && (
              <div className="text-center text-sm text-slate-400 py-6">No payment receipts found</div>
            )}
          </CardContent>
        </Card>
      )}

      {selected && selectedStudent && (
        <div className="space-y-4">
          <Card className="print:hidden">
            <CardContent className="py-4 flex items-center justify-center gap-2">
              <Button variant={size === '80mm' ? 'default' : 'outline'} size="sm" onClick={() => setSize('80mm')}>80mm</Button>
              <Button variant={size === 'A4' ? 'default' : 'outline'} size="sm" onClick={() => setSize('A4')}>A4</Button>
              <Button variant="outline" onClick={() => setSelectedId(null)}>← Back</Button>
              <Button onClick={() => window.print()}>
                <Printer size={16} className="mr-1" /> Print Receipt
              </Button>
            </CardContent>
          </Card>
          <div className="print-area">
            <ReceiptDoc
              size={size}
              institute={institute}
              studentName={selectedStudent.name}
              studentSno={selectedStudent.sno}
              programLabel={(() => { try { return getSubCourseDef(selectedStudent.program).sub.label; } catch { return selectedStudent.program; } })()}
              batchLabel={selectedStudent.batch}
              sessionLabel={String(selectedStudent.session)}
              receiptNo={selected.receiptNo ?? 'N/A'}
              date={selected.date}
              payment={selected.payment}
              discount={selected.discount > 0 ? selected.discount : 0}
              mode={selected.narration.includes('Bank') ? 'Bank' : selected.narration.includes('Cheque') ? 'Cheque' : selected.narration.includes('Online') ? 'Online' : 'Cash'}
              prevBalance={undefined}
              newBalance={undefined}
              receivedBy={selected.receivedBy ?? selected.createdBy ?? 'Admin'}
            />
          </div>
        </div>
      )}
    </div>
  );
}
