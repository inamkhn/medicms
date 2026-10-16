// ============================================
// MediCMS Desktop — Academic core: migration + re-link tests (§26, §27)
// §45 cases 27-28. Run: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import { countUnmatched, migrateBatches, planRelink, type LegacyBatchRow } from './migrate.ts';

const META = { createdBy: 'Migration', createdAt: '2026-10-09T00:00:00.000Z' };

describe('migrateBatches (§45 case 27)', () => {
  const rows: LegacyBatchRow[] = [
    { programLegacy: 'BSN', name: 'Fall', session: 2026, isActive: true },
    { programLegacy: 'LHV', name: '', session: 2025, isActive: false },
    { programLegacy: 'BSN', name: 'Fall', session: 2026, isActive: true }, // dupe (student + template)
  ];
  const batches = migrateBatches(rows, META);

  it('collapses duplicate (program, name, session) rows', () => {
    equal(batches.length, 2);
  });
  it('an active old batch is Running with admissions Open', () => {
    const bsn = batches.find((b) => b.programId === 'prog-bsn')!;
    deepStrictEqual({ status: bsn.status, admissions: bsn.admissions }, { status: 'Running', admissions: 'Open' });
  });
  it('a disabled old batch is Running with admissions Closed', () => {
    const lhv = batches.find((b) => b.programId === 'prog-lhv')!;
    deepStrictEqual({ status: lhv.status, admissions: lhv.admissions }, { status: 'Running', admissions: 'Closed' });
  });
  it('comes across with no invented Term 1 start date or schedule', () => {
    equal(batches[0].term1Start, null);
    deepStrictEqual(batches[0].schedule, []);
    equal(batches[0].createdBy, 'Migration');
  });
  it('uses a deterministic id so a reload never churns the link', () => {
    const again = migrateBatches(rows, META);
    deepStrictEqual(batches.map((b) => b.id), again.map((b) => b.id));
  });
});

describe('planRelink (§45 case 28)', () => {
  const batches = migrateBatches(
    [{ programLegacy: 'BSN', name: 'Fall', session: 2025, isActive: true }],
    META,
  );
  const fallId = batches[0].id;

  it('links a student by saved name, ignoring case', () => {
    const plan = planRelink([{ sno: 7, programLegacy: 'BSN', name: 'fall', session: 2025 }], batches);
    equal(plan[0].batchId, fallId);
    equal(countUnmatched(plan), 0);
  });
  it('leaves an unmatched name for the re-link tool', () => {
    const plan = planRelink(
      [
        { sno: 8, programLegacy: 'BSN', name: 'Spring', session: 2025 }, // no such batch
        { sno: 9, programLegacy: 'LHV', name: 'Fall', session: 2025 }, // wrong program
        { sno: 10, programLegacy: 'BSN', name: 'Fall', session: 2024 }, // wrong session
      ],
      batches,
    );
    deepStrictEqual(plan.map((p) => p.batchId), [null, null, null]);
    equal(countUnmatched(plan), 3);
  });
  it('does not mutate the batch list it reads', () => {
    planRelink([{ sno: 1, programLegacy: 'BSN', name: 'Fall', session: 2025 }], batches);
    equal(batches.length, 1);
    equal(batches[0].id, fallId);
  });
});
