// ============================================
// MediCMS Desktop — Academic core: schedule / calendar term / promotion tests
// §18, §45 cases 4-15. Run: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import { calendarTermOf, generateSchedule, isDueForPromotion } from './schedule.ts';
import type { TermPosition } from './types.ts';

const TODAY = '2026-10-09';

describe('generateSchedule (§45 cases 4-5)', () => {
  it('builds an 8-term six-month schedule ending 31 Aug 2030', () => {
    const rows = generateSchedule('2026-09-01', 8, 2); // 6-month terms
    deepStrictEqual(
      rows.map((r) => r.starts),
      [
        '2026-09-01', '2027-03-01', '2027-09-01', '2028-03-01',
        '2028-09-01', '2029-03-01', '2029-09-01', '2030-03-01',
      ],
    );
    deepStrictEqual(
      rows.map((r) => r.ends),
      [
        '2027-02-28', '2027-08-31', '2028-02-29', '2028-08-31', // Feb 2028 is a leap year
        '2029-02-28', '2029-08-31', '2030-02-28', '2030-08-31',
      ],
    );
  });

  it('builds an annual (12-month) two-term schedule', () => {
    const rows = generateSchedule('2025-11-01', 2, 1);
    deepStrictEqual(rows, [
      { term: 1, starts: '2025-11-01', ends: '2026-10-31' },
      { term: 2, starts: '2026-11-01', ends: '2027-10-31' },
    ]);
  });
});

describe('calendarTermOf (§45 cases 6-12)', () => {
  it('BSN Fall 2025 → Semester 3', () => {
    const cal = calendarTermOf(generateSchedule('2025-09-01', 8, 2), TODAY);
    deepStrictEqual(cal, { state: 'term', term: 3, starts: '2026-09-01' });
  });
  it('BSN Spring 2025 → Semester 4', () => {
    const cal = calendarTermOf(generateSchedule('2025-03-01', 8, 2), TODAY);
    equal(cal.state === 'term' && cal.term, 4);
  });
  it('BSN Fall 2024 → Semester 5', () => {
    const cal = calendarTermOf(generateSchedule('2024-09-01', 8, 2), TODAY);
    equal(cal.state === 'term' && cal.term, 5);
  });
  it('RAD Fall 2025 (4 terms) → Semester 3', () => {
    const cal = calendarTermOf(generateSchedule('2025-09-01', 4, 2), TODAY);
    equal(cal.state === 'term' && cal.term, 3);
  });
  it('CMW 2024 (annual, 2 terms) → Year 2, ending 31 Oct 2026', () => {
    const cal = calendarTermOf(generateSchedule('2024-11-01', 2, 1), TODAY);
    deepStrictEqual(cal, { state: 'term', term: 2, starts: '2025-11-01' });
  });
  it('a batch starting in the future is not started', () => {
    deepStrictEqual(calendarTermOf(generateSchedule('2027-01-01', 8, 2), TODAY), {
      state: 'notStarted',
    });
  });
  it('a schedule wholly in the past is finished', () => {
    const cal = calendarTermOf(generateSchedule('2022-09-01', 8, 2), TODAY);
    deepStrictEqual(cal, { state: 'finished', lastEnds: '2026-08-31' });
  });
});

describe('isDueForPromotion (§45 cases 13-15)', () => {
  const behind: TermPosition[] = [{ term: 2, active: true, heldBack: false }];

  it('due when a student is behind and past the grace period', () => {
    const cal = { state: 'term', term: 3, starts: '2026-09-01' } as const;
    equal(isDueForPromotion(behind, cal, TODAY, 7), true); // 38 days since start
  });
  it('not due when nobody is behind', () => {
    const cal = { state: 'term', term: 5, starts: '2026-09-01' } as const;
    const onTrack: TermPosition[] = [{ term: 5, active: true, heldBack: false }];
    equal(isDueForPromotion(onTrack, cal, TODAY, 7), false);
  });
  it('not due within the grace period', () => {
    const cal = { state: 'term', term: 3, starts: '2026-10-06' } as const; // 3 days ago
    equal(isDueForPromotion(behind, cal, TODAY, 7), false);
  });
  it('held-back students are not counted as behind', () => {
    const cal = { state: 'term', term: 3, starts: '2026-09-01' } as const;
    const held: TermPosition[] = [{ term: 2, active: true, heldBack: true }];
    equal(isDueForPromotion(held, cal, TODAY, 7), false);
  });
  it('never due before the batch starts or after it finishes', () => {
    equal(isDueForPromotion(behind, { state: 'notStarted' }, TODAY, 7), false);
    equal(isDueForPromotion(behind, { state: 'finished', lastEnds: '2026-08-31' }, TODAY, 7), false);
  });
});
