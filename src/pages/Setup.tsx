// ============================================
// First-run setup — Feature 1 §4
// Shown only when there are no accounts. Creates the institute and the first
// Admin, then signs them straight in. There is no built-in admin/admin: the app
// cannot be used until a real owner account with a real password exists.
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validatePassword } from '@/lib/crypto';
import { normalizeUsername, useUserStore } from '@/stores/userStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuditStore } from '@/stores/auditStore';

export default function Setup() {
  const navigate = useNavigate();
  const createUser = useUserStore((s) => s.createUser);
  const login = useAuthStore((s) => s.login);
  const setInstitute = useSettingsStore((s) => s.setInstitute);
  const instituteName = useSettingsStore((s) => s.instituteName);
  const instituteAddress = useSettingsStore((s) => s.instituteAddress);
  const institutePhone = useSettingsStore((s) => s.institutePhone);
  const addLog = useAuditStore((s) => s.addLog);

  const [institute, setInstituteName] = useState(instituteName);
  const [address, setAddress] = useState(instituteAddress);
  const [phone, setPhone] = useState(institutePhone);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!institute.trim() || !name.trim() || !username.trim()) {
      setError('Institute name, your full name and a username are required.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    const pwProblem = validatePassword(password, username);
    if (pwProblem) {
      setError(pwProblem);
      return;
    }

    setLoading(true);
    try {
      setInstitute(institute.trim(), address.trim(), phone.trim());
      const owner = await createUser({
        username: normalizeUsername(username),
        name: name.trim(),
        role: 'Admin',
        password,
      });
      addLog({ user: owner.username, action: 'User Created', details: 'First Admin created at setup' });
      await login(owner.username, password);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Could not complete setup. Please try again.');
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      instituteName="Set up your institute"
      heading="First-time setup"
      subheading="Create the institute and your Admin account. No default password ships with the app."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="institute">Institute name</Label>
          <Input id="institute" value={institute} onChange={(e) => setInstituteName(e.target.value)} placeholder="Paramedical Institute" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="address">Location</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="City" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className="my-1 h-px bg-hairline" />

        <div className="space-y-1.5">
          <Label htmlFor="name">Your full name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Imran Shah" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. imran" autoComplete="username" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <p className="text-micro text-ink-subtle">At least 8 characters, and not equal to the username.</p>

        {error ? (
          <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-body text-danger" role="alert">
            {error}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={loading}>
          {loading ? 'Setting up…' : 'Create account & sign in'}
        </Button>
      </form>
    </AuthScreen>
  );
}
