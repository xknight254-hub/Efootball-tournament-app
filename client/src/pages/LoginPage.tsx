import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ username: '', password: '' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await api.auth.login({
        username: formData.username,
        password: formData.password,
      });
      login(result.token, result.user);
      navigate('/');
    } catch (err: any) {
      setError(err.error || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-12 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-neon-blue flex items-center justify-center shadow-glow">
              <span className="text-white font-bold text-xl font-[Orbitron]">E</span>
            </div>
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-gray-400">Sign in to continue competing</p>
        </div>

        <Card>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Username or Email"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              placeholder="Enter your username or email"
              required
              autoComplete="username"
              leftIcon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              }
            />

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="input-label mb-0">Password</label>
                <a href="#" className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
                  Forgot password?
                </a>
              </div>
              <Input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                leftIcon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="remember" className="w-4 h-4 rounded bg-dark-800 border-dark-600 text-primary-500 focus:ring-primary-500/20" />
              <label htmlFor="remember" className="text-sm text-gray-400 cursor-pointer">Remember me</label>
            </div>

            <Button type="submit" variant="primary" className="w-full" size="lg" isLoading={loading}>
              {loading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-dark-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-surface px-4 text-dark-400">or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="w-full" type="button" disabled>
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Google
            </Button>
            <Button variant="outline" className="w-full" type="button" disabled>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.04-.08.04-.16.01-.24-.08-.24-.16-.48-.24-.72-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36-.04-.12-.08-.24-.12-.36z"/></svg>
              Discord
            </Button>
          </div>
        </Card>

        <p className="text-center text-gray-400 mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
