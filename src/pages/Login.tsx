// ============================================
// Login — Feature 1 §5
// Multi-user sign-in. No demo credentials, no admin/admin. The generic error never
// reveals which field was wrong; disabled and locked states say so explicitly
// because those are actionable for the user, unlike a wrong password.
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import Setup from '@/pages/Setup';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore, type LoginResult } from '@/stores/authStore';
import { useUserStore } from '@/stores/userStore';
import { useSettingsStore } from '@/stores/settingsStore';

const MESSAGES: Record<Exclude<LoginResult, { ok: true }>['reason'], string> = {
  incorrect: 'Username or password is incorrect.',
  disabled: 'This account is disabled. Contact your administrator.',
  locked: 'Too many failed attempts. This account is locked for 5 minutes.',
};

export default function Login() {
  const navigate = useNavigate();
  // First launch has no accounts: replace the sign-in form with setup (§4).
  const needsSetup = useUserStore((s) => s.users.length === 0);
  const instituteName = useSettingsStore((s) => s.instituteName);
  const instituteAddress = useSettingsStore((s) => s.instituteAddress);
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forceChange, setForceChange] = useState(false);

  if (needsSetup) return <Setup />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (result.ok) {
      // A reset password must be replaced before the app opens (§7).
      if (result.mustChangePassword) setForceChange(true);
      else navigate('/dashboard', { replace: true });
      return;
    }
    setError(MESSAGES[result.reason]);
    setPassword('');
  };

  return (
    <AuthScreen instituteName={instituteName} instituteLine={instituteAddress} heading="Sign in" subheading="Enter your username and password.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            autoComplete="username"
            autoFocus
            invalid={!!error}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              invalid={!!error}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-control p-1 text-ink-subtle transition-colors duration-120 hover:text-ink"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-body text-danger" role="alert">
            {error}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="text-center text-micro text-ink-muted">
          Forgot your password? Ask your administrator to reset it.
        </p>
      </form>

      <div className="mt-6 border-t border-hairline-soft pt-4 text-center text-micro text-ink-subtle">
        Works offline against the local user list.
      </div>

      <ChangePasswordDialog forced open={forceChange} onOpenChange={setForceChange} onDone={() => navigate('/dashboard', { replace: true })} />
    </AuthScreen>
  );
}
