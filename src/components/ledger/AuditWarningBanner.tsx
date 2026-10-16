// Ledger module — persistent audit warning (spec §3.4).

import { AlertTriangle } from 'lucide-react';

export function AuditWarningBanner({ text }: { text?: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
      <p className="text-sm text-amber-700">
        {text ?? 'This action is logged to the audit trail with your operator ID and cannot be deleted.'}
      </p>
    </div>
  );
}
