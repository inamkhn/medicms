#!/usr/bin/env node
/**
 * check-merge.mjs — guards docs/DESIGN_SYSTEM.md §1.1
 *
 * §1.1 makes registering a token with tailwind-merge mandatory, and the failure it
 * prevents is invisible: `h: ['control-md']` registers the literal class `control-md`
 * instead of the `h-` prefix, the config still type-checks, the CSS still compiles, and
 * every page-level override (`h-7`) silently stops winning. No amount of reading the
 * source catches that — only asserting the merge outcome does.
 *
 * The config is read out of src/lib/utils.ts rather than copied, so this file cannot
 * drift into passing on a stale duplicate.
 *
 * Exit 0 = all cases merge as documented · Exit 1 = a regression.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extendTailwindMerge } from 'tailwind-merge';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const src = readFileSync(`${ROOT}src/lib/utils.ts`, 'utf8');
const start = src.indexOf('const TOKEN_COLORS');
const end = src.indexOf('export function cn(');
if (start < 0 || end < 0 || end < start) {
  console.error('check-merge: could not locate the tailwind-merge config in src/lib/utils.ts');
  console.error('If cn() was moved, update the anchors in this script to match it.');
  process.exit(2);
}

// `as const` is the only TypeScript syntax inside that span; stripping it keeps this
// runnable in plain node without a second toolchain.
const config = src.slice(start, end).replace(/as const/g, '');
const { twMerge } = new Function('extendTailwindMerge', `${config}; return { twMerge };`)(extendTailwindMerge);

/**
 * Each case is [input, expected]. The rule throughout: a token class from index.css and
 * the stock Tailwind class it conflicts with must collapse to whichever came last, which
 * is what lets a page override a primitive.
 */
const CASES = [
  // Motion (Phase 3): overlays and dialogs are animated by the primitives, and a page
  // turning motion off must actually turn it off.
  ['animate-panel-in animate-none', 'animate-none'],
  ['animate-overlay-in animate-none', 'animate-none'],
  ['animate-toast-in animate-none', 'animate-none'],
  ['animate-panel-in', 'animate-panel-in'],
  // Different variants are not a conflict; both must survive.
  ['animate-panel-in data-[state=closed]:animate-panel-out', 'animate-panel-in data-[state=closed]:animate-panel-out'],
  ['ease-standard ease-out', 'ease-out'],
  ['duration-120 duration-200', 'duration-200'],
  // Control heights (Phase 2): the override pattern seen ~24 times across the pages.
  ['h-control-md h-7', 'h-7'],
  ['h-control-md h-[28px]', 'h-[28px]'],
  ['h-control-sm h-control-md', 'h-control-md'],
  // Type, colour, radius, elevation, layering.
  ['text-section text-base', 'text-base'],
  ['text-body text-meta', 'text-meta'],
  ['bg-accent bg-panel', 'bg-panel'],
  ['text-ink-muted text-danger', 'text-danger'],
  ['border-hairline border-danger', 'border-danger'],
  ['ring-accent ring-danger', 'ring-danger'],
  ['placeholder:text-ink-subtle placeholder:text-danger', 'placeholder:text-danger'],
  ['rounded-control rounded-none', 'rounded-none'],
  ['shadow-raised shadow-none', 'shadow-none'],
  ['z-sticky z-dropdown', 'z-dropdown'],
  ['z-modal z-tooltip', 'z-tooltip'],
];

let bad = 0;
for (const [input, expected] of CASES) {
  const out = twMerge(input);
  const ok = out === expected;
  if (!ok) bad++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${input}\n      => ${out}${ok ? '' : `\n      expected ${expected}`}`,
  );
}

if (bad) {
  console.error(`\ncheck-merge: ${bad} of ${CASES.length} cases failed — see DESIGN_SYSTEM.md §1.1`);
  process.exit(1);
}
console.log(`\ncheck-merge: ${CASES.length} cases pass`);
