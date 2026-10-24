// Student module — single source of truth for status (spec §2.1, §5)
// Dot + label (not filled pill) for dense-table scannability.
// Dues = amber-orange; red reserved for destructive only.

import type { StudentBadgeType } from '@/types';
import { cn } from '@/lib/utils';

const CONFIG: Record<StudentBadgeType, { label: (b: number) => string; dot: string; text: string }> = {
  active: { label: () => 'Cleared', dot: 'bg-[#1A8754]', text: 'text-[#1A8754]' },
  dues: { label: (b) => `Dues ${b.toLocaleString()}`, dot: 'bg-[#C2410C]', text: 'text-[#C2410C]' },
  credit: { label: (b) => `Credit ${Math.abs(b).toLocaleString()}`, dot: 'bg-[#2451B8]', text: 'text-[#2451B8]' },
  struck_off: { label: () => 'Struck off', dot: 'bg-[#6B7280]', text: 'text-[#6B7280]' },
  struck_off_dues: { label: (b) => `Struck off · Dues ${b.toLocaleString()}`, dot: 'bg-[#6B7280]', text: 'text-[#6B7280]' },
  struck_off_credit: { label: () => 'Struck off · Credit', dot: 'bg-[#6B7280]', text: 'text-[#6B7280]' },
  completed: { label: () => 'Completed', dot: 'bg-cleared', text: 'text-cleared' },
  on_leave: { label: () => 'On leave', dot: 'bg-ink-muted', text: 'text-ink-muted' },
};

export function StudentStatusBadge({ badge, balance, className }: { badge: StudentBadgeType; balance: number; className?: string }) {
  const c = CONFIG[badge];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap', c.text, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', c.dot)} />
      {c.label(balance)}
    </span>
  );
}
