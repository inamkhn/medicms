// ============================================
// MediCMS Desktop v4.0 - Status Bar
// ============================================

import { useSyncStore } from '@/stores';
import { getSyncIndicator } from '@/stores/syncStore';
import { formatDateTime } from '@/lib/utils';

export function StatusBar() {
  const { status, lastSync, pendingCount } = useSyncStore();
  const { dot, label } = getSyncIndicator(status);

  return (
    <footer className="h-7 border-t border-slate-100/60 bg-white/60 backdrop-blur-sm flex items-center justify-between px-6 text-xs text-slate-400 shrink-0">
      <div className="flex items-center gap-4">
        <span>
          {dot} {label}
        </span>
        {lastSync && (
          <span>
            Last sync: {formatDateTime(lastSync)}
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        {pendingCount > 0 && (
          <span className="text-amber-500">
            {pendingCount} pending sync
          </span>
        )}
        <span>MediCMS Desktop v4.0</span>
      </div>
    </footer>
  );
}
