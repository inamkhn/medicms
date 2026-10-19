import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// RestrictedField — STAFF_PAYROLL_DESIGN §47.2, §48, §64 integrity 8
// A protected value is *absent from the payload* (getStaffProjection strips the
// key), so this component is not a frontend-only hide — it renders the explicit
// "this exists but you are not permitted to see it" placeholder a compliant
// screen shows instead of a blank cell. The words carry the meaning; the lock is
// decoration (aria-hidden), so state is never colour/icon-only (P4).
// ============================================

export interface RestrictedFieldProps {
  /** The field the viewer cannot see, e.g. "Bank account". */
  label: string;
  /** Optional second line naming the permission, kept secret-free. */
  hint?: string;
  className?: string;
}

export function RestrictedField({ label, hint, className }: RestrictedFieldProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-control border border-dashed border-hairline bg-surface px-3 py-2',
        className,
      )}
    >
      <Lock size={13} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-body text-ink-muted">
          <span className="font-medium text-ink-secondary">{label}</span> — restricted to Admin
        </div>
        {hint && <div className="text-meta text-ink-subtle">{hint}</div>}
      </div>
    </div>
  );
}
