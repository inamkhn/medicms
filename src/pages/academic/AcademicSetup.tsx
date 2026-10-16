// ============================================
// Academic setup — tabbed shell (BATCHES_ACADEMIC_SETUP_DESIGN §28, §29)
// Replaces the old standalone Batches page. Holds the title, the four-figure summary
// strip (each a link) and the Batches / Programs / Sessions tab bar, then renders the
// active tab through <Outlet/>. The tab lives in the address, so a link or a refresh
// lands on the same view. The setup-health panel is added later (Phase 8, §37).
// ============================================

import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { can } from '@/lib/permissions';
import { useAcademicStore, useAuthStore, useStudentStore } from '@/stores';

function StatLink({ label, value, to }: { label: string; value: string | number; to: string }) {
  return (
    <NavLink
      to={to}
      className={cn(
        'flex flex-col gap-0.5 rounded-control border border-hairline bg-panel px-3 py-2',
        'transition-colors duration-120 ease-standard hover:border-hairline-strong hover:bg-hairline-soft',
      )}
    >
      <span className="text-micro uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="text-ui font-semibold text-ink">{value}</span>
    </NavLink>
  );
}

const TABS = [
  { to: '/academic/batches', key: 'batches', label: 'Batches' },
  { to: '/academic/programs', key: 'programs', label: 'Programs' },
  { to: '/academic/sessions', key: 'sessions', label: 'Sessions' },
];

export default function AcademicSetup() {
  const role = useAuthStore((s) => s.user?.role);
  const view = can(role, 'academic.view');

  const listBatches = useAcademicStore((s) => s.listBatches);
  const listPrograms = useAcademicStore((s) => s.listPrograms);
  const sessions = useAcademicStore((s) => s.sessions);
  const currentSession = useAcademicStore((s) => s.getCurrentSession);
  const students = useStudentStore((s) => s.students);

  if (!view) return <Navigate to="/dashboard" replace />;

  const allBatches = listBatches({ includeCompleted: true });
  const runningBatches = allBatches.filter((b) => b.status === 'Running');
  const openAdmissions = allBatches.filter((b) => b.status !== 'Completed' && b.admissions === 'Open');
  const activeStudents = students.filter((s) => !s.struckOff && !s.isTestRecord);

  const batchCounts: Record<string, number> = {
    batches: allBatches.filter((b) => b.status !== 'Completed').length,
    programs: listPrograms().filter((p) => p.status === 'Active').length,
    sessions: sessions.length,
  };

  const current = currentSession();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-title font-semibold text-ink">Academic setup</h1>
          <p className="text-body text-ink-muted">Programs, sessions and batches are managed here, not in code</p>
        </div>
        {role === 'Viewer' && (
          <Badge variant="secondary" className="ml-1">View only</Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatLink label="Current session" value={current ? String(current.year) : '—'} to="/academic/sessions" />
        <StatLink label="Running batches" value={runningBatches.length} to="/academic/batches?status=Running" />
        <StatLink label="Admissions open" value={openAdmissions.length} to="/academic/batches?admissions=Open" />
        <StatLink label="Active students" value={activeStudents.length} to="/students" />
      </div>

      <div className="flex items-center gap-1 border-b border-hairline">
        {TABS.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-body font-medium transition-colors duration-120 ease-standard',
                isActive
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )
            }
          >
            {tab.label}
            <span className="rounded-pill bg-hairline-soft px-1.5 text-micro font-medium text-ink-secondary">
              {batchCounts[tab.key]}
            </span>
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
