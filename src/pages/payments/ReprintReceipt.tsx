// ============================================
// MediCMS - Reprint Receipt (fixed keys, amounts, print)
// ============================================

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ReceiptDoc, type ReceiptSize } from '@/components/receipts/ReceiptDoc';
import { formatPKR, formatDate } from '@/lib/utils';
import { todayKey } from '@/lib/dates';
import { getPaymentMode } from '@/lib/ledger';
import { getSubCourseDef } from '@/lib/constants';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { useStudentStore, useLedgerStore, useSettingsStore } from '@/stores';
import type { LedgerEntry } from '@/types';

export default function ReprintReceipt() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // §16 click-through: the dashboard's "Collected today" links the receipt list to
  // this day only. The chip below is the only way out, so it must be clearable.
  const [searchParams, setSearchParams] = useSearchParams();
  const dateFilter = searchParams.get('date') === 'today' ? todayKey() : '';
  const storeStudents = useStudentStore((s) => s.students);
  const entries = useLedgerStore((s) => s.entries);
  const showTestRecords = useSettingsStore((s) => s.showTestRecords);
  const paperDefault = useSettingsStore((s) => s.paperSize);
  const [size, setSize] = useState<ReceiptSize>(paperDefault);
  const institute = {
    name: useSettingsStore((s) => s.instituteName),
    address: useSettingsStore((s) => s.instituteAddress),
    phone: useSettingsStore((s) => s.institutePhone),
  };

  // Balance and badge come from one derivation, reused for every lookup below — the
  // old code rebuilt the whole list inside a per-row filter (O(rows × students)).
  const withBalance = getStudentsWithBalanceLive(storeStudents, entries);
  const nameBySno = new Map(withBalance.map((s) => [s.sno, s.name] as const));
  const testBySno = new Map(storeStudents.map((s) => [s.sno, s.isTestRecord] as const));

  // A receipt is the reference on a Payment entry (§5); a charge has no receipt.
  const allReceipts: LedgerEntry[] = entries.filter(
    (entry) => entry.type === 'Payment' && !!entry.reference
  );

  const filtered = (search.length >= 1
    ? allReceipts.filter((entry) => {
        const hay = `${entry.reference ?? ''} ${nameBySno.get(entry.studentSno) ?? ''} ${entry.studentSno}`.toLowerCase();
        return hay.includes(search.toLowerCase());
      })
    : allReceipts
  ).filter((entry) => {
    if (showTestRecords) return true;
    return !testBySno.get(entry.studentSno);
  }).filter((entry) => !dateFilter || entry.date.slice(0, 10) === dateFilter);

  const selected = selectedId ? entries.find((entry) => entry.id === selectedId) ?? null : null;
  const selectedStudent = selected
    ? withBalance.find((s) => s.sno === selected.studentSno)
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
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => setSearchParams({})}
                  className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-control border border-hairline bg-panel px-2 py-1 text-micro text-ink-secondary hover:bg-hairline-soft"
                >
                  Showing {formatDate(dateFilter)} only
                  <X size={12} />
                </button>
              )}
            </div>
            {filtered.length > 0 && (
              <div className="space-y-2">
                {filtered.slice(0, 50).map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => { setSelectedId(entry.id); setSize(useSettingsStore.getState().paperSize); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100/60 hover:bg-slate-50 text-left"
                    >
                      <div>
                        <div className="font-medium">Receipt {entry.reference}</div>
                        <div className="text-sm text-slate-500">
                          {nameBySno.get(entry.studentSno) ?? `SNO:${entry.studentSno}`} (SNO:{entry.studentSno}) · {formatDate(entry.date)}
                        </div>
                      </div>
                      <span className="font-medium">{formatPKR(entry.amount)}</span>
                    </button>
                ))}
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
              receiptNo={selected.reference ?? 'N/A'}
              date={selected.date}
              payment={selected.amount}
              discount={0}
              mode={getPaymentMode(selected)}
              prevBalance={undefined}
              newBalance={undefined}
              receivedBy={selected.createdBy ?? 'Admin'}
            />
          </div>
        </div>
      )}
    </div>
  );
}
