import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  telegramId?: string;
  telegramUsername?: string;
  isPremium?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authMethod: 'telegram' | 'password' | 'phone' | null;
  login: (token: string, user: User, method?: 'telegram' | 'password' | 'phone') => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMethod, setAuthMethod] = useState<'telegram' | 'password' | 'phone' | null>(null);

  useEffect(() => {
    // Listen for Telegram auto-login events
    const handleTelegramAuth = (event: CustomEvent) => {
      const { token, user } = event.detail;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('auth_method', 'telegram');
      setToken(token);
      setUser(user);
      setAuthMethod('telegram');
      setIsLoading(false);
    };

    window.addEventListener('telegram-authenticated', handleTelegramAuth as EventListener);

    // Check for existing saved auth
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedMethod = localStorage.getItem('auth_method') as 'telegram' | 'password' | 'phone' | null;
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setAuthMethod(savedMethod);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('auth_method');
      }
    }
    setIsLoading(false);

    return () => {
      window.removeEventListener('telegram-authenticated', handleTelegramAuth as EventListener);
    };
  }, []);

  const login = useCallback((newToken: string, newUser: User, method: 'telegram' | 'password' | 'phone' = 'password') => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    localStorage.setItem('auth_method', method);
    setToken(newToken);
    setUser(newUser);
    setAuthMethod(method);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_method');
    setToken(null);
    setUser(null);
    setAuthMethod(null);
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Refresh token for Telegram sessions
  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch('/api/auth/refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error('Refresh failed');
      const data = await res.json();
      localStorage.setItem('token', data.token);
      setToken(data.token);
      return true;
    } catch {
      logout();
      return false;
    }
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated: !!token && !!user,
      isLoading,
      authMethod,
      login,
      logout,
      updateUser,
      refreshSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
