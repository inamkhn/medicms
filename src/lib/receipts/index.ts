// ============================================
// MediCMS Desktop — Receipts: the public face of the receipts core
//
// Screens and stores import from `@/lib/receipts` and never reach into a file
// inside. The modules keep importing each other by relative path, so
// `node --test` can type-strip them without the alias (the same arrangement as
// src/lib/ledger and src/lib/fee).
// ============================================

export * from './types.ts';
export * from './books.ts';
export * from './register.ts';
export * from './words.ts';
export * from './safety.ts';
export * from './preview.ts';
export * from './daybook.ts';
export * from './statement.ts';
