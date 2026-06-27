// ============================================
// MediCMS Desktop v4.0 - Login Page
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores';
import { INSTITUTE_INFO } from '@/lib/constants';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate login (replace with actual API call)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Demo credentials
    if (username === 'admin' && password === 'admin') {
      login({
        id: '1',
        username: 'admin',
        name: 'Admin Khalid',
        role: 'Admin',
      });
      navigate('/dashboard');
    } else if (username === 'principal' && password === 'principal') {
      login({
        id: '2',
        username: 'principal',
        name: 'Principal',
        role: 'Principal',
      });
      navigate('/dashboard');
    } else {
      setError('Invalid username or password');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-10 w-full max-w-[420px] border border-slate-100/40">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-18 h-18 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-200/50" style={{ width: '72px', height: '72px' }}>
            <span className="text-white font-bold text-3xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">MediCMS Desktop</h1>
          <p className="text-sm text-slate-500 mt-2">
            {INSTITUTE_INFO.name} — {INSTITUTE_INFO.location}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative mt-2">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50/80 p-3.5 rounded-xl border border-red-100">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full h-12 text-[15px]" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </Button>
        </form>

        {/* Offline Note */}
        <div className="mt-7 text-center text-xs text-slate-400">
          Works offline — cached credentials (7-day window)
        </div>

        {/* Demo Credentials */}
        <div className="mt-5 p-4 bg-slate-50 rounded-xl text-sm text-slate-500 border border-slate-100/60">
          <div className="font-medium text-slate-700 mb-2">Demo Credentials</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Admin</span>
              <span className="font-mono text-xs text-slate-600">admin / admin</span>
            </div>
            <div className="flex justify-between">
              <span>Principal</span>
              <span className="font-mono text-xs text-slate-600">principal / principal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
