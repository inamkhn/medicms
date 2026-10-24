// ============================================
// MediCMS Desktop — Finance core: statements, matching and reconciliation
// (§40–§42, §44). A statement line is what the bank says happened; a money entry
// is what the books say happened. Reconciliation is confirming the two agree,
// month by month, and the check in §42 is the only arithmetic behind "Finish".
// Pure: no clock, no store — the date, the entries and the window come in.
// ============================================

import type { MoneyAccount, MoneyEntry } from './types.ts';

/** §41: each statement line is Matched, Unmatched or Ignored (with a reason). */
export type StatementStatus = 'Unmatched' | 'Matched' | 'Ignored';

/** §41.1's three confidences, in the order the screen ranks them. */
export type MatchConfidence = 'Exact' | 'Likely' | 'Possible';

/**
 * One line of a bank statement (§40). Stored, never edited: a line that does not
 * belong is Ignored with a reason, never deleted, so the import count stays honest.
 */
export interface StatementLine {
  /** `sl-<n>` — unique and never reused, like every other number. */
  id: string;
  accountId: string;
  date: string;
  description: string;
  /** Rupees out of the account; 0 when the line is a deposit (§40 debit/credit). */
  debit: number;
  /** Rupees into the account. */
  credit: number;
  /** The statement's own running balance column, when the file carried one. */
  balance?: number;
  /** Reference or cheque number, the field §41.1 matches an Exact on. */
  reference?: string;
  status: StatementStatus;
  /** The entries this line matched — §41.2 allows one line to several entries. */
  matchedEntryIds?: string[];
  /** §41.3: an ignored line carries its reason. */
  ignoredReason?: string;
}

/** §42 step 6: the reconciliation record that is saved when the difference is zero. */
export interface Reconciliation {
  /** `rec-<accountId>-<month>` — one reconciliation per account per month. */
  id: string;
  accountId: string;
  /** `YYYY-MM`. */
  month: string;
  statementClosing: number;
  bookBalance: number;
  difference: number;
  depositsInTransit: number;
  paymentsInTransit: number;
  createdBy: string;
  /** ISO timestamp. */
  createdAt: string;
  /** §42: a reversal in a reconciled period needs this reopened (Admin). */
  reopenedBy?: string;
  reopenedAt?: string;
  reopenReason?: string;
}

// -------------------------------------------
// Import (§40)
// -------------------------------------------

/** §40 "column names are flexible"; the first header that matches wins. */
const COLUMN_ALIASES: Record<keyof ColumnMap, readonly string[]> = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date'],
  description: ['description', 'narration', 'details', 'particulars', 'remarks'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'dr', 'debit amount'],
  credit: ['credit', 'deposit', 'deposits', 'cr', 'credit amount'],
  balance: ['balance', 'closing balance', 'running balance'],
  reference: ['reference', 'ref', 'cheque no', 'chq no', 'cheque number', 'instrument', 'instrument no'],
};

export interface ColumnMap {
  date: number;
  description: number;
  debit: number;
  credit: number;
  balance: number;
  reference: number;
}

function toPosixHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** §40/§67.1: guess the columns from the header row; -1 means "not in the file". */
export function guessColumns(header: readonly string[]): ColumnMap {
  const lowered = header.map(toPosixHeader);
  const find = (aliases: readonly string[]) => lowered.findIndex((h) => aliases.includes(h));
  return {
    date: find(COLUMN_ALIASES.date),
    description: find(COLUMN_ALIASES.description),
    debit: find(COLUMN_ALIASES.debit),
    credit: find(COLUMN_ALIASES.credit),
    balance: find(COLUMN_ALIASES.balance),
    reference: find(COLUMN_ALIASES.reference),
  };
}

/** One valid row of the file, before it becomes a stored line. */
export interface ParsedLine {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  reference?: string;
}

export interface ParseResult {
  lines: ParsedLine[];
  /** §40 "bad rows are listed and skipped", one sentence per row. */
  errors: { row: number; message: string }[];
  /** §40 "lines dated before the go-live date are ignored, with a count shown". */
  skippedBeforeGoLive: number;
  /** §40 "a line with the same date, amount, reference and balance is skipped". */
  duplicates: number;
}

/** `YYYY-MM-DD`, `DD/MM/YYYY` and `DD-MM-YYYY` are the shapes banks print. */
function parseDate(raw: string): string | undefined {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return validDay(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? value : undefined;
  const short = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (!short) return undefined;
  const day = Number(short[1]);
  const month = Number(short[2]);
  const year = Number(short[3]);
  if (!validDay(year, month, day)) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function validDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** "1,250.00" / "PKR 1,250" / "(1,250)" / "" — whole rupees, sign dropped. */
function parseAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/[^0-9.()-]/g, '');
  if (!cleaned.trim()) return 0;
  const negative = /^\(.*\)$/.test(cleaned) || cleaned.startsWith('-');
  const digits = cleaned.replace(/[()-]/g, '');
  const value = Math.round(Number(digits));
  if (!Number.isFinite(value)) return undefined;
  return negative ? -value : value;
}

/** Everything a re-import must recognise to stay idempotent (§40, §79.25). */
export function statementDedupeKey(line: Pick<ParsedLine, 'date' | 'debit' | 'credit' | 'reference' | 'balance'>): string {
  return [line.date, line.debit, line.credit, line.reference ?? '', line.balance ?? ''].join('|');
}

/**
 * §40/§67.1 — read a CSV into statement lines. The header is guessed, valid rows
 * come back, bad rows are named, and lines before go-live or already stored are
 * counted rather than added, so importing the same file twice changes nothing.
 */
export function parseStatementCsv(
  text: string,
  opts: { goLiveDate?: string; existing?: readonly StatementLine[] } = {},
): ParseResult {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  const result: ParseResult = { lines: [], errors: [], skippedBeforeGoLive: 0, duplicates: 0 };
  if (rows.length === 0) {
    result.errors.push({ row: 0, message: 'The file is empty.' });
    return result;
  }

  const header = splitCsvRow(rows[0]);
  const map = guessColumns(header);
  if (map.date < 0 || (map.debit < 0 && map.credit < 0)) {
    result.errors.push({
      row: 1,
      message: 'No date column, or no debit/credit column, was found in the first row (§40).',
    });
    return result;
  }

  const seen = new Set((opts.existing ?? []).map((line) => statementDedupeKey(line)));
  rows.slice(1).forEach((row, index) => {
    const rowNo = index + 2;
    const cells = splitCsvRow(row);
    const date = parseDate(cells[map.date] ?? '');
    if (!date) {
      result.errors.push({ row: rowNo, message: `Line ${rowNo}: the date is not valid (§73.1).` });
      return;
    }
    const debit = map.debit >= 0 ? parseAmount(cells[map.debit] ?? '') : 0;
    const credit = map.credit >= 0 ? parseAmount(cells[map.credit] ?? '') : 0;
    if (debit === undefined || credit === undefined) {
      result.errors.push({ row: rowNo, message: `Line ${rowNo}: the amount is not valid (§73.1).` });
      return;
    }
    const balance = map.balance >= 0 ? parseAmount(cells[map.balance] ?? '') : undefined;
    const line: ParsedLine = {
      date,
      description: (map.description >= 0 ? cells[map.description] ?? '' : '').trim(),
      // §40 separates the two columns; a signed single column lands on the right side.
      debit: Math.abs(debit),
      credit: Math.abs(credit),
      balance: balance === undefined ? undefined : Math.abs(balance),
      reference: (map.reference >= 0 ? cells[map.reference] ?? '' : '').trim() || undefined,
    };
    if (opts.goLiveDate && line.date < opts.goLiveDate) {
      result.skippedBeforeGoLive += 1;
      return;
    }
    const key = statementDedupeKey(line);
    if (seen.has(key)) {
      result.duplicates += 1;
      return;
    }
    seen.add(key);
    result.lines.push(line);
  });
  return result;
}

/** A CSV row split on commas, honouring double quotes; exported for the preview. */
export function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (quoted) {
      if (ch === '"' && row[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

// -------------------------------------------
// Matching (§41)
// -------------------------------------------

/** Whole days between two `YYYY-MM-DD` dates, calendar-safe. */
export function dayGap(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

export interface MatchSuggestion {
  entryIds: string[];
  confidence: MatchConfidence;
}

/** Every number the line could be quoting — a receipt, voucher, cheque or slip. */
function lineNumbers(line: StatementLine): string[] {
  const text = `${line.reference ?? ''} ${line.description}`.toLowerCase();
  return text.split(/[^a-z0-9-]+/).filter((token) => token.length >= 3);
}

function entryNumbers(entry: MoneyEntry): string[] {
  return [entry.reference, entry.linkedDoc].filter((v): v is string => Boolean(v)).map((v) => v.toLowerCase());
}

/**
 * §41.1 — the suggestion for one statement line, ranked as the doc ranks it:
 * **Exact** when the amount is equal, the date is within 3 days and the line
 * quotes a document number the entry carries; **Likely** when the amount is
 * equal, the date is within 3 days and only one candidate is left; **Possible**
 * when only the amount is equal. Undefined means nothing is close.
 */
export function suggestMatches(
  line: StatementLine,
  entries: readonly MoneyEntry[],
  opts: { windowDays?: number; alreadyMatched?: ReadonlySet<string> } = {},
): MatchSuggestion | undefined {
  const windowDays = opts.windowDays ?? 3;
  const amount = line.debit > 0 ? line.debit : line.credit;
  const direction = line.debit > 0 ? 'Out' : 'In';
  const tokens = lineNumbers(line);
  const candidates = entries.filter((entry) => {
    if (entry.accountId !== line.accountId) return false;
    if (entry.direction !== direction) return false;
    if (entry.amount !== amount) return false;
    if (opts.alreadyMatched?.has(entry.id)) return false;
    return true;
  });
  if (candidates.length === 0) return undefined;

  const inWindow = candidates.filter((entry) => Math.abs(dayGap(line.date, entry.date)) <= windowDays);
  const exact = inWindow.filter((entry) =>
    entryNumbers(entry).some((number) => tokens.some((token) => token === number || token.includes(number))),
  );
  if (exact.length === 1) return { entryIds: [exact[0].id], confidence: 'Exact' };
  if (inWindow.length === 1) return { entryIds: [inWindow[0].id], confidence: 'Likely' };
  const best = inWindow[0] ?? candidates[0];
  return { entryIds: [best.id], confidence: 'Possible' };
}

/** §41.3: the lines that still block "Finish". */
export function unresolvedLines(lines: readonly StatementLine[]): StatementLine[] {
  return lines.filter((line) => line.status === 'Unmatched');
}

/** The entries a set of confirmed lines already stands against. */
export function matchedEntryIds(lines: readonly StatementLine[]): Set<string> {
  const out = new Set<string>();
  for (const line of lines) for (const id of line.matchedEntryIds ?? []) out.add(id);
  return out;
}

/**
 * §41.4 — book entries the statement has not shown yet: **in transit** while the
 * movement is recent, **needs attention** when it is older than the window.
 */
export function inTransitEntries(
  entries: readonly MoneyEntry[],
  matched: ReadonlySet<string>,
  opts: { accountId?: string; today: string; windowDays?: number },
): { inTransit: MoneyEntry[]; needsAttention: MoneyEntry[] } {
  const windowDays = opts.windowDays ?? 5;
  const inTransit: MoneyEntry[] = [];
  const needsAttention: MoneyEntry[] = [];
  for (const entry of entries) {
    if (opts.accountId && entry.accountId !== opts.accountId) continue;
    if (matched.has(entry.id)) continue;
    if (entry.kind === 'OpeningBalance') continue;
    if (Math.abs(dayGap(entry.date, opts.today)) <= windowDays) inTransit.push(entry);
    else needsAttention.push(entry);
  }
  return { inTransit, needsAttention };
}

// -------------------------------------------
// Reconciliation (§42)
// -------------------------------------------

export interface ReconciliationInput {
  statementClosing: number;
  /** Book entries the statement has not shown that increase the account (§42 step 5). */
  depositsInTransit: number;
  /** Book entries the statement has not shown that reduce it. */
  paymentsInTransit: number;
  bookBalance: number;
}

export interface ReconciliationCheck extends ReconciliationInput {
  adjustedStatement: number;
  difference: number;
}

/**
 * §42 step 5, verbatim: statement closing + deposits in transit − payments in
 * transit = book balance. The difference must be zero before Finish is enabled.
 */
export function reconciliationCheck(input: ReconciliationInput): ReconciliationCheck {
  const adjustedStatement = input.statementClosing + input.depositsInTransit - input.paymentsInTransit;
  return { ...input, adjustedStatement, difference: input.bookBalance - adjustedStatement };
}

/** §42/§73.1: why Finish is still disabled, in the doc's own sentences. */
export function reconciliationProblems(check: ReconciliationCheck, lines: readonly StatementLine[]): string[] {
  const problems: string[] = [];
  const unresolved = unresolvedLines(lines).length;
  if (unresolved > 0) {
    problems.push(`${unresolved} statement line${unresolved === 1 ? ' is' : 's are'} not resolved — match, create or ignore each one (§42).`);
  }
  if (check.difference !== 0) {
    problems.push(`The difference is ${Math.abs(check.difference).toLocaleString('en-PK')}. Resolve every statement line before finishing (§73.1).`);
  }
  return problems;
}

/** The in/out of a line as one signed number, for the check panel. */
export function lineSignedAmount(line: StatementLine): number {
  return line.credit - line.debit;
}

/** The bank or wallet accounts that reconciliation owns (§39, §60.2). */
export function reconcilableAccounts(accounts: readonly MoneyAccount[]): MoneyAccount[] {
  return accounts.filter((a) => (a.type === 'bank' || a.type === 'wallet') && a.status === 'Active');
}

/** `YYYY-MM` of a stored reconciliation, for "reconciled through" (§60.1). */
export function reconciledThroughMonth(
  reconciliations: readonly Reconciliation[],
  accountId: string,
): string | undefined {
  let latest: string | undefined;
  for (const rec of reconciliations) {
    if (rec.accountId !== accountId || rec.reopenedAt) continue;
    if (!latest || rec.month > latest) latest = rec.month;
  }
  return latest;
}
