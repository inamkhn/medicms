// ============================================
// MediCMS Desktop v4.0 - Record Creation Helpers
// Components must stay pure: never inline Date.now() / new Date() inside a
// render body. All timestamps and generated ids come from this module and are
// called from event handlers.
// ============================================

/**
 * Local calendar date as YYYY-MM-DD.
 * Deliberately NOT toISOString().split('T')[0]: a payment taken at 02:00 PKT
 * belongs to that day, not the previous UTC day.
 */
export function todayISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Timestamp for createdAt / audit fields. */
export function nowISO(): string {
  return new Date().toISOString();
}

// The old txnId() is gone: a ledger entry's id is derived from its own number
// (`entryId(sno, entryNo)` in lib/ledger/entries.ts), so ids are deterministic and
// never reused (§5) instead of carrying a Date.now() suffix.
