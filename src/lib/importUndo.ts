// ============================================
// MediCMS Desktop — Import undo core (students doc §23.7)
//
// Undo is offered only while none of the imported students has had a payment,
// fee charge, edit or other activity after the import. That question is pure:
// one batch record, the live register and the live ledger in; a refusal with
// its reason, or null, out. Removal itself stays in the stores.
// Run with: npm run test
// ============================================

import type { ImportBatchRecord, LedgerEntry, Student } from '@/types';

/**
 * §23.7: null means Undo may go ahead; a string is the reason it is not offered.
 * The checks run in the order the doc lists them — a student who is gone, has
 * changed status, was edited, or moved money/charges is enough to refuse.
 */
export function undoBlocker(
  record: ImportBatchRecord,
  students: readonly Student[],
  entries: readonly LedgerEntry[],
): string | null {
  if (record.snos.length === 0) return 'This import created no students — nothing to undo.';
  const bySno = new Map(students.map((s) => [s.sno, s]));
  const created = new Set(record.entryIds);
  for (const sno of record.snos) {
    const live = bySno.get(sno);
    if (!live) return `SNO ${sno} is no longer on the register — undo is not offered (§23.7).`;
    if (live.struckOff || live.completed || live.onLeave) {
      return `SNO ${sno} changed status after the import — undo is not offered (§23.7).`;
    }
    if (live.updatedAt && live.updatedAt >= record.at) {
      return `SNO ${sno} was edited after the import — undo is not offered (§23.7).`;
    }
    // Any entry this import did not post — a payment, a charge, a refund — is
    // "activity after the import"; an opening balance it did post is not.
    if (entries.some((e) => e.studentSno === sno && !created.has(e.id))) {
      return `SNO ${sno} has ledger activity after the import — undo is not offered (§23.7).`;
    }
  }
  return null;
}
