// ============================================
// MediCMS Desktop — Finance core: the §77 entry limits
// The limits a screen checks before it lets an amount through. The settings
// store keeps the institute's own values; these are the defaults it starts
// with, listed in one place so the store and any screen that shows the rule
// read the same sentence. (§3: "Default limits (changeable in Settings,
// section 77)".)
// ============================================

export interface FinanceLimits {
  /** §77: an Accountant may pay out up to this per voucher. */
  accountantPayoutLimit: number;
  /** §77: the same cap for reversals, bank charges and other receipts. */
  accountantOtherEntryLimit: number;
  /** §77: a bill image is required above this amount. */
  billImageRequiredAbove: number;
  /** §77: one petty cash voucher cannot exceed this. */
  pettyVoucherLimit: number;
  /** §77: a cash payment above this asks for a second look. */
  cashPaymentWarningAbove: number;
  /** §77/§66: the petty float is flagged low below this percent of itself. */
  pettyLowWarningPercent: number;
  /** §77/§26: how many days back an Accountant may post; Admin, any open day. */
  accountantBackDateDays: number;
  /** §77/§31.2: an outstanding cheque reads stale after this many months. */
  chequeStaleMonths: number;
  /** §77/§25: the payment terms a new vendor starts with, in days. */
  vendorDefaultTermsDays: number;
}

/** The §77 "Default" column, exactly. */
export const DEFAULT_FINANCE_LIMITS: FinanceLimits = {
  accountantPayoutLimit: 50_000,
  accountantOtherEntryLimit: 50_000,
  billImageRequiredAbove: 5_000,
  pettyVoucherLimit: 5_000,
  cashPaymentWarningAbove: 25_000,
  pettyLowWarningPercent: 25,
  accountantBackDateDays: 7,
  chequeStaleMonths: 6,
  vendorDefaultTermsDays: 30,
};

/** §77's own wording for each limit, so Settings lists them as the doc names them. */
export const FINANCE_LIMIT_LABELS: Record<keyof FinanceLimits, string> = {
  accountantPayoutLimit: 'Accountant payout (per voucher)',
  accountantOtherEntryLimit: 'Accountant reversal / bank charge / other receipt',
  billImageRequiredAbove: 'Bill image required above',
  pettyVoucherLimit: 'Petty cash per-voucher limit',
  cashPaymentWarningAbove: 'Cash payment warning above',
  pettyLowWarningPercent: 'Petty cash low warning (% of float)',
  accountantBackDateDays: 'Accountant back-dating (days)',
  chequeStaleMonths: 'Cheque stale after (months)',
  vendorDefaultTermsDays: 'Default vendor payment terms (days)',
};

/** How each limit's default reads on screen — only the rupee caps show a
 *  currency; the rest are plain counts of percent, days or months (§77). */
export type FinanceLimitUnit = 'PKR' | 'percent' | 'days' | 'months';

export const FINANCE_LIMIT_UNITS: Record<keyof FinanceLimits, FinanceLimitUnit> = {
  accountantPayoutLimit: 'PKR',
  accountantOtherEntryLimit: 'PKR',
  billImageRequiredAbove: 'PKR',
  pettyVoucherLimit: 'PKR',
  cashPaymentWarningAbove: 'PKR',
  pettyLowWarningPercent: 'percent',
  accountantBackDateDays: 'days',
  chequeStaleMonths: 'months',
  vendorDefaultTermsDays: 'days',
};
