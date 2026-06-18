const API_URL = import.meta.env.VITE_API_URL || '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

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

export interface Tournament {
  id: number;
  name: string;
  description?: string;
  imageUrl?: string;
  platform: string;
  format: 'knockout' | 'league' | 'multi_bracket' | 'swiss';
  maxPlayers: number;
  bestOf: number;
  status: string;
  prizePool?: string;
  registrationDeadline?: string;
  resultDeadlineHours?: number;
  rules?: string;
  groupCount?: number;
  bracketType?: string;
  ownerId: number;
  winnerId?: number;
  participantCount: number;
  createdAt: string;
}

export interface Match {
  id: number;
  tournamentId: number;
  round: number;
  matchNumber: number;
  player1: { id: number; username: string } | null;
  player2: { id: number; username: string } | null;
  player1Score: number | null;
  player2Score: number | null;
  winner: { id: number; username: string } | null;
  status: string;
  confirmationStatus: string;
  submittedBy?: { id: number; username: string };
  submittedAt?: string;
  confirmedAt?: string;
  screenshotUrl?: string;
  createdAt: string;
}

export interface Participant {
  id: number;
  userId: number;
  username: string;
  status: string;
  seed?: number;
  joinedAt: string;
}

export const api = {
  auth: {
    register: async (data: { username: string; email: string; password: string; firstName?: string; lastName?: string }) => {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    login: async (data: { username: string; password: string }) => {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    logout: async () => {
      const res = await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) throw await res.json();
      localStorage.removeItem('token');
      return res.json();
    },
    me: async () => {
      const res = await fetch(`${API_URL}/auth/me`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    telegramLogin: async (initData: string) => {
      const res = await fetch(`${API_URL}/auth/telegram-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    linkTelegram: async (initData: string) => {
      const res = await fetch(`${API_URL}/auth/link-telegram`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ initData }),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    unlinkTelegram: async () => {
      const res = await fetch(`${API_URL}/auth/unlink-telegram`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
  },

  tournaments: {
    list: async (params?: { status?: string; platform?: string; search?: string; limit?: number; offset?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.platform) searchParams.set('platform', params.platform);
      if (params?.search) searchParams.set('search', params.search);
      if (params?.limit) searchParams.set('limit', String(params.limit));
      if (params?.offset) searchParams.set('offset', String(params.offset));
      
      const res = await fetch(`${API_URL}/tournaments?${searchParams}`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    get: async (id: number) => {
      const res = await fetch(`${API_URL}/tournaments/${id}`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    create: async (data: Partial<Tournament>) => {
      const res = await fetch(`${API_URL}/tournaments`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    update: async (id: number, data: Partial<Tournament>) => {
      const res = await fetch(`${API_URL}/tournaments/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    delete: async (id: number) => {
      const res = await fetch(`${API_URL}/tournaments/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    join: async (tournamentId: number) => {
      const res = await fetch(`${API_URL}/tournaments/${tournamentId}/join`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    participants: async (tournamentId: number) => {
      const res = await fetch(`${API_URL}/tournaments/${tournamentId}/participants`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    standings: async (tournamentId: number) => {
      const res = await fetch(`${API_URL}/tournaments/${tournamentId}/standings`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    getByToken: async (token: string) => {
      const res = await fetch(`${API_URL}/tournaments/by-token/${encodeURIComponent(token)}`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    joinByToken: async (token: string, phoneNumber: string) => {
      const res = await fetch(`${API_URL}/tournaments/by-token/${encodeURIComponent(token)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
  },

  matches: {
    list: async (tournamentId: number) => {
      const res = await fetch(`${API_URL}/matches/tournament/${tournamentId}`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    get: async (id: number) => {
      const res = await fetch(`${API_URL}/matches/${id}`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    submitResult: async (id: number, data: { player1Score: number; player2Score: number; screenshotUrl?: string }) => {
      const res = await fetch(`${API_URL}/matches/${id}/result`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    confirm: async (id: number) => {
      const res = await fetch(`${API_URL}/matches/${id}/confirm`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    dispute: async (id: number) => {
      const res = await fetch(`${API_URL}/matches/${id}/dispute`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
  },

  ocr: {
    /** Upload a screenshot for OCR processing */
    analyze: async (file: File) => {
      const formData = new FormData();
      formData.append('screenshot', file);
      const token = getToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/matches/ocr`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    /** Auto-submit result from OCR (one-tap after confirming OCR data) */
    autoSubmit: async (matchId: number, player1Score: number, player2Score: number, screenshotBase64?: string) => {
      const res = await fetch(`${API_URL}/matches/ocr/submit`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ matchId, player1Score, player2Score, screenshotBase64 }),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
  },

  users: {
    get: async (id: number) => {
      const res = await fetch(`${API_URL}/auth/users/${id}`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
  },

  images: {
    listTournamentImages: async (): Promise<{ images: { filename: string; url: string }[] }> => {
      const res = await fetch(`${API_URL}/images/tournament-images`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    upload: async (file: File): Promise<{ url: string }> => {
      const formData = new FormData();
      formData.append('image', file);
      const token = getToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/images/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    uploadAvatar: async (file: File): Promise<{ url: string }> => {
      const formData = new FormData();
      formData.append('avatar', file);
      const token = getToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/images/avatar`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
  },

  admin: {
    generateCodes: async (count: number = 1, length: number = 6, note: string = '') => {
      const res = await fetch(`${API_URL}/admin/codes/generate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ count, length, note }),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    listCodes: async () => {
      const res = await fetch(`${API_URL}/admin/codes`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    revokeCode: async (codeId: number) => {
      const res = await fetch(`${API_URL}/admin/codes/${codeId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },
  },

  redeemCode: async (code: string) => {
    const res = await fetch(`${API_URL}/auth/redeem-code`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  },

  wagers: {
    create: async (stakeAmount: number, phoneNumber: string) => {
      const res = await fetch(`${API_URL}/wagers`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ stakeAmount, phoneNumber }),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },

    list: async (params?: { minStake?: number; maxStake?: number; limit?: number; offset?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.minStake) searchParams.set('minStake', String(params.minStake));
      if (params?.maxStake) searchParams.set('maxStake', String(params.maxStake));
      if (params?.limit) searchParams.set('limit', String(params.limit));
      if (params?.offset) searchParams.set('offset', String(params.offset));
      const res = await fetch(`${API_URL}/wagers?${searchParams}`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },

    get: async (id: number) => {
      const res = await fetch(`${API_URL}/wagers/${id}`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },

    getByCode: async (matchCode: string) => {
      const res = await fetch(`${API_URL}/wagers/by-code/${encodeURIComponent(matchCode)}`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },

    accept: async (id: number, phoneNumber: string) => {
      const res = await fetch(`${API_URL}/wagers/${id}/accept`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ phoneNumber }),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },

    confirm: async (id: number, winner: 'creator' | 'challenger') => {
      const res = await fetch(`${API_URL}/wagers/${id}/confirm`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ winner }),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },

    dispute: async (id: number, reason: string) => {
      const res = await fetch(`${API_URL}/wagers/${id}/dispute`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },

    cancel: async (id: number) => {
      const res = await fetch(`${API_URL}/wagers/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) throw await res.json();
      return res.json();
    },

    myWagers: async () => {
      const res = await fetch(`${API_URL}/wagers/my`, { headers: getHeaders() });
      if (!res.ok) throw await res.json();
      return res.json();
    },
  },
};

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getCurrentUser(): User | null {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

export function setAuth(token: string, user: User): void {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}