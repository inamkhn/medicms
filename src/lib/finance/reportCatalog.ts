// ============================================
// MediCMS Desktop — Finance: the report catalog (§54, §70.1)
// The thirteen reports of §54 in the doc's own words, plus the fees-owed table
// of §55.3 that the overview links to. The hub prints this list and the report
// page looks a name up in it, so a report cannot exist in one place and not the
// other — and the route a card opens is the report's own name.
// Pure data: no store, no clock.
// ============================================

/** §52 — which of the two views the figures come from. */
export type ReportView = 'Cash' | 'Cost' | 'Ledger' | 'Both';

/** §70.1 — the four groups the hub lays the cards out in. */
export type ReportGroup = 'Money' | 'Costs' | 'Fees' | 'Control';

/**
 * What the report's period control is (`range`): a from/to pair, a single
 * "as at" date, or a month. §54 gives every report a date range; a balance is
 * still one figure on a date, and a month-end report is the month it closed.
 */
export type ReportRange = 'range' | 'asAt' | 'month';

export interface ReportDescriptor {
  /** The address segment: `/finance/reports/<name>`. */
  name: string;
  /** §54's own report name. */
  title: string;
  /** §54's "Question it answers" — the card's heading (§70.1). */
  question: string;
  /** One line under the question. */
  description: string;
  view: ReportView;
  group: ReportGroup;
  range: ReportRange;
  /** §54.13: individual pay never appears for anyone except an Admin. */
  adminOnly?: boolean;
}

export const FINANCE_REPORTS: readonly ReportDescriptor[] = [
  {
    name: 'money-flow',
    title: 'Money flow',
    question: 'How much came in and went out, by route and purpose?',
    description: 'The cash view for the period. Transfers are counted apart, never in the totals (§55.1).',
    view: 'Cash',
    group: 'Money',
    range: 'range',
  },
  {
    name: 'balances',
    title: 'Account balances',
    question: 'Where is the money, on any date?',
    description: 'Every account, its balance and — for a bank — what is still free after issued cheques (§53).',
    view: 'Cash',
    group: 'Money',
    range: 'asAt',
  },
  {
    name: 'cash-book',
    title: 'Cash book and bank book',
    question: 'Every movement of an account, with a running balance.',
    description: 'One account’s entries in date order, the balance worked out from the start (§12).',
    view: 'Cash',
    group: 'Money',
    range: 'range',
  },
  {
    name: 'vouchers',
    title: 'Voucher register',
    question: 'Every payment out, by payee, mode and date.',
    description: 'Every voucher, void ones shown as void, with what each one paid (§29).',
    view: 'Cash',
    group: 'Money',
    range: 'range',
  },
  {
    name: 'costs',
    title: 'Costs by category',
    question: 'What did we incur, and for what?',
    description: 'Bills posted in the period by category, paid and still owed (§54.5).',
    view: 'Cost',
    group: 'Costs',
    range: 'range',
  },
  {
    name: 'budget',
    title: 'Budget versus actual',
    question: 'Are we on budget, including unpaid bills?',
    description: 'The month’s grid: budget, paid, committed and what is left (§47).',
    view: 'Cost',
    group: 'Costs',
    range: 'month',
  },
  {
    name: 'payables',
    title: 'Payables and vendor statement',
    question: 'What do we owe, to whom, and since when?',
    description: 'Unpaid bills aged by how late they are, by vendor (§55.2).',
    view: 'Cost',
    group: 'Costs',
    range: 'asAt',
  },
  {
    name: 'fee-collection',
    title: 'Fee collection',
    question: 'How much was billed, collected and is still due, by mode and program?',
    description: 'The ledger’s own figures for the period, by the route the money took (§54.4).',
    view: 'Ledger',
    group: 'Fees',
    range: 'range',
  },
  {
    name: 'receivables',
    title: 'Fees owed',
    question: 'What are students still to pay, and how late is it?',
    description: 'Outstanding, overdue and struck-off dues with the ageing bands (§55.3).',
    view: 'Ledger',
    group: 'Fees',
    range: 'asAt',
  },
  {
    name: 'held-money',
    title: 'Held money',
    question: 'What do we hold for others?',
    description: 'Student credit, security deposits and cheques in hand — none of it income (§18).',
    view: 'Both',
    group: 'Fees',
    range: 'asAt',
  },
  {
    name: 'programs',
    title: 'Program summary',
    question: 'Fees collected compared with costs tagged to each program.',
    description: 'Both views side by side: what a program brought in, and what it cost (§54.12).',
    view: 'Both',
    group: 'Fees',
    range: 'range',
  },
  {
    name: 'reconciliation',
    title: 'Reconciliation',
    question: 'Is every bank account reconciled, and what is outstanding?',
    description: 'Reconciled through, unmatched statement lines and the month’s difference (§42).',
    view: 'Cash',
    group: 'Control',
    range: 'month',
  },
  {
    name: 'month-end',
    title: 'Month-end report',
    question: 'The whole month on one set of pages, created at closing.',
    description: 'Saved the moment the month was locked, and never recalculated (§48.3).',
    view: 'Both',
    group: 'Control',
    range: 'month',
  },
  {
    name: 'payroll',
    title: 'Payroll summary',
    question: 'What did staff cost, and what is still to pay?',
    description: 'Approved runs by service month, as batch totals. Admin only (§54.13).',
    view: 'Cost',
    group: 'Control',
    range: 'range',
    adminOnly: true,
  },
];

/** The report a `/finance/reports/:name` address asks for, if it exists. */
export function reportByName(name: string): ReportDescriptor | undefined {
  return FINANCE_REPORTS.find((report) => report.name === name);
}

/** §70.1 — one group's cards, in §54's order. */
export function reportsInGroup(group: ReportGroup): ReportDescriptor[] {
  return FINANCE_REPORTS.filter((report) => report.group === group);
}
