// ============================================
// MediCMS Desktop — Student statement document (§9.1, §55)
//
// The paper §9.1 describes: a header with the institute, the student and the
// period; the balance brought forward and every entry with a running balance;
// the summary line; the unpaid fee charges with due dates and days overdue; and
// the ageing line. Two variants of one document — a Full statement and a Dues
// only statement that prints just the summary and the dues.
//
// Every figure comes from `studentStatement` (the same charge state the ledger
// uses), so the statement, the ledger tab and the ledger check cannot disagree.
// The parent wraps it in `.print-area`; print goes through the browser dialog,
// which also offers Save as PDF (§55).
// ============================================

import { formatDate } from '@/lib/utils';
import { ENTRY_LABELS, type LedgerEntry } from '@/lib/ledger';
import type { StatementRow, StudentStatement } from '@/lib/receipts';

export type StatementPaper = 'A4' | '80mm';

export interface StatementDocProps {
  size: StatementPaper;
  institute: { name: string; address: string; phone: string };
  student: {
    name: string;
    sno: number;
    fatherName?: string;
    programLabel?: string;
    batchLabel?: string;
    sessionLabel?: string;
    termLabel?: string;
  };
  statement: StudentStatement;
  printedBy: string;
  /** The day the statement is printed, `YYYY-MM-DD`. */
  printedOn: string;
}

/** Paper money: grouped rupees, a credit in brackets — an accounting statement, not a receipt. */
function money(amount: number): string {
  const abs = Math.abs(Math.trunc(amount)).toLocaleString('en-PK');
  return amount < 0 ? `(${abs})` : abs;
}

/** §9.1's Entry column: what it was, plus the due date or the receipt it carries. */
function entryText(entry: LedgerEntry): string {
  const base = entry.description || ENTRY_LABELS[entry.type];
  if (entry.type === 'Payment' && entry.reference) {
    return `${base} ${entry.reference}${entry.paymentMode ? ` (${entry.paymentMode.toLowerCase()})` : ''}`;
  }
  if (entry.dueDate && (entry.type === 'FeeCharge' || entry.type === 'SpecialCharge')) {
    return `${base} (due ${formatDate(entry.dueDate)})`;
  }
  return base;
}

function Row({ row }: { row: StatementRow }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="whitespace-nowrap py-0.5 pr-2 align-top text-micro">{formatDate(row.entry.date)}</td>
      <td className="py-0.5 pr-2 align-top">{entryText(row.entry)}</td>
      <td className="num whitespace-nowrap py-0.5 pr-2 text-right align-top">{row.charges ? money(row.charges) : ''}</td>
      <td className="num whitespace-nowrap py-0.5 pr-2 text-right align-top">{row.credits ? money(row.credits) : ''}</td>
      <td className="num whitespace-nowrap py-0.5 text-right align-top font-medium">{money(row.balance)}</td>
    </tr>
  );
}

export function StatementDoc(props: StatementDocProps) {
  const { size, institute, student, statement, printedBy, printedOn } = props;
  const narrow = size === '80mm';
  const { summary, ageing } = statement;

  return (
    <div className={narrow ? 'mx-auto max-w-[300px] text-black' : 'mx-auto max-w-[720px] rounded-card border-2 border-slate-900 bg-white p-6 text-slate-900'}>
      {/* §9.1 header: institute, student, period and who printed it. */}
      <div className={narrow ? 'text-center' : 'flex items-start justify-between gap-3'}>
        <div>
          <div className={narrow ? 'text-ui font-bold' : 'text-title font-bold'}>{institute.name || 'Institute'}</div>
          <div className="text-micro">{institute.address}{institute.address && institute.phone ? ' · ' : ''}{institute.phone}</div>
        </div>
        <div className={narrow ? 'mt-1 text-meta font-bold tracking-widest' : 'text-right text-meta font-bold tracking-widest'}>
          STUDENT STATEMENT
        </div>
      </div>

      <hr className={narrow ? 'my-1.5 border-black' : 'my-3 border-slate-900'} />

      <div className="space-y-0.5 text-micro">
        <div className="font-medium">
          {student.name}{student.fatherName ? `, s/o ${student.fatherName}` : ''} · SNO {student.sno}
        </div>
        <div>
          {[student.programLabel, student.batchLabel, student.sessionLabel, student.termLabel].filter(Boolean).join(', ')}
        </div>
        <div className={narrow ? '' : 'flex justify-between'}>
          <span>Period: {formatDate(statement.from)} to {formatDate(statement.to)}</span>
          <span>{narrow ? `Printed ${formatDate(printedOn)}` : `Printed ${formatDate(printedOn)} by ${printedBy}`}</span>
        </div>
      </div>

      {/* §9.1 "Balance brought forward, then every entry in the period with a running balance." */}
      {statement.layout === 'Full' && (
        <>
          <hr className={narrow ? 'my-1.5 border-dashed border-black' : 'my-2 border-slate-300'} />
          <table className="w-full text-left text-meta">
            <thead>
              <tr className="border-b border-slate-400 text-micro uppercase tracking-wide">
                <th className="py-0.5 pr-2 font-semibold">Date</th>
                <th className="py-0.5 pr-2 font-semibold">Entry</th>
                <th className="py-0.5 pr-2 text-right font-semibold">Charges</th>
                <th className="py-0.5 pr-2 text-right font-semibold">Credits</th>
                <th className="py-0.5 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="py-0.5 pr-2 text-micro" />
                <td className="py-0.5 pr-2 italic" colSpan={3}>Brought forward</td>
                <td className="num py-0.5 text-right font-medium">{money(statement.broughtForward)}</td>
              </tr>
              {statement.rows.map((row) => <Row key={row.entry.id} row={row} />)}
            </tbody>
          </table>
        </>
      )}

      {/* §9.1 summary and the balance due. */}
      <div className={narrow ? 'mt-1.5 space-y-0.5 text-micro' : 'mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro'}>
        <span>Brought forward <b className="num">{money(summary.broughtForward)}</b></span>
        <span aria-hidden="true">|</span>
        <span>Charges <b className="num">{money(summary.charges)}</b></span>
        <span aria-hidden="true">|</span>
        <span>Concessions <b className="num">{money(summary.concessions)}</b></span>
        <span aria-hidden="true">|</span>
        <span>Payments <b className="num">{money(summary.payments)}</b></span>
      </div>
      <div className={narrow ? 'mt-0.5 text-meta font-bold' : 'mt-1 text-body font-bold'}>
        Balance {summary.balance < 0 ? 'in credit' : 'due'} {money(Math.abs(summary.balance))}
      </div>

      {/* §9.1 "An Unpaid fee charges list with due dates and days overdue." */}
      <div className={narrow ? 'mt-1.5' : 'mt-3'}>
        <div className="text-meta font-semibold">Unpaid fee charges</div>
        {statement.unpaid.length === 0 ? (
          <div className="text-micro italic">Nothing unpaid on a fee charge.</div>
        ) : (
          <table className="mt-0.5 w-full text-left text-micro">
            <thead>
              <tr className="border-b border-slate-400 uppercase tracking-wide">
                <th className="py-0.5 pr-2 font-semibold">Charge</th>
                <th className="py-0.5 pr-2 text-right font-semibold">Unpaid</th>
                <th className="py-0.5 pr-2 font-semibold">Due</th>
                <th className="py-0.5 text-right font-semibold">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {statement.unpaid.map((row) => (
                <tr key={row.chargeId} className="border-b border-slate-200">
                  <td className="py-0.5 pr-2">{row.label}</td>
                  <td className="num py-0.5 pr-2 text-right">{money(row.unpaid)}</td>
                  <td className="py-0.5 pr-2">{formatDate(row.dueDate)}</td>
                  <td className="num py-0.5 text-right">
                    {row.daysOverdue > 0 ? `${row.daysOverdue} ${row.daysOverdue === 1 ? 'day' : 'days'} overdue` : 'Not yet due'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-0.5 text-micro">
          Unpaid total <b className="num">{money(statement.unpaidTotal)}</b>
        </div>
      </div>

      {/* §9.1 ageing line: not yet due, 1-30, 31-60, 61-90, over 90. */}
      <div className="mt-1.5 text-micro">
        <span className="font-semibold">Ageing</span>{' '}
        Not yet due {money(ageing.buckets.notYetDue)} · 1-30 {money(ageing.buckets.d1to30)} · 31-60{' '}
        {money(ageing.buckets.d31to60)} · 61-90 {money(ageing.buckets.d61to90)} · Over 90 {money(ageing.buckets.over90)}
      </div>

      <hr className={narrow ? 'my-1.5 border-black' : 'my-3 border-slate-300'} />
      <div className="text-micro italic">
        {statement.layout === 'DuesOnly'
          ? 'Dues only — the summary and the unpaid charges, without the entry list (§9.1).'
          : 'Every figure above is calculated from the ledger entries; nothing here is stored or edited (§7.3).'}
      </div>
    </div>
  );
}
