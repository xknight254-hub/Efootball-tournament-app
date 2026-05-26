import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../api';

// ─── Telegram WebApp SDK Integration ───────────────────────────
// This context auto-detects if the app is running inside Telegram Mini App,
// validates the session, and provides user data throughout the app.

// Declare Telegram WebApp global (injected by Telegram client)
declare global {
  interface Window {
    Telegram?: {
      WebApp?: WebApp;
    };
  }
}

interface WebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
      allows_write_to_pm?: boolean;
      is_bot?: boolean;
    };
    auth_date?: number;
    query_id?: string;
    start_param?: string;
    chat_type?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  isClosingConfirmationEnabled: boolean;
  headerColor: string;
  backgroundColor: string;
  isVersionAtLeast: (version: string) => boolean;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  onEvent: (eventType: string, callback: () => void) => void;
  offEvent: (eventType: string, callback: () => void) => void;
  sendData: (data: string) => void;
  switchInlineQuery: (query: string, chatTypes?: string[]) => void;
  openLink: (url: string, options?: { try_in_view?: boolean }) => void;
  openTelegramLink: (url: string) => void;
  openInvoice: (url: string, callback?: (status: string) => void) => void;
  showPopup: (params: {
    title?: string;
    message: string;
    buttons?: Array<{ type?: string; text?: string; id?: string }>;
  }, callback?: (buttonId: string) => void) => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  showScanQrPopup: (params?: { text?: string }, callback?: (text: string) => void) => void;
  closeScanQrPopup: () => void;
  readTextFromClipboard: (callback?: (text: string) => void) => void;
  requestWriteAccess: (callback?: (allowed: boolean) => void) => void;
  requestContact: (callback?: (sent: boolean) => void) => void;
  ready: () => void;
  expand: () => void;
  close: () => void;
  SettingsButton: {
    isVisible: boolean;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    setParams: (params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }) => void;
  };
  BackButton: {
    isVisible: boolean;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  CloudStorage: {
    getItem: (key: string, callback: (error: string | null, value?: string) => void) => void;
    getItems: (keys: string[], callback: (error: string | null, values?: Record<string, string>) => void) => void;
    getKeys: (callback: (error: string | null, keys?: string[]) => void) => void;
    setItem: (key: string, value: string, callback?: (error: string | null, success?: boolean) => void) => void;
    removeItem: (key: string, callback?: (error: string | null, success?: boolean) => void) => void;
    removeItems: (keys: string[], callback?: (error: string | null, success?: boolean) => void) => void;
  };
}

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  allows_write_to_pm?: boolean;
}

interface TelegramContextType {
  isInTelegram: boolean;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  telegramUser: TelegramUser | null;
  telegramInitData: string | null;
  webApp: WebApp | null;
  colorScheme: 'light' | 'dark';
  themeParams: WebApp['themeParams'];
  hapticFeedback: WebApp['HapticFeedback'] | null;
  mainButton: WebApp['MainButton'] | null;
  backButton: WebApp['BackButton'] | null;
  settingsButton: WebApp['SettingsButton'] | null;
  cloudStorage: WebApp['CloudStorage'] | null;
  // Actions
  showAlert: (message: string) => void;
  showConfirm: (message: string) => Promise<boolean>;
  requestWriteAccess: () => Promise<boolean>;
  shareToInline: (query: string, chatTypes?: string[]) => void;
  openLink: (url: string) => void;
  // Auth callback — called by AuthContext after successful token auth
  onAuthenticated: () => void;
}

const TelegramContext = createContext<TelegramContextType | null>(null);

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [webApp, setWebApp] = useState<WebApp | null>(null);
  const [isInTelegram, setIsInTelegram] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [telegramInitData, setTelegramInitData] = useState<string | null>(null);
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('dark');
  const [themeParams, setThemeParams] = useState<WebApp['themeParams']>({});
  const [hapticFeedback, setHapticFeedback] = useState<WebApp['HapticFeedback'] | null>(null);
  const [mainButton, setMainButton] = useState<WebApp['MainButton'] | null>(null);
  const [backButton, setBackButton] = useState<WebApp['BackButton'] | null>(null);
  const [settingsButton, setSettingsButton] = useState<WebApp['SettingsButton'] | null>(null);
  const [cloudStorage, setCloudStorage] = useState<WebApp['CloudStorage'] | null>(null);

  // ─── Initialize Telegram WebApp ──────────────────────────────
  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (!tg) {
      // Not running in Telegram — that's fine, app works as normal web app
      setIsLoading(false);
      setIsInTelegram(false);
      return;
    }

    try {
      // Check we have user data
      if (!tg.initDataUnsafe?.user) {
        console.warn('[Telegram] No user data in initDataUnsafe');
        setIsLoading(false);
        setIsInTelegram(false);
        return;
      }

      // Expand to full height
      tg.expand();

      // Mark as ready (required by Telegram)
      tg.ready();

      // Store references
      setWebApp(tg);
      setIsInTelegram(true);
      setTelegramUser(tg.initDataUnsafe.user);
      setTelegramInitData(tg.initData);
      setColorScheme(tg.colorScheme);
      setThemeParams(tg.themeParams);
      setHapticFeedback(tg.HapticFeedback);
      setMainButton(tg.MainButton);
      setBackButton(tg.BackButton);
      setSettingsButton(tg.SettingsButton);
      setCloudStorage(tg.CloudStorage);

      // Auto-login if not already authenticated
      const token = localStorage.getItem('token');
      if (!token && tg.initData) {
        setIsLoading(true);
        api.auth.telegramLogin(tg.initData)
          .then((data: any) => {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            setError(null);
            // Trigger a custom event so AuthContext picks up the new token
            window.dispatchEvent(new CustomEvent('telegram-authenticated', {
              detail: { token: data.token, user: data.user }
            }));
          })
          .catch((err: any) => {
            console.error('[Telegram] Auto-login failed:', err);
            setError(err.error || 'Telegram login failed');
          })
          .finally(() => {
            setIsLoading(false);
          });
      } else {
        setIsLoading(false);
      }

      // Listen for theme changes
      tg.onEvent('themeChanged', () => {
        setColorScheme(tg.colorScheme);
        setThemeParams(tg.themeParams);
      });

      setIsReady(true);
    } catch (err: any) {
      console.error('[Telegram] Initialization error:', err);
      setError(err.message || 'Telegram WebApp initialization failed');
      setIsLoading(false);
    }
  }, []);

  // ─── Auth callback — called after token refresh ─────────────
  const onAuthenticated = useCallback(() => {
    // Could refresh Telegram user data here if needed
  }, []);

  // ─── Helper methods ──────────────────────────────────────────
  const showAlert = useCallback((message: string) => {
    if (webApp) {
      webApp.showAlert(message);
    } else {
      alert(message);
    }
  }, [webApp]);

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (webApp) {
        webApp.showConfirm(message, resolve);
      } else {
        resolve(confirm(message));
      }
    });
  }, [webApp]);

  const requestWriteAccess = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (webApp) {
        webApp.requestWriteAccess(resolve);
      } else {
        resolve(false);
      }
    });
  }, [webApp]);

  const shareToInline = useCallback((query: string, chatTypes?: string[]) => {
    if (webApp) {
      webApp.switchInlineQuery(query, chatTypes);
    }
  }, [webApp]);

  const openLink = useCallback((url: string) => {
    if (webApp) {
      webApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  }, [webApp]);

  return (
    <TelegramContext.Provider value={{
      isInTelegram,
      isReady,
      isLoading,
      error,
      telegramUser,
      telegramInitData,
      webApp,
      colorScheme,
      themeParams,
      hapticFeedback,
      mainButton,
      backButton,
      settingsButton,
      cloudStorage,
      showAlert,
      showConfirm,
      requestWriteAccess,
      shareToInline,
      openLink,
      onAuthenticated,
    }}>
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegram() {
  const context = useContext(TelegramContext);
  if (!context) {
    throw new Error('useTelegram must be used within a TelegramProvider');
  }
  return context;
}

export default TelegramContext;
