// Ledger module — signed amount (design system §11, principles P2/P4).
// Explicit +/− prefix so the sign carries the meaning and colour is redundant
// confirmation only. Right-aligned tabular figures via the `num` utility.
//
// §54 asks for colour by direction: an entry that increases dues is tinted, one that
// reduces them is tinted the other way. `dues` is the token for "outstanding" — the
// design system maps a red balance onto it and keeps `danger` red for destructive
// actions only, so a charge is never dressed as a deletion.

import { formatPKR, cn } from '@/lib/utils';

export function SignedAmount({ value, className }: { value: number; className?: string }) {
  if (value === 0) {
    return <span className={cn('num text-ink-subtle', className)}>—</span>;
  }
  const negative = value < 0;
  return (
    <span
      className={cn('num font-medium', negative ? 'text-cleared' : 'text-dues', className)}
    >
      {negative ? '−' : '+'}
      {formatPKR(Math.abs(value))}
    </span>
  );
}
