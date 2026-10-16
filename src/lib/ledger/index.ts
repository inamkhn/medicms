// ============================================
// MediCMS Desktop — Ledger: the public face of the entry model
//
// Screens and stores import from `@/lib/ledger` and never reach into a file
// inside. The modules themselves keep importing each other by relative path, so
// `node --test` can type-strip them without the alias (the same arrangement as
// src/lib/fee).
// ============================================

export type { LedgerEntry, LedgerEntryLine, LedgerEntryType, PaymentMode } from './types.ts';

export * from './entries.ts';
export * from './balance.ts';
export * from './charges.ts';
export * from './check.ts';
export * from './mode.ts';
export * from './draft.ts';

// Migration input: `LegacyLedgerRow` is the shape being moved off, not a type the
// app is meant to build, so only the converters are advertised.
export { migrateLegacyRows } from './migrate.ts';
export type { LegacyLedgerRow, LegacyTransactionType } from './migrate.ts';
