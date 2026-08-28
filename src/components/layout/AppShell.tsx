// ============================================
// MediCMS Desktop v4.0 - App Shell
// ============================================

import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { StatusBar } from './StatusBar';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { GlobalSearch } from '@/components/shared/GlobalSearch';
import { useSyncStore, useUIStore } from '@/stores';

// Global keyboard shortcuts (inside Router context so useNavigate works)
function useGlobalShortcuts() {
  const openSearch = useUIStore((s) => s.openSearch);
  const { setSyncing, syncComplete } = useSyncStore();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // F3 - Global search
      if (e.key === 'F3') {
        e.preventDefault();
        openSearch();
      }
      // F5 - Sync now
      if (e.key === 'F5') {
        e.preventDefault();
        setSyncing();
        setTimeout(() => syncComplete(0, 0), 1000);
      }
      // Ctrl+N - New Admission
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        navigate('/admissions/new');
      }
      // Ctrl+P - Record Payment
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        navigate('/payments/record');
      }
      // Ctrl+D - Daily cash report (today)
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        navigate('/reports');
      }
      // Ctrl+R - Reprint last receipt
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        navigate('/payments/reprint');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openSearch, setSyncing, syncComplete, navigate]);
}

export function AppShell() {
  useGlobalShortcuts();
  const syncStatus = useSyncStore((s) => s.status);
  const { searchOpen, closeSearch } = useUIStore();
  const isOffline = syncStatus === 'offline';

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50/50 print:h-auto print:overflow-visible">
      <div className="print:hidden"><Header /></div>
      {isOffline && <OfflineBanner />}
      
      <div className="flex flex-1 overflow-hidden print:block">
        <div className="print:hidden flex"><Sidebar /></div>
        <main className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
          <Outlet />
        </main>
      </div>
      
      <div className="print:hidden"><StatusBar /></div>
      
      {/* Global Search Overlay */}
      {searchOpen && <GlobalSearch onClose={closeSearch} />}
    </div>
  );
}
