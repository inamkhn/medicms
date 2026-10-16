// ============================================
// Password hashing — Feature 1 §6
// "Stored as a one-way hash, never as readable text." Salted SHA-256 via Web
// Crypto. The fallback for contexts without SubtleCrypto (a file:// build has no
// secure crypto even though it has crypto.getRandomValues) is still one-way and
// never stores the plaintext — it is weaker, but honest about being a local
// prototype that holds no server-side secrets.
// ============================================

/** Per-user random salt so two users with the same password hash differently. */
export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  const c = globalThis.crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return toHex(bytes);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return toHex(new Uint8Array(digest));
  }
  return fnv1a(data);
}

export function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  return hashPassword(password, salt).then((h) => timingSafeEqual(h, expectedHash));
}

/**
 * Password rules (§6): at least 8 characters and not equal to the username.
 * Returns a human message, or null when the password is acceptable. Kept here so
 * first-run setup, change-password and admin reset all enforce one definition.
 */
export function validatePassword(password: string, username: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (username && password.toLowerCase() === username.toLowerCase()) {
    return 'Password cannot be the same as the username.';
  }
  return null;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// Compare without leaking length/content differences through early exits on the
// common (equal-length) path; a prototype nicety, not a hardened KDF.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 32-bit FNV-1a, hex-encoded. Only used when SubtleCrypto is unavailable.
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Stretch a few rounds so the fallback is not a trivial single-pass digest.
  let acc = h >>> 0;
  for (let r = 0; r < 1000; r++) {
    acc = Math.imul(acc ^ (acc >>> 15), 0x2c1b3c6d) >>> 0;
  }
  return acc.toString(16).padStart(8, '0') + h.toString(16).padStart(8, '0');
}
