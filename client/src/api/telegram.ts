// Telegram WebApp integration
// https://core.telegram.org/bots/webapps

// Global Window.Telegram declaration is in TelegramContext.tsx

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

let tgReady = false;

export function initTelegram(): boolean {
  const tg = window.Telegram?.WebApp;
  if (!tg) return false;

  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0A0A0A');
    tg.setBackgroundColor('#0A0A0A');
    tg.disableClosingConfirmation();
    tgReady = true;
    return true;
  } catch (e) {
    console.warn('[TG] Init failed:', e);
    return false;
  }
}

export function isTelegramWebApp(): boolean {
  return tgReady && !!window.Telegram?.WebApp?.initDataUnsafe?.user;
}

export function getTgUser(): TgUser | null {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (!u) return null;
  return {
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name,
    username: u.username,
    photo_url: u.photo_url,
    language_code: u.language_code,
  };
}

export function getTgInitData(): string {
  return window.Telegram?.WebApp?.initData || '';
}

export function getTgTheme(): 'light' | 'dark' {
  return window.Telegram?.WebApp?.colorScheme || 'dark';
}

export function tgExpand(): void {
  window.Telegram?.WebApp?.expand();
}

export function tgReady_(): void {
  window.Telegram?.WebApp?.ready();
}

export function tgShowAlert(msg: string): void {
  window.Telegram?.WebApp?.showAlert(msg);
}

export function tgHaptic(style: 'light' | 'medium' | 'heavy' = 'medium'): void {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

export function tgBackButton(show: boolean, onClick?: () => void): void {
  const btn = window.Telegram?.WebApp?.BackButton;
  if (!btn) return;
  if (show) {
    if (onClick) btn.onClick(onClick);
    btn.show();
  } else {
    btn.hide();
  }
}

export function tgMainButton(text: string, onClick: () => void): void {
  const btn = window.Telegram?.WebApp?.MainButton;
  if (!btn) return;
  btn.setText(text);
  btn.onClick(onClick);
  btn.show();
}

export function tgMainButtonHide(): void {
  window.Telegram?.WebApp?.MainButton?.hide();
}

export function tgOpenLink(url: string): void {
  window.Telegram?.WebApp?.openLink(url);
}
