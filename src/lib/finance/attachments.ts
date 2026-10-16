// ============================================
// MediCMS Desktop — Finance core: bill attachments (§61)
// "Drop zone for images and PDF. Up to 3, 3 MB each. A thumbnail preview." The
// rules live here as pure, testable functions so the screen's file picking can
// never drift from them. A cost's image requirement above the §77 limit and the
// up-to-3 count are already enforced by `recordCost` against the stored names;
// this module adds the type and per-file size checks and the accept/duplicate
// decisions the picker needs. Pure: no DOM, no clock — the screen turns each
// File into a plain descriptor before calling in.
// ============================================

/** §61: a cost carries up to three attachments. */
export const MAX_ATTACHMENT_COUNT = 3;

/** §61: each attachment is at most 3 MB. */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/** What a picked file is, as far as the rules care. */
export type AttachmentKind = 'image' | 'pdf' | 'unsupported';

/** §61: only images and PDF may be attached. Classified from the mime, or the
 *  extension when no mime is known (a name restored from the bill record). */
export function attachmentKind(name: string, mime?: string): AttachmentKind {
  const type = (mime ?? '').toLowerCase();
  const lower = name.toLowerCase();
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) return 'image';
  if (type === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  return 'unsupported';
}

/** A picked file reduced to what the pure rules read — no `File` reaches here. */
export interface AttachmentFile {
  name: string;
  size: number;
  mime?: string;
}

export interface AcceptResult {
  /** The files that passed every rule, in the order offered. */
  accepted: AttachmentFile[];
  /** One sentence per rejected file, saying why it was skipped (§61). */
  problems: string[];
}

/**
 * §61: take the files a drop or a picker offered against the names already on
 * the bill, and decide each one: not an image or a PDF, over 3 MB, a repeated
 * name, or no room left under the three-file cap are each refused with a plain
 * sentence; the rest are accepted. A cost's stored attachment is the file's
 * name (the same reference `recordCost` and the seed keep), never the bytes.
 */
export function acceptAttachments(
  existingNames: readonly string[],
  incoming: readonly AttachmentFile[],
): AcceptResult {
  const problems: string[] = [];
  const accepted: AttachmentFile[] = [];
  const names = new Set(existingNames.map((n) => n.toLowerCase()));
  let count = existingNames.length;
  for (const f of incoming) {
    const key = f.name.toLowerCase();
    if (attachmentKind(f.name, f.mime) === 'unsupported') {
      problems.push(`${f.name} is not an image or a PDF — skipped (§61).`);
      continue;
    }
    if (f.size > MAX_ATTACHMENT_BYTES) {
      problems.push(`${f.name} is larger than 3 MB — skipped (§61).`);
      continue;
    }
    if (names.has(key)) {
      problems.push(`${f.name} is already attached — skipped (§61).`);
      continue;
    }
    if (count >= MAX_ATTACHMENT_COUNT) {
      problems.push(`A cost carries up to ${MAX_ATTACHMENT_COUNT} attachments — ${f.name} not added (§61).`);
      continue;
    }
    names.add(key);
    count += 1;
    accepted.push(f);
  }
  return { accepted, problems };
}
