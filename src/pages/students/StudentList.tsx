// ============================================
// MediCMS Desktop v4.0 - Student List
// ============================================

import { useState, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Download, Printer, Eye, BookOpen, CreditCard, Pencil,
  ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  SlidersHorizontal, ChevronDown, ChevronUp, SearchX, FilterX, User, Upload, UserX, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAuthStore, useStudentStore, useSettingsStore, useAuditStore } from '@/stores';
import { canWrite } from '@/stores/authStore';
import { normalizeCNIC, normalizeContact } from '@/lib/utils';

import { getStudentsWithBalance } from '@/lib/mockData';
import {
  COURSES, BATCH_OPTIONS, SESSION_OPTIONS, SEMESTER_OPTIONS,
  getCourseDef, getSubCourseDef,
} from '@/lib/constants';
import { cn, formatBalanceDisplay, formatDate, getTermLabel, pluralize } from '@/lib/utils';
import type { StudentBadgeType, CourseCode, ProgramCode, Semester } from '@/types';

// --- Status badge ---
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

// --- Sub-course info cache (getSubCourseDef resolved once per program code) ---
interface SubCourseInfo {
  courseLabel: string;
  subLabel: string;
  system: 'semester' | 'annual' | 'months';
}

const subCourseInfoCache = new Map<ProgramCode, SubCourseInfo>();

function getSubCourseInfo(program: ProgramCode): SubCourseInfo {
  let info = subCourseInfoCache.get(program);
  if (!info) {
    const { course, sub } = getSubCourseDef(program);
    info = { courseLabel: course.label, subLabel: sub.label, system: course.system };
    subCourseInfoCache.set(program, info);
  }
  return info;
}

// --- Cell helpers ---
function ProgramCell({ program }: { program: ProgramCode }) {
  const info = getSubCourseInfo(program);
  return (
    <div>
      <div className="font-medium text-slate-900">{info.subLabel}</div>
      <div className="text-xs text-slate-500 mt-0.5">{info.courseLabel}</div>
    </div>
  );
}

function TermCell({ program, semester }: { program: ProgramCode; semester: Semester }) {
  const info = getSubCourseInfo(program);
  return <span className="text-slate-600">{getTermLabel(info.system, semester)}</span>;
}

function BalanceCell({ balance }: { balance: number }) {
  const display = formatBalanceDisplay(balance);
  return <span className={display.color}>{display.label}</span>;
}

// --- Sorting ---
type SortKey = 'sno' | 'name' | 'program' | 'batch' | 'session' | 'semester' | 'regDate' | 'balance';
type SortDir = 'asc' | 'desc';

function SortableHead({
  label, sortKey, activeKey, dir, onSort, className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1.5 transition-colors cursor-pointer',
          active ? 'text-slate-900 font-semibold' : 'hover:text-slate-900'
        )}
      >
        {label}
        {active && (dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
      </button>
    </TableHead>
  );
}

// --- Row action icon button ---
function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50/60 transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}

// --- Pagination nav button ---
function PageButton({ disabled, onClick, title, children }: {
  disabled: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
    >
      {children}
    </button>
  );
}

// --- Page number list with ellipsis ---
function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (current > 3) pages.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

// --- Status filter values ---
type StatusFilter = 'all' | 'active' | 'dues' | 'credit' | 'struck_off';

export default function StudentList() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canEdit = canWrite(user?.role);
  const storeStudents = useStudentStore((s) => s.students);
  const showTestRecords = useSettingsStore((s) => s.showTestRecords);

  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('sno');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkStrike, setShowBulkStrike] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<{ raw: string[]; error?: string }[]>([]);
  const [importHeader, setImportHeader] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allStudents = getStudentsWithBalance(storeStudents).filter((s) => showTestRecords || !s.isTestRecord);

  const filterProgramOptions = courseFilter === 'all'
    ? COURSES.flatMap((c) => c.subCourses)
    : getCourseDef(courseFilter as CourseCode).subCourses;

  // Filter handlers also reset the page (fixes the empty-page bug)
  const updateSearch = (v: string) => { setSearch(v); setPage(1); };
  const updateCourse = (v: string) => { setCourseFilter(v); setProgramFilter('all'); setPage(1); };
  const updateProgram = (v: string) => { setProgramFilter(v); setPage(1); };
  const updateBatch = (v: string) => { setBatchFilter(v); setPage(1); };
  const updateSession = (v: string) => { setSessionFilter(v); setPage(1); };
  const updateSemester = (v: string) => { setSemesterFilter(v); setPage(1); };
  const updateStatus = (v: StatusFilter) => { setStatusFilter(v); setPage(1); };
  const updatePageSize = (v: string) => { setPageSize(parseInt(v, 10)); setPage(1); };

  // Apply filters — search parity with GlobalSearch (name/sno/father/contact/cnic/address/domicile/emergency/course/batch)
  const filteredStudents = allStudents.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      const { courseLabel, subLabel } = getSubCourseInfo(s.program);
      const haystack = [
        s.name, s.sno.toString(), s.fatherName,
        s.contact ?? '', s.cnic ?? '', s.cnic?.replace(/\D/g,'') ?? '',
        s.address ?? '', s.domicile ?? '', s.emergencyContact ?? '',
        s.gender ?? '', courseLabel, subLabel, s.batch, s.session.toString(),
      ];
      if (!haystack.some((v) => v.toLowerCase().includes(q))) return false;
    }
    if (courseFilter !== 'all' && s.course !== courseFilter) return false;
    if (programFilter !== 'all' && s.program !== programFilter) return false;
    if (batchFilter !== 'all' && s.batch !== batchFilter) return false;
    if (sessionFilter !== 'all' && s.session.toString() !== sessionFilter) return false;
    if (semesterFilter !== 'all' && s.semester !== semesterFilter) return false;

    // Status filter
    if (statusFilter === 'active' && s.struckOff) return false;
    if (statusFilter === 'struck_off' && !s.struckOff) return false;
    if (statusFilter === 'dues' && (s.computedBalance <= 0 || s.struckOff)) return false;
    if (statusFilter === 'credit' && s.computedBalance >= 0) return false;

    return true;
  });

  // Sort
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'sno': return (a.sno - b.sno) * dir;
      case 'name': return a.name.localeCompare(b.name) * dir;
      case 'program': return getSubCourseInfo(a.program).subLabel.localeCompare(getSubCourseInfo(b.program).subLabel) * dir;
      case 'batch': return a.batch.localeCompare(b.batch) * dir;
      case 'session': return (a.session - b.session) * dir;
      case 'semester': return (parseInt(a.semester, 10) - parseInt(b.semester, 10)) * dir;
      case 'regDate': return a.regDate.localeCompare(b.regDate) * dir;
      case 'balance': return (a.computedBalance - b.computedBalance) * dir;
      default: return 0;
    }
  });

  const totalPages = Math.max(1, Math.ceil(sortedStudents.length / pageSize));
  const start = sortedStudents.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, sortedStudents.length);
  const paginatedStudents = sortedStudents.slice((page - 1) * pageSize, page * pageSize);

  // Chip stats
  const stats: Record<StatusFilter, number> = {
    all: allStudents.length,
    active: allStudents.filter((s) => !s.struckOff).length,
    dues: allStudents.filter((s) => !s.struckOff && s.computedBalance > 0).length,
    credit: allStudents.filter((s) => s.computedBalance < 0).length,
    struck_off: allStudents.filter((s) => s.struckOff).length,
  };

  const statusChips: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'dues', label: 'With Dues' },
    { value: 'credit', label: 'Credit' },
    { value: 'struck_off', label: 'Struck Off' },
  ];

  const hasActiveFilters =
    search !== '' || courseFilter !== 'all' || programFilter !== 'all' ||
    batchFilter !== 'all' || sessionFilter !== 'all' || semesterFilter !== 'all' ||
    statusFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setCourseFilter('all');
    setProgramFilter('all');
    setBatchFilter('all');
    setSessionFilter('all');
    setSemesterFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  // Bulk selection
  const toggleSelect = (sno: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sno)) next.delete(sno); else next.add(sno);
      return next;
    });
  };
  const toggleSelectAllPage = () => {
    const pageSnos = paginatedStudents.map(s => s.sno);
    const allSelected = pageSnos.every(sno => selected.has(sno));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) pageSnos.forEach(sno => next.delete(sno));
      else pageSnos.forEach(sno => next.add(sno));
      return next;
    });
  };
  const exportSelectedCSV = () => {
    const selectedStudents = sortedStudents.filter(s => selected.has(s.sno));
    const header = ['SNO','Name','Father','Course','Sub-course','Batch','Session','Term','Contact','CNIC','Reg Date','Status','Balance'];
    const rows = selectedStudents.map(s => {
      const info = getSubCourseInfo(s.program);
      const status = s.struckOff ? 'Struck Off' : s.computedBalance > 0 ? 'Dues' : s.computedBalance < 0 ? 'Credit' : 'Active';
      return [s.sno, s.name, s.fatherName, info.courseLabel, info.subLabel, s.batch, s.session, getTermLabel(info.system, s.semester), s.contact ?? '', s.cnic ?? '', s.regDate, status, s.computedBalance];
    });
    const csv = [header, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `students-selected-${new Date().toISOString().split('T')[0]}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const handleBulkStrike = () => {
    if (!bulkReason.trim() || selected.size===0) return;
    const strikeOff = useStudentStore.getState().strikeOff;
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const addLog = useAuditStore.getState().addLog;
    selected.forEach(sno => {
      strikeOff(sno, bulkReason.trim(), 'Bulk action', new Date().toISOString().split('T')[0]);
      addLog({ user: userName, action: 'Struck Off', studentSno: sno, details: `Bulk struck off — Reason: ${bulkReason.trim()}` });
    });
    setSelected(new Set());
    setShowBulkStrike(false);
    setBulkReason('');
  };
  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return { header: [], rows: [] as string[][] };
    const split = (line: string) => {
      const out: string[] = []; let cur=''; let inQ=false;
      for (let i=0;i<line.length;i++){ const c=line[i]; if(c==='"'){ if(inQ && line[i+1]==='"'){cur+='"';i++;} else inQ=!inQ;} else if(c===',' && !inQ){ out.push(cur); cur='';} else cur+=c; }
      out.push(cur); return out.map(s=>s.trim().replace(/^\"|\"$/g,''));
    };
    const header = split(lines[0]).map(h=>h.toLowerCase());
    const rows = lines.slice(1).map(split);
    return { header, rows };
  };
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { header, rows } = parseCSV(reader.result as string);
      setImportHeader(header);
      setImportRows(rows.map(r => ({ raw: r })));
      setImportOpen(true);
    };
    reader.readAsText(file);
    e.target.value='';
  };
  const handleConfirmImport = () => {
    const addStudent = useStudentStore.getState().addStudent;
    const userName = useAuthStore.getState().user?.name ?? 'Admin';
    const addLog = useAuditStore.getState().addLog;
    const h = importHeader;
    const idx = (name: string) => h.indexOf(name);
    let count=0;
    importRows.forEach(({ raw }) => {
      const get = (n: string) => { const i=idx(n); return i>=0 ? raw[i]?.trim()||'' : ''; };
      const name = get('name'); const father = get('fathername')||get('father name');
      if (!name || !father) return;
      const course = (get('course') as any) || 'Paramedics';
      const program = (get('program')||get('sub-course')||get('subcourse') as any) || 'Health';
      const batch = (get('batch') as any) || '17th Batch';
      const session = parseInt(get('session')||'2026',10)||2026;
      const semester = (get('semester')||get('term') as any) || '1st';
      try {
        const created = addStudent({
          name, fatherName: father,
          contact: normalizeContact(get('contact')),
          cnic: normalizeCNIC(get('cnic')),
          address: get('address')||null,
          regDate: get('regdate')||get('reg date')||new Date().toISOString().split('T')[0],
          photoUrl: null,
          dob: get('dob')||null,
          gender: (get('gender') as any)||null,
          domicile: get('domicile')||null,
          emergencyContact: normalizeContact(get('emergencycontact')||get('emergency contact')),
          course, program, batch, session, semester,
        });
        addLog({ user: userName, action: 'New Admission', studentSno: created.sno, details: `Bulk import — ${created.name} · ${program} · ${batch}` });
        count++;
      } catch {}
    });
    setImportOpen(false);
    setImportRows([]);
    setImportHeader([]);
  };
  const downloadTemplate = () => {
    const header = ['name','fatherName','contact','cnic','address','regDate','dob','gender','domicile','emergencyContact','course','program','batch','session','semester'];
    const sample = ['Ali Khan','Umar Khan','+923001234567','15602-1234567-1','Mingora Swat','2026-03-20','2000-01-01','Male','Swat','+923001234568','Paramedics','Health','17th Batch','2026','1st'];
    const csv = [header,sample].map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='students-template.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const header = [
      'SNO', 'Name', 'Father', 'Course', 'Sub-course', 'Batch', 'Session',
      'Term', 'Contact', 'CNIC', 'Reg Date', 'Status', 'Balance',
    ];
    const rows = sortedStudents.map((s) => {
      const info = getSubCourseInfo(s.program);
      const status = s.struckOff
        ? 'Struck Off'
        : s.computedBalance > 0 ? 'Dues' : s.computedBalance < 0 ? 'Credit' : 'Active';
      return [
        s.sno, s.name, s.fatherName, info.courseLabel, info.subLabel, s.batch,
        s.session, getTermLabel(info.system, s.semester), s.contact ?? '',
        s.cnic ?? '', s.regDate, status, s.computedBalance,
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `students-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Students</h1>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {statusChips.map((chip) => {
              const active = statusFilter === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => updateStatus(active ? 'all' : chip.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer',
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200/50'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'
                  )}
                >
                  {chip.label}
                  <span className={active ? 'text-blue-100' : 'text-slate-400'}>{stats[chip.value]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <Button onClick={() => navigate('/admissions/new')} className="print:hidden">
          <Plus size={16} className="mr-2" />
          New Admission
        </Button>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100/60 p-4 space-y-3 print:hidden">
        {/* Row 1: search + actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search name, SNO, father, contact, CNIC, address, domicile, course, batch..."
              className="pl-10"
            />
          </div>
          <span className="text-sm text-slate-500 whitespace-nowrap">
            {filteredStudents.length} {pluralize(filteredStudents.length, 'student')}
          </span>
          <div className="flex-1" />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <FilterX size={14} className="mr-1.5" />
              Clear Filters
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download size={14} className="mr-1.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} className="mr-1.5" />
            Import CSV
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>
            <Download size={14} className="mr-1.5" />
            Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={14} className="mr-1.5" />
            Print
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFiltersOpen((o) => !o)}>
            <SlidersHorizontal size={14} className="mr-1.5" />
            Filters
            {filtersOpen ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
          </Button>
        </div>

        {/* Row 2: filter selects */}
        {filtersOpen && (
          <div className="flex flex-wrap gap-3 items-center pt-3 border-t border-slate-100/60">
            <Select value={courseFilter} onValueChange={updateCourse}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {COURSES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={programFilter} onValueChange={updateProgram}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Program" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programs</SelectItem>
                {filterProgramOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={batchFilter} onValueChange={updateBatch}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Batch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Batches</SelectItem>
                {BATCH_OPTIONS.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sessionFilter} onValueChange={updateSession}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Session" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sessions</SelectItem>
                {SESSION_OPTIONS.map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={semesterFilter} onValueChange={updateSemester}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Semester" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Semesters</SelectItem>
                {SEMESTER_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => updateStatus(v as StatusFilter)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="struck_off">Struck Off</SelectItem>
                <SelectItem value="dues">With Dues</SelectItem>
                <SelectItem value="credit">Credit Balance</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-blue-700">{selected.size} selected</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportSelectedCSV}>
            <Download size={14} className="mr-1.5" /> Export Selected
          </Button>
          {canEdit && (
            <Button variant="destructive" size="sm" onClick={() => setShowBulkStrike(true)}>
              <UserX size={14} className="mr-1.5" /> Bulk Struck Off
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X size={14} className="mr-1.5" /> Clear
          </Button>
        </div>
      )}

      {/* Bulk Strike Modal */}
      {showBulkStrike && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold text-slate-900">Bulk Struck Off ({selected.size} students)</h3>
            <p className="text-sm text-slate-500">This will mark all selected students as struck off and log to audit.</p>
            <Input value={bulkReason} onChange={e=>setBulkReason(e.target.value)} placeholder="Reason * — e.g. Non-payment of fees" />
            {!bulkReason.trim() && <p className="text-xs text-red-500">Reason required</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setShowBulkStrike(false)}>Cancel</Button>
              <Button variant="destructive" disabled={!bulkReason.trim()} onClick={handleBulkStrike}>Confirm</Button>
            </div>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {importOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="p-5 border-b">
              <h3 className="font-semibold">Import Preview — {importRows.length} rows</h3>
              <p className="text-xs text-slate-500 mt-1">Header: {importHeader.join(', ')}</p>
              <p className="text-xs text-slate-400">Required: name, fatherName. Optional: contact/cnic/address/regDate/course/program/batch/session/semester/dob/gender/domicile/emergencyContact</p>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <div className="text-xs text-slate-600 space-y-1 max-h-60 overflow-auto border rounded-lg p-3 bg-slate-50">
                {importRows.slice(0,10).map((r,i)=><div key={i} className="truncate">{i+1}. {r.raw.join(' | ')}</div>)}
                {importRows.length>10 && <div className="text-slate-400">...and {importRows.length-10} more</div>}
              </div>
            </div>
            <div className="p-5 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setImportOpen(false)}>Cancel</Button>
              <Button onClick={handleConfirmImport}>Import {importRows.length} Students</Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <input type="checkbox" checked={paginatedStudents.length>0 && paginatedStudents.every(s=>selected.has(s.sno))} onChange={toggleSelectAllPage} className="w-4 h-4 accent-blue-600" />
              </TableHead>
              <TableHead className="w-[50px]">Photo</TableHead>
              <SortableHead label="SNO" sortKey="sno" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-[70px]" />
              <SortableHead label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableHead label="Program" sortKey="program" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableHead label="Batch" sortKey="batch" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableHead label="Session" sortKey="session" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableHead label="Term" sortKey="semester" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <TableHead>Contact</TableHead>
              <SortableHead label="Reg Date" sortKey="regDate" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableHead label="Balance" sortKey="balance" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedStudents.map((student) => (
              <TableRow
                key={student.sno}
                className="cursor-pointer"
                onClick={() => navigate(`/students/${student.sno}`)}
              >
                <TableCell onClick={e=>e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(student.sno)} onChange={()=>toggleSelect(student.sno)} className="w-4 h-4 accent-blue-600" />
                </TableCell>
                <TableCell>
                  <div className="w-9 h-11 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                    {student.photoUrl ? <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" /> : <User size={14} className="text-slate-300" />}
                  </div>
                </TableCell>
                <TableCell className="font-medium text-slate-900">{student.sno}</TableCell>
                <TableCell>
                  <div className="font-medium text-slate-900">{student.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{student.fatherName}</div>
                </TableCell>
                <TableCell><ProgramCell program={student.program} /></TableCell>
                <TableCell className="text-slate-600">{student.batch}</TableCell>
                <TableCell className="text-slate-600">{student.session}</TableCell>
                <TableCell><TermCell program={student.program} semester={student.semester} /></TableCell>
                <TableCell className="text-slate-600">{student.contact ?? '—'}</TableCell>
                <TableCell className="text-slate-600">{formatDate(student.regDate)}</TableCell>
                <TableCell><BalanceCell balance={student.computedBalance} /></TableCell>
                <TableCell>
                  <StatusBadge badge={student.badge} balance={student.computedBalance} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-0.5">
                    <IconButton title="View details" onClick={() => navigate(`/students/${student.sno}`)}>
                      <Eye size={15} />
                    </IconButton>
                    <IconButton title="Fee ledger" onClick={() => navigate(`/ledger/${student.sno}`)}>
                      <BookOpen size={15} />
                    </IconButton>
                    <IconButton title="Record payment" onClick={() => navigate(`/payments/record?sno=${student.sno}`)}>
                      <CreditCard size={15} />
                    </IconButton>
                    {canEdit && (
                      <IconButton title="Edit student" onClick={() => navigate(`/students/${student.sno}/edit`)}>
                        <Pencil size={15} />
                      </IconButton>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Empty state */}
        {sortedStudents.length === 0 && (
          <div className="text-center py-16">
            <SearchX size={40} className="mx-auto text-slate-300" />
            <p className="mt-3 text-slate-600 font-medium">No students found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters</p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                <FilterX size={14} className="mr-1.5" />
                Clear Filters
              </Button>
            )}
          </div>
        )}

        {/* Pagination */}
        {sortedStudents.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-t border-slate-100/60 print:hidden">
            <div className="text-sm text-slate-500">
              Showing {start}–{end} of {sortedStudents.length}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 mr-2">
                <span className="text-xs text-slate-500">Rows per page</span>
                <Select value={pageSize.toString()} onValueChange={updatePageSize}>
                  <SelectTrigger className="h-8 w-[72px] px-2 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[20, 50, 100].map((n) => (
                      <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <PageButton disabled={page === 1} onClick={() => setPage(1)} title="First page">
                  <ChevronsLeft size={15} />
                </PageButton>
                <PageButton disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} title="Previous page">
                  <ChevronLeft size={15} />
                </PageButton>
                {getPageNumbers(page, totalPages).map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} className="px-1 text-slate-400">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={cn(
                        'min-w-8 h-8 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                        page === p ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      {p}
                    </button>
                  )
                )}
                <PageButton disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} title="Next page">
                  <ChevronRight size={15} />
                </PageButton>
                <PageButton disabled={page === totalPages} onClick={() => setPage(totalPages)} title="Last page">
                  <ChevronsRight size={15} />
                </PageButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
