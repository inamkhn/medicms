import { Navigate } from 'react-router-dom';
import { can, type Permission } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';

// ============================================
// RequirePermission — Feature 1 §3, §10
// The route half of the "one shared rule set" rule. Hiding the sidebar link is not
// protection; this guard is what actually refuses the page when its address is typed
// in. It asks the same can() the buttons ask, so a route and its button can never
// disagree about who is allowed.
// ============================================

interface RequirePermissionProps {
  perm: Permission;
  children: React.ReactNode;
}

export function RequirePermission({ perm, children }: RequirePermissionProps) {
  const role = useAuthStore((s) => s.user?.role);
  if (!can(role, perm)) {
    // Send them somewhere they ARE allowed rather than a dead 404; the dashboard is
    // readable by every signed-in role.
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
