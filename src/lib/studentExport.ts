// ============================================
// MediCMS Desktop — Student export core (students doc §23.1)
//
// The export uses the same column layout as the import (§23.3), so a file can be
// exported, edited in Excel and imported again. A counter operator's file is the
// doc's short list — SNO, name, program, batch, session — with no phone, CNIC or
// balances. Pure: students in, header + cell rows out; no store, no clock. The
// CSV reader/writer pair lives here too so the round-trip is pinned by tests.
// Run with: npm run test
// ============================================

import type { StudentWithBalance } from '@/types';
import { getSubCourseDef, termIndexOf } from './constants.ts';

/** §23.3 — the one import layout; the template, the parser and the export read it. */
export const IMPORT_COLUMNS = [
  'name', 'father_name', 'cnic', 'phone', 'address', 'date_of_birth', 'gender',
  'domicile', 'emergency_contact', 'guardian_name', 'guardian_phone',
  'council_registration_no', 'roll_no', 'registration_date', 'course', 'program',
  'batch', 'session', 'current_term', 'opening_balance', 'fee_template',
] as const;

/** §23.1 — what a counter operator's file may carry: no phone, CNIC or balances. */
export const COUNTER_COLUMNS = ['SNO', 'name', 'program', 'batch', 'session'] as const;

/**
 * The export rows for the current list (§23.1). `opening_balance` is the live
 * balance — the figure a re-import would carry in as the student's position.
 * `fee_template` stays blank on purpose: import attaches the Active template for
 * the row's own placement when the cell is empty (§7.1), and the student record
 * holds no template link to copy honestly.
 */
export function studentExportRows(
  students: readonly StudentWithBalance[],
  countersOnly: boolean,
): { header: string[]; rows: (string | number)[][] } {
  if (countersOnly) {
    return {
      header: [...COUNTER_COLUMNS],
      rows: students.map((s) => [
        s.sno, s.name, getSubCourseDef(s.program).sub.label, s.batch, s.session,
      ]),
    };
  }
  return {
    header: [...IMPORT_COLUMNS],
    rows: students.map((s) => {
      const { course, sub } = getSubCourseDef(s.program);
      return [
        s.name, s.fatherName, s.cnic ?? '', s.contact ?? '', s.address ?? '',
        s.dob ?? '', s.gender ?? '', s.domicile ?? '', s.emergencyContact ?? '',
        s.guardianName ?? '', s.guardianPhone ?? '', s.councilRegistrationNo ?? '', s.rollNo ?? '',
        s.regDate, course.label, sub.label, s.batch, s.session, termIndexOf(s.semester),
        s.computedBalance,
        '',
      ];
    }),
  };
}

/** RFC-4180 quoting, the same shape `splitCsvLine` reads back (§23.2). */
export function csvText(
  header: readonly (string | number)[],
  rows: readonly (readonly (string | number)[])[],
): string {
  return [header, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

/** The import's reader: quoted fields, `""` escaping, one line in (moved from the page). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
    } else if (c === ',' && !inQ) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** §23.1 — "filters used" in the audit entry: only the ones that narrow the list. */
export function summarizeFilters(filters: Record<string, string | number | undefined>): string {
  const active = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== '' && v !== 'all' && v !== 'any',
  );
  return active.length === 0 ? 'no filters' : active.map(([k, v]) => `${k}=${String(v)}`).join(', ');
}
