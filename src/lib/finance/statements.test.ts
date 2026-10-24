// ============================================
// MediCMS Desktop — Finance core: statements and reconciliation (§40–§42) tests
// §79.25 import twice, §79.26 match confidence, §79.29 the September sample,
// §79.30 resolved lines, plus the CSV shapes banks print. No store, no clock.
// Run: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import {
  inTransitEntries,
  matchedEntryIds,
  parseStatementCsv,
  reconciliationCheck,
  reconciliationProblems,
  suggestMatches,
  unresolvedLines,
  type StatementLine,
} from './statements.ts';
import type { MoneyEntry } from './types.ts';

function line(over: Partial<StatementLine> = {}): StatementLine {
  return {
    id: 'sl-1',
    accountId: 'acc-bank',
    date: '2026-09-05',
    description: 'TRF Aslam Properties',
    debit: 0,
    credit: 0,
    status: 'Unmatched',
    ...over,
  };
}

function entry(over: Partial<MoneyEntry> = {}): MoneyEntry {
  return {
    id: 'me-1',
    no: 1,
    date: '2026-09-05',
    accountId: 'acc-bank',
    direction: 'Out',
    amount: 150_000,
    kind: 'BillPayment',
    reference: 'PV-0377',
    actionId: 'a-1',
    createdBy: 'Saba Noor',
    cleared: true,
    reconciled: false,
    createdAt: '2026-09-05T10:00:00',
    ...over,
  };
}

describe('import (§40)', () => {
  it('guesses the columns and reads a debit and a credit row', () => {
    const csv = [
      'Txn Date,Narration,Withdrawal,Deposit,Closing Balance,Chq No',
      '05/09/2026,TRF Aslam Properties,150000,,1173500,PV-0377',
      '08/09/2026,Cash deposit D-112,,600000,1773500,',
    ].join('\n');
    const result = parseStatementCsv(csv);
    equal(result.errors.length, 0);
    deepStrictEqual(result.lines, [
      { date: '2026-09-05', description: 'TRF Aslam Properties', debit: 150_000, credit: 0, balance: 1_173_500, reference: 'PV-0377' },
      { date: '2026-09-08', description: 'Cash deposit D-112', debit: 0, credit: 600_000, balance: 1_773_500, reference: undefined },
    ]);
  });

  it('§79.25: the same file imported twice adds no lines', () => {
    const csv = ['date,description,debit,credit', '2026-09-05,TRF Aslam,150000,', '2026-09-08,Cash deposit,,600000'].join('\n');
    const first = parseStatementCsv(csv);
    equal(first.lines.length, 2);
    const stored = first.lines.map((parsed, index) => ({ ...parsed, id: `sl-${index + 1}`, accountId: 'acc-bank', status: 'Unmatched' as const }));
    const second = parseStatementCsv(csv, { existing: stored });
    equal(second.lines.length, 0);
    equal(second.duplicates, 2);
  });

  it('§40: lines before go-live are counted, and a bad date is listed', () => {
    const csv = ['date,description,debit,credit', '2026-08-30,Old line,1000,', '2026-13-45,Bad line,500,', '2026-10-02,Rent,150000,'].join('\n');
    const result = parseStatementCsv(csv, { goLiveDate: '2026-10-01' });
    equal(result.lines.length, 1);
    equal(result.lines[0].description, 'Rent');
    equal(result.skippedBeforeGoLive, 1);
    equal(result.errors.length, 1);
    equal(result.errors[0].message, 'Line 3: the date is not valid (§73.1).');
  });

  it('refuses a file with no date or amount column', () => {
    const result = parseStatementCsv('name,note\nfoo,bar');
    equal(result.lines.length, 0);
    equal(result.errors.length, 1);
  });
});

describe('matching (§41)', () => {
  it('§79.26: equal amount, 2 days apart, reference quoting PV-0377 is Exact; amount alone is Possible', () => {
    const exact = suggestMatches(line({ date: '2026-09-07', debit: 150_000, description: 'TRF Aslam Properties PV-0377' }), [entry()]);
    deepStrictEqual(exact, { entryIds: ['me-1'], confidence: 'Exact' });

    const possible = suggestMatches(line({ date: '2026-09-20', debit: 150_000, description: 'Something else' }), [entry()]);
    deepStrictEqual(possible, { entryIds: ['me-1'], confidence: 'Possible' });
  });

  it('a single candidate within three days is Likely', () => {
    const suggestion = suggestMatches(line({ date: '2026-09-07', debit: 150_000, description: 'Bulk transfer' }), [entry()]);
    deepStrictEqual(suggestion, { entryIds: ['me-1'], confidence: 'Likely' });
  });

  it('nothing equal in the window gets no suggestion', () => {
    equal(suggestMatches(line({ date: '2026-09-05', debit: 1_500 }), [entry()]), undefined);
  });

  it('§41.4: unmatched entries are in transit while recent, and need attention when old', () => {
    const matched = matchedEntryIds([line({ status: 'Matched', matchedEntryIds: ['me-2'] })]);
    const result = inTransitEntries(
      [entry(), entry({ id: 'me-2', no: 2 }), entry({ id: 'me-3', no: 3, date: '2026-08-01' })],
      matched,
      { today: '2026-09-09' },
    );
    equal(result.inTransit.length, 1);
    equal(result.inTransit[0].id, 'me-1');
    equal(result.needsAttention.length, 1);
    equal(result.needsAttention[0].id, 'me-3');
  });
});

describe('reconciliation (§42)', () => {
  it('§79.29: statement 1,132,000 + transit 40,000 − 0 = book 1,172,000, difference 0', () => {
    const check = reconciliationCheck({
      statementClosing: 1_132_000,
      depositsInTransit: 40_000,
      paymentsInTransit: 0,
      bookBalance: 1_172_000,
    });
    equal(check.adjustedStatement, 1_172_000);
    equal(check.difference, 0);
    deepStrictEqual(reconciliationProblems(check, [line({ status: 'Matched' })]), []);
  });

  it('§73.1: an unresolved line and a non-zero difference both block Finish', () => {
    const check = reconciliationCheck({
      statementClosing: 1_132_000,
      depositsInTransit: 0,
      paymentsInTransit: 0,
      bookBalance: 1_133_500,
    });
    const problems = reconciliationProblems(check, [line()]);
    equal(problems.length, 2);
    equal(problems[0], '1 statement line is not resolved — match, create or ignore each one (§42).');
    equal(problems[1], 'The difference is 1,500. Resolve every statement line before finishing (§73.1).');
    equal(unresolvedLines([line(), line({ id: 'sl-2', status: 'Ignored' })]).length, 1);
  });
});
