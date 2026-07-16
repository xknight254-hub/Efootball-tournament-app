/**
 * Agent API Client — the ONLY way agents communicate with the backend.
 *
 * Every agent action becomes an authenticated HTTP call to the Express
 * API. No direct DB access. No Baileys access. Everything goes through
 * the backend's REST API.
 */
import { whatsappConfig } from '../config.js';

const API_BASE = `http://127.0.0.1:${process.env.PORT || '3002'}/api`;

interface ApiOptions {
  method?: string;
  body?: any;
  token: string;
  timeout?: number;
}

async function api(path: string, opts: ApiOptions): Promise<any> {
  const { method = 'GET', body, token, timeout = 10000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Agent-Action': 'true',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Agent Action Endpoints ────────────────────────────────────

export const agentApi = (token: string) => ({
  // Tournament Operations
  advanceTournament: (id: number) =>
    api(`/admin/agent/tournaments/${id}/advance`, { method: 'POST', token }),

  closeTournament: (id: number) =>
    api(`/admin/agent/tournaments/${id}/close`, { method: 'POST', token }),

  createFixtures: (id: number) =>
    api(`/admin/agent/tournaments/${id}/fixtures`, { method: 'POST', token }),

  generateBracket: (id: number) =>
    api(`/admin/agent/tournaments/${id}/bracket`, { method: 'POST', token }),

  // Match Operations
  awardWalkover: (matchId: number, winnerId: number) =>
    api(`/admin/agent/matches/${matchId}/walkover`, { method: 'POST', token, body: { winnerId } }),

  rescheduleMatch: (matchId: number, scheduledTime: string) =>
    api(`/admin/agent/matches/${matchId}/reschedule`, { method: 'POST', token, body: { scheduledTime } }),

  // Result Validation
  approveResult: (submissionId: number, winnerId: number, p1Score: number, p2Score: number) =>
    api(`/admin/agent/results/${submissionId}/approve`, { method: 'POST', token, body: { winnerId, player1Score: p1Score, player2Score: p2Score } }),

  rejectResult: (submissionId: number, reason: string) =>
    api(`/admin/agent/results/${submissionId}/reject`, { method: 'POST', token, body: { reason } }),

  // Payment Operations
  verifyPayment: (paymentId: number) =>
    api(`/admin/agent/payments/${paymentId}/verify`, { method: 'POST', token, body: { note: 'Auto-verified by Finance Agent' } }),

  flagPayment: (paymentId: number, reason: string) =>
    api(`/admin/agent/payments/${paymentId}/flag`, { method: 'POST', token, body: { reason } }),

  // Player Moderation
  warnPlayer: (userId: number, reason: string) =>
    api(`/admin/agent/players/${userId}/warn`, { method: 'POST', token, body: { reason } }),

  mutePlayer: (userId: number, hours: number) =>
    api(`/admin/agent/players/${userId}/mute`, { method: 'POST', token, body: { hours } }),

  banPlayer: (userId: number, reason: string) =>
    api(`/admin/agent/players/${userId}/ban`, { method: 'POST', token, body: { reason } }),

  // Messaging
  sendMessage: (jid: string, text: string) =>
    api(`/admin/agent/send-message`, { method: 'POST', token, body: { jid, text } }),

  sendBroadcast: (text: string) =>
    api(`/admin/agent/broadcast`, { method: 'POST', token, body: { text } }),

  publishStatus: (text: string) =>
    api(`/admin/agent/status`, { method: 'POST', token, body: { text } }),

  // Reminders
  sendReminder: (matchId: number) =>
    api(`/admin/agent/reminders/send`, { method: 'POST', token, body: { matchId } }),

  // Analytics
  generateReport: (type: string) =>
    api(`/admin/agent/reports/${type}`, { method: 'POST', token }),

  // Coach
  getPlayerStats: (userId: number) =>
    api(`/players/${userId}/stats`, { method: 'GET', token }),

  // Health
  reportHealth: (health: Record<string, any>) =>
    api(`/admin/agent/health`, { method: 'POST', token, body: health }),
});

/** Generate a unique idempotency key for an action. */
export function actionId(agentId: string, type: string, ...parts: (string | number)[]): string {
  return `${agentId}/${type}/${parts.join('/')}/${Date.now()}`;
}
