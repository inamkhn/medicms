// ============================================
// MediCMS Desktop — Ledger: the ledger check (§7.3)
//
// "The balance is always calculated from entries. If a stored copy is kept for
// speed, it is rebuilt automatically and can be checked with the ledger check
// tool (Admin), which recalculates every student and lists any difference."
// (§7.3)
//
// So the stored `balanceAfter` is never an input to anything the app shows, and
// this is the tool that proves the stored copy still matches the arithmetic. It
// reads no clock and no store: the caller passes the students, the entries and
// today's date, which is what makes §66 case 20 testable.
// ============================================

import { computeEntryBalance, chronological, runningBalances } from './balance.ts';
import { entryProblems } from './entries.ts';
import type { LedgerEntry } from './types.ts';

/** Only these two fields are needed to name a student in the report. */
export interface CheckStudent {
  sno: number;
  name: string;
}

/** A student whose stored balance does not match the recalculated one. */
export interface BalanceDifference {
  studentSno: number;
  name: string;
  /** The stored copy at the entry where the two parted. */
  stored: number;
  /** The figure recalculated from the entries at that same entry (§6). */
  recomputed: number;
  /** `stored - recomputed`, so a positive delta means dues were overstated there. */
  delta: number;
  /** The first entry where the stored copy and the arithmetic parted. */
  atEntryNo: number;
  /** What the student actually owes (or holds, when negative), recalculated now. */
  closingBalance: number;
}

/** One entry that breaks a §5 / §6 / §7 rule. */
export interface EntryFinding {
  studentSno: number;
  entryId: string;
  message: string;
}

export interface LedgerCheckResult {
  /** Students looked at, including students who only appear in the ledger. */
  checked: number;
  ok: boolean;
  differences: BalanceDifference[];
  problems: EntryFinding[];
  /** `studentSno -> recalculated balance`, for the caller that prints the summary. */
  balanceByStudent: Map<number, number>;
}

function nameOf(index: Map<number, string>, studentSno: number): string {
  return index.get(studentSno) ?? `SNO ${studentSno}`;
}

/** The §5 rule that a link belongs to one student's ledger, which a per-student
 *  dangling-check cannot see on its own. */
function crossStudentLink(
  entry: LedgerEntry,
  allById: Map<string, LedgerEntry>,
): string | null {
  const targetId = entry.linkedEntryId;
  if (!targetId) return null;
  const target = allById.get(targetId);
  if (target && target.studentSno !== entry.studentSno) {
    return `Linked entry "${targetId}" belongs to student ${target.studentSno}, not student ${entry.studentSno} (§5).`;
  }
  return null;
}

/**
 * Recalculate every student's ledger and report:
 *
 * - `differences` — one row per student whose stored `balanceAfter` parts company
 *   with the recalculated figures, naming the student and the entry where it began
 *   (§10: "reports zero differences on correct data and names any student that
 *   differs");
 * - `problems` — one row per rule broken by an individual entry.
 */
export function runLedgerCheck(
  students: readonly CheckStudent[],
  entries: readonly LedgerEntry[],
  context: { today: string },
): LedgerCheckResult {
  const names = new Map(students.map((student) => [student.sno, student.name]));
  const allById = new Map(entries.map((entry) => [entry.id, entry]));
  const byStudent = new Map<number, LedgerEntry[]>();
  for (const entry of entries) {
    const list = byStudent.get(entry.studentSno);
    if (list) list.push(entry);
    else byStudent.set(entry.studentSno, [entry]);
  }

  // Every student, plus any SNO that has entries but no record — an entry nobody
  // owns is exactly the sort of thing this tool exists to catch.
  const snos = [...new Set([...students.map((student) => student.sno), ...byStudent.keys()])].sort(
    (a, b) => a - b,
  );

  const differences: BalanceDifference[] = [];
  const problems: EntryFinding[] = [];
  const balanceByStudent = new Map<number, number>();

  for (const studentSno of snos) {
    const ordered = chronological(byStudent.get(studentSno) ?? []);
    const recomputed = computeEntryBalance(ordered).balance;
    balanceByStudent.set(studentSno, recomputed);

    // The same running balance the ledger prints, against every stored copy.
    const rows = runningBalances(ordered);
    const diverged = rows.find((row) => row.entry.balanceAfter !== row.running);
    if (diverged) {
      differences.push({
        studentSno,
        name: nameOf(names, studentSno),
        stored: diverged.entry.balanceAfter,
        recomputed: diverged.running,
        delta: diverged.entry.balanceAfter - diverged.running,
        atEntryNo: diverged.entry.entryNo,
        closingBalance: recomputed,
      });
    }

    for (const entry of ordered) {
      for (const message of entryProblems(entry, { today: context.today, all: ordered })) {
        problems.push({ studentSno, entryId: entry.id, message });
      }
      const crossStudent = crossStudentLink(entry, allById);
      if (crossStudent) problems.push({ studentSno, entryId: entry.id, message: crossStudent });
    }

    // Entry numbers are per student and never reused (§5). Two entries sharing one
    // number means the numbering service was bypassed, and every id after it is a
    // duplicate too.
    const seenIds = new Set<string>();
    for (const entry of ordered) {
      if (seenIds.has(entry.id)) {
        problems.push({
          studentSno,
          entryId: entry.id,
          message: 'Entry number is used by more than one entry — numbers only go forward (§5).',
        });
      }
      seenIds.add(entry.id);
    }
  }

  return {
    checked: snos.length,
    ok: differences.length === 0 && problems.length === 0,
    differences,
    problems,
    balanceByStudent,
  };
}
