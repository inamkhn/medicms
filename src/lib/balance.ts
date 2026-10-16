// ============================================
// MediCMS Desktop v4.0 — Balance for the screens (app adapter)
//
// All the arithmetic lives in src/lib/ledger: the balance is derived from typed
// entries there (§4, §6) and never from a stored number. This file adds the one
// thing a screen needs on top of it — a student list with its balance and badge —
// and keeps the import path the twelve list screens already use.
// ============================================

import type { LedgerEntry, Student, StudentWithBalance } from '@/types';
import { computeEntryBalance } from '@/lib/ledger';
import { getStudentBadge } from '@/lib/utils';

/**
 * The only balance helper screens should use: pass the students and the ledger's
 * entries, and every row comes back with the balance derived from those entries.
 *
 * One pass groups the entries by student, so a list of n students and m entries
 * costs O(n + m) rather than O(n * m).
 */
export function getStudentsWithBalanceLive(
  students: readonly Student[],
  entries: readonly LedgerEntry[],
): StudentWithBalance[] {
  const bySno = new Map<number, LedgerEntry[]>();
  for (const entry of entries) {
    const list = bySno.get(entry.studentSno);
    if (list) list.push(entry);
    else bySno.set(entry.studentSno, [entry]);
  }

  return students.map((student) => {
    const balance = computeEntryBalance(bySno.get(student.sno) ?? []).balance;
    return {
      ...student,
      computedBalance: balance,
      badge: getStudentBadge(student.struckOff, balance),
    };
  });
}
