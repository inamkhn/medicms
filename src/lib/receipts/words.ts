// ============================================
// MediCMS Desktop — Receipts: amount in words (§26, §61)
//
// §26 "In figures, and in words using lakh and crore (for example 'Twenty-five
// thousand rupees only')". English words in the Indian numbering system, whole
// rupees only — the ledger never holds paise (§7.2).
//
// The words are built in lower case and the sentence is capitalised once at the
// end, so "One hundred one" and "Twenty-five thousand" both read correctly
// inside a longer figure.
// ============================================

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0–99 as words: `twenty`, `twenty-five`. */
function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens}-${ones}` : tens;
}

/** 0–999 as words: `six hundred seventy-eight`. */
function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(' ');
}

/** Crore above 999 is written as digits — no receipt in the app reaches it. */
function croreWords(crore: number): string {
  return crore < 1000 ? belowThousand(crore) : String(crore);
}

/** Whole rupees in Indian words, lower case: `one crore twenty-three lakh`. */
function rupeesWords(rupees: number): string {
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1_000);
  const rest = rupees % 1_000;

  const parts: string[] = [];
  if (crore) parts.push(`${croreWords(crore)} crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

/** First letter up, the rest untouched — `twenty-five thousand` → `Twenty-five thousand`. */
function capitalise(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * `25_000` → `Twenty-five thousand rupees only` (§26). Zero reads
 * `Zero rupees only`; a negative amount keeps its sign as `Minus …` so a
 * mis-signed figure can never print as a valid receipt.
 */
export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  const rupees = Math.trunc(Math.abs(amount));
  const words = rupees === 0 ? 'zero' : rupeesWords(rupees);
  const sentence = `${words} rupee${rupees === 1 ? '' : 's'} only`;
  if (amount < 0) return `Minus ${sentence}`;
  return capitalise(sentence);
}
