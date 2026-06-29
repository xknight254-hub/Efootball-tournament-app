import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '../hooks/useTelegram';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

/**
 * TelegramAutoLogin — silently authenticates users arriving from Telegram Mini App.
 * 
 * Flow:
 * 1. Detect Telegram WebApp environment
 * 2. Extract initData from the WebApp SDK
 * 3. Send to backend for validation + JWT issuance
 * 4. Auto-login the user (no button click needed)
 * 5. Handle start_param for deep links (tournament invites, match links)
 */
export function TelegramAutoLogin() {
  const { isAvailable, isReady, initData, startParam } = useTelegram();
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    // Only auto-login if:
    // 1. Running in Telegram
    // 2. SDK is ready with initData
    // 3. User is not already authenticated
    // 4. Haven't already tried
    if (!isAvailable || !isReady || !initData || isAuthenticated || status !== 'idle') {
      return;
    }

    const doAutoLogin = async () => {
      setStatus('processing');
      try {
        const result = await api.auth.telegramLogin(initData);
        login(result.token, result.user);

        // Handle deep link start_param
        if (startParam) {
          handleStartParam(startParam);
        } else {
          navigate('/');
        }

        setStatus('done');
      } catch (err: any) {
        console.error('[TelegramAutoLogin] Failed:', err);
        setError(err.error || 'Telegram login failed');
        setStatus('error');
      }
    };

    doAutoLogin();
  }, [isAvailable, isReady, initData, isAuthenticated, status, login, navigate, startParam]);

  const handleStartParam = (param: string) => {
    // start_param formats:
    //   tournament_<id>     → /tournaments/<id>
    //   match_<id>          → /tournaments/<id>/match/<id>
    //   join_<token>        → /join/<token>
    //   wager_<code>        → /wagers/<code>
    //   Any other value     → /

    if (param.startsWith('tournament_')) {
      const id = param.replace('tournament_', '');
      navigate(`/tournaments/${id}`);
    } else if (param.startsWith('match_')) {
      const id = param.replace('match_', '');
      navigate(`/tournaments/${id}`);
    } else if (param.startsWith('join_')) {
      const token = param.replace('join_', '');
      navigate(`/join/${token}`);
    } else if (param.startsWith('wager_')) {
      const code = param.replace('wager_', '');
      navigate(`/wagers?code=${code}`);
    } else {
      navigate('/');
    }
  };

  // Manual retry button on error
  if (status === 'error') {
    return (
      <div className="text-center py-4">
        <p className="text-sm mb-3" style={{ color: '#f87171' }}>
          {error}
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="text-sm font-medium underline"
          style={{ color: 'var(--color-accent)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  // Show loading state during auto-login
  if (status === 'processing') {
    return (
      <div className="flex items-center justify-center gap-3 py-4">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Signing in with Telegram...
        </span>
      </div>
    );
  }

  // If Telegram is available but not yet tried, show nothing (waiting for effect)
  if (isAvailable && status === 'idle') {
    return null;
  }

  return null;
}
