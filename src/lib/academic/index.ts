// ============================================
// MediCMS Desktop — Academic core barrel
// App-side entry point: `import { generateSchedule, termLabel } from '@/lib/academic'`.
// The pure modules under here stay free of stores, React and the clock so `node --test`
// can run them directly (§48 step 2).
// ============================================

export * from './types.ts';
export * from './terms.ts';
export * from './schedule.ts';
export * from './batch.ts';
export * from './batchMembership.ts';
export * from './selector.ts';
export * from './seed.ts';
export * from './migrate.ts';
