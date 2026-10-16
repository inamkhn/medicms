// ============================================
// TermLabel — BATCHES_ACADEMIC_SETUP_DESIGN §42.1, §8
// One component so a term reads identically everywhere. It never invents a label:
// the wording comes from the pure term helper, which is the same one the tests and
// the print layouts use. `short` is for tight tables (student directory, dashboard).
// ============================================

import type { TermSystem } from '@/lib/academic';
import { termLabel } from '@/lib/academic';

export interface TermLabelProps {
  system: TermSystem;
  term: number;
  style?: 'long' | 'short';
  className?: string;
}

export function TermLabel({ system, term, style = 'long', className }: TermLabelProps) {
  return <span className={className}>{termLabel(system, term, style)}</span>;
}
