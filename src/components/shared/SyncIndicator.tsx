// ============================================
// MediCMS Desktop v4.0 - Sync Indicator
// ============================================

import { useSyncStore } from '@/stores';
import { getSyncIndicator } from '@/stores/syncStore';

export function SyncIndicator() {
  const { status, error } = useSyncStore();
  const { dot, label } = getSyncIndicator(status);

  return (
    <div className="flex items-center gap-2" title={error || label}>
      <span className="text-sm">{dot}</span>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}
