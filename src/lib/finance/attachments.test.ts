// ============================================
// MediCMS Desktop — Finance core: bill attachment tests (§61)
// Type, size, duplicate and the three-file cap on a drop or a pick. Pure, no
// DOM, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  acceptAttachments,
  attachmentKind,
  type AttachmentFile,
} from './attachments.ts';

function file(name: string, size = 1000, mime?: string): AttachmentFile {
  return { name, size, mime };
}

describe('what counts as an attachment (§61)', () => {
  it('takes images and PDF, from the mime or the extension', () => {
    equal(attachmentKind('scan.jpg', 'image/jpeg'), 'image');
    equal(attachmentKind('bill-2210.jpg'), 'image');   // extension only (a name restored from the record)
    equal(attachmentKind('invoice.pdf', 'application/pdf'), 'pdf');
    equal(attachmentKind('bill-2210.PDF'), 'pdf');
  });

  it('refuses anything that is neither', () => {
    equal(attachmentKind('macro.xlsm', 'application/vnd.ms-excel'), 'unsupported');
    equal(attachmentKind('notes.txt'), 'unsupported');
  });
});

describe('a pick or drop is decided file by file (§61)', () => {
  it('accepts a clean image and a PDF', () => {
    const r = acceptAttachments([], [file('scan.jpg', 2048, 'image/jpeg'), file('inv.pdf', 4096, 'application/pdf')]);
    equal(r.problems.length, 0);
    deepStrictEqual(r.accepted.map((f) => f.name), ['scan.jpg', 'inv.pdf']);
  });

  it('skips a file over the 3 MB cap', () => {
    const r = acceptAttachments([], [file('big.png', MAX_ATTACHMENT_BYTES + 1, 'image/png')]);
    equal(r.accepted.length, 0);
    equal(/larger than 3 MB/.test(r.problems[0]), true);
  });

  it('allows a file exactly at the cap', () => {
    const r = acceptAttachments([], [file('edge.png', MAX_ATTACHMENT_BYTES, 'image/png')]);
    equal(r.accepted.length, 1);
  });

  it('skips a non-image / non-PDF', () => {
    const r = acceptAttachments([], [file('sheet.xlsx', 100, 'application/vnd.ms-excel')]);
    equal(r.accepted.length, 0);
    equal(/not an image or a PDF/.test(r.problems[0]), true);
  });

  it('skips a name already attached, ignoring case', () => {
    const r = acceptAttachments(['Bill-2210.PDF'], [file('bill-2210.pdf', 500, 'application/pdf')]);
    equal(r.accepted.length, 0);
    equal(/already attached/.test(r.problems[0]), true);
  });

  it('stops at three attachments and says the fourth was not added', () => {
    const existing = ['a.jpg', 'b.jpg', 'c.jpg'];
    const r = acceptAttachments(existing, [file('d.jpg', 100, 'image/jpeg')]);
    equal(r.accepted.length, 0);
    equal(/up to 3 attachments/.test(r.problems[0]), true);
  });

  it('accepts what fits and reports the rest when a drop is too big', () => {
    const offered = [file('one.jpg'), file('two.jpg'), file('three.jpg'), file('four.jpg')];
    equal(MAX_ATTACHMENT_COUNT, 3);
    const r = acceptAttachments([], offered);
    deepStrictEqual(r.accepted.map((f) => f.name), ['one.jpg', 'two.jpg', 'three.jpg']);
    equal(r.problems.length, 1);
    equal(/four.jpg not added/.test(r.problems[0]), true);
  });
});
