import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

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
      const result = await api.auth.login({ username: formData.username, password: formData.password });
      login(result.token, result.user);
      navigate('/');
    } catch (err: any) {
      setError(err.error || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <span className="text-white font-bold text-lg" style={{ fontFamily: 'Orbitron, sans-serif' }}>E</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-white mb-1">Welcome Back</h1>
          <p className="text-[var(--color-text-muted)] text-sm">Sign in to continue competing</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Username or Email" name="username" type="text" value={formData.username} onChange={handleChange} placeholder="Enter your username" required />
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[var(--color-text-secondary)]">Password</label>
                <a href="#" className="text-xs" style={{ color: 'var(--color-neon-indigo)' }}>Forgot password?</a>
              </div>
              <Input name="password" type="password" value={formData.password} onChange={handleChange} placeholder="Enter your password" required />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="remember" className="w-4 h-4 rounded" style={{ background: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }} />
              <label htmlFor="remember" className="text-sm text-[var(--color-text-muted)] cursor-pointer">Remember me</label>
            </div>
            <Button type="submit" variant="primary" className="w-full" size="lg" isLoading={loading}>
              {loading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full" style={{ borderTop: '1px solid var(--color-border)' }} /></div>
            <div className="relative flex justify-center text-xs"><span className="px-3" style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-dim)' }}>or continue with</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="w-full text-sm" type="button" disabled>Google</Button>
            <Button variant="outline" className="w-full text-sm" type="button" disabled>Discord</Button>
          </div>
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Don't have an account?{' '}
          <Link to="/register" className="font-medium" style={{ color: 'var(--color-neon-indigo)' }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
