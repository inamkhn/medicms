import { useState } from 'react';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ROLE_LABELS } from '@/types';

// ============================================
// Lock screen — Feature 1 §6
// "Lock screen shows the user's name. Unlock with password, or sign in as someone
// else." Rendered as a full replacement of the shell (not an overlay), so nothing
// sensitive stays on screen while locked, and no ad-hoc `fixed inset-0` overlay is
// needed (design gate P10).
// ============================================

export function LockScreen() {
  const user = useAuthStore((s) => s.user);
  const unlock = useAuthStore((s) => s.unlock);
  const logout = useAuthStore((s) => s.logout);
  const instituteName = useSettingsStore((s) => s.instituteName);

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await unlock(password);
    setBusy(false);
    if (!ok) {
      setError('Incorrect password.');
      setPassword('');
    }
  };

  return (
    <AuthScreen
      instituteName={instituteName}
      heading={user ? `Welcome back, ${user.name}` : 'Screen locked'}
      subheading={user ? `${ROLE_LABELS[user.role]} · Enter your password to unlock` : 'Enter your password to unlock'}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="lock-password">Password</Label>
          <Input
            id="lock-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            invalid={!!error}
            autoComplete="current-password"
          />
        </div>

        {error ? (
          <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-body text-danger" role="alert">
            {error}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={busy}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>

        <Button type="button" variant="ghost" className="w-full" onClick={logout}>
          Sign in as someone else
        </Button>
      </form>
    </AuthScreen>
  );
}
