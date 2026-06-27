// ============================================
// MediCMS Desktop v4.0 - Offline Banner
// ============================================

import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSyncStore } from '@/stores';

export function OfflineBanner() {
  const { pendingCount, setSyncing, syncComplete } = useSyncStore();
  
  const handleSync = () => {
    // In real app, this would trigger actual sync
    setSyncing();
    setTimeout(() => syncComplete(0, 0), 1000);
  };

  return (
    <div className="bg-amber-50/80 backdrop-blur-sm border-b border-amber-100/60 px-6 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-amber-700">
        <WifiOff size={16} />
        <span className="text-sm">
          Working offline — {pendingCount} record{pendingCount !== 1 ? 's' : ''} pending sync.
          Data saves locally.
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={handleSync}>
        <RefreshCw size={14} className="mr-1.5" />
        Sync Now
      </Button>
    </div>
  );
}
