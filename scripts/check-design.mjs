#!/usr/bin/env node
/**
 * check-design.mjs — design-system gate (docs/DESIGN_SYSTEM.md §13)
 *
 * This repo has no test runner, so the design system is enforced by a script
 * rather than by review comments. Four rules, each mapped to a principle:
 *
 *   hex              a colour literal outside src/index.css        (P3, P9)
 *   arbitrary-size   text-[Npx] instead of a role token            (P1)
 *   native-dialog    window.alert / confirm instead of ConfirmDialog|Toast (P6)
 *   handrolled-modal `fixed inset-0` outside components/ui/dialog  (P10)
 *
 * Existing violations are recorded in scripts/check-design.allowlist.json as a
 * per-file count. The gate FAILS when a count grows or a new file appears.
 * Fixing a violation shrinks the allowlist — regenerate with:
 *
 *   node scripts/check-design.mjs --update-allowlist
 *
 * Exit 0 = clean · Exit 1 = new violation · Exit 2 = script/IO error.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ALLOWLIST_PATH = join(ROOT, 'scripts', 'check-design.allowlist.json');

/** Files the rules cannot apply to, by design. */
const TOKEN_SOURCE = 'src/index.css';
// Extension-less, because ruleAppliesTo compares against the scanned file with its
// extension removed. Anything here is the overlay implementation itself; everywhere
// else `fixed inset-0` means a hand-rolled modal with no focus trap (P10).
const MODAL_IMPL_ALLOWED = ['src/components/ui/dialog', 'src/components/ui/alert-dialog'];

const RULES = [
  {
    id: 'hex',
    pattern: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
    hint: 'use a token (bg-accent / text-dues / border-hairline) — colour is declared only in src/index.css',
  },
  {
    id: 'arbitrary-size',
    pattern: /\btext-\[[\d.]+px\]/g,
    hint: 'use a role token: text-micro | text-meta | text-body | text-ui | text-section | text-title | text-page | text-stat',
  },
  {
    id: 'native-dialog',
    pattern: /\b(?:window\.)?(?:alert|confirm)\s*\(/g,
    hint: 'use Toast for feedback and ConfirmDialog / ConfirmWithReasonDialog for confirmation',
  },
  {
    id: 'handrolled-modal',
    pattern: /(?:fixed[^\n"']*inset-0|inset-0[^\n"']*fixed)/g,
    hint: 'use Dialog (focus trap, Escape and aria-modal come from Radix, not from you)',
  },
];

/** Only these trees are policed; shell/layout are swept in Phase 5 like everything else. */
const SCOPED_DIRS = ['src/pages', 'src/components'];

function toPosix(p) {
  return relative(ROOT, p).split(sep).join('/');
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

function inScope(filePosix) {
  if (filePosix === TOKEN_SOURCE) return false;
  return SCOPED_DIRS.some((d) => filePosix.startsWith(d + '/'));
}

/** `fixed inset-0` is legitimate only inside the overlay implementations (P10). */
function ruleAppliesTo(ruleId, filePosix) {
  if (ruleId !== 'handrolled-modal') return true;
  return !MODAL_IMPL_ALLOWED.includes(filePosix.replace(/\.(tsx|ts)$/, ''));
}

/** Strip comments so prose in a source file is not reported as a colour. */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/[^\n]*/gm, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * `#100` in "Txn#100" and `&#8211;` in an entity are not colours. A 3- or 4-digit
 * run that contains no a-f is an ordinal, so it is ignored; real short hex forms
 * (#fff, #0f0, #1234abcd, #2451B8) still match.
 */
function isColourLiteral(match) {
  const digits = match.slice(1);
  if (digits.length !== 3 && digits.length !== 4) return true;
  return /[a-fA-F]/.test(digits);
}

function collect() {
  const files = [];
  for (const dir of SCOPED_DIRS) {
    const full = join(ROOT, dir);
    if (existsSync(full)) walk(full, files);
  }
  const findings = new Map(); // filePosix -> ruleId -> [{line, text}]

  for (const abs of files) {
    const posix = toPosix(abs);
    if (!inScope(posix)) continue;
    const raw = readFileSync(abs, 'utf8');
    const lines = stripComments(raw).split('\n');

    for (const rule of RULES) {
      if (!ruleAppliesTo(rule.id, posix)) continue;
      const hits = [];
      lines.forEach((line, i) => {
        rule.pattern.lastIndex = 0;
        let m;
        while ((m = rule.pattern.exec(line)) !== null) {
          if (rule.id === 'hex' && !isColourLiteral(m[0])) continue;
          hits.push({ line: i + 1, text: line.trim().slice(0, 110) });
          break; // one finding per line: the budget counts sites, not regex hits
        }
      });
      if (hits.length) {
        if (!findings.has(posix)) findings.set(posix, {});
        findings.get(posix)[rule.id] = hits;
      }
    }
  }
  return findings;
}

function countsOf(findings) {
  const out = {};
  for (const [file, byRule] of findings) {
    const entry = {};
    for (const [rule, hits] of Object.entries(byRule)) entry[rule] = hits.length;
    out[file] = entry;
  }
  return out;
}

function readAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return {};
  try {
    return JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch (e) {
    console.error(`check-design: cannot parse ${toPosix(ALLOWLIST_PATH)}: ${e.message}`);
    process.exit(2);
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  const findings = collect();
  const current = countsOf(findings);

  if (args.has('--update-allowlist')) {
    const sorted = Object.fromEntries(
      Object.entries(current).sort(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(ALLOWLIST_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
    const total = Object.values(current).reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0);
    console.log(`check-design: allowlist written — ${total} tolerated violations across ${Object.keys(current).length} files.`);
    return;
  }

  const allow = readAllowlist();
  const regressions = [];

  for (const [file, byRule] of findings) {
    for (const [ruleId, hits] of Object.entries(byRule)) {
      const tolerated = allow[file]?.[ruleId] ?? 0;
      if (hits.length > tolerated) {
        regressions.push({ file, ruleId, hits, tolerated, excess: hits.length - tolerated });
      }
    }
  }

  // Shrinkage is worth reporting even though it is not a failure.
  let stale = 0;
  for (const [file, rules] of Object.entries(allow)) {
    for (const [ruleId, allowed] of Object.entries(rules)) {
      const now = current[file]?.[ruleId] ?? 0;
      if (now < allowed) stale += allowed - now;
    }
  }

  const totalNow = Object.values(current)
    .reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0);
  const totalAllowed = Object.values(allow)
    .reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0);

  if (regressions.length === 0) {
    console.log(
      `✓ check-design: clean — ${totalNow} tolerated legacy violation(s) in ${Object.keys(current).length} file(s) (budget ${totalAllowed}).`,
    );
    if (stale > 0) {
      console.log(
        `  ${stale} violation(s) have already been fixed: run \`node scripts/check-design.mjs --update-allowlist\` to shrink the budget.`,
      );
    }
    return;
  }

  console.error('✗ check-design: new design-system violations found.\n');
  for (const r of regressions) {
    const rule = RULES.find((x) => x.id === r.ruleId);
    console.error(`  ${r.file}  [${r.ruleId}] ${r.hits.length} found, ${r.tolerated} tolerated (+${r.excess})`);
    console.error(`    → ${rule.hint}`);
    for (const h of r.hits.slice(0, 6)) {
      console.error(`      ${h.line}: ${h.text}`);
    }
    if (r.hits.length > 6) console.error(`      … ${r.hits.length - 6} more`);
    console.error('');
  }
  console.error(
    'Fix these, or — only for a genuinely legitimate case — widen the budget deliberately\n' +
      'in scripts/check-design.allowlist.json and say why in the commit message.\n' +
      'Reference: docs/DESIGN_SYSTEM.md · docs/DESIGN_PRINCIPLES.md',
  );
  process.exit(1);
}

try {
  main();
} catch (e) {
  console.error(`check-design: ${e.stack || e.message}`);
  process.exit(2);
}
