import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FilterX, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StaffSummaryCard } from '@/components/staff/StaffSummaryCard';
import { StaffDirectoryTable } from '@/components/staff/StaffDirectoryTable';
import type { StaffSortKey } from '@/components/staff/StaffDirectoryTable';
import { StaffDrawer } from '@/components/staff/StaffDrawer';
import { can } from '@/lib/permissions';
import { getStaffProjection } from '@/lib/payroll';
import type { PublicStaff } from '@/lib/payroll';
import { EMPLOYMENT_MODES, EMPLOYMENT_STATUSES, STAFF_TYPES } from '@/lib/payroll';
import { pluralize } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { usePayrollStore } from '@/stores/payrollStore';

// ============================================
// StaffDirectory — STAFF_PAYROLL_DESIGN §47.1 (/staff/directory)
// The register of people who work here. Two invariants drive the whole page:
//   • What is rendered is a projection, not the record. getStaffProjection hands
//     each role the fields it may see, so a non-Admin's rows never *contain* a
//     CNIC, bank account or note (§64 integrity 8, t48). Salary/advances are not
//     a directory column at all (§47.1).
//   • Every filter, the sort and the page live in the address (§47.1), so a view
//     is bookmarkable and a deep link reopens exactly the same list. Local state
//     is the source of truth after mount; one effect mirrors it to the URL.
// ============================================

const SORT_KEYS: readonly StaffSortKey[] = ['staffNo', 'name', 'type', 'designation', 'department', 'joined', 'status'];
const STATUS_RANK: Record<string, number> = { Active: 0, 'On leave': 1, Left: 2 };

type DrawerState = { open: boolean; mode: 'create' | 'edit'; staffId?: string };

export default function StaffDirectory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = can(role, 'staff.manage');
  const staffRecords = usePayrollStore((s) => s.staff);

  const str = (k: string) => searchParams.get(k) ?? 'all';
  const oneOf = <T extends string>(k: string, allowed: readonly T[], def: T): T => {
    const v = searchParams.get(k);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : def;
  };

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [typeFilter, setTypeFilter] = useState(str('type'));
  const [deptFilter, setDeptFilter] = useState(str('dept'));
  const [statusFilter, setStatusFilter] = useState(str('status'));
  const [modeFilter, setModeFilter] = useState(str('mode'));
  const [joinedFrom, setJoinedFrom] = useState(searchParams.get('from') ?? '');
  const [joinedTo, setJoinedTo] = useState(searchParams.get('to') ?? '');
  const [sortKey, setSortKey] = useState<StaffSortKey>(oneOf('sort', SORT_KEYS, 'status'));
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(searchParams.get('dir') === 'desc' ? 'desc' : 'asc');
  const [page, setPage] = useState(() => { const n = parseInt(searchParams.get('page') ?? '1', 10); return Number.isFinite(n) && n > 0 ? n : 1; });
  const [pageSize, setPageSize] = useState(() => { const s = parseInt(searchParams.get('size') ?? '20', 10); return [20, 50, 100].includes(s) ? s : 20; });
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, mode: 'create' });

  // §47.1 the projection is the whole security story for this screen: the raw
  // record never reaches the table, the summary or the export.
  const visible = staffRecords.map((s) => getStaffProjection(s, role) as PublicStaff);
  const departments = Array.from(new Set(staffRecords.map((s) => s.department).filter((d): d is string => Boolean(d)))).sort();

  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const filtered = visible.filter((s) => {
    if (q) {
      const haystack = [s.staffNo, s.fullName, s.designation, s.department ?? ''].map((v) => v.toLowerCase());
      const phoneHit = s.phone ? s.phone.replace(/\D/g, '').includes(qDigits) && qDigits.length >= 3 : false;
      if (!haystack.some((v) => v.includes(q)) && !phoneHit) return false;
    }
    if (typeFilter !== 'all' && s.staffType !== typeFilter) return false;
    if (deptFilter !== 'all' && (s.department ?? '') !== deptFilter) return false;
    if (statusFilter !== 'all' && s.employmentStatus !== statusFilter) return false;
    if (modeFilter !== 'all' && s.employmentMode !== modeFilter) return false;
    if (joinedFrom && s.joiningDate < joinedFrom) return false;
    if (joinedTo && s.joiningDate > joinedTo) return false;
    return true;
  });

  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case 'name': return a.fullName.localeCompare(b.fullName) * dir;
      case 'type': return a.staffType.localeCompare(b.staffType) * dir;
      case 'designation': return a.designation.localeCompare(b.designation) * dir;
      case 'department': return (a.department ?? '').localeCompare(b.department ?? '') * dir;
      case 'joined': return a.joiningDate.localeCompare(b.joiningDate) * dir;
      case 'staffNo': return a.staffNo.localeCompare(b.staffNo) * dir;
      case 'status':
      default: {
        // §47.1 default: Active first, then staff name.
        const byStatus = (STATUS_RANK[a.employmentStatus] ?? 9) - (STATUS_RANK[b.employmentStatus] ?? 9);
        return (byStatus !== 0 ? byStatus : a.fullName.localeCompare(b.fullName)) * dir;
      }
    }
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, totalPages);
  const pageRows = sorted.slice((current - 1) * pageSize, current * pageSize);
  const start = sorted.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, sorted.length);

  const hasActiveFilters =
    search !== '' || typeFilter !== 'all' || deptFilter !== 'all' ||
    statusFilter !== 'all' || modeFilter !== 'all' || joinedFrom !== '' || joinedTo !== '';

  // §47.1 mirror every filter, the sort and the page to the address; defaults are
  // omitted so links stay short and a copied link reopens exactly the same view.
  // setSearchParams is the router setter (an external system), not a useState
  // setter, so syncing it from an effect is the intended pattern (as in StudentList).
  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (typeFilter !== 'all') p.set('type', typeFilter);
    if (deptFilter !== 'all') p.set('dept', deptFilter);
    if (statusFilter !== 'all') p.set('status', statusFilter);
    if (modeFilter !== 'all') p.set('mode', modeFilter);
    if (joinedFrom) p.set('from', joinedFrom);
    if (joinedTo) p.set('to', joinedTo);
    if (sortKey !== 'status') p.set('sort', sortKey);
    if (sortDir !== 'asc') p.set('dir', sortDir);
    if (current > 1) p.set('page', String(current));
    if (pageSize !== 20) p.set('size', String(pageSize));
    setSearchParams(p, { replace: true });
  }, [search, typeFilter, deptFilter, statusFilter, modeFilter, joinedFrom, joinedTo, sortKey, sortDir, current, pageSize, setSearchParams]);

  const onSort = (key: StaffSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const clearFilters = () => {
    setSearch(''); setTypeFilter('all'); setDeptFilter('all'); setStatusFilter('all');
    setModeFilter('all'); setJoinedFrom(''); setJoinedTo(''); setPage(1);
  };

  const changePage = (n: number) => setPage(Math.min(Math.max(1, n), totalPages));

  // §47.1 CSV — only the projected (non-sensitive) columns; bank/CNIC/notes are
  // structurally absent from `visible`, so an export built from it cannot leak.
  const exportCSV = () => {
    const header = ['Staff #', 'Name', 'Type', 'Designation', 'Department', 'Joined', 'Status', 'Mode'];
    const rows = sorted.map((s) => [s.staffNo, s.fullName, s.staffType, s.designation, s.department ?? '', s.joiningDate, s.employmentStatus, s.employmentMode]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `staff-directory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const editingStaff = drawer.mode === 'edit' && drawer.staffId
    ? staffRecords.find((s) => s.id === drawer.staffId)
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-page font-semibold text-ink">Staff directory</h1>
          <span className="text-meta text-ink-muted">{filtered.length} {pluralize(filtered.length, 'staff record', 'staff records')}</span>
        </div>
        {canManage && (
          <Button size="sm" className="print:hidden" onClick={() => setDrawer({ open: true, mode: 'create' })}>
            <Plus size={13} className="mr-1" />
            Add staff
          </Button>
        )}
      </div>

      <StaffSummaryCard rows={visible} />

      {/* Toolbar — filters live in the address; search is applied as you type */}
      <div className="space-y-2 rounded-card border border-hairline bg-panel p-2.5 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-[200px] max-w-[320px] flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, staff #, phone, department, designation"
              className="pl-8"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <FilterX size={12} className="mr-1" />
              Clear filters
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download size={12} className="mr-1" />
            Export
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterSelect value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} placeholder="Staff type" options={['all', ...STAFF_TYPES]} labelAll="All types" />
          <FilterSelect value={deptFilter} onChange={(v) => { setDeptFilter(v); setPage(1); }} placeholder="Department" options={['all', ...departments]} labelAll="All departments" />
          <FilterSelect value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} placeholder="Status" options={['all', ...EMPLOYMENT_STATUSES]} labelAll="Any status" />
          <FilterSelect value={modeFilter} onChange={(v) => { setModeFilter(v); setPage(1); }} placeholder="Employment mode" options={['all', ...EMPLOYMENT_MODES]} labelAll="Any mode" />
          <label className="flex items-center gap-1 text-meta text-ink-muted">
            Joined
            <Input type="date" value={joinedFrom} onChange={(e) => { setJoinedFrom(e.target.value); setPage(1); }} className="h-control-sm w-[135px] text-micro" aria-label="Joined from" />
            <span>to</span>
            <Input type="date" value={joinedTo} onChange={(e) => { setJoinedTo(e.target.value); setPage(1); }} className="h-control-sm w-[135px] text-micro" aria-label="Joined to" />
          </label>
        </div>
      </div>

      <StaffDirectoryTable
        rows={pageRows}
        canManage={canManage}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        onOpen={(id) => navigate(`/staff/${id}`)}
        onEdit={(id) => setDrawer({ open: true, mode: 'edit', staffId: id })}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <span className="text-meta text-ink-muted">Showing {start}–{end} of {sorted.length}</span>
        <div className="flex items-center gap-2">
          <FilterSelect
            value={String(pageSize)}
            onChange={(v) => { setPageSize(parseInt(v, 10)); setPage(1); }}
            options={['20', '50', '100']}
            labelAll=""
            placeholder="Rows"
          />
          <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => changePage(current - 1)}>Prev</Button>
          <span className="text-meta text-ink-secondary">Page {current} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={current >= totalPages} onClick={() => changePage(current + 1)}>Next</Button>
        </div>
      </div>

      {drawer.open && (
        <StaffDrawer
          key={`${drawer.mode}-${drawer.staffId ?? 'new'}`}
          open
          mode={drawer.mode}
          staff={editingStaff}
          onOpenChange={(open) => { if (!open) setDrawer({ open: false, mode: drawer.mode }); }}
        />
      )}
    </div>
  );
}

function FilterSelect({ value, onChange, options, placeholder, labelAll }: {
  value: string; onChange: (v: string) => void; options: readonly string[]; placeholder: string; labelAll?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-auto min-w-[130px]" aria-label={placeholder}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>{opt === 'all' ? (labelAll || 'All') : opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
