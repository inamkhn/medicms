// ============================================
// MediCMS Desktop — Ledger: entry type badge (§54)
// Label + left-edge accent bar only; never a full-row fill (design system §2.1).
//
// The accents come from the token layer rather than literals, and the two places
// where §54's words and the tokens disagree are decided by the tokens: the design
// system reserves brand blue for "clickable", so Refund sits on `credit` violet and
// Special charge on `dues` amber instead of a one-off colour.
// ============================================

import type { LedgerEntryType } from '@/types';
import { ENTRY_LABELS } from '@/lib/ledger';
import { cn } from '@/lib/utils';

const ACCENT: Record<LedgerEntryType, string> = {
  OpeningBalanceDues: 'border-l-ink-subtle',
  OpeningBalanceCredit: 'border-l-ink-subtle',
  FeeCharge: 'border-l-ink-muted',
  SpecialCharge: 'border-l-dues',
  AdjustmentAdd: 'border-l-struckoff',
  AdjustmentReduce: 'border-l-struckoff',
  Concession: 'border-l-accent',
  Payment: 'border-l-cleared',
  WriteOff: 'border-l-struckoff',
  Refund: 'border-l-credit text-credit',
  // A reversal is not a money state of its own — it undoes one, so it is grey and
  // dashed rather than a tenth colour.
  Reversal: 'border-l-dashed border-l-struckoff text-ink-muted',
};

export function EntryTypeBadge({ type, className }: { type: LedgerEntryType; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block border-l-[3px] pl-1.5 text-meta font-medium text-ink-secondary whitespace-nowrap',
        ACCENT[type],
        className,
      )}
    >
      {ENTRY_LABELS[type]}
    </span>
  );
}
