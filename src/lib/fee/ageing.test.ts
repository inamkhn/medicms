// ============================================
// MediCMS Desktop — Fee engine: ageing buckets and the directory age filter
// (§24.2, §22.3). The bucket boundaries are what the directory tab and the
// "Overdue age" filter promise, so they are pinned here even though the
// overdue amounts themselves are tested through charges.test.ts.
// Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { equal } from 'node:assert/strict';

import { bucketFor, inAgeRange } from './ageing.ts';

describe('bucketFor — §24.2 boundaries', () => {
  it('files each whole-day span in its bucket', () => {
    equal(bucketFor(1, 500), 'd1to30');
    equal(bucketFor(30, 500), 'd1to30');
    equal(bucketFor(31, 500), 'd31to60');
    equal(bucketFor(60, 500), 'd31to60');
    equal(bucketFor(61, 500), 'd61to90');
    equal(bucketFor(90, 500), 'd61to90');
    equal(bucketFor(91, 500), 'over90');
  });

  it('keeps a current charge — or a fully paid one — out of the overdue buckets', () => {
    equal(bucketFor(0, 500), 'notYetDue');
    equal(bucketFor(-3, 500), 'notYetDue');
    equal(bucketFor(45, 0), 'notYetDue');
  });
});

describe('inAgeRange — §22.3 overdue-age filter', () => {
  it('"any" matches exactly the students with something overdue', () => {
    equal(inAgeRange(0, 'any'), false);
    equal(inAgeRange(1, 'any'), true);
    equal(inAgeRange(400, 'any'), true);
  });

  it('a range matches only its own bucket', () => {
    equal(inAgeRange(30, 'd1to30'), true);
    equal(inAgeRange(31, 'd1to30'), false);
    equal(inAgeRange(45, 'd31to60'), true);
    equal(inAgeRange(45, 'd61to90'), false);
    equal(inAgeRange(90, 'd61to90'), true);
    equal(inAgeRange(91, 'over90'), true);
    equal(inAgeRange(0, 'over90'), false);
  });
});
