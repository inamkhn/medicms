// ============================================
// MediCMS Desktop — Staff & Payroll core: the public face of the payroll model
//
// Screens and stores import from `@/lib/payroll` and never reach into a file
// inside. The modules import each other by relative path so `node --test` can
// type-strip them without the alias (exactly as `@/lib/finance` does).
// ============================================

export * from './types.ts';
export * from './calc.ts';
export * from './structures.ts';
export * from './advances.ts';
export * from './run.ts';
export * from './generate.ts';
export * from './disbursement.ts';
export * from './execution.ts';
export * from './reports.ts';
export * from './projections.ts';
export * from './transactions.ts';
