// ============================================
// MediCMS Desktop v4.0 - Student number allocation (§27)
// The SNO is issued when the record is saved, and numbers are never reused —
// including after a strike-off or an undo-import (§23.7 removes rows, so the
// register's maximum alone is not enough). The store keeps the highest SNO it
// ever issued as a floor this helper must respect.
// ============================================

export function getNextSno(students: readonly { sno: number }[], floor = 0): number {
  return Math.max(0, floor, ...students.map((s) => s.sno)) + 1;
}
