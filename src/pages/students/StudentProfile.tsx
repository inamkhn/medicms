// ============================================
// MediCMS Desktop v4.0 - Student Profile (§24)
// The one place to understand a student: identity, fee summary, term-by-term
// ledger, personal details and history — organised into six tabs.
// Balance/fee figures are always derived from the ledger (single source of truth).
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Edit, CreditCard, FileText, UserX, Printer, Plus, Scale,
  RotateCcw, IdCard, User, MoreVertical, AlertTriangle, Receipt, Paperclip,
  GraduationCap, CalendarOff, Undo2, Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StruckOffModal } from '@/components/shared/StruckOffModal';
import { StudentStatusModal } from '@/components/shared/StudentStatusModal';
import { ChangeFeePlanModal } from '@/components/students/ChangeFeePlanModal';
import { CancelAdmissionModal } from '@/components/students/CancelAdmissionModal';
import { StatementDialog } from '@/components/receipts/StatementDialog';
import { useAuthStore, useStudentStore, useLedgerStore, useSettingsStore, useAuditStore, useFeeTemplateStore, can } from '@/stores';
import { canWrite } from '@/stores/authStore';
import { formatDate, formatCNIC, formatPKR, formatBalanceDisplay, getTermLabel } from '@/lib/utils';
import { getSubCourseDef, SEMESTER_OPTIONS } from '@/lib/constants';
import { getNextTerm } from '@/lib/promotion';
import { getStudentsWithBalanceLive } from '@/lib/balance';
import {
  ageingOf,
  chargeStateOf,
  chronological,
  entryResolver,
  signedEffect,
} from '@/lib/ledger';
import type { EntryLookup } from '@/lib/ledger';
import type { AgeingBucket } from '@/lib/fee/ageing';
import { concessionValueLabel, scopeLabel } from '@/lib/fee/planPreview';
import type { ConcessionRecord } from '@/lib/fee/types';
import { dayKey } from '@/lib/dates';
import { StudentStatusBadge } from '@/components/students/StudentStatusBadge';
import { SnoDisplay } from '@/components/students/SnoDisplay';
import { StudentIdCard } from '@/components/students/StudentIdCard';
import { EntryTypeBadge } from '@/components/ledger/EntryTypeBadge';
import { SignedAmount } from '@/components/ledger/SignedAmount';
import type { LedgerEntry, Semester } from '@/types';

// '1st'..'8th' → 1..8 for ordering the term-by-term table.
const termNum = (s: string) => parseInt(s, 10) || 0;

/** The semester label an entry's term number refers back to (§5 — terms are numbers). */
const semesterOf = (term: number): Semester | null =>
  SEMESTER_OPTIONS[term - 1] ?? null;

/** One row of the §24 term table. */
interface TermRow {
  term: number;
  semester: Semester;
  charged: number;
  concessions: number;
  paid: number;
  due: number;
  billed: boolean;
  /** Due date of this term's open charge; null when nothing is billed (§24). */
  dueDate: string | null;
  /** Past-due part of this term's unpaid charges (§24). */
  overdue: number;
  /** Age of the oldest past-due charge in this term, in whole days. */
  daysOverdue: number;
}

/**
 * Which column of the term table an entry belongs to. A Reversal is filed against
 * the column of the entry it cancels (§6, §45), so a voided payment stops being
 * counted as money that arrived.
 */
function columnOf(entry: LedgerEntry, resolve: EntryLookup): 'charged' | 'concessions' | 'paid' | null {
  const type = entry.type === 'Reversal'
    ? (entry.linkedEntryId ? resolve(entry.linkedEntryId)?.type : undefined)
    : entry.type;
  switch (type) {
    case 'FeeCharge':
    case 'SpecialCharge':
    case 'AdjustmentAdd':
      return 'charged';
    case 'Concession':
    case 'WriteOff':
    case 'AdjustmentReduce':
      return 'concessions';
    case 'Payment':
      return 'paid';
    default:
      return null;
  }
}

function termStatus(r: TermRow): { label: string; cls: string } {
  if (!r.billed) return { label: 'Not yet billed', cls: 'text-ink-subtle' };
  // §24: a term past its due date with money unpaid reads Overdue, in red, with days.
  if (r.overdue > 0) return { label: `Overdue · ${r.daysOverdue} ${r.daysOverdue === 1 ? 'day' : 'days'}`, cls: 'text-dues font-medium' };
  if (r.due < 0) return { label: 'Credit', cls: 'text-credit' };
  if (r.due === 0) return { label: 'Paid', cls: 'text-cleared' };
  if (r.paid > 0) return { label: 'Partly paid', cls: 'text-dues' };
  return { label: 'Not paid', cls: 'text-dues' };
}

export default function StudentProfile() {
  const navigate = useNavigate();
  const { sno } = useParams<{ sno: string }>();
  const { user } = useAuthStore();
  const role = user?.role;
  const canEdit = canWrite(role);
  const canTakePayment = can(role, 'payment.record');
  // §26.1: only the Accountant and Admin change a plan after admission — a Counter
  // operator would send a request, so the button is not theirs.
  const canAdjustPlan = can(role, 'ledger.adjust');
  // §28: mark completed / put on leave — Admin and Accountant only.
  const canStatus = can(role, 'student.status');
  const [modalMode, setModalMode] = useState<'strike' | 'reverse' | null>(null);
  const [statusModal, setStatusModal] = useState<'complete' | 'leave' | 'return' | null>(null);
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [showCancelAdmission, setShowCancelAdmission] = useState(false);
  // §55: Print statement asks for the period and layout, then previews.
  const [showStatement, setShowStatement] = useState(false);

  const students = useStudentStore((s) => s.students);
  const entries = useLedgerStore((s) => s.entries);
  const student = useMemo(
    () => getStudentsWithBalanceLive(students, entries).find((s) => s.sno.toString() === sno),
    [students, entries, sno]
  );

  const instituteName = useSettingsStore((s) => s.instituteName);
  const instituteLocation = useSettingsStore((s) => s.instituteAddress);

  // Esc navigates back (modal closes first when open)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modalMode || statusModal) { setModalMode(null); setStatusModal(null); }
      else navigate(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalMode, statusModal, navigate]);

  const snoNum = Number(sno);
  const ledger = useMemo(() => entries.filter((t) => t.studentSno === snoNum), [entries, snoNum]);

  // §24: the term table's Due dates, Overdue statuses and the ageing bar all come
  // from the same charge state the ledger prints — never a second calculation.
  const today = dayKey();
  const chargeState = useMemo(() => chargeStateOf(ledger), [ledger]);
  const ageing = useMemo(() => ageingOf(chargeState, today), [chargeState, today]);

  // Per-term figures derived from the entries, grouped by entry.term (§5). All hooks
  // run before the conditional return below (rules of hooks).
  const termRows = useMemo<TermRow[]>(() => {
    if (!student) return [];
    const resolve = entryResolver(ledger);
    const totals = new Map<number, { charged: number; concessions: number; paid: number }>();
    for (const entry of ledger) {
      if (typeof entry.term !== 'number') continue;
      const column = columnOf(entry, resolve);
      if (!column) continue;
      const bucket = totals.get(entry.term) ?? { charged: 0, concessions: 0, paid: 0 };
      bucket[column] += (entry.type === 'Reversal' ? -1 : 1) * entry.amount;
      totals.set(entry.term, bucket);
    }

    const keys = new Set<number>(totals.keys());
    const currentTerm = termNum(student.semester);
    if (currentTerm) keys.add(currentTerm);
    const next = getNextTerm(student.program, student.semester);
    const nextTerm = next ? termNum(next) : 0;
    if (nextTerm) keys.add(nextTerm);

    // §24: each term's due date (of its open charge where one exists) and its
    // overdue share, grouped from the same charge state and ageing rows.
    const extras = new Map<number, { dueDate: string | null; unpaidDue: string | null; overdue: number; daysOverdue: number }>();
    for (const charge of chargeState.charges) {
      if (typeof charge.term !== 'number' || charge.term <= 0) continue;
      const x = extras.get(charge.term) ?? { dueDate: null, unpaidDue: null, overdue: 0, daysOverdue: 0 };
      if (!x.dueDate || charge.dueDate < x.dueDate) x.dueDate = charge.dueDate;
      if (charge.unpaid > 0 && (!x.unpaidDue || charge.dueDate < x.unpaidDue)) x.unpaidDue = charge.dueDate;
      extras.set(charge.term, x);
    }
    const termById = new Map(chargeState.charges.map((c) => [c.entryId, c.term] as const));
    for (const row of ageing.rows) {
      if (row.bucket === 'notYetDue') continue;
      const term = termById.get(row.chargeId) ?? (row.term > 0 ? row.term : null);
      const x = term !== null ? extras.get(term) : undefined;
      if (!x) continue;
      x.overdue += row.unpaid;
      if (row.daysOverdue > x.daysOverdue) x.daysOverdue = row.daysOverdue;
    }

    return [...keys]
      .sort((a, b) => a - b)
      .map((term) => {
        const bucket = totals.get(term) ?? { charged: 0, concessions: 0, paid: 0 };
        const extra = extras.get(term);
        return {
          term,
          semester: semesterOf(term) ?? student.semester,
          charged: Math.max(0, bucket.charged),
          concessions: Math.max(0, bucket.concessions),
          paid: Math.max(0, bucket.paid),
          due: bucket.charged - bucket.concessions - bucket.paid,
          billed: bucket.charged > 0,
          dueDate: extra?.unpaidDue ?? extra?.dueDate ?? null,
          overdue: extra?.overdue ?? 0,
          daysOverdue: extra?.daysOverdue ?? 0,
        };
      });
  }, [ledger, student, chargeState, ageing]);

  // §18: the saved plan's template - only needed to name components in the record list.
  const planTemplate = useFeeTemplateStore((s) => (student ? s.templates.find((t) => t.id === student.feeTemplateId) : undefined));

  if (!student) {
    return <div className="p-8 text-body text-ink-muted">Student not found (SNO: {sno})</div>;
  }

  const subDef = getSubCourseDef(student.program);
  const system = subDef.course.system;
  const nextSemester = getNextTerm(student.program, student.semester);
  const hasNextTerm = nextSemester !== null;
  const termNoun = system === 'annual' ? 'Year' : system === 'months' ? 'Term' : 'Semester';
  const balanceDisplay = formatBalanceDisplay(student.computedBalance);

  const current = termRows.find((r) => r.semester === student.semester);
  const nextRow = nextSemester ? termRows.find((r) => r.semester === nextSemester) : undefined;
  const nextFeeLabel = nextSemester
    ? nextRow?.charged
      ? formatPKR(nextRow.charged)
      : student.baseFeeRecurring
        ? formatPKR(student.baseFeeRecurring)
        : 'not yet billed'
    : '—';

  // §29: a record whose term differs from the ledger's highest charged term gets a
  // warning showing both values, with a shortcut to the correction screen.
  const highestBilledTerm = termRows.reduce((max, r) => (r.billed && r.term > max ? r.term : max), 0);
  const highestBilledSemester = highestBilledTerm > 0 ? semesterOf(highestBilledTerm) : null;
  const termRecordMismatch = highestBilledSemester !== null && highestBilledSemester !== student.semester ? highestBilledSemester : null;

  const hasChargeCurrentTerm = !!current?.billed;
  const hasFeePlan = !!student.baseFeeBreakup || typeof student.baseFeeRecurring === 'number';
  // §18: the saved concession records, with their reasons - shown above the locked heads.
  const planRecords = student.planConcessions ?? [];
  const recordTargetName = (record: ConcessionRecord): string => {
    const t = record.target;
    if (t.kind === 'plan') return 'Whole plan';
    return planTemplate?.components.find((c) => c.id === t.componentId)?.name ?? 'Component';
  };

  // Last ledger entries, newest first, each with the signed effect §54 prints.
  const resolveLedger = entryResolver(ledger);
  const recent = chronological(ledger)
    .slice(-10)
    .reverse()
    .map((entry) => ({ entry, signed: signedEffect(entry, resolveLedger) }));

  const takePayment = () => navigate(`/payments/record?sno=${student.sno}`);

  return (
    <div className="w-auto space-y-6">
      {/* On-screen UI is hidden when printing the ID card; the print sheet is a sibling
          so print:hidden on an ancestor does not suppress it (see print layout notes). */}
      <div className="space-y-6 print:hidden">
        <div className="text-meta text-ink-muted">
          <button className="hover:underline" onClick={() => navigate('/students')}>Students</button>
          <span> / {student.name}</span>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </Button>
          <div className="w-16 h-20 rounded-card border border-hairline bg-panel overflow-hidden shrink-0 flex items-center justify-center">
            {student.photoUrl ? (
              <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" />
            ) : (
              <User size={24} className="text-ink-subtle" />
            )}
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-page font-bold text-ink tracking-tight">{student.name}</h1>
              <StudentStatusBadge badge={student.badge} balance={student.computedBalance} />
            </div>
            <p className="text-body text-ink-muted mt-1">
              <SnoDisplay sno={student.sno} /> · {subDef.course.label} — {subDef.sub.label} · {student.batch} · Session {student.session} · {getTermLabel(system, student.semester)}
            </p>
          </div>
          <div className={`text-title font-bold tabular-nums ${balanceDisplay.color}`}>
            {student.computedBalance > 0 ? `Dues ${formatPKR(student.computedBalance)}` : balanceDisplay.label}
          </div>
        </div>

        {termRecordMismatch && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertTriangle size={16} />
            <span>
              Record says <strong>{getTermLabel(system, student.semester)}</strong>, but the highest term charged
              in the ledger is <strong>{getTermLabel(system, termRecordMismatch)}</strong> — the record may need a correction.
            </span>
            {canEdit && (
              <button className="underline hover:no-underline" onClick={() => navigate(`/students/${student.sno}/edit`)}>
                Correct the term
              </button>
            )}
          </div>
        )}

        {/* Action bar (§24 wireframe) */}
        <div className="flex flex-wrap items-center gap-2">
          {canTakePayment && (
            <Button size="sm" onClick={takePayment}>
              <CreditCard size={14} className="mr-1.5" /> Take payment
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate(`/ledger/${student.sno}`)}>
            <FileText size={14} className="mr-1.5" /> Ledger
          </Button>
          {canEdit && hasNextTerm && !student.completed && !student.onLeave && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/ledger/${student.sno}/promote`)}>
              <Plus size={14} className="mr-1.5" /> Promote
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/ledger/${student.sno}/add-charge`)}>
              <Scale size={14} className="mr-1.5" /> Add charge
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/students/${student.sno}/edit`)}>
              <Edit size={14} className="mr-1.5" /> Edit
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto">
                More <MoreVertical size={14} className="ml-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.print()}>
                <IdCard size={14} className="mr-2" /> Print ID Card
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowStatement(true)}>
                <Printer size={14} className="mr-2" /> Print Statement
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/payments/reprint?sno=${student.sno}`)}>
                <Receipt size={14} className="mr-2" /> Reprint Receipt
              </DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  {student.struckOff ? (
                    <DropdownMenuItem onClick={() => setModalMode('reverse')}>
                      <RotateCcw size={14} className="mr-2" /> Reverse Struck Off
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem destructive onClick={() => setModalMode('strike')}>
                        <UserX size={14} className="mr-2" /> Mark as Struck Off
                      </DropdownMenuItem>
                      {/* §27.3: within the cancellation window — Accountant and Admin. */}
                      {can(role, 'student.strike') && (
                        <DropdownMenuItem destructive onClick={() => setShowCancelAdmission(true)}>
                          <Ban size={14} className="mr-2" /> Cancel admission
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </>
              )}
              {/* §26.5 / §28: completed and on-leave transitions — Admin and Accountant. */}
              {canStatus && !student.struckOff && !student.completed && (
                <>
                  <DropdownMenuSeparator />
                  {student.onLeave ? (
                    <DropdownMenuItem onClick={() => setStatusModal('return')}>
                      <Undo2 size={14} className="mr-2" /> Return from leave
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => setStatusModal('leave')}>
                        <CalendarOff size={14} className="mr-2" /> Put on leave
                      </DropdownMenuItem>
                      {!hasNextTerm && hasChargeCurrentTerm && (
                        <DropdownMenuItem onClick={() => setStatusModal('complete')}>
                          <GraduationCap size={14} className="mr-2" /> Mark as completed
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Alerts strip (§24) */}
        {(student.struckOff || !hasFeePlan || !hasChargeCurrentTerm || ageing.overdueTotal > 0) && (
          <div className="space-y-2">
            {student.struckOff && (
              <AlertStrip tone="danger" icon={<UserX size={16} />}>
                <span className="font-semibold">Struck off</span>
                {student.struckOffDate && <> on {formatDate(student.struckOffDate)}</>}
                {student.struckOffReason && <> — {student.struckOffReason}</>}
              </AlertStrip>
            )}
            {!hasFeePlan && (
              <AlertStrip tone="warn" icon={<AlertTriangle size={16} />}>
                No fee plan attached. Add one before promotion.
              </AlertStrip>
            )}
            {ageing.overdueTotal > 0 && (
              <AlertStrip tone="warn" icon={<AlertTriangle size={16} />}>
                <span className="font-semibold">Overdue {formatPKR(ageing.overdueTotal)}</span>
                {' '}— the oldest unpaid charge is {ageing.oldestDays} {ageing.oldestDays === 1 ? 'day' : 'days'} past its due date.
              </AlertStrip>
            )}
            {hasFeePlan && !hasChargeCurrentTerm && (
              <AlertStrip tone="warn" icon={<AlertTriangle size={16} />}>
                No fee charged for {getTermLabel(system, student.semester)} yet.
              </AlertStrip>
            )}
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="fees">Fees</TabsTrigger>
            <TabsTrigger value="ledger">Ledger and receipts</TabsTrigger>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6">
            <FeeSummaryCard
              termNoun={termNoun}
              agreed={current?.charged ?? 0}
              agreedTerm={getTermLabel(system, student.semester)}
              concessions={current?.concessions ?? 0}
              paid={current?.paid ?? 0}
              due={current?.due ?? 0}
              nextFeeLabel={nextFeeLabel}
              nextTermLabel={nextSemester ? getTermLabel(system, nextSemester) : 'Program complete'}
              system={system}
              overdue={ageing.overdueTotal}
              overdueDays={ageing.oldestDays}
              buckets={ageing.buckets}
              termRows={termRows}
              compact
            />
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Ledger Activity</CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 text-micro" onClick={() => navigate(`/ledger/${student.sno}`)}>View all →</Button>
                </div>
              </CardHeader>
              <CardContent>
                <LedgerList rows={recent} system={system} empty="No ledger activity yet — add from ledger." />
              </CardContent>
            </Card>
          </TabsContent>

          {/* FEES */}
          <TabsContent value="fees" className="space-y-6">
            <FeeSummaryCard
              termNoun={termNoun}
              agreed={current?.charged ?? 0}
              agreedTerm={getTermLabel(system, student.semester)}
              concessions={current?.concessions ?? 0}
              paid={current?.paid ?? 0}
              due={current?.due ?? 0}
              nextFeeLabel={nextFeeLabel}
              nextTermLabel={nextSemester ? getTermLabel(system, nextSemester) : 'Program complete'}
              system={system}
              overdue={ageing.overdueTotal}
              overdueDays={ageing.oldestDays}
              buckets={ageing.buckets}
              termRows={termRows}
            />
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Fee Plan</CardTitle>
                  {canAdjustPlan && student.feeTemplateId && (
                    <Button size="sm" variant="outline" onClick={() => setShowChangePlan(true)}>
                      <Scale size={14} className="mr-1.5" /> Change fee plan
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {planRecords.length > 0 && (
                  <div>
                    <div className="text-meta text-ink-muted mb-1">
                      Concessions{planTemplate ? ` · from “${planTemplate.name}”${student.feeTemplateVersion ? ` v${student.feeTemplateVersion}` : ''}` : ''}
                    </div>
                    <ul className="divide-y divide-hairline rounded-card border border-hairline">
                      {planRecords.map((record) => (
                        <li key={record.id} className="px-3 py-2 text-body">
                          <span className="font-medium text-ink">{recordTargetName(record)}</span>
                          <span className="text-ink-muted"> · {concessionValueLabel(record, formatPKR)} · {scopeLabel(record.scope)}</span>
                          <div className="text-meta text-ink-subtle">{record.reasonCategory}{record.note ? ` — ${record.note}` : ''}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {student.baseFeeBreakup ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-body">
                    {Object.entries(student.baseFeeBreakup).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-ink-muted capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                        <div className="font-semibold text-ink tabular-nums mt-0.5">{formatPKR(v)}</div>
                      </div>
                    ))}
                  </div>
                ) : planRecords.length === 0 ? (
                  <div className="text-body text-ink-muted">
                    No locked fee plan on this student{hasChargeCurrentTerm ? '' : ' — add one before promotion'}.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          {/* LEDGER AND RECEIPTS */}
          <TabsContent value="ledger" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Ledger and receipts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-body text-ink-muted">
                  The full ledger with a running-balance column, statement printing and receipt reprints live on the ledger screen.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => navigate(`/ledger/${student.sno}`)}>
                    <FileText size={14} className="mr-1.5" /> Open full ledger
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowStatement(true)}>
                    <Printer size={14} className="mr-1.5" /> Print statement
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/payments/reprint?sno=${student.sno}`)}>
                    <Receipt size={14} className="mr-1.5" /> Reprint receipt
                  </Button>
                </div>
                <div className="pt-2">
                  <div className="text-meta font-semibold text-ink-muted mb-1">Latest entries</div>
                  <LedgerList rows={recent} system={system} empty="No ledger entries yet." />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PERSONAL */}
          <TabsContent value="personal" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Program &amp; Registration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-body">
                  <Field label="Course" value={subDef.course.label} strong />
                  <Field label="Program" value={subDef.sub.label} strong />
                  <Field label="Batch" value={student.batch} />
                  <Field label="Session" value={String(student.session)} />
                  <Field label={termNoun} value={getTermLabel(system, student.semester)} />
                  <Field label="Reg Date" value={formatDate(student.regDate)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Contact &amp; Personal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-body">
                  <Field label="Father" value={student.fatherName} strong />
                  <Field label="Contact" value={student.contact || 'Not entered'} />
                  <Field label="CNIC" value={formatCNIC(student.cnic)} />
                  <Field label="DOB" value={student.dob ? formatDate(student.dob) : 'Not entered'} />
                  <Field label="Gender" value={student.gender || 'Not entered'} />
                  <Field label="Domicile" value={student.domicile || 'Not entered'} />
                  <Field label="Emergency Contact" value={student.emergencyContact || 'Not entered'} />
                  <Field label="Guardian" value={student.guardianName || 'Not entered'} />
                  <Field label="Guardian Phone" value={student.guardianPhone || 'Not entered'} />
                  <Field label="Roll No" value={student.rollNo || 'Not entered'} />
                  <Field label="Council Reg No" value={student.councilRegistrationNo || 'Not entered'} />
                  <Field label="Previous Education" value={student.previousEducation || 'Not entered'} />
                  <div className="col-span-2">
                    <Field label="Address" value={student.address || 'Not entered'} wrap />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DOCUMENTS */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 text-body text-ink-muted">
                  <Paperclip size={16} className="text-ink-subtle" />
                  Document upload is planned for a later release.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* HISTORY */}
          <TabsContent value="history">
            <HistoryCard sno={student.sno} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Printable ID Card (CR80, print-only) */}
      <div className="hidden print:block print-area">
        <StudentIdCard
          student={student}
          courseLabel={subDef.course.label}
          programLabel={subDef.sub.label}
          instituteName={instituteName}
          instituteLocation={instituteLocation}
        />
      </div>

      {modalMode && (
        <StruckOffModal student={student} mode={modalMode} onClose={() => setModalMode(null)} />
      )}
      {statusModal && (
        <StudentStatusModal student={student} mode={statusModal} onClose={() => setStatusModal(null)} />
      )}
      {showChangePlan && (
        <ChangeFeePlanModal student={student} onClose={() => setShowChangePlan(false)} />
      )}
      {showCancelAdmission && (
        <CancelAdmissionModal student={student} onClose={() => setShowCancelAdmission(false)} />
      )}
      {showStatement && <StatementDialog student={student} onClose={() => setShowStatement(false)} />}
    </div>
  );
}

// --- helpers/subviews (presentational only) ---

function AlertStrip({ tone, icon, children }: { tone: 'danger' | 'warn'; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-amber-50 text-amber-700';
  return (
    <div className={`flex items-center gap-3 rounded-card border border-hairline px-4 py-3 text-body ${cls}`}>
      <span className="shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, value, strong, wrap }: { label: string; value: string; strong?: boolean; wrap?: boolean }) {
  return (
    <div className={wrap ? 'col-span-2' : undefined}>
      <span className="text-ink-muted">{label}</span>
      <div className={`mt-0.5 ${strong ? 'font-semibold text-ink' : 'text-ink-secondary'} ${wrap ? 'whitespace-pre-wrap break-words' : ''}`}>
        {value}
      </div>
    </div>
  );
}

/** §24 "Recent ledger activity" — the same entries the ledger screen prints. */
function LedgerList({ rows, system, empty }: {
  rows: { entry: LedgerEntry; signed: number }[];
  system: 'semester' | 'annual' | 'months';
  empty: string;
}) {
  if (rows.length === 0) return <div className="text-body text-ink-muted">{empty}</div>;
  return (
    <div className="space-y-0">
      {rows.map(({ entry, signed }) => {
        const term = typeof entry.term === 'number' ? semesterOf(entry.term) : null;
        return (
          <div key={entry.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-hairline last:border-0">
            <div className="min-w-0">
              <div className="text-body font-medium text-ink truncate">
                {entry.description}{term ? ` · ${getTermLabel(system, term)}` : ''}
              </div>
              <div className="text-micro text-ink-muted truncate">
                {formatDate(entry.date)} · <EntryTypeBadge type={entry.type} />
              </div>
            </div>
            <SignedAmount value={signed} />
          </div>
        );
      })}
    </div>
  );
}

function FeeSummaryCard(props: {
  termNoun: string;
  agreed: number;
  agreedTerm: string;
  concessions: number;
  paid: number;
  due: number;
  nextFeeLabel: string;
  nextTermLabel: string;
  system: 'semester' | 'annual' | 'months';
  overdue: number;
  overdueDays: number;
  buckets: Record<AgeingBucket, number>;
  termRows: TermRow[];
  compact?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <SummaryStat label={`Total agreed (${props.agreedTerm})`} value={formatPKR(props.agreed)} />
          <SummaryStat label="Concessions" value={props.concessions ? `−${formatPKR(props.concessions)}` : formatPKR(0)} cls="text-credit" />
          <SummaryStat label="Paid" value={formatPKR(props.paid)} />
          <SummaryStat label="Due now" value={formatPKR(Math.max(0, props.due))} cls={props.due > 0 ? 'text-dues' : undefined} />
          <SummaryStat label="Overdue" value={formatPKR(props.overdue)} cls={props.overdue > 0 ? 'text-dues' : undefined} />
          <SummaryStat label={`Next fee (${props.nextTermLabel})`} value={props.nextFeeLabel} />
        </div>
        <TermByTermTable system={props.system} termNoun={props.termNoun} rows={props.compact ? props.termRows.slice(-4) : props.termRows} />
        {props.overdue > 0 && <AgeingBar buckets={props.buckets} oldestDays={props.overdueDays} />}
      </CardContent>
    </Card>
  );
}

function SummaryStat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <span className="text-micro text-ink-muted">{label}</span>
      <div className={`text-stat font-bold tabular-nums mt-0.5 ${cls ?? 'text-ink'}`}>{value}</div>
    </div>
  );
}

function TermByTermTable({ rows, system, termNoun }: { rows: TermRow[]; system: 'semester' | 'annual' | 'months'; termNoun: string }) {
  if (rows.length === 0) {
    return <div className="text-body text-ink-muted">No {termNoun.toLowerCase()} billing recorded yet.</div>;
  }
  return (
    <div className="overflow-hidden rounded-card border border-hairline">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{termNoun}</TableHead>
            <TableHead className="text-right">Charged</TableHead>
            <TableHead className="text-right">Concessions</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Due</TableHead>
            <TableHead>Due date</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const status = termStatus(r);
            return (
              <TableRow key={r.semester}>
                <TableCell className="font-medium text-ink">{getTermLabel(system, r.semester)}</TableCell>
                <TableCell className="text-right tabular-nums text-ink-secondary">{r.billed ? formatPKR(r.charged) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums text-credit">{r.concessions ? `−${formatPKR(r.concessions)}` : '—'}</TableCell>
                <TableCell className="text-right tabular-nums text-ink-secondary">{r.paid ? formatPKR(r.paid) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums text-ink-secondary">{r.billed ? formatPKR(Math.abs(r.due)) : '—'}</TableCell>
                <TableCell className="text-ink-secondary">{r.dueDate ? formatDate(r.dueDate) : '—'}</TableCell>
                <TableCell className={`text-body ${status.cls}`}>{status.label}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** §24 ageing bar: not-yet-due plus each overdue bucket, one hue that deepens. */
const AGE_SEGMENTS: { key: AgeingBucket; label: string; bar: string }[] = [
  { key: 'notYetDue', label: 'Not yet due', bar: 'bg-hairline-strong' },
  { key: 'd1to30', label: '1–30 days', bar: 'bg-dues/30' },
  { key: 'd31to60', label: '31–60 days', bar: 'bg-dues/55' },
  { key: 'd61to90', label: '61–90 days', bar: 'bg-dues/80' },
  { key: 'over90', label: 'Over 90 days', bar: 'bg-dues' },
];

function AgeingBar({ buckets, oldestDays }: { buckets: Record<AgeingBucket, number>; oldestDays: number }) {
  const total = AGE_SEGMENTS.reduce((sum, seg) => sum + buckets[seg.key], 0);
  if (total <= 0) return null;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-micro">
        <span className="text-ink-muted">Ageing</span>
        <span className="text-ink-muted">
          Oldest unpaid charge: {oldestDays} {oldestDays === 1 ? 'day' : 'days'}
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-pill border border-hairline-soft">
        {AGE_SEGMENTS.filter((seg) => buckets[seg.key] > 0).map((seg) => (
          <div
            key={seg.key}
            className={seg.bar}
            style={{ width: `${(buckets[seg.key] / total) * 100}%` }}
            title={`${seg.label}: ${formatPKR(buckets[seg.key])}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {AGE_SEGMENTS.map((seg) => (
          <span key={seg.key} className="flex items-center gap-1.5 text-micro text-ink-muted">
            <span className={`h-2 w-2 flex-none rounded-pill ${seg.bar}`} />
            {seg.label} · <span className="tabular-nums text-ink-secondary">{formatPKR(buckets[seg.key])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HistoryCard({ sno }: { sno: number }) {
  const navigate = useNavigate();
  const logs = useAuditStore((s) => s.logs);
  const entries = useMemo(() => logs.filter((l) => l.studentSno === sno), [logs, sno]);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>History</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-micro" onClick={() => navigate('/audit')}>Audit trail →</Button>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="text-body text-ink-muted">No audit entries recorded for this student.</div>
        ) : (
          <div className="space-y-2">
            {entries.map((l) => (
              <div key={l.id} className="text-micro">
                <span className="font-semibold text-ink">{l.action}</span>
                <span className="text-ink-muted"> · {formatDate(l.timestamp)} · {l.user}</span>
                <div className="text-ink-secondary truncate">{l.details}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
