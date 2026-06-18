import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Telegram WebApp SDK Types ─────────────────────────────────

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  allows_write_to_pm?: boolean;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: TelegramUser;
    auth_date?: number;
    hash?: string;
    start_param?: string;
    chat_type?: string;
    chat_instance?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  isClosingConfirmationEnabled: boolean;
  BackButton: { isVisible: boolean; show: () => void; hide: () => void; onClick: (cb: () => void) => void };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    setText: (text: string) => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  sendData: (data: string) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink: (url: string) => void;
  showAlert: (message: string, cb?: () => void) => void;
  showConfirm: (message: string, cb?: (confirmed: boolean) => void) => void;
  showPopup: (params: { title?: string; message: string; buttons?: Array<{ id?: string; type?: string; text?: string }> }, cb?: (buttonId: string) => void) => void;
  CloudStorage: {
    getItem: (key: string, cb: (err: string | null, value?: string) => void) => void;
    setItem: (key: string, value: string, cb: (err: string | null, saved?: boolean) => void) => void;
    getKeys: (cb: (err: string | null, keys?: string[]) => void) => void;
    removeItem: (key: string, cb: (err: string | null, removed?: boolean) => void) => void;
  };
  EventTypes: Record<string, string>;
  onEvent: (eventType: string, callback: () => void) => void;
  offEvent: (eventType: string, callback: () => void) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export interface TelegramAuthState {
  isAvailable: boolean;
  isReady: boolean;
  user: TelegramUser | null;
  initData: string | null;
  startParam: string | null;
  platform: string;
  colorScheme: 'light' | 'dark';
}

// ─── Hook ──────────────────────────────────────────────────────

export function useTelegram() {
  const [state, setState] = useState<TelegramAuthState>({
    isAvailable: false,
    isReady: false,
    user: null,
    initData: null,
    startParam: null,
    platform: 'unknown',
    colorScheme: 'dark',
  });

  const webAppRef = useRef<TelegramWebApp | null>(null);

  useEffect(() => {
    // Try to load Telegram WebApp SDK
    const loadTelegramSDK = () => {
      // Already loaded
      if (window.Telegram?.WebApp) {
        const webApp = window.Telegram.WebApp;
        webAppRef.current = webApp;

        // Apply Telegram theme colors to CSS variables
        if (webApp.themeParams) {
          const root = document.documentElement;
          if (webApp.themeParams.bg_color) root.style.setProperty('--tg-bg-color', webApp.themeParams.bg_color);
          if (webApp.themeParams.text_color) root.style.setProperty('--tg-text-color', webApp.themeParams.text_color);
          if (webApp.themeParams.hint_color) root.style.setProperty('--tg-hint-color', webApp.themeParams.hint_color);
          if (webApp.themeParams.button_color) root.style.setProperty('--tg-button-color', webApp.themeParams.button_color);
          if (webApp.themeParams.button_text_color) root.style.setProperty('--tg-button-text-color', webApp.themeParams.button_text_color);
          if (webApp.themeParams.secondary_bg_color) root.style.setProperty('--tg-secondary-bg-color', webApp.themeParams.secondary_bg_color);
        }

        // Ready signal
        webApp.ready();
        webApp.expand();

        setState({
          isAvailable: true,
          isReady: true,
          user: webApp.initDataUnsafe.user || null,
          initData: webApp.initData || null,
          startParam: webApp.initDataUnsafe.start_param || null,
          platform: webApp.platform || 'unknown',
          colorScheme: webApp.colorScheme || 'dark',
        });

        return true;
      }

      // Check if running in Telegram via URL hash or user agent
      const isTelegramUA = /Telegram/i.test(navigator.userAgent);
      const hasTgWebAppStartParam = window.location.search.includes('tgWebAppStartParam');
      const hasTelegramInitData = window.location.hash.includes('tgWebAppData');

      if (isTelegramUA || hasTgWebAppStartParam || hasTelegramInitData) {
        // In Telegram but SDK not loaded yet — inject it
        injectTelegramSDK();
      }

      return false;
    };

    const injectTelegramSDK = () => {
      if (document.getElementById('telegram-webapp-sdk')) return;

      const script = document.createElement('script');
      script.id = 'telegram-webapp-sdk';
      script.src = 'https://telegram.org/js/telegram-webapp.js';
      script.async = true;
      script.onload = () => {
        // SDK loaded, re-check
        setTimeout(loadTelegramSDK, 100);
      };
      script.onerror = () => {
        console.error('[Telegram] Failed to load WebApp SDK');
        // Fallback: try to parse initData from URL
        parseInitDataFromURL();
      };
      document.head.appendChild(script);
    };

    const parseInitDataFromURL = () => {
      try {
        // Telegram passes initData as URL hash fragment
        const hash = window.location.hash.slice(1); // remove #
        const params = new URLSearchParams(hash);

        const tgData = params.get('tgWebAppData');
        if (tgData) {
          const dataParams = new URLSearchParams(tgData);
          const userJson = dataParams.get('user');
          const user = userJson ? JSON.parse(decodeURIComponent(userJson)) : null;

          setState({
            isAvailable: true,
            isReady: true,
            user,
            initData: tgData,
            startParam: dataParams.get('start_param') || null,
            platform: 'weba',
            colorScheme: 'dark',
          });
        }
      } catch (e) {
        console.error('[Telegram] Failed to parse initData from URL:', e);
      }
    };

    // Init immediately
    const loaded = loadTelegramSDK();

    // If not loaded, try again after a short delay (SDK might be blocked)
    if (!loaded) {
      const timeout = setTimeout(() => {
        if (!webAppRef.current) {
          parseInitDataFromURL();
        }
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, []);

  // Provide a manual login trigger
  const requestLogin = useCallback((): { initData: string | null; user: TelegramUser | null } => {
    if (webAppRef.current) {
      const wa = webAppRef.current;
      return {
        initData: wa.initData,
        user: wa.initDataUnsafe.user || null,
      };
    }
    return { initData: state.initData, user: state.user };
  }, [state.initData, state.user]);

  // Close the web app
  const closeApp = useCallback(() => {
    webAppRef.current?.close();
  }, []);

  // Send data back to the bot
  const sendDataToBot = useCallback((data: string) => {
    webAppRef.current?.sendData(data);
  }, []);

  // Open a Telegram link
  const openTelegramLink = useCallback((url: string) => {
    webAppRef.current?.openTelegramLink(url);
  }, []);

  // Open external link
  const openExternalLink = useCallback((url: string) => {
    webAppRef.current?.openLink(url, { try_instant_view: false });
  }, []);

  // Haptic feedback
  const hapticFeedback = useCallback((style: 'light' | 'medium' | 'heavy' = 'medium') => {
    webAppRef.current?.HapticFeedback?.impactOccurred(style);
  }, []);

  return {
    ...state,
    webApp: webAppRef.current,
    requestLogin,
    closeApp,
    sendDataToBot,
    openTelegramLink,
    openExternalLink,
    hapticFeedback,
  };
}

// ─── Helper: Check if running inside Telegram ──────────────────

export function isTelegramEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(
    window.Telegram?.WebApp?.initData ||
    /Telegram/i.test(navigator.userAgent) ||
    window.location.search.includes('tgWebAppStartParam') ||
    window.location.hash.includes('tgWebAppData')
  );
}
