// ============================================
// MediCMS Desktop v4.0 - Utility Functions
// ============================================

import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import type { StudentBadgeType, BalanceState } from '@/types';

// --- Class name utility ---

/**
 * The token scale, declared once in src/index.css and registered here so
 * tailwind-merge recognises it.
 *
 * This is not optional convenience. tailwind-merge resolves conflicts by matching a
 * class against a known group; an unrecognised name such as `text-section` is passed
 * through untouched, so `<CardTitle className="text-base">` would emit BOTH
 * `text-section` and `text-base` and leave the winner to CSS source order instead of
 * letting the caller override the primitive. Pages override primitives constantly
 * (`h-7`, `text-[11px]`, `border-blue-100`), so re-tokening the primitives without
 * registering these names would silently break every one of those overrides.
 */
const TOKEN_COLORS = [
  'brand-50', 'brand-100', 'brand-200', 'brand-300', 'brand-400', 'brand-500', 'brand-600', 'brand-700', 'brand-800',
  'accent', 'accent-hover', 'accent-soft',
  'cleared', 'cleared-soft', 'dues', 'dues-soft', 'struckoff', 'struckoff-soft', 'credit', 'credit-soft',
  'danger', 'danger-hover', 'danger-soft',
  'ink', 'ink-secondary', 'ink-muted', 'ink-subtle',
  'hairline', 'hairline-soft', 'hairline-strong',
  'surface', 'surface-sunken', 'panel',
] as const;

const TOKEN_FONT_SIZES = ['micro', 'meta', 'body', 'ui', 'section', 'title', 'page', 'stat'] as const;

/**
 * The named animations and the one easing, both declared in src/index.css
 * (@utility animate-* / --ease-standard). Registered for the same reason as the
 * colours: a page that writes `animate-none` over a primitive's `animate-panel-in`
 * has to win by merge, not by CSS source order.
 */
const TOKEN_ANIMATIONS = [
  'panel-in',
  'panel-out',
  'overlay-in',
  'overlay-out',
  'toast-in',
  'toast-out',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // font-size and text-color share the `text-` prefix; the explicit name lists keep
      // them unambiguous (there is no colour called `body`, no size called `panel`).
      'font-size': [{ text: [...TOKEN_FONT_SIZES] }],
      'text-color': [{ text: [...TOKEN_COLORS] }],
      'bg-color': [{ bg: [...TOKEN_COLORS] }],
      'border-color': [{ border: [...TOKEN_COLORS] }],
      'ring-color': [{ ring: [...TOKEN_COLORS] }],
      'placeholder-color': [{ placeholder: [...TOKEN_COLORS] }],
      'outline-color': [{ outline: [...TOKEN_COLORS] }],
      rounded: [{ rounded: ['control', 'card', 'pill'] }],
      shadow: [{ shadow: ['card', 'raised', 'overlay'] }],
      z: [{ z: ['dropdown', 'sticky', 'overlay', 'modal', 'toast', 'tooltip'] }],
      // Group ids here are tailwind-merge's own, not invented: `animate` and `ease`
      // (not `animation`/`timing`) — a wrong id creates a second, empty group and the
      // config still type-checks, so the only proof is asserting the merge outcome.
      animate: [{ animate: [...TOKEN_ANIMATIONS] }],
      ease: [{ ease: ['standard'] }],
      // The px-pinned control heights (index.css @utility) must join tailwind-merge's
      // own height group, and must be written as `{ h: [...] }` — the object form is
      // what means "classes prefixed with h-". A bare `'control-md'` registers the
      // literal class `control-md`, which matches nothing, so the group silently does
      // nothing. Verified: 'h-control-md h-7' → 'h-7', so the ~24 page-level height
      // overrides keep working after primitives switch to h-control-*.
      h: [{ h: ['control-sm', 'control-md', 'control-lg', 'row'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Currency formatting ---
export function formatPKR(amount: number): string {
  return `PKR ${amount.toLocaleString('en-PK')}`;
}

// --- Date formatting ---
export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy');
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy HH:mm');
}

export function formatTime(date: string | Date): string {
  return format(new Date(date), 'HH:mm');
}

// --- Balance computation and display ---
export function computeBalanceState(balance: number): BalanceState {
  if (balance > 0) return { type: 'dues', amount: balance };
  if (balance === 0) return { type: 'cleared' };
  return { type: 'credit', amount: Math.abs(balance) };
}

export function getStudentBadge(
  struckOff: boolean,
  balance: number,
  completed = false,
  onLeave = false,
): StudentBadgeType {
  // §26.5: a lifecycle state outranks the money state on the badge.
  if (struckOff) {
    if (balance > 0) return 'struck_off_dues';
    if (balance < 0) return 'struck_off_credit';
    return 'struck_off';
  }
  if (completed) return 'completed';
  if (onLeave) return 'on_leave';
  if (balance > 0) return 'dues';
  if (balance < 0) return 'credit';
  return 'active';
}

/**
 * The one way this app says "what does this balance mean" (P3, P9). Call sites
 * must apply `.color` verbatim rather than re-deriving amber/green/blue.
 * dues / cleared / credit are the three reserved money states — note credit is
 * violet, deliberately not the brand blue, so a money state is never identical
 * to the interactive colour. Label wording moves to the Money pattern in Phase 4.
 */
export function formatBalanceDisplay(balance: number): { label: string; color: string } {
  if (balance > 0) {
    return { label: `⚠ PKR ${balance.toLocaleString()} due`, color: 'text-dues' };
  }
  if (balance === 0) {
    return { label: '✅ Cleared', color: 'text-cleared' };
  }
  return { label: `✅ Credit PKR ${Math.abs(balance).toLocaleString()}`, color: 'text-credit' };
}

// --- CNIC formatting ---
export function formatCNIC(cnic: string | null): string {
  if (!cnic) return 'Not entered';
  // Format: XXXXX-XXXXXXX-X
  const cleaned = cnic.replace(/\D/g, '');
  if (cleaned.length !== 13) return cnic;
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5, 12)}-${cleaned.slice(12)}`;
}

// --- CNIC validation ---
export function isValidCNIC(cnic: string): boolean {
  const cleaned = cnic.replace(/\D/g, '');
  return cleaned.length === 13;
}

// --- Normalize CNIC (handle "nil", "nic", etc.) ---
export function normalizeCNIC(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase();
  if (['nil', 'nic', 'n/a', 'na', '-'].includes(cleaned)) return null;
  return value.trim();
}

// --- Contact validation (PK formats) ---
// Accepts: 03XXXXXXXXX (11 digits), +923XXXXXXXXX / 923XXXXXXXXX (12 digits after 92), empty (optional)
export function isValidContact(contact: string): boolean {
  if (!contact.trim()) return true; // optional
  const cleaned = contact.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('03')) return true;
  if (cleaned.length === 12 && cleaned.startsWith('923')) return true;
  if (cleaned.length === 10 && cleaned.startsWith('3')) return true; // without leading 0
  return false;
}

export function normalizeContact(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export function formatContact(contact: string | null): string {
  if (!contact) return 'Not entered';
  const cleaned = contact.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('03')) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }
  return contact;
}

// --- Semester label ---
export function getSemesterLabel(semester: string): string {
  return `${semester} Semester`;
}

// --- Term label (per course system) ---
export function getTermLabel(system: 'semester' | 'annual' | 'months', term: string): string {
  if (system === 'annual') return `${term} Year`;
  if (system === 'months') return `${term} Term`;
  return `${term} Semester`;
}

// --- Batch to Session mapping (approximate) ---
export function batchToSession(batch: string): number {
  const match = batch.match(/^(\d+)/);
  if (!match) return new Date().getFullYear();
  const batchNum = parseInt(match[1], 10);
  // 1st Batch = 2017, 2nd = 2017, 3rd = 2019, etc.
  // This is approximate - actual mapping should come from data
  return 2016 + batchNum;
}

// --- Generate receipt number ---
export function generateReceiptNumber(_block: { start: number; end: number }, current: number): string {
  return `#${current}`;
}

// --- Fee template total (always computed) ---
// Removed with the eight-head table: a template's term figures are computed by
// src/lib/fee/termFees from its components, and lib/fee/templateCompat projects the
// legacy heads from that. Two totals in two places was the bug this closes.

// --- Search highlight ---
export function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '**$1**');
}

// --- Pluralize ---
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}
