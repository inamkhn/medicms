// ============================================
// MediCMS Desktop — Academic core: batch naming, status and seats
// §16-§19. Pure guards the batch drawer and admission rely on. No store, no clock.
// ============================================

import type { BatchStatus } from './types.ts';

/**
 * §16 / §45 cases 1-2: program short code, optional name, session. Empty name
 * collapses to just code + session.
 */
export function batchDisplayName(shortCode: string, name: string, session: number): string {
  const trimmed = name.trim();
  return trimmed ? `${shortCode} ${trimmed} ${session}` : `${shortCode} ${session}`;
}

/** A candidate/existing batch reduced to just the fields the name-uniqueness rule reads. */
export interface BatchNameKey {
  id?: string;
  programId: string;
  session: number;
  name: string;
}

/**
 * §7 / §16 / §45 case 3: a batch name is unique within (program, session), ignoring
 * capital letters and surrounding space. An empty name still collides with another
 * empty name for the same program + session (§40.1).
 */
export function isDuplicateBatchName(
  existing: readonly BatchNameKey[],
  candidate: BatchNameKey,
): boolean {
  const wanted = candidate.name.trim().toLowerCase();
  return existing.some(
    (b) =>
      b.id !== candidate.id &&
      b.programId === candidate.programId &&
      b.session === candidate.session &&
      b.name.trim().toLowerCase() === wanted,
  );
}

/**
 * §17: a batch is Planned until its Term 1 start arrives, then Running. Completed is
 * a stored Admin/Accountant decision, so it is not derived here — this only answers
 * the Planned-vs-Running half.
 */
export function deriveRunningStatus(
  term1Start: string | null,
  today: string,
): Extract<BatchStatus, 'Planned' | 'Running'> {
  if (!term1Start || today < term1Start) return 'Planned';
  return 'Running';
}

/**
 * §19 / §45 case 18: seats is optional, but when set it must be a whole number and
 * can never fall below the students already admitted. Returns a message, or null
 * when the value is fine.
 */
export function seatCountProblem(seats: number | null, admitted: number): string | null {
  if (seats === null) return null;
  if (!Number.isInteger(seats) || seats < 0) return 'Seats must be a whole number.';
  if (seats < admitted) {
    return `Seats cannot be fewer than the ${admitted} students already admitted.`;
  }
  return null;
}

/** §19: the meter percentage ("Admitted 41 of 50"), or null when seats are unset. */
export function seatsPercent(seats: number | null, admitted: number): number | null {
  if (seats === null || seats <= 0) return null;
  return Math.round((admitted / seats) * 100);
}

/** §19: full when a set seat count has been reached; unset seats are never full. */
export function isBatchFull(seats: number | null, admitted: number): boolean {
  return seats !== null && admitted >= seats;
}
