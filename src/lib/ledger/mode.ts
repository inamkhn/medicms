// ============================================
// MediCMS Desktop — Ledger: reading the payment mode
// Moved here from lib/paymentMode.ts when the ledger stopped storing rows: the
// question "how was this paid?" belongs next to the entry that answers it.
//
// The stored entry may or may not carry an explicit `paymentMode`. New payments do;
// migrated and imported ones only encode it in the description or reference (the
// historical convention). This is the single place that answers the question, so
// the dashboard's §14 split and any future report read the same truth.
// ============================================

import type { LedgerEntry, PaymentMode } from './types.ts';

/** Cash is the default when nothing says otherwise — matches the entry form. */
export function getPaymentMode(
  entry: Pick<LedgerEntry, 'paymentMode'> & { description?: string; reference?: string | null },
): PaymentMode {
  if (entry.paymentMode) return entry.paymentMode;
  const haystack = `${entry.description ?? ''} ${entry.reference ?? ''}`.toLowerCase();
  if (haystack.includes('cheque') || haystack.includes('check')) return 'Cheque';
  if (haystack.includes('online') || haystack.includes('easypaisa') || haystack.includes('jazzcash')) return 'Online';
  if (haystack.includes('bank')) return 'Bank';
  return 'Cash';
}

/** The same reading for migration input, which has no entry shape yet (§7.10). */
export function readPaymentMode(
  stored: PaymentMode | string | null | undefined,
  text: string,
): PaymentMode {
  return getPaymentMode({ paymentMode: stored as PaymentMode | undefined, description: text });
}

/** §14: the collection split is just Cash vs everything routed through the bank
 *  (Bank / Online / Cheque all leave the student's counter as non-cash). */
export function isNonCash(entry: Pick<LedgerEntry, 'paymentMode'> & { description?: string; reference?: string | null }): boolean {
  return getPaymentMode(entry) !== 'Cash';
}
