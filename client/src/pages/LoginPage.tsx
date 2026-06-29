import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTelegram } from '../context/TelegramContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type LoginMode = 'password' | 'phone';

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { isInTelegram: isTelegramEnv } = useTelegram();
  const [mode, setMode] = useState<LoginMode>('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If in Telegram and already authenticated, redirect to home
  // (TelegramContext auto-logged them in)
  useEffect(() => {
    if (isTelegramEnv && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isTelegramEnv, isAuthenticated, navigate]);

  // Don't render login form for Telegram Mini App users
  // They should be auto-logged in by TelegramProvider
  if (isTelegramEnv) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}>
            <span className="text-white font-bold text-2xl" style={{ fontFamily: 'Orbitron, sans-serif' }}>E</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Signing you in...</h1>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">Connecting to Telegram</p>
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    );
  }

  // Password login
  const [formData, setFormData] = useState({ username: '', password: '' });

  // Phone login
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // ─── Password Login ───────────────────────────────────────────
  const handlePasswordLogin = async (e: React.FormEvent) => {
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

  // ─── Phone Login (Step 1: Send OTP) ──────────────────────────
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) { setError('Phone number required'); return; }
    setPhoneLoading(true);
    setError('');
    try {
      await api.auth.sendOTP(phone.trim());
      setOtpSent(true);
    } catch (err: any) {
      setError(err.error || 'Failed to send OTP');
    } finally {
      setPhoneLoading(false);
    }
  };

  // ─── Phone Login (Step 2: Verify OTP) ────────────────────────
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) { setError('Enter the code'); return; }
    setPhoneLoading(true);
    setError('');
    try {
      const result = await api.auth.verifyOTP(phone.trim(), otpCode.trim());
      login(result.token, result.user);
      navigate('/');
    } catch (err: any) {
      setError(err.error || 'Invalid code');
    } finally {
      setPhoneLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}>
              <span className="text-white font-bold text-lg" style={{ fontFamily: 'Orbitron, sans-serif' }}>E</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-white mb-1">Welcome Back</h1>
          <p className="text-[var(--color-text-muted)] text-sm">Sign in to continue competing</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          {/* Mode Toggle */}
          <div className="flex rounded-lg p-1 mb-5" style={{ background: 'var(--color-bg-surface)' }}>
            <button
              type="button"
              onClick={() => { setMode('password'); setError(''); }}
              className="flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all"
              style={{
                background: mode === 'password' ? 'var(--color-bg-card)' : 'transparent',
                color: mode === 'password' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                boxShadow: mode === 'password' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => { setMode('phone'); setError(''); setOtpSent(false); }}
              className="flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all"
              style={{
                background: mode === 'phone' ? 'var(--color-bg-card)' : 'transparent',
                color: mode === 'phone' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                boxShadow: mode === 'phone' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              Phone
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              {error}
            </div>
          )}

          {/* ─── Password Form ──────────────────────────────────── */}
          {mode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <Input
                label="Username or Email"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter your username"
                required
              />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[var(--color-text-secondary)]">Password</label>
                  <a href="#" className="text-xs" style={{ color: 'var(--color-accent)' }}>Forgot password?</a>
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
          )}

          {/* ─── Phone Form ──────────────────────────────────────── */}
          {mode === 'phone' && !otpSent && (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <Input
                label="Phone Number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0712345678"
                required
              />
              <p className="text-[10px] text-[var(--color-text-dim)]">
                We'll send an SMS code to verify your number. Standard rates apply.
              </p>
              <Button type="submit" variant="primary" className="w-full" size="lg" isLoading={phoneLoading}>
                {phoneLoading ? 'Sending...' : 'Send Code'}
              </Button>
            </form>
          )}

          {mode === 'phone' && otpSent && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm text-[var(--color-text-muted)]">
                  Code sent to <span className="text-white font-medium">{phone}</span>
                </p>
              </div>
              <Input
                label="Verification Code"
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                required
              />
              <Button type="submit" variant="primary" className="w-full" size="lg" isLoading={phoneLoading}>
                {phoneLoading ? 'Verifying...' : 'Verify & Sign In'}
              </Button>
              <button
                type="button"
                onClick={() => { setOtpSent(false); setOtpCode(''); setError(''); }}
                className="w-full text-center text-xs py-2"
                style={{ color: 'var(--color-text-dim)' }}
              >
                Change phone number
              </button>
            </form>
          )}

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full" style={{ borderTop: '1px solid var(--color-border)' }} /></div>
            <div className="relative flex justify-center text-xs"><span className="px-3" style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-dim)' }}>or</span></div>
          </div>

          {/* Telegram Login Button */}
          <TelegramLoginButton />
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Don't have an account?{' '}
          <Link to="/register" className="font-medium" style={{ color: 'var(--color-accent)' }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}

// ─── Telegram Login Button ─────────────────────────────────────
// Uses Telegram Login Widget (for web, not Mini App)
function TelegramLoginButton() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleTelegramLogin = async () => {
    setLoading(true);
    try {
      // For Telegram Mini App: use WebApp SDK directly
      if (window.Telegram?.WebApp?.initData) {
        const result = await api.auth.telegramLogin(window.Telegram.WebApp.initData);
        login(result.token, result.user);
        navigate('/');
        return;
      }

      // For web: open Telegram OAuth popup
      const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'Budgal_bot';
      const redirectUrl = encodeURIComponent(window.location.origin + '/auth/telegram-callback');

      // Telegram Login Widget approach
      const authUrl = `https://oauth.telegram.org/auth?bot_id=${botUsername}&origin=${encodeURIComponent(window.location.origin)}&return_to=${redirectUrl}&request_access=write`;

      window.open(authUrl, 'telegram-login', 'width=500,height=600');

      // Listen for callback
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'telegram-oauth') {
          window.removeEventListener('message', handleMessage);
          const result = await api.auth.telegramLogin(event.data.initData);
          login(result.token, result.user);
          navigate('/');
        }
      };
      window.addEventListener('message', handleMessage);
    } catch (err: any) {
      console.error('[Telegram] Login failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="w-full text-sm"
      type="button"
      isLoading={loading}
      onClick={handleTelegramLogin}
    >
      <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
      {loading ? 'Connecting...' : 'Sign in with Telegram'}
    </Button>
  );
}
