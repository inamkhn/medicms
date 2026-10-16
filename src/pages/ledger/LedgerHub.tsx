// ============================================
// MediCMS Desktop v4.0 - Fee Ledger Hub
// Pick a student to open their per-student ledger (/ledger/:sno)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, SearchX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useStudentStore, useSettingsStore, useLedgerStore } from '@/stores';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import { formatBalanceDisplay } from '@/lib/utils';
import type { StudentBadgeType } from '@/types';

function StatusBadge({ badge, balance }: { badge: StudentBadgeType; balance: number }) {
  const config: Record<StudentBadgeType, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-50 text-emerald-600 border border-emerald-100' },
    dues: { label: `PKR ${balance.toLocaleString()} due`, className: 'bg-amber-50 text-amber-600 border border-amber-100' },
    credit: { label: `Credit PKR ${Math.abs(balance).toLocaleString()}`, className: 'bg-blue-50 text-blue-600 border border-blue-100' },
    struck_off: { label: 'Struck Off', className: 'bg-red-50 text-red-600 border border-red-100' },
    struck_off_dues: { label: `Struck Off + PKR ${balance.toLocaleString()}`, className: 'bg-red-50 text-red-600 border border-red-100' },
    struck_off_credit: { label: 'Struck Off + Credit', className: 'bg-red-50 text-red-600 border border-red-100' },
  };
  const { label, className } = config[badge];
  return <Badge className={className}>{label}</Badge>;
}

export default function LedgerHub() {
  const navigate = useNavigate();
  const storeStudents = useStudentStore((s) => s.students);
  const showTestRecords = useSettingsStore((s) => s.showTestRecords);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  const [search, setSearch] = useState('');

  const allStudents = getStudentsWithBalanceLive(storeStudents, ledgerEntries).filter(
    (s) => showTestRecords || !s.isTestRecord
  );

  const q = search.trim().toLowerCase();
  const filtered = q
    ? allStudents.filter((s) =>
        [s.name, s.sno.toString(), s.fatherName, s.contact ?? '', s.batch].some((v) =>
          v.toLowerCase().includes(q)
        )
      )
    : allStudents;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[16px] font-bold text-slate-900 tracking-tight">Fee Ledger</h1>
          <span className="text-[11px] text-slate-500">{filtered.length} students</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-2.5">
        <div className="relative flex-1 min-w-[180px] max-w-[320px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SNO, father… then Enter to open"
            className="pl-7 h-7 text-[12px]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered.length > 0) {
                navigate(`/ledger/${filtered[0].sno}`);
              }
            }}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Ledger is maintained per student. Search above and select a student to open their running-balance statement.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">SNO</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 100).map((s) => {
              const display = formatBalanceDisplay(s.computedBalance);
              return (
                <TableRow
                  key={s.sno}
                  className="cursor-pointer"
                  onClick={() => navigate(`/ledger/${s.sno}`)}
                >
                  <TableCell className="font-medium text-slate-900">{s.sno}</TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.fatherName}</div>
                  </TableCell>
                  <TableCell className="text-slate-600">{s.program}</TableCell>
                  <TableCell className="text-slate-600">{s.batch}</TableCell>
                  <TableCell><span className={display.color}>{display.label}</span></TableCell>
                  <TableCell><StatusBadge badge={s.badge} balance={s.computedBalance} /></TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[12px]"
                      onClick={(e) => { e.stopPropagation(); navigate(`/ledger/${s.sno}`); }}
                    >
                      <BookOpen size={12} className="mr-1.5" />
                      Open Ledger
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <SearchX size={40} className="mx-auto text-slate-300" />
            <p className="mt-3 text-slate-600 font-medium">No students found</p>
            <p className="text-sm text-slate-400 mt-1">Try a different name or SNO</p>
          </div>
        )}
        {filtered.length > 100 && (
          <div className="p-2 border-t border-slate-200 text-[11px] text-slate-500 text-center">
            Showing first 100 of {filtered.length} — refine your search.
          </div>
        )}
      </div>
    </div>
  );
}
