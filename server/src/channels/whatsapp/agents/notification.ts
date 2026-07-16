import type { AgentAction, AgentHealth } from './agentTypes.js';
import type { AgentContext } from './agentTypes.js';
import { actionId, agentApi } from './agentApi.js';
import db from '../../../db.js';

const ID = 'notification';

export class NotificationAgent {
  id = ID;
  version = '1.0.0';
  private token: string;
  private startTime = Date.now();
  private health_: AgentHealth = { agentId: ID, status: 'online', lastTick: null, lastError: null, tasksCompleted: 0, tasksFailed: 0, queueLength: 0, uptimeSeconds: 0, version: '1.0.0' };
  private seen = new Set<string>();
  private lastPrune = 0;

  constructor(cfg: { token: string }) { this.token = cfg.token; }

  async evaluate(ctx: AgentContext): Promise<AgentAction[]> {
    const a: AgentAction[] = [];
    const { now } = ctx;
    if (now.getTime() - this.lastPrune > 60_000) { this.seen.clear(); this.lastPrune = now.getTime(); }
    const n = (d?: Date) => (d||now).toISOString().replace('T', ' ').replace(/\.\d{3}Z/, '');
    const add = (ms: number) => n(new Date(now.getTime()+ms));
    try {
      // 1) Match reminders ~30min before deadline
      for (const m of db.prepare(`SELECT m.id, m.player1_id, m.player2_id, m.deadline_at FROM matches m WHERE m.status='pending' AND m.deadline_at IS NOT NULL AND datetime(m.deadline_at) BETWEEN datetime(?) AND datetime(?)`).all(n(), add(10800000)) as any[]) {
        const d = Math.round((new Date(m.deadline_at).getTime()-now.getTime())/60000);
        if (d < 20 || d > 45) continue;
        for (const p of [m.player1_id, m.player2_id]) {
          if (!p) continue;
          const k = `r/${m.id}/${p}`;
          if (this.seen.has(k)) continue;
          this.seen.add(k);
          a.push({ id: actionId(ID,'send_reminder',m.id,p), agentId: ID, type: 'send_reminder', params: { matchId: m.id, userId: p }, priority: 'high', description: `Remind player ${p} for match #${m.id} (${d}min)`, requiresConfirmation: false });
        }
      }
      // 2) Payment reminders — registered, unpaid, joined >1h ago
      for (const p of db.prepare(`SELECT p.user_id, p.tournament_id, t.name, t.entry_fee FROM participants p JOIN tournaments t ON t.id=p.tournament_id WHERE p.status='registered' AND t.status='registration_open' AND NOT EXISTS(SELECT 1 FROM tournament_payments tp WHERE tp.user_id=p.user_id AND tp.tournament_id=p.tournament_id AND tp.status='completed') AND p.joined_at<datetime(?,'-1 hours')`).all(n()) as any[]) {
        const k = `pmt/${p.tournament_id}/${p.user_id}`;
        if (this.seen.has(k)) continue; this.seen.add(k);
        a.push({ id: actionId(ID,'send_message','pay',p.user_id), agentId: ID, type: 'send_message', params: { userId: p.user_id, text: `💳 *Payment Reminder*\n\nYou registered for *${p.name}* but haven't paid yet${p.entry_fee?` (KSh ${p.entry_fee})`:''}.\nPay now to secure your spot!` }, priority: 'normal', description: `Payment reminder for user ${p.user_id}`, requiresConfirmation: false });
      }
      // 3) Broadcast tournament openings (created in last 6h)
      for (const t of db.prepare(`SELECT id, name, format, max_players, entry_fee, registration_deadline FROM tournaments WHERE status='registration_open' AND created_at>datetime(?,'-6 hours')`).all(n()) as any[]) {
        const k = `bcast/${t.id}`; if (this.seen.has(k)) continue; this.seen.add(k);
        const dl = t.registration_deadline ? `\n⏰ Register before: ${new Date(t.registration_deadline).toLocaleDateString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}` : '';
        a.push({ id: actionId(ID,'send_broadcast',t.id), agentId: ID, type: 'send_broadcast', params: { text: `🏆 *New Tournament Open!*\n\n*${t.name}*\nFormat: ${t.format} | Max: ${t.max_players} players${t.entry_fee?`\nEntry: KSh ${t.entry_fee}`:'\nFree entry'}${dl}\n\nType *join ${t.id}* to register!` }, priority: 'normal', description: `Broadcast opening of "${t.name}"`, requiresConfirmation: false });
      }
      // 4) Winner congratulations (completed in last hour)
      for (const t of db.prepare(`SELECT t.id, t.name, t.winner_id, u.username FROM tournaments t LEFT JOIN users u ON u.id=t.winner_id WHERE t.status='completed' AND t.winner_id IS NOT NULL AND t.created_at<datetime(?,'-1 hour') AND t.created_at>datetime(?,'-2 hours')`).all(n(),n()) as any[]) {
        const k = `win/${t.id}`; if (this.seen.has(k)) continue; this.seen.add(k);
        a.push({ id: actionId(ID,'send_message','win',t.winner_id), agentId: ID, type: 'send_message', params: { userId: t.winner_id, text: `🎉 *Congratulations ${t.username||'Champion'}!*\n\nYou won *${t.name}*! 🏆\n\nKeep an eye out for more tournaments to defend your title!` }, priority: 'high', description: `Congratulate winner of "${t.name}"`, requiresConfirmation: false });
      }
      // 5) Daily status summary (published <12h ago?)
      if (!db.prepare(`SELECT 1 FROM admin_logs WHERE action='agent_status_summary' AND created_at>datetime(?,'-12 hours') LIMIT 1`).get(n())) {
        const rows = db.prepare(`SELECT status, COUNT(*) AS c FROM tournaments GROUP BY status`).all() as any[];
        const map: Record<string,number> = {};
        for (const r of rows) map[r.status] = r.c;
        const total = (db.prepare(`SELECT COUNT(DISTINCT user_id) AS c FROM participants`).get() as any)?.c || 0;
        a.push({ id: actionId(ID,'publish_status','daily'), agentId: ID, type: 'publish_status', params: { text: `📊 *TOSS Daily Status*\n\n${Object.entries(map).map(([s,c])=>`• ${s.replace(/_/g,' ')}: ${c}`).join('\n')}\n\n👥 Total players: ${total}` }, priority: 'low', description: 'Daily tournament status summary', requiresConfirmation: false });
      }
    } catch (err: any) { this.health_.lastError = err.message; this.health_.status = 'error'; }
    this.health_.lastTick = now.toISOString();
    this.health_.queueLength = a.length;
    this.health_.uptimeSeconds = Math.floor((Date.now()-this.startTime)/1000);
    return a;
  }

  async execute(act: AgentAction): Promise<{ ok: boolean; error?: string }> {
    try {
      const api = agentApi(this.token);
      switch (act.type) {
        case 'send_reminder': await api.sendReminder(act.params.matchId); break;
        case 'send_message': {
          const u = db.prepare(`SELECT phone FROM users WHERE id=?`).get(act.params.userId) as any;
          if (!u?.phone) return { ok: false, error: 'No phone' };
          await api.sendMessage(`${u.phone}@s.whatsapp.net`, act.params.text);
          break;
        }
        case 'send_broadcast': await api.sendBroadcast(act.params.text); break;
        case 'publish_status': {
          await api.publishStatus(act.params.text);
          db.prepare(`INSERT INTO admin_logs(admin_id,action,details,created_at) VALUES('agent:notification','agent_status_summary',?,CURRENT_TIMESTAMP)`).run(JSON.stringify(act.params));
          break;
        }
        default: return { ok: false, error: `Unknown ${act.type}` };
      }
      this.health_.tasksCompleted++;
      return { ok: true };
    } catch (err: any) { this.health_.tasksFailed++; this.health_.lastError = err.message; return { ok: false, error: err.message }; }
  }

  health(): AgentHealth { this.health_.uptimeSeconds = Math.floor((Date.now()-this.startTime)/1000); return {...this.health_}; }
}
