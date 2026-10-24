// ============================================
// MediCMS Desktop v4.0 - Student List
// ============================================

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StudentStatusBadge } from '@/components/students/StudentStatusBadge';
import { SnoDisplay } from '@/components/students/SnoDisplay';
import {
  Plus, Search, Download, Printer, Eye, BookOpen, CreditCard, Pencil,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  SlidersHorizontal, ChevronDown, ChevronUp, SearchX, FilterX, User, Upload, UserX, X, RotateCcw,
  Columns3, Bookmark, Save, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSortHead,
} from '@/components/ui/table';
import { useAuthStore, useStudentStore, useSettingsStore, useAuditStore, useLedgerStore, useDirectoryStore, useAcademicStore, can } from '@/stores';
import { canWrite } from '@/stores/authStore';
import { AcademicSelector, type AcademicSelection } from '@/components/academic/AcademicSelector';
import { csvText, studentExportRows, summarizeFilters } from '@/lib/studentExport';

import { getStudentsWithBalanceLive } from '@/lib/balance';
import { ageingByStudent } from '@/lib/ledger';
import { inAgeRange, type AgeRange } from '@/lib/fee/ageing';
import {
  SEMESTER_OPTIONS,
  getSubCourseDef,
} from '@/lib/constants';
import { cn, formatBalanceDisplay, formatDate, formatPKR, getTermLabel, pluralize } from '@/lib/utils';
import { dayKey } from '@/lib/dates';
import type { ProgramCode, Semester, StudentWithBalance } from '@/types';

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

function BalanceCell({ balance, overdue }: { balance: number; overdue: number }) {
  const display = formatBalanceDisplay(balance);
  return (
    <div>
      <span className={display.color}>{display.label}</span>
      {overdue > 0 && <div className="mt-0.5 text-micro text-dues">{formatPKR(overdue)} overdue</div>}
    </div>
  );
}

// --- Sorting ---
type SortKey = 'sno' | 'name' | 'program' | 'batch' | 'session' | 'semester' | 'regDate' | 'balance' | 'lastPay';
type SortDir = 'asc' | 'desc';

// The sortable header itself now lives in components/ui/table (TableSortHead) —
// directory, ledger, audit, expenses and bank all need the same affordance.

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
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-body">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold text-ink tabular-nums">{value}</span>
    </div>
  );
}

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
type StatusFilter = 'all' | 'active' | 'dues' | 'overdue' | 'credit' | 'struck_off' | 'completed' | 'on_leave';

// §22.3 overdue-age filter values; the tokens double as the address parameter.
const AGE_VALUES = ['any', 'd1to30', 'd31to60', 'd61to90', 'over90'] as const;

// §22.5 toggleable columns (Photo/SNO/Name/Actions are always shown and not listed).
const COLUMNS: { id: string; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'program', label: 'Program' },
  { id: 'batch', label: 'Batch' },
  { id: 'session', label: 'Session' },
  { id: 'term', label: 'Current term' },
  { id: 'contact', label: 'Phone' },
  { id: 'regDate', label: 'Reg date' },
  { id: 'lastPay', label: 'Last payment' },
  { id: 'balance', label: 'Balance' },
  { id: 'overdueAmt', label: 'Overdue amount' },
  { id: 'oldestDue', label: 'Oldest due date' },
  { id: 'status', label: 'Status' },
];

// §22.5 extras start hidden — the column chooser switches them on.
const DEFAULT_HIDDEN = ['overdueAmt', 'oldestDue'];

export default function StudentList() {
  const navigate = useNavigate();
  // §16 Dashboard click-through: a card deep-links a pre-filtered view via the
  // address, e.g. /students?status=dues&sort=balance. Seed the local filter state
  // from the query once; the page stays the source of truth after that.
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const role = user?.role;
  const userName = user?.name ?? '';
  const canEdit = canWrite(role);
  // §28 gates read the one shared rule set, never ad-hoc role names.
  const canImport = can(role, 'data.import');
  const canBulkStrike = can(role, 'student.bulkStrike');
  // §23.1: a counter operator's export is the doc's five columns — no phone,
  // CNIC or balances. Everyone else exports the full import layout.
  const countersOnly = role === 'Counter';
  const storeStudents = useStudentStore((s) => s.students);
  const showTestRecords = useSettingsStore((s) => s.showTestRecords);
  const ledgerEntries = useLedgerStore((s) => s.entries);
  // Saved views + column chooser are per-user and persisted (§22.4 / §22.5).
  // Select the raw slices (stable refs) and derive below — a selector that returns
  // a fresh array each call would spin zustand v5 into an infinite loop.
  const allViews = useDirectoryStore((s) => s.views);
  const hiddenColumnsMap = useDirectoryStore((s) => s.hiddenColumns);
  const addView = useDirectoryStore((s) => s.addView);
  const removeView = useDirectoryStore((s) => s.removeView);
  const setHiddenColumns = useDirectoryStore((s) => s.setHiddenColumns);
  const myViews = useMemo(() => allViews.filter((v) => v.owner === userName), [allViews, userName]);
  const hiddenColumns = hiddenColumnsMap[userName] ?? DEFAULT_HIDDEN;

  // §22.3 — every filter, the sort and the page live in the page address so a view
  // can be bookmarked, shared or deep-linked from the dashboard. Local state is the
  // source of truth after mount; one effect mirrors it back to the address.
  const str = (k: string) => searchParams.get(k) ?? 'all';
  const num = (k: string) => { const n = parseInt(searchParams.get(k) ?? '', 10); return Number.isFinite(n) ? n : 1; };
  const oneOf = <T extends string>(k: string, allowed: readonly T[], def: T): T => {
    const v = searchParams.get(k);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : def;
  };
  const STATUS_VALUES = ['all', 'active', 'dues', 'overdue', 'credit', 'struck_off', 'completed', 'on_leave'] as const;
  const SORT_KEYS = ['sno', 'name', 'balance', 'lastPay'] as const;

  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [courseFilter, setCourseFilter] = useState(str('course'));
  const [programFilter, setProgramFilter] = useState(str('program'));
  const [batchFilter, setBatchFilter] = useState(str('batch'));
  const [sessionFilter, setSessionFilter] = useState(str('session'));
  const [semesterFilter, setSemesterFilter] = useState(str('term'));
  // §38.3 The directory's batch list hides Completed batches unless this is ticked.
  const [includeCompleted, setIncludeCompleted] = useState(searchParams.get('completed') === '1');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(oneOf('status', STATUS_VALUES, 'all'));
  const [sortKey, setSortKey] = useState<SortKey>(oneOf('sort', SORT_KEYS, 'sno'));
  const [sortDir, setSortDir] = useState<SortDir>(searchParams.get('dir') === 'desc' ? 'desc' : 'asc');
  const [balMin, setBalMin] = useState(searchParams.get('balmin') ?? '');
  const [balMax, setBalMax] = useState(searchParams.get('balmax') ?? '');
  const [regFrom, setRegFrom] = useState(searchParams.get('from') ?? '');
  const [regTo, setRegTo] = useState(searchParams.get('to') ?? '');
  const [noCharge, setNoCharge] = useState<'all' | 'yes' | 'no'>(oneOf('nocharge', ['all', 'yes', 'no'] as const, 'all'));
  const [ageFilter, setAgeFilter] = useState<AgeRange>(oneOf('age', AGE_VALUES, 'any'));
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [page, setPage] = useState(num('page'));
  const [pageSize, setPageSize] = useState(() => { const s = parseInt(searchParams.get('size') ?? '20', 10); return [20, 50, 100].includes(s) ? s : 20; });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [showBulkStrike, setShowBulkStrike] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  // §26.4 the batch just struck off, kept so the result screen can undo (reinstate all).
  const [bulkResult, setBulkResult] = useState<{ snos: number[]; reason: string } | null>(null);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  // Debounce the search box into the applied filter; reset to page 1. Declared after
  // `setPage` so the effect does not reference state before it is initialised.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 150);
    return () => clearTimeout(t);
  }, [searchInput]);

  const allStudents = getStudentsWithBalanceLive(storeStudents, ledgerEntries).filter((s) => showTestRecords || !s.isTestRecord);

  // §22.5 Last payment date = latest Payment entry per student, derived once from the
  // ledger and reused by the column, the sort and the CSV export.
  const lastPayBySno = useMemo(() => {
    const m = new Map<number, string>();
    for (const entry of ledgerEntries) {
      if (entry.type !== 'Payment') continue;
      const prev = m.get(entry.studentSno);
      if (!prev || entry.date > prev) m.set(entry.studentSno, entry.date);
    }
    return m;
  }, [ledgerEntries]);

  // §22.3 "No fee charge for current term": a student is charged this term when a
  // FeeCharge entry carries the term they are standing in (§5 — an entry has a term,
  // not a semester label).
  const chargedCurrent = useMemo(() => {
    const set = new Set<string>();
    for (const entry of ledgerEntries) {
      if (entry.type !== 'FeeCharge' || entry.term === null || entry.term === undefined) continue;
      const semester = SEMESTER_OPTIONS[entry.term - 1];
      // A term outside the program's list cannot be the student's current one, so it
      // is skipped rather than turned into a key nobody matches.
      if (!semester) continue;
      set.add(`${entry.studentSno}|${semester}`);
    }
    return set;
  }, [ledgerEntries]);

  // §22.3/§22.5 per-student overdue, from the same charge state the ledger prints.
  // One pass per ledger change keeps the tab, the age filter and the balance marker
  // on identical numbers — and the dashboard reads this same helper.
  const today = dayKey();
  const ageingBySno = useMemo(() => ageingByStudent(ledgerEntries, today), [ledgerEntries, today]);

  // §38/§46 The academic filters are the shared AcademicSelector, and this page keeps
  // its own state in legacy terms (students are stored by program code, session and
  // batch name; saved views and dashboard links carry those in the address). So the
  // selection is derived from the address state and mapped back on every change.
  const academicCourses = useAcademicStore((s) => s.courses);
  const academicPrograms = useAcademicStore((s) => s.programs);
  const academicBatches = useAcademicStore((s) => s.batches);
  const selection = useMemo<AcademicSelection>(() => {
    const program = programFilter === 'all' ? undefined : academicPrograms.find((p) => p.legacyValue === programFilter);
    const course = courseFilter === 'all' ? undefined : academicCourses.find((c) => c.legacyValue === courseFilter);
    // Resolvable only when the cascade (program + session) the batch dropdown needs
    // is present — otherwise the id would name an option the list cannot show.
    const batch = program && batchFilter !== 'all' && sessionFilter !== 'all'
      ? academicBatches.find((b) => b.programId === program.id
          && b.session === Number(sessionFilter)
          && b.name.trim().toLowerCase() === batchFilter.trim().toLowerCase())
      : undefined;
    return {
      courseId: course?.id ?? program?.courseId ?? '',
      programId: program?.id ?? '',
      session: sessionFilter === 'all' ? '' : Number(sessionFilter),
      // A Completed batch reached by an old link stays shown even while the offers
      // hide it — the component renders the chosen-but-unlisted batch itself.
      batchId: batch?.id ?? '',
    };
  }, [academicCourses, academicPrograms, academicBatches, courseFilter, programFilter, sessionFilter, batchFilter]);

  const applySelection = (next: AcademicSelection) => {
    const program = next.programId ? academicPrograms.find((p) => p.id === next.programId) : undefined;
    const course = next.courseId ? academicCourses.find((c) => c.id === next.courseId) : undefined;
    const batch = next.batchId ? academicBatches.find((b) => b.id === next.batchId) : undefined;
    setCourseFilter(course?.legacyValue ?? 'all');
    setProgramFilter(program?.legacyValue ?? 'all');
    // A chosen batch pins its own session — the pair must stay coherent.
    setSessionFilter(batch ? String(batch.session) : next.session === '' ? 'all' : String(next.session));
    setBatchFilter(batch?.name ?? 'all');
    setPage(1);
    resetSelection();
  };

  // §22.3 mirror every filter to the page address; defaults are omitted so links stay
  // short and a copied link reopens exactly the same view (§30).
  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (courseFilter !== 'all') p.set('course', courseFilter);
    if (programFilter !== 'all') p.set('program', programFilter);
    if (batchFilter !== 'all') p.set('batch', batchFilter);
    if (sessionFilter !== 'all') p.set('session', sessionFilter);
    if (semesterFilter !== 'all') p.set('term', semesterFilter);
    if (includeCompleted) p.set('completed', '1');
    if (statusFilter !== 'all') p.set('status', statusFilter);
    if (sortKey !== 'sno') p.set('sort', sortKey);
    if (sortDir !== 'asc') p.set('dir', sortDir);
    if (balMin) p.set('balmin', balMin);
    if (balMax) p.set('balmax', balMax);
    if (regFrom) p.set('from', regFrom);
    if (regTo) p.set('to', regTo);
    if (noCharge !== 'all') p.set('nocharge', noCharge);
    if (ageFilter !== 'any') p.set('age', ageFilter);
    if (page > 1) p.set('page', String(page));
    if (pageSize !== 20) p.set('size', String(pageSize));
    setSearchParams(p, { replace: true });
  }, [search, courseFilter, programFilter, batchFilter, sessionFilter, semesterFilter, includeCompleted, statusFilter, sortKey, sortDir, balMin, balMax, regFrom, regTo, noCharge, ageFilter, page, pageSize, setSearchParams]);

  // Changing any filter invalidates a bulk selection so it can never act on rows the
  // user can no longer see.
  const resetSelection = () => { setSelected(new Set()); setSelectAllFiltered(false); };

  // Filter handlers also reset the page (fixes the empty-page bug)
  const updateSearch = (v: string) => { setSearchInput(v); };
  const updateSemester = (v: string) => { setSemesterFilter(v); setPage(1); resetSelection(); };
  const updateStatus = (v: StatusFilter) => {
    setStatusFilter(v);
    // Spec §8.8: the dues and overdue tabs default to balance descending — the
    // biggest debt first, the same rank the dashboard's top defaulters use.
    if (v === 'dues' || v === 'overdue') { setSortKey('balance'); setSortDir('desc'); }
    setPage(1); resetSelection();
  };
  const updatePageSize = (v: string) => { setPageSize(parseInt(v, 10)); setPage(1); };

  // §22.3 new filters — balance range, registration date range, no-charge-this-term.
  const updateBalMin = (v: string) => { setBalMin(v); setPage(1); resetSelection(); };
  const updateBalMax = (v: string) => { setBalMax(v); setPage(1); resetSelection(); };
  const updateRegFrom = (v: string) => { setRegFrom(v); setPage(1); resetSelection(); };
  const updateRegTo = (v: string) => { setRegTo(v); setPage(1); resetSelection(); };
  const updateNoCharge = (v: 'all' | 'yes' | 'no') => { setNoCharge(v); setPage(1); resetSelection(); };
  const updateAge = (v: AgeRange) => { setAgeFilter(v); setPage(1); resetSelection(); };

  // Apply filters — search parity with GlobalSearch (§22.2).
  const filteredStudents = allStudents.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      if (/^[\d+()\s-]+$/.test(search)) {
        // Numeric query matches SNO / CNIC / phone, ignoring punctuation and a
        // leading 0 or +92: 3520212345671 finds 35202-1234567-1.
        const qDigits = search.replace(/\D/g, '').replace(/^920?/, '');
        if (qDigits) {
          const digits = [
            s.sno.toString(),
            (s.cnic ?? '').replace(/\D/g, '').replace(/^920?/, ''),
            (s.contact ?? '').replace(/\D/g, '').replace(/^920?/, ''),
            (s.emergencyContact ?? '').replace(/\D/g, '').replace(/^920?/, ''),
          ];
          if (!digits.some((v) => v.includes(qDigits))) return false;
        }
      } else {
        const { courseLabel, subLabel } = getSubCourseInfo(s.program);
        const haystack = [
          s.name, s.sno.toString(), s.fatherName,
          s.contact ?? '', s.cnic ?? '', s.cnic?.replace(/\D/g,'') ?? '',
          s.address ?? '', s.domicile ?? '', s.emergencyContact ?? '',
          s.gender ?? '', courseLabel, subLabel, s.batch, s.session.toString(),
        ];
        if (!haystack.some((v) => v.toLowerCase().includes(q))) return false;
      }
    }
    if (courseFilter !== 'all' && s.course !== courseFilter) return false;
    if (programFilter !== 'all' && s.program !== programFilter) return false;
    if (batchFilter !== 'all' && s.batch !== batchFilter) return false;
    if (sessionFilter !== 'all' && s.session.toString() !== sessionFilter) return false;
    if (semesterFilter !== 'all' && s.semester !== semesterFilter) return false;

    // Status filter (§26.5: completed leaves the active counts and defaulter lists)
    if (statusFilter === 'active' && (s.struckOff || s.completed || s.onLeave)) return false;
    if (statusFilter === 'struck_off' && !s.struckOff) return false;
    if (statusFilter === 'completed' && !s.completed) return false;
    if (statusFilter === 'on_leave' && !s.onLeave) return false;
    if (statusFilter === 'dues' && (s.computedBalance <= 0 || s.struckOff || s.completed)) return false;
    if (statusFilter === 'overdue' && (s.struckOff || s.completed || (ageingBySno.get(s.sno)?.overdue ?? 0) <= 0)) return false;
    if (statusFilter === 'credit' && s.computedBalance >= 0) return false;

    // Balance range — combines with every other filter (§30).
    if (balMin !== '' && s.computedBalance < Number(balMin)) return false;
    if (balMax !== '' && s.computedBalance > Number(balMax)) return false;

    // Registration date range (local ISO dates compare lexically).
    if (regFrom && s.regDate.slice(0, 10) < regFrom) return false;
    if (regTo && s.regDate.slice(0, 10) > regTo) return false;

    // No fee charge for the student's current term.
    const hasCharge = chargedCurrent.has(`${s.sno}|${s.semester}`);
    if (noCharge === 'yes' && hasCharge) return false;
    if (noCharge === 'no' && !hasCharge) return false;

    // §22.3 overdue-age filter — the student's oldest unpaid past-due charge sets
    // the age, so "61 to 90" finds rows the ledger labels 61 to 90 days overdue.
    if (ageFilter !== 'any' && !inAgeRange(ageingBySno.get(s.sno)?.oldestDays ?? 0, ageFilter)) return false;

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
      case 'lastPay': return (lastPayBySno.get(a.sno) ?? '').localeCompare(lastPayBySno.get(b.sno) ?? '') * dir;
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
    active: allStudents.filter((s) => !s.struckOff && !s.completed && !s.onLeave).length,
    dues: allStudents.filter((s) => !s.struckOff && !s.completed && s.computedBalance > 0).length,
    overdue: allStudents.filter((s) => !s.struckOff && !s.completed && (ageingBySno.get(s.sno)?.overdue ?? 0) > 0).length,
    credit: allStudents.filter((s) => s.computedBalance < 0).length,
    struck_off: allStudents.filter((s) => s.struckOff).length,
    completed: allStudents.filter((s) => s.completed).length,
    on_leave: allStudents.filter((s) => s.onLeave).length,
  };

  const statusChips: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'dues', label: 'With Dues' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'credit', label: 'Credit' },
    { value: 'struck_off', label: 'Struck Off' },
    { value: 'completed', label: 'Completed' },
    { value: 'on_leave', label: 'On Leave' },
  ];

  const hasActiveFilters =
    search !== '' || courseFilter !== 'all' || programFilter !== 'all' ||
    batchFilter !== 'all' || sessionFilter !== 'all' || semesterFilter !== 'all' ||
    statusFilter !== 'all' || balMin !== '' || balMax !== '' || regFrom !== '' ||
    regTo !== '' || noCharge !== 'all' || ageFilter !== 'any';

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCourseFilter('all');
    setProgramFilter('all');
    setBatchFilter('all');
    setSessionFilter('all');
    setSemesterFilter('all');
    setIncludeCompleted(false);
    setStatusFilter('all');
    setBalMin(''); setBalMax(''); setRegFrom(''); setRegTo(''); setNoCharge('all');
    setAgeFilter('any');
    setPage(1);
    resetSelection();
  };

  const handleSort = (key: SortKey) => {
    // §22.5 column sort on SNO / Name / Balance / Last payment only.
    if (key !== 'sno' && key !== 'name' && key !== 'balance' && key !== 'lastPay') return;
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  // Bulk selection (§22.6).
  const toggleSelect = (sno: number) => {
    const base = selectAllFiltered
      ? new Set(filteredStudents.map((s) => s.sno))
      : new Set(selected);
    if (base.has(sno)) base.delete(sno); else base.add(sno);
    setSelectAllFiltered(false);
    setSelected(base);
  };
  const toggleSelectAllPage = () => {
    if (selectAllFiltered) { setSelectAllFiltered(false); setSelected(new Set()); return; }
    const pageSnos = paginatedStudents.map(s => s.sno);
    const allSelected = pageSnos.every(sno => selected.has(sno));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) pageSnos.forEach(sno => next.delete(sno));
      else pageSnos.forEach(sno => next.add(sno));
      return next;
    });
  };
  // The effective selection is either the explicit set, or — when "select all
  // filtered" is on — every row the current filter matches, not just the page.
  // A plain derivation: the React Compiler memoizes it, and `filteredStudents` is
  // recomputed per render, so a manual useMemo here cannot be preserved.
  const effectiveSelected = selectAllFiltered
    ? new Set(filteredStudents.map((s) => s.sno))
    : selected;
  const selectedCount = effectiveSelected.size;
  const pageAllSelected = paginatedStudents.length > 0 && paginatedStudents.every((s) => effectiveSelected.has(s.sno));

  // §22.5 column chooser — is this optional column currently visible for this user?
  const showCol = (id: string) => !hiddenColumns.includes(id);
  const toggleColumn = (id: string) => {
    const next = hiddenColumns.includes(id)
      ? hiddenColumns.filter((c) => c !== id)
      : [...hiddenColumns, id];
    setHiddenColumns(userName, next);
  };

  // §22.4 apply a saved view. Local state is the source of truth (the effect owns
  // the address), so re-seed every filter rather than only navigating — otherwise
  // the mirror effect would immediately overwrite the link back to the old view.
  const applyQuery = (qs: string) => {
    const p = new URLSearchParams(qs);
    const g = (k: string, d = 'all') => p.get(k) ?? d;
    const qv = p.get('q') ?? '';
    setSearchInput(qv); setSearch(qv);
    setCourseFilter(g('course')); setProgramFilter(g('program')); setBatchFilter(g('batch'));
    setSessionFilter(g('session')); setSemesterFilter(g('term'));
    setStatusFilter(g('status') as StatusFilter);
    setSortKey(g('sort') as SortKey); setSortDir(p.get('dir') === 'desc' ? 'desc' : 'asc');
    setBalMin(p.get('balmin') ?? ''); setBalMax(p.get('balmax') ?? '');
    setRegFrom(p.get('from') ?? ''); setRegTo(p.get('to') ?? '');
    setNoCharge((p.get('nocharge') as 'all' | 'yes' | 'no') ?? 'all');
    const age = p.get('age') ?? 'any';
    setAgeFilter((AGE_VALUES as readonly string[]).includes(age) ? (age as AgeRange) : 'any');
    setPage(parseInt(p.get('page') ?? '1', 10) || 1);
    const s = parseInt(p.get('size') ?? '20', 10); setPageSize([20, 50, 100].includes(s) ? s : 20);
    resetSelection();
    setViewsOpen(false);
  };

  // §23.1: every export is written to the audit trail — who, when, the filters
  // used and how many rows. The layout is the import's, so the file round-trips.
  const auditExport = (rows: number, scope: 'filtered' | 'selected') => {
    const filters = summarizeFilters({
      q: search,
      course: courseFilter,
      program: programFilter,
      batch: batchFilter,
      session: sessionFilter,
      term: semesterFilter,
      status: statusFilter,
      balance: balMin || balMax ? `${balMin || '*'}..${balMax || '*'}` : '',
      registered: regFrom || regTo ? `${regFrom || '*'}..${regTo || '*'}` : '',
      nocharge: noCharge,
      age: ageFilter,
    });
    useAuditStore.getState().addLog({
      user: userName,
      action: 'Export',
      details: `Exported ${rows} student${rows === 1 ? '' : 's'} (${scope} import-layout CSV; ${countersOnly ? 'counter columns' : 'full columns'}; filters: ${filters})`,
    });
  };

  const downloadExport = (students: readonly StudentWithBalance[], scope: 'filtered' | 'selected') => {
    const { header, rows } = studentExportRows(students, countersOnly);
    const csv = csvText(header, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `students-${scope}-${dayKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    auditExport(students.length, scope);
  };

  const exportSelectedCSV = () => {
    downloadExport(sortedStudents.filter((s) => effectiveSelected.has(s.sno)), 'selected');
  };
  const closeBulkModal = () => { setShowBulkStrike(false); setBulkResult(null); setBulkReason(''); };
  const handleBulkStrike = () => {
    if (!bulkReason.trim() || effectiveSelected.size === 0) return;
    const strikeOff = useStudentStore.getState().strikeOff;
    const addLog = useAuditStore.getState().addLog;
    const reason = bulkReason.trim();
    const snos = [...effectiveSelected];
    snos.forEach((sno) => {
      strikeOff(sno, reason, 'Bulk action', dayKey());
      addLog({ user: userName, action: 'Struck Off', studentSno: sno, details: `Bulk struck off — Reason: ${reason}` });
    });
    // Keep the modal open and switch to the result view so the batch can be undone (§26.4).
    setBulkResult({ snos, reason });
    setSelected(new Set());
    setSelectAllFiltered(false);
  };
  const handleUndoBulkStrike = () => {
    if (!bulkResult) return;
    const reverseStrikeOff = useStudentStore.getState().reverseStrikeOff;
    const addLog = useAuditStore.getState().addLog;
    bulkResult.snos.forEach((sno) => {
      reverseStrikeOff(sno);
      addLog({ user: userName, action: 'Struck Off Reversed', studentSno: sno, details: `Undo bulk strike-off — Reason: ${bulkResult.reason}` });
    });
    closeBulkModal();
  };
  const exportCSV = () => {
    downloadExport(sortedStudents, 'filtered');
  };

  const isFreshInstall = allStudents.length === 0;
  if (isFreshInstall) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-[24px] font-semibold text-slate-900">No students yet — start with your first admission.</h1>
        <p className="text-[14px] text-slate-500 mt-2">Admissions create the SNO, lock the fee, and open the ledger.</p>
        <Button className="mt-6" onClick={() => navigate('/admissions/new')}>
          <Plus size={14} className="mr-1.5" />
          New Admission
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb + header */}
      <div className="text-[12px] text-slate-500">Students</div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[24px] font-semibold text-slate-900 tracking-tight">Student Directory</h1>
          <span className="text-[11px] text-slate-500">{filteredStudents.length} total</span>
          <div className="flex items-center gap-1 ml-2">
            {statusChips.map((chip) => {
              const active = statusFilter === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => updateStatus(active ? 'all' : chip.value)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors',
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  )}
                >
                  {chip.label}
                  <span className={active ? 'text-slate-300' : 'text-slate-400'}>{stats[chip.value]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <Button size="sm" className="h-7 text-[12px] print:hidden" onClick={() => navigate('/admissions/new')}>
          <Plus size={12} className="mr-1.5" />
          New Admission
        </Button>
      </div>

      {/* Toolbar — desktop dense */}
      <div className="bg-white rounded-lg border border-slate-200 p-2.5 space-y-2 print:hidden">
        {/* Row 1: search + actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search by SNO, name, father, CNIC, phone"
              className="pl-7 h-7 text-[12px]"
            />
          </div>
          <span className="text-[11px] text-slate-500 whitespace-nowrap">
            {filteredStudents.length} {pluralize(filteredStudents.length, 'student')}
          </span>
          <div className="flex-1" />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={clearFilters}>
              <FilterX size={11} className="mr-1" />
              Clear
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={exportCSV}>
            <Download size={11} className="mr-1" />
            Export
          </Button>
          {canImport && (
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={() => navigate('/import')}>
              <Upload size={11} className="mr-1" />
              Import
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={() => window.print()}>
            <Printer size={11} className="mr-1" />
            Print
          </Button>

          {/* §22.4 Saved views — scoped to this user, persisted */}
          <div className="relative">
            <Button variant="outline" size="sm" className="h-6 px-2 text-micro" onClick={() => { setViewsOpen((o) => !o); setColPickerOpen(false); }}>
              <Bookmark size={11} className="mr-1" />
              Views
            </Button>
            {viewsOpen && (
              <div className="absolute right-0 mt-1 z-30 w-64 rounded-card border border-hairline bg-panel p-2 shadow-overlay">
                <div className="px-1 pb-1.5 text-micro font-medium text-ink-muted">Save current filters as a view</div>
                <div className="flex gap-1 pb-2">
                  <Input value={newViewName} onChange={(e) => setNewViewName(e.target.value)} placeholder="e.g. BSN defaulters" className="h-6 text-micro" />
                  <Button size="sm" variant="subtle" className="h-6 px-2" disabled={!newViewName.trim()} onClick={() => { addView(userName, newViewName.trim(), searchParams.toString()); setNewViewName(''); }}>
                    <Save size={12} />
                  </Button>
                </div>
                {myViews.length === 0 ? (
                  <div className="px-1 py-1 text-micro text-ink-subtle">No saved views yet.</div>
                ) : (
                  <div className="max-h-40 overflow-auto">
                    {myViews.map((v) => (
                      <div key={v.id} className="flex items-center gap-1 rounded-control px-1 py-1 hover:bg-accent-soft">
                        <button type="button" className="flex-1 text-left text-body text-ink truncate cursor-pointer" onClick={() => applyQuery(v.query)}>{v.name}</button>
                        <button type="button" title="Delete view" className="text-ink-subtle hover:text-dues cursor-pointer" onClick={() => removeView(v.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* §22.5 Column chooser */}
          <div className="relative">
            <Button variant="outline" size="sm" className="h-6 px-2 text-micro" onClick={() => { setColPickerOpen((o) => !o); setViewsOpen(false); }}>
              <Columns3 size={11} className="mr-1" />
              Columns
            </Button>
            {colPickerOpen && (
              <div className="absolute right-0 mt-1 z-30 w-44 rounded-card border border-hairline bg-panel p-1.5 shadow-overlay">
                {COLUMNS.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-control px-1.5 py-1 text-body text-ink cursor-pointer">
                    <input type="checkbox" checked={showCol(c.id)} onChange={() => toggleColumn(c.id)} className="w-3.5 h-3.5 accent-blue-600" />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setFiltersOpen((o) => !o)}>
            <SlidersHorizontal size={11} className="mr-1" />
            Filters
            {filtersOpen ? <ChevronUp size={11} className="ml-1" /> : <ChevronDown size={11} className="ml-1" />}
          </Button>
        </div>

        {/* Row 2: filter selects — compact */}
        {filtersOpen && (
          <div className="flex flex-wrap gap-1.5 items-center pt-2 border-t border-slate-200">
            {/* §38 The four academic filters are the one shared selector, same rules as
                everywhere else; in the directory context every level is optional ("All …"). */}
            <AcademicSelector
              context="directory"
              includeCompleted={includeCompleted}
              value={selection}
              onChange={applySelection}
            />
            <label className="flex items-center gap-1.5 text-micro text-ink-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={(e) => { setIncludeCompleted(e.target.checked); setPage(1); }}
                className="accent-blue-600"
              />
              Include completed
            </label>

            <Select value={semesterFilter} onValueChange={updateSemester}>
              <SelectTrigger className="w-[110px] h-7 text-[12px]">
                <SelectValue placeholder="Term" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Terms</SelectItem>
                {SEMESTER_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => updateStatus(v as StatusFilter)}>
              <SelectTrigger className="w-[120px] h-7 text-[12px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="struck_off">Struck Off</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="dues">With Dues</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
              </SelectContent>
            </Select>

            {/* §22.3 Balance range — e.g. "dues above 20,000". Combines with all filters. */}
            <div className="flex items-center gap-1">
              <Input type="number" value={balMin} onChange={(e) => updateBalMin(e.target.value)} placeholder="Bal min" className="w-24 h-7 text-body" />
              <span className="text-micro text-ink-muted">–</span>
              <Input type="number" value={balMax} onChange={(e) => updateBalMax(e.target.value)} placeholder="Bal max" className="w-24 h-7 text-body" />
            </div>

            {/* §22.3 Registration date range */}
            <Input type="date" value={regFrom} onChange={(e) => updateRegFrom(e.target.value)} className="w-36 h-7 text-body" aria-label="Registered from" />
            <Input type="date" value={regTo} onChange={(e) => updateRegTo(e.target.value)} className="w-36 h-7 text-body" aria-label="Registered to" />

            {/* §22.3 No fee charge for the current term */}
            <Select value={noCharge} onValueChange={(v) => updateNoCharge(v as 'all' | 'yes' | 'no')}>
              <SelectTrigger className="w-40 h-7 text-body">
                <SelectValue placeholder="Fee charge" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Fee charge: any</SelectItem>
                <SelectItem value="yes">No charge this term</SelectItem>
                <SelectItem value="no">Charged this term</SelectItem>
              </SelectContent>
            </Select>

            {/* §22.3 Overdue age — reads the oldest unpaid past-due charge */}
            <Select value={ageFilter} onValueChange={(v) => updateAge(v as AgeRange)}>
              <SelectTrigger className="w-44 h-7 text-body">
                <SelectValue placeholder="Overdue age" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Overdue age: any</SelectItem>
                <SelectItem value="d1to30">1–30 days</SelectItem>
                <SelectItem value="d31to60">31–60 days</SelectItem>
                <SelectItem value="d61to90">61–90 days</SelectItem>
                <SelectItem value="over90">Over 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* §22.6 "Select all N filtered results" — page selected but more exist */}
      {pageAllSelected && !selectAllFiltered && filteredStudents.length > selectedCount && (
        <div className="bg-accent-soft border border-hairline rounded-card px-4 py-2 flex flex-wrap items-center gap-2">
          <span className="text-body text-ink-secondary">Only the current page is selected.</span>
          <button type="button" className="text-body font-medium text-ink underline cursor-pointer" onClick={() => setSelectAllFiltered(true)}>
            Select all {filteredStudents.length} {pluralize(filteredStudents.length, 'student')} matching this filter
          </button>
        </div>
      )}

      {/* Bulk bar */}
      {selectedCount > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-blue-700">
            {selectAllFiltered ? `All ${selectedCount} filtered selected` : `${selectedCount} selected`}
          </span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportSelectedCSV}>
            <Download size={14} className="mr-1.5" /> Export Selected
          </Button>
          {canBulkStrike && (
            <Button variant="destructive" size="sm" onClick={() => setShowBulkStrike(true)}>
              <UserX size={14} className="mr-1.5" /> Bulk Struck Off
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setSelected(new Set()); setSelectAllFiltered(false); }}>
            <X size={14} className="mr-1.5" /> Clear
          </Button>
        </div>
      )}

      {/* Bulk Strike Modal — confirmation summary (§26.4), then an undoable result in the same overlay */}
      {showBulkStrike && (() => {
        const scopeSet = new Set(bulkResult ? bulkResult.snos : [...effectiveSelected]);
        const sel = allStudents.filter((s) => scopeSet.has(s.sno));
        const totalDues = sel.reduce((n, s) => n + Math.max(0, s.computedBalance), 0);
        const totalCredit = sel.reduce((n, s) => n + Math.max(0, -s.computedBalance), 0);
        return (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-panel rounded-card shadow-overlay p-6 w-full max-w-md space-y-4">
              {bulkResult ? (
                <>
                  <h3 className="text-title font-semibold text-ink">Struck off {bulkResult.snos.length} students</h3>
                  <div className="rounded-card border border-hairline divide-y divide-hairline">
                    <SummaryRow label="Students struck off" value={String(bulkResult.snos.length)} />
                    <SummaryRow label="Total dues" value={formatPKR(totalDues)} />
                    <SummaryRow label="Total credit" value={formatPKR(totalCredit)} />
                    <SummaryRow label="Reason" value={bulkResult.reason} />
                  </div>
                  <p className="text-meta text-ink-muted">Undo returns every student in this batch to Active — the ledger and balance are kept.</p>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={closeBulkModal}>Close</Button>
                    <Button variant="subtle" onClick={handleUndoBulkStrike}>
                      <RotateCcw size={14} className="mr-1.5" /> Undo (reinstate all {bulkResult.snos.length})
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-title font-semibold text-ink">Bulk strike off ({selectedCount} students)</h3>
                  <p className="text-body text-ink-muted">Review the summary before confirming — nothing changes until you do.</p>
                  <div className="rounded-card border border-hairline divide-y divide-hairline">
                    <SummaryRow label="Students selected" value={String(selectedCount)} />
                    <SummaryRow label="Total dues" value={formatPKR(totalDues)} />
                    <SummaryRow label="Total credit" value={formatPKR(totalCredit)} />
                    <SummaryRow label="Date" value={formatDate(dayKey())} />
                  </div>
                  <Input value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="Reason * — e.g. Non-payment of fees" />
                  {!bulkReason.trim() && <p className="text-micro text-danger">Reason required</p>}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={closeBulkModal}>Cancel</Button>
                    <Button variant="destructive" disabled={!bulkReason.trim() || selectedCount === 0} onClick={handleBulkStrike}>Confirm</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Table — desktop dense (spec §8.8: sort on SNO / Name / Balance only; sticky header) */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead className="w-[30px]">
                <input type="checkbox" checked={pageAllSelected} onChange={toggleSelectAllPage} className="w-3.5 h-3.5 accent-blue-600" />
              </TableHead>
              {showCol('photo') && <TableHead className="w-[40px]">Photo</TableHead>}
              <TableSortHead label="SNO" sortKey="sno" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-[70px]" />
              <TableSortHead label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              {showCol('program') && <TableHead>Program</TableHead>}
              {showCol('batch') && <TableHead>Batch</TableHead>}
              {showCol('session') && <TableHead>Session</TableHead>}
              {showCol('term') && <TableHead>Term</TableHead>}
              {showCol('contact') && <TableHead>Contact</TableHead>}
              {showCol('regDate') && <TableHead>Reg Date</TableHead>}
              {showCol('lastPay') && <TableSortHead label="Last payment" sortKey="lastPay" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
              {showCol('balance') && <TableSortHead label="Balance" sortKey="balance" activeKey={sortKey} dir={sortDir} onSort={handleSort} num />}
              {showCol('overdueAmt') && <TableHead className="text-right">Overdue</TableHead>}
              {showCol('oldestDue') && <TableHead>Oldest due</TableHead>}
              {showCol('status') && <TableHead>Status</TableHead>}
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
                  <input type="checkbox" checked={effectiveSelected.has(student.sno)} onChange={()=>toggleSelect(student.sno)} className="w-4 h-4 accent-blue-600" />
                </TableCell>
                {showCol('photo') && (
                  <TableCell>
                    <div className="w-9 h-11 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                      {student.photoUrl ? <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" /> : <User size={14} className="text-slate-300" />}
                    </div>
                  </TableCell>
                )}
                <TableCell className="font-medium text-slate-900 tabular-nums"><SnoDisplay sno={student.sno} /></TableCell>
                <TableCell>
                  <div className="font-medium text-slate-900">{student.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{student.fatherName}</div>
                </TableCell>
                {showCol('program') && <TableCell><ProgramCell program={student.program} /></TableCell>}
                {showCol('batch') && <TableCell className="text-slate-600">{student.batch}</TableCell>}
                {showCol('session') && <TableCell className="text-slate-600">{student.session}</TableCell>}
                {showCol('term') && <TableCell><TermCell program={student.program} semester={student.semester} /></TableCell>}
                {showCol('contact') && <TableCell className="text-slate-600">{student.contact ?? '—'}</TableCell>}
                {showCol('regDate') && <TableCell className="text-slate-600">{formatDate(student.regDate)}</TableCell>}
                {showCol('lastPay') && <TableCell className="text-slate-600">{(() => { const d = lastPayBySno.get(student.sno); return d ? formatDate(d) : '—'; })()}</TableCell>}
                {showCol('balance') && (
                  <TableCell>
                    <BalanceCell
                      balance={student.computedBalance}
                      overdue={ageingBySno.get(student.sno)?.overdue ?? 0}
                    />
                  </TableCell>
                )}
                {showCol('overdueAmt') && (
                  <TableCell className="text-right tabular-nums text-dues">
                    {(() => { const aged = ageingBySno.get(student.sno); return aged && aged.overdue > 0 ? formatPKR(aged.overdue) : '—'; })()}
                  </TableCell>
                )}
                {showCol('oldestDue') && (
                  <TableCell className="text-slate-600">
                    {(() => { const due = ageingBySno.get(student.sno)?.oldestDueDate; return due ? formatDate(due) : '—'; })()}
                  </TableCell>
                )}
                {showCol('status') && (
                  <TableCell>
                    <StudentStatusBadge badge={student.badge} balance={student.computedBalance} />
                  </TableCell>
                )}
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
            <p className="mt-3 text-slate-600 font-medium">No students match. Clear filters or admit a new student.</p>
            <p className="text-sm text-slate-400 mt-1">Filters and search combine; clearing one often resolves it.</p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                <FilterX size={14} className="mr-1.5" />
                Clear Filters
              </Button>
            )}
          </div>
        )}

        {/* Pagination — compact */}
        {sortedStudents.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 border-t border-slate-200 print:hidden">
            <div className="text-[11px] text-slate-500">
              Showing {start}–{end} of {sortedStudents.length}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1 mr-1">
                <span className="text-[11px] text-slate-500">Rows</span>
                <Select value={pageSize.toString()} onValueChange={updatePageSize}>
                  <SelectTrigger className="h-6 w-[60px] px-1.5 text-[11px]">
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
