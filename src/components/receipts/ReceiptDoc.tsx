// ============================================
// MediCMS - Shared Receipt Document (80mm / A4)
// Used by admission, payment success, reprint.
// Print via parent .print-area wrapper.
// ============================================

import { formatPKR, formatDate } from '@/lib/utils';

export type ReceiptSize = '80mm' | 'A4';

export interface ReceiptDocProps {
  size: ReceiptSize;
  institute: { name: string; address: string; phone: string };
  studentName: string;
  studentSno: number;
  programLabel?: string;
  batchLabel?: string;
  receiptNo: string;
  date: string;
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
}

export function ReceiptDoc(props: ReceiptDocProps) {
  const {
    size, institute, studentName, studentSno, programLabel, batchLabel,
    receiptNo, date, payment, discount = 0, discountReason,
    mode, bankRef, demandTotal, prevBalance, newBalance, receivedBy, sessionLabel,
  } = props;

  if (size === '80mm') {
    return (
      <div className="thermal-receipt mx-auto text-center text-black" style={{ maxWidth: 300 }}>
        <div className="font-bold text-[14px]">{institute.name}</div>
        <div className="text-[11px]">{institute.address}</div>
        <div className="text-[11px]">{institute.phone}</div>
        <div className="my-1 border-t border-dashed border-black" />
        <div className="font-bold text-[12px]">PAYMENT RECEIPT</div>
        <div className="text-[11px]">Receipt: {receiptNo} · {formatDate(date)}</div>
        <div className="my-1 border-t border-dashed border-black" />
        <div className="text-left text-[11px] space-y-0.5">
          <div>Student: {studentName} (SNO:{studentSno})</div>
          {programLabel && <div>{programLabel}{batchLabel ? ` · ${batchLabel}` : ''}{sessionLabel ? ` · ${sessionLabel}` : ''}</div>}
          {demandTotal !== undefined && <div>Demand: {formatPKR(demandTotal)}</div>}
          <div>Paid: {formatPKR(payment)}</div>
          {discount > 0 && <div>Concession: {formatPKR(discount)}{discountReason ? ` (${discountReason})` : ''}</div>}
          {mode && <div>Mode: {mode}{bankRef ? ` · ${bankRef}` : ''}</div>}
          {prevBalance !== undefined && <div>Prev bal: {formatPKR(prevBalance)}</div>}
          {newBalance !== undefined && <div className="font-bold">Balance: {formatPKR(newBalance)}</div>}
        </div>
        <div className="my-1 border-t border-dashed border-black" />
        <div className="text-[11px]">Received by: {receivedBy}</div>
        <div className="text-[10px] mt-1">Sign: __________ Stamp: [ ]</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px] border-2 border-slate-900 rounded-lg p-6 text-slate-900 bg-white">
      <div className="text-center">
        <div className="font-bold text-xl">{institute.name}</div>
        <div className="text-sm text-slate-600">{institute.address} · {institute.phone}</div>
      </div>
      <hr className="my-3" />
      <div className="flex justify-between text-sm">
        <div className="font-bold">PAYMENT RECEIPT</div>
        <div>Receipt No: <strong>{receiptNo}</strong></div>
      </div>
      <div className="flex justify-between text-sm mt-1">
        <div>Date: {formatDate(date)}</div>
        {sessionLabel && <div>Session: {sessionLabel}</div>}
      </div>
      <hr className="my-3" />
      <div className="text-sm space-y-1.5">
        <div className="flex justify-between"><span className="text-slate-500">Student</span><span className="font-medium">{studentName} (SNO:{studentSno})</span></div>
        {programLabel && <div className="flex justify-between"><span className="text-slate-500">Program</span><span>{programLabel}{batchLabel ? ` · ${batchLabel}` : ''}</span></div>}
        {demandTotal !== undefined && <div className="flex justify-between"><span className="text-slate-500">Sem demand</span><span>{formatPKR(demandTotal)}</span></div>}
        {prevBalance !== undefined && <div className="flex justify-between"><span className="text-slate-500">Previous balance</span><span>{formatPKR(prevBalance)}</span></div>}
        <div className="flex justify-between"><span className="text-slate-500">Amount paid</span><span className="font-bold">{formatPKR(payment)}</span></div>
        {discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Concession</span><span>{formatPKR(discount)}{discountReason ? ` — ${discountReason}` : ''}</span></div>}
        {mode && <div className="flex justify-between"><span className="text-slate-500">Mode</span><span>{mode}{bankRef ? ` · Ref ${bankRef}` : ''}</span></div>}
        {newBalance !== undefined && <div className="flex justify-between pt-2 border-t"><span className="text-slate-500">New balance</span><span className="font-bold">{formatPKR(newBalance)}</span></div>}
      </div>
      <hr className="my-3" />
      <div className="flex justify-between text-sm">
        <span>Received by: <strong>{receivedBy}</strong></span>
        <span className="text-slate-500">Signature: __________ Stamp: [ ]</span>
      </div>
    </div>
  );
}
