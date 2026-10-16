// Student module — SNO display (spec §5): tabular-nums, # prefix.

import { cn } from '@/lib/utils';

export function SnoDisplay({ sno, className }: { sno: number | string; className?: string }) {
  return (
    <span className={cn('font-medium tabular-nums whitespace-nowrap', className)}>
      #{sno}
    </span>
  );
}
