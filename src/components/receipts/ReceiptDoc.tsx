// ============================================
// MediCMS Desktop — Shared receipt document (§26, §61)
//
// One document, two formats: A4 prints a student copy and an office copy with a
// cut line (§61.1), 80 mm prints one narrow copy (§61.2). Everything §26 asks for
// is printed here — the paid-for lines with their due dates, the amount in words,
// the mode and reference, the balance, who received it, the institute footer —
// plus the marks a reprint, a void or an uncleared cheque must carry (§26).
// Print via the parent `.print-area` wrapper.
// ============================================

import { formatDate, formatPKR } from '@/lib/utils';
import { amountInWords } from '@/lib/receipts';

export type ReceiptSize = '80mm' | 'A4';

/** §26 "One line per fee charge paid, with its due date". */
export interface ReceiptLine {
  label: string;
  dueDate?: string;
  amount: number;
}

export interface ReceiptDocProps {
  size: ReceiptSize;
  institute: { name: string; address: string; phone: string };
  studentName: string;
  studentSno: number;
  programLabel?: string;
  batchLabel?: string;
  receiptNo: string;
  date: string;
  /** §26 "Receipt number, date and time". */
  time?: string;
  payment: number;
  discount?: number;
  discountReason?: string;
  mode?: string;
  bankRef?: string;
  demandTotal?: number;
  prevBalance?: number;
  newBalance?: number;
  receivedBy: string;
  sessionLabel?: string;
  /** The fee charges this payment paid (§26). */
  lines?: ReceiptLine[];
  /** DUPLICATE, VOID, CHEQUE SUBJECT TO CLEARANCE, CHEQUE RETURNED (§26). */
  mark?: string;
  /** §26/§65 institute note, for example the refund policy. */
  footer?: string;
  /** §61.1 "two copies on one page, a student copy and an office copy". */
  copies?: number;
}

/** The parts both formats print, so the two can never say different things. */
interface BodyProps extends Omit<ReceiptDocProps, 'size' | 'copies'> {
  copyLabel?: string;
}

function Mark({ mark }: { mark: string }) {
  return (
    <div className="mb-1 border-2 border-black px-2 py-0.5 text-center font-bold uppercase tracking-widest text-black">
      {mark}
    </div>
  );
}

function Words({ amount, className }: { amount: number; className: string }) {
  return <div className={className}>{amountInWords(amount)}</div>;
}

function ThermalBody(props: BodyProps) {
  const {
    institute, studentName, studentSno, programLabel, batchLabel, receiptNo, date, time,
    payment, discount = 0, discountReason, mode, bankRef, demandTotal, prevBalance,
    newBalance, receivedBy, sessionLabel, lines = [], mark, footer,
  } = props;

  return (
    <div className="thermal-receipt mx-auto text-center text-black" style={{ maxWidth: 300 }}>
      {mark && <Mark mark={mark} />}
      <div className="text-ui font-bold">{institute.name}</div>
      <div className="text-micro">{institute.address}</div>
      <div className="text-micro">{institute.phone}</div>
      <div className="my-1 border-t border-dashed border-black" />
      <div className="text-meta font-bold">PAYMENT RECEIPT</div>
      <div className="text-micro">Receipt: {receiptNo} · {formatDate(date)}{time ? ` ${time}` : ''}</div>
      <div className="my-1 border-t border-dashed border-black" />
      <div className="space-y-0.5 text-left text-micro">
        <div>Student: {studentName} (SNO:{studentSno})</div>
        {programLabel && <div>{programLabel}{batchLabel ? ` · ${batchLabel}` : ''}{sessionLabel ? ` · ${sessionLabel}` : ''}</div>}
        {demandTotal !== undefined && <div>Demand: {formatPKR(demandTotal)}</div>}
        {lines.length > 0 && (
          <>
            <div className="pt-1 font-bold">Paid for</div>
            {lines.map((line) => (
              <div key={`${line.label}-${line.dueDate ?? ''}`} className="flex justify-between">
                <span>{line.label}{line.dueDate ? ` (due ${formatDate(line.dueDate)})` : ''}</span>
                <span>{formatPKR(line.amount)}</span>
              </div>
            ))}
          </>
        )}
        <div className="pt-1">Paid: {formatPKR(payment)}</div>
        {discount > 0 && <div>Concession: {formatPKR(discount)}{discountReason ? ` (${discountReason})` : ''}</div>}
        {mode && <div>Mode: {mode}{bankRef ? ` · ${bankRef}` : ''}</div>}
        {prevBalance !== undefined && <div>Prev bal: {formatPKR(prevBalance)}</div>}
        {newBalance !== undefined && <div className="font-bold">Balance: {formatPKR(newBalance)}</div>}
      </div>
      <Words amount={payment} className="mt-1 text-left text-micro italic" />
      <div className="my-1 border-t border-dashed border-black" />
      <div className="text-micro">Received by: {receivedBy}</div>
      <div className="mt-1 text-micro">Sign: __________ Stamp: [ ]</div>
      {footer && <div className="mt-1 text-micro">{footer}</div>}
    </div>
  );
}

function CopyBody(props: BodyProps) {
  const {
    copyLabel, institute, studentName, studentSno, programLabel, batchLabel, receiptNo,
    date, time, payment, discount = 0, discountReason, mode, bankRef, demandTotal,
    prevBalance, newBalance, receivedBy, sessionLabel, lines = [], mark, footer,
  } = props;

  return (
    <div className="text-black">
      {mark && <Mark mark={mark} />}
      <div className="text-center">
        <div className="text-xl font-bold">{institute.name}</div>
        <div className="text-sm">{institute.address} · {institute.phone}</div>
      </div>
      <hr className="my-3" />
      <div className="flex justify-between text-sm">
        <div className="font-bold">PAYMENT RECEIPT{copyLabel ? ` · ${copyLabel}` : ''}</div>
        <div>Receipt No: <strong>{receiptNo}</strong></div>
      </div>
      <div className="mt-1 flex justify-between text-sm">
        <div>Date: {formatDate(date)}{time ? ` · ${time}` : ''}</div>
        {sessionLabel && <div>Session: {sessionLabel}</div>}
      </div>
      <hr className="my-3" />
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between"><span>Student</span><span className="font-medium">{studentName} (SNO:{studentSno})</span></div>
        {programLabel && <div className="flex justify-between"><span>Program</span><span>{programLabel}{batchLabel ? ` · ${batchLabel}` : ''}</span></div>}
        {demandTotal !== undefined && <div className="flex justify-between"><span>Term demand</span><span>{formatPKR(demandTotal)}</span></div>}
        {lines.length > 0 && (
          <div className="pt-1">
            <div className="font-medium">Paid for</div>
            {lines.map((line) => (
              <div key={`${line.label}-${line.dueDate ?? ''}`} className="flex justify-between pl-2">
                <span>{line.label}{line.dueDate ? ` · due ${formatDate(line.dueDate)}` : ''}</span>
                <span className="num">{formatPKR(line.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {prevBalance !== undefined && <div className="flex justify-between"><span>Previous balance</span><span>{formatPKR(prevBalance)}</span></div>}
        <div className="flex justify-between"><span>Amount paid</span><span className="font-bold">{formatPKR(payment)}</span></div>
        {discount > 0 && <div className="flex justify-between"><span>Concession</span><span>{formatPKR(discount)}{discountReason ? ` — ${discountReason}` : ''}</span></div>}
        {mode && <div className="flex justify-between"><span>Mode</span><span>{mode}{bankRef ? ` · Ref ${bankRef}` : ''}</span></div>}
        {newBalance !== undefined && <div className="flex justify-between border-t pt-2"><span>New balance</span><span className="font-bold">{formatPKR(newBalance)}</span></div>}
      </div>
      <Words amount={payment} className="mt-2 text-sm italic" />
      <hr className="my-3" />
      <div className="flex justify-between text-sm">
        <span>Received by: <strong>{receivedBy}</strong></span>
        <span>Signature: __________ Stamp: [ ]</span>
      </div>
      {footer && <div className="mt-2 text-xs">{footer}</div>}
    </div>
  );
}

export function ReceiptDoc(props: ReceiptDocProps) {
  const { size, copies = 2, ...body } = props;

  if (size === '80mm') return <ThermalBody {...body} />;

  // §61.1 two copies on one page, cut apart. One copy prints when asked for one.
  const labels = ['Student copy', 'Office copy'];
  return (
    <div className="mx-auto max-w-[720px] rounded-card border-2 border-slate-900 bg-white p-6 text-slate-900">
      {Array.from({ length: Math.max(1, copies) }, (_, index) => (
        <div key={index}>
          {index > 0 && <div className="my-4 border-t-2 border-dashed border-slate-400 text-center text-micro text-slate-500">✂ cut here</div>}
          <CopyBody {...body} copyLabel={copies > 1 ? labels[index] ?? `Copy ${index + 1}` : undefined} />
        </div>
      ))}
    </div>
  );
}
