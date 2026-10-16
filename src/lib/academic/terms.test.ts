// ============================================
// MediCMS Desktop — Academic core: term rules tests (§45 cases 20-22, 29)
// Run: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, notEqual, ok, throws } from 'node:assert/strict';

import {
  TERMS_PER_YEAR_CHOICES,
  isValidTermsPerYear,
  numTermsBelowHighestStudentTerm,
  termLabel,
  termLengthMonthsOf,
  termSystemFromLegacy,
} from './terms.ts';

describe('terms per year (§45 case 21)', () => {
  it('accepts exactly 1, 2, 3, 4, 6, 12', () => {
    deepStrictEqual([...TERMS_PER_YEAR_CHOICES], [1, 2, 3, 4, 6, 12]);
    for (const n of [1, 2, 3, 4, 6, 12]) ok(isValidTermsPerYear(n), `${n} must be valid`);
  });
  it('rejects 5', () => {
    equal(isValidTermsPerYear(5), false);
  });
});

describe('term length (§45 case 22)', () => {
  it('is 12 ÷ terms per year', () => {
    equal(termLengthMonthsOf(2), 6);
    equal(termLengthMonthsOf(1), 12);
    equal(termLengthMonthsOf(4), 3);
  });
  it('throws on a rejected value', () => {
    throws(() => termLengthMonthsOf(5));
  });
});

describe('number-of-terms guard (§45 case 20)', () => {
  it('blocks reducing below the highest student term', () => {
    equal(numTermsBelowHighestStudentTerm(6, [7]), true); // BSN 8→6 with a student in Sem 7
    equal(numTermsBelowHighestStudentTerm(6, [5, 6]), false);
    equal(numTermsBelowHighestStudentTerm(6, []), false); // no students → nothing blocks
  });
});

describe('term labels (§45 case 29)', () => {
  it('long labels read "<System> <n>"', () => {
    equal(termLabel('Semester', 3), 'Semester 3');
    equal(termLabel('Year', 2), 'Year 2');
    equal(termLabel('Term', 1), 'Term 1');
  });
  it('short labels use T for Semester/Term and Y for Year', () => {
    equal(termLabel('Semester', 3, 'short'), 'T3');
    equal(termLabel('Year', 2, 'short'), 'Y2');
    equal(termLabel('Term', 1, 'short'), 'T1');
  });
});

describe('legacy term-system mapping (§6 seed)', () => {
  it('maps semester/annual/months to Semester/Year/Term', () => {
    equal(termSystemFromLegacy('semester'), 'Semester');
    equal(termSystemFromLegacy('annual'), 'Year');
    equal(termSystemFromLegacy('months'), 'Term');
  });
  it('short vs long labels never collide across systems', () => {
    notEqual(termLabel('Year', 2, 'short'), termLabel('Semester', 2, 'short'));
  });
});
