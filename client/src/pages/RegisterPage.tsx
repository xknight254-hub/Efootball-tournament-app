import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ firstName: '', lastName: '', username: '', email: '', password: '' });
  const [strength, setStrength] = useState(0);
  const [agreed, setAgreed] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'password') setStrength(calcStrength(value));
  };

  const calcStrength = (pw: string) => {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[a-z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) { setError('You must agree to the Terms'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await api.auth.register({ username: formData.username, email: formData.email, password: formData.password, firstName: formData.firstName || undefined, lastName: formData.lastName || undefined });
      login(result.token, result.user);
      navigate('/');
    } catch (err: any) {
      setError(err.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][strength];
  const strengthColor = ['', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4'][strength];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}>
              <span className="text-white font-bold text-lg" style={{ fontFamily: 'Orbitron, sans-serif' }}>E</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-white mb-1">Create Account</h1>
          <p className="text-[var(--color-text-muted)] text-sm">Join the eFootball Arena</p>
        </div>

        <div className="rounded-2xl p-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name" name="firstName" value={formData.firstName} onChange={handleChange} placeholder="John" />
              <Input label="Last Name" name="lastName" value={formData.lastName} onChange={handleChange} placeholder="Doe" />
            </div>
            <Input label="Username" name="username" value={formData.username} onChange={handleChange} placeholder="johndoe123" required />
            <Input label="Email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="john@example.com" required />
            <div>
              <Input label="Password" name="password" type="password" value={formData.password} onChange={handleChange} placeholder="Create a strong password" required minLength={8} />
              {formData.password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="h-1 flex-1 rounded-full transition-colors" style={{ background: i <= strength ? strengthColor : 'var(--color-bg-elevated)' }} />
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: strength >= 4 ? '#22c55e' : strength >= 3 ? '#eab308' : '#ef4444' }}>Password strength: {strengthLabel}</p>
                </div>
              )}
            </div>
            <div className="flex items-start gap-2">
              <input type="checkbox" id="agree" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="w-4 h-4 mt-0.5 rounded" style={{ background: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }} required />
              <label htmlFor="agree" className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                I agree to the <Link to="/terms" style={{ color: 'var(--color-accent)' }}>Terms of Service</Link> and <Link to="/privacy" style={{ color: 'var(--color-accent)' }}>Privacy Policy</Link>
              </label>
            </div>
            <Button type="submit" variant="neon" className="w-full" size="lg" isLoading={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium" style={{ color: 'var(--color-accent)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
