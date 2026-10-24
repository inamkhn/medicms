import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNextSno } from './sno.ts';

test('first admission on an empty register gets SNO 1', () => {
  assert.equal(getNextSno([]), 1);
});

test('next SNO follows the highest on the register', () => {
  const students = [{ sno: 101 }, { sno: 107 }, { sno: 103 }];
  assert.equal(getNextSno(students), 108);
});

test('§27: an undo-import that removed the top rows does not free their numbers', () => {
  // The import created 104 and 105; undo removed them. Without the floor the
  // next admission would be 104 again — forbidden.
  const remaining = [{ sno: 101 }, { sno: 103 }];
  assert.equal(getNextSno(remaining, 105), 106);
});

test('a live student above the floor still wins', () => {
  assert.equal(getNextSno([{ sno: 108 }], 105), 109);
});

test('a negative or zero floor never pushes the first number below 1', () => {
  assert.equal(getNextSno([], 0), 1);
  assert.equal(getNextSno([], -5), 1);
});
