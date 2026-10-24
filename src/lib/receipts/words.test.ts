// ============================================
// MediCMS Desktop — Amount in words tests (§26, §61)
// "Twenty-five thousand rupees only" — lakh and crore, whole rupees, English.
// Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal } from 'node:assert/strict';

import { amountInWords } from './words.ts';

describe('amount in words (§26)', () => {
  it('writes the doc\'s own example', () => {
    equal(amountInWords(25_000), 'Twenty-five thousand rupees only');
  });

  it('writes zero and one rupee', () => {
    equal(amountInWords(0), 'Zero rupees only');
    equal(amountInWords(1), 'One rupee only');
  });

  it('uses lakh above a hundred thousand', () => {
    equal(amountInWords(100_000), 'One lakh rupees only');
    equal(amountInWords(500_000), 'Five lakh rupees only');
    equal(amountInWords(1_100_000), 'Eleven lakh rupees only');
  });

  it('uses crore above a hundred lakh', () => {
    equal(amountInWords(10_000_000), 'One crore rupees only');
    equal(amountInWords(12_345_678), 'One crore twenty-three lakh forty-five thousand six hundred seventy-eight rupees only');
  });

  it('joins hundreds and tens the way a receipt reads', () => {
    equal(amountInWords(101), 'One hundred one rupees only');
    equal(amountInWords(999), 'Nine hundred ninety-nine rupees only');
    equal(amountInWords(1_001), 'One thousand one rupees only');
    equal(amountInWords(78_000), 'Seventy-eight thousand rupees only');
  });

  it('never prints a negative figure as a valid receipt', () => {
    equal(amountInWords(-2_000), 'Minus two thousand rupees only');
  });

  it('drops a fraction rather than inventing paise', () => {
    equal(amountInWords(1_500.75), 'One thousand five hundred rupees only');
  });
});
