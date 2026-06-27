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
import { StudentDrawer } from '@/components/shared/StudentDrawer';
import { useSyncStore, useUIStore } from '@/stores';

// Global keyboard shortcuts (inside Router context so useNavigate works)
function useGlobalShortcuts() {
  const openSearch = useUIStore((s) => s.openSearch);
  const { setSyncing, syncComplete } = useSyncStore();
  const { closeDrawer, drawerOpen } = useUIStore();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Esc - Close drawer / overlay
      if (e.key === 'Escape') {
        if (drawerOpen) {
          e.preventDefault();
          closeDrawer();
          return;
        }
      }
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
  }, [openSearch, setSyncing, syncComplete, navigate, closeDrawer, drawerOpen]);
}

export function AppShell() {
  useGlobalShortcuts();
  const syncStatus = useSyncStore((s) => s.status);
  const { searchOpen, drawerOpen, drawerStudent, closeDrawer, closeSearch } = useUIStore();
  const isOffline = syncStatus === 'offline';

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50/50">
      <Header />
      {isOffline && <OfflineBanner />}
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
      
      <StatusBar />
      
      {/* Global Search Overlay */}
      {searchOpen && <GlobalSearch onClose={closeSearch} />}
      
      {/* Student Drawer */}
      {drawerOpen && drawerStudent && (
        <StudentDrawer student={drawerStudent} onClose={closeDrawer} />
      )}
    </div>
  );
}
