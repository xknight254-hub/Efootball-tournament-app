import type { AgentAction, AgentHealth } from './agentTypes.js';
import type { AgentContext } from './agentTypes.js';
import { actionId, agentApi } from './agentApi.js';
import db from '../../../db.js';
import type { Campaign } from '../../../modules/marketing/types/index.js';
import { renderCampaign, closeRenderer } from '../../../modules/marketing/services/renderService.js';
import { sendAdminStatus } from '../bot.js';

const ID = 'marketing';

export class MarketingAgent {
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
    try {
      // 1) Countdown for upcoming tournaments (deadline within 3 days)
      for (const t of db.prepare(`SELECT id, name, registration_deadline, format, entry_fee, max_players, (SELECT COUNT(*) FROM participants WHERE tournament_id=t.id) AS pc FROM tournaments t WHERE status='registration_open' AND registration_deadline IS NOT NULL AND datetime(registration_deadline) BETWEEN datetime(?) AND datetime(?,'+3 days') ORDER BY registration_deadline ASC`).all(n(),n()) as any[]) {
        const k = `cd/${t.id}`; if (this.seen.has(k)) continue; this.seen.add(k);
        const rem = Math.ceil((new Date(t.registration_deadline).getTime()-now.getTime())/86400000);
        const slots = t.max_players - (t.pc||0);
        a.push({ id: actionId(ID,'publish_status','cd',t.id), agentId: ID, type: 'publish_status', params: { text: `⏳ *${rem===1?'Last Day!':`${rem} Days Left`}*\n\n*${t.name}*\n📅 ${new Date(t.registration_deadline).toLocaleDateString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}${t.entry_fee?`\n💵 KSh ${t.entry_fee}`:''}\n🎯 ${slots>0?`${slots} slot${slots===1?'':'s'} left`:'Full'}\n\nJoin with *join ${t.id}*`, campaign: { template: 'tournament-announcement', title: t.name, subtitle: `${slots>0?`${slots} slots left`:'Full'} · ${t.format}`, prize: t.entry_fee?`KSh ${t.entry_fee}`:'Free', date: new Date(t.registration_deadline).toLocaleDateString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}), registrationDeadline: new Date(t.registration_deadline).toLocaleDateString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}), cta: 'Register Now', tournamentCode: `TOSS-${t.id}`, accent: 'gold' } }, priority: 'normal', description: `Countdown for "${t.name}" (${rem}d, ${slots} slots)`, requiresConfirmation: false });
      }
      // 2) Winner announcements (completed in last 24h)
      for (const w of db.prepare(`SELECT t.id, t.name, t.prize_pool, u.username, (SELECT COUNT(*) FROM participants WHERE tournament_id=t.id) AS tp FROM tournaments t LEFT JOIN users u ON u.id=t.winner_id WHERE t.status='completed' AND t.winner_id IS NOT NULL AND t.created_at>datetime(?,'-24 hours')`).all(n()) as any[]) {
        const k = `win/${w.id}`; if (this.seen.has(k)) continue; this.seen.add(k);
        a.push({ id: actionId(ID,'publish_status','wa',w.id), agentId: ID, type: 'publish_status', params: { text: `🏆 *Tournament Champion!*\n\n*${w.name}* concluded!\n👑 Winner: *${w.username||'Unknown'}*\n👥 ${w.tp||0} players${w.prize_pool?`\n💰 ${w.prize_pool}`:''}\n\nCongratulations! 🎉`, campaign: { template: 'champion', title: w.name, subtitle: w.username||'Unknown', prize: w.prize_pool?`KSh ${w.prize_pool}`:'—', players: `${w.tp||0}`, accent: 'gold', featuredPlayer: { name: w.username||'Unknown' } } }, priority: 'normal', description: `Announce winner "${w.name}"`, requiresConfirmation: false });
      }
      // 3) Weekly recap (once per 7 days)
      if (!db.prepare(`SELECT 1 FROM admin_logs WHERE action='agent_weekly_recap' AND created_at>datetime(?,'-6 days') LIMIT 1`).get(n())) {
        const wAgo = n(new Date(now.getTime()-7*86400000));
        const s = db.prepare(`SELECT (SELECT COUNT(*) FROM tournaments WHERE created_at>?) AS t, (SELECT COUNT(*) FROM participants WHERE joined_at>?) AS p, COALESCE((SELECT SUM(amount) FROM tournament_payments WHERE created_at>? AND status='completed'),0) AS pr, (SELECT COUNT(*) FROM matches WHERE created_at>? AND winner_id IS NOT NULL) AS m`).get(wAgo,wAgo,wAgo,wAgo) as any;
        a.push({ id: actionId(ID,'publish_status','weekly'), agentId: ID, type: 'publish_status', params: { text: `📈 *TOSS Weekly Recap*\n\n🏟️ ${s.t||0} tournament${(s.t||0)!==1?'s':''}\n👥 ${s.p||0} player${(s.p||0)!==1?'s':''}\n⚔️ ${s.m||0} matche${(s.m||0)!==1?'s':''}\n💰 KSh ${(s.pr||0).toLocaleString()}\n\nStay sharp! 🔥`, campaign: { template: 'tournament-announcement', title: 'Weekly Recap', subtitle: `${(s.t||0)} tournaments · ${(s.p||0)} players`, prize: `KSh ${(s.pr||0).toLocaleString()}`, cta: 'Play Now', accent: 'gold' } }, priority: 'low', description: 'Weekly tournament recap', requiresConfirmation: false });
      }
      // 4) Status updates for in_progress/live tournaments
      for (const t of db.prepare(`SELECT t.id, t.name, t.format, t.status, (SELECT COUNT(*) FROM matches WHERE tournament_id=t.id AND status='pending') AS pm, (SELECT COUNT(*) FROM matches WHERE tournament_id=t.id AND winner_id IS NOT NULL) AS cm, (SELECT COUNT(*) FROM participants WHERE tournament_id=t.id) AS tp FROM tournaments t WHERE t.status IN ('in_progress','live')`).all() as any[]) {
        const k = `active/${t.id}`; if (this.seen.has(k)) continue; this.seen.add(k);
        const pct = (t.cm+t.pm)>0 ? Math.round(t.cm/(t.cm+t.pm)*100) : 0;
        a.push({ id: actionId(ID,'publish_status','act',t.id), agentId: ID, type: 'publish_status', params: { text: `⚡ *${t.name}* — ${t.status==='live'?'🔴 LIVE':'In Progress'}\n\n📊 ${pct}% done (${t.cm||0}/${(t.cm||0)+(t.pm||0)})\n👥 ${t.tp||0} players\n\nFollow results in the menu!`, campaign: { template: 'live-now', title: t.name, subtitle: t.status==='live'?'LIVE NOW':'In Progress', teamA: 'Team A', teamB: 'Team B', countdown: `${pct}% complete`, accent: 'live' } }, priority: 'low', description: `Status for "${t.name}"`, requiresConfirmation: false });
      }
      // 5) Re-engagement for players inactive >5 days
      const cutoff = n(new Date(now.getTime()-5*86400000));
      for (const u of db.prepare(`SELECT DISTINCT u.id, u.username, u.phone FROM users u WHERE u.is_banned=0 AND u.phone IS NOT NULL AND u.created_at<? AND NOT EXISTS(SELECT 1 FROM matches m WHERE (m.player1_id=u.id OR m.player2_id=u.id) AND m.created_at>?) AND NOT EXISTS(SELECT 1 FROM participants p WHERE p.user_id=u.id AND p.joined_at>?) AND NOT EXISTS(SELECT 1 FROM tournament_payments tp WHERE tp.user_id=u.id AND tp.created_at>?) LIMIT 20`).all(cutoff,cutoff,cutoff,cutoff) as any[]) {
        const k = `eng/${u.id}`; if (this.seen.has(k)) continue; this.seen.add(k);
        const cnt = (db.prepare(`SELECT COUNT(*) AS c FROM tournaments WHERE status='registration_open'`).get() as any)?.c||0;
        a.push({ id: actionId(ID,'send_message','eng',u.id), agentId: ID, type: 'send_message', params: { userId: u.id, text: `👋 Hey ${u.username||'there'}! We've missed you!\n\n${cnt>0?`There ${cnt===1?'is':'are'} *${cnt}* tournament${cnt===1?'':'s'} open!`:'New tournaments coming soon.'}\n\nType *tournaments* to jump back in! 🔥` }, priority: 'low', description: `Re-engage user ${u.id}`, requiresConfirmation: false });
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
        case 'send_message': {
          const u = db.prepare(`SELECT phone FROM users WHERE id=?`).get(act.params.userId) as any;
          if (!u?.phone) return { ok: false, error: 'No phone' };
          await api.sendMessage(`${u.phone}@s.whatsapp.net`, act.params.text);
          break;
        }
        case 'send_broadcast': await api.sendBroadcast(act.params.text); break;
        case 'publish_status': {
          // The agent emits a Campaign JSON (template + copy). The renderer
          // owns all design. If no campaign, fall back to text-only status.
          let imageUrl: string | undefined;
          const camp = act.params.campaign as Campaign | undefined;
          if (camp && camp.template) {
            try {
              const r = await renderCampaign(camp);
              imageUrl = r.url;
            } catch (e: any) {
              console.error('[marketing] render failed, text-only:', e?.message);
            }
          }
          await sendAdminStatus(
            { text: act.params.text, image: imageUrl ? { url: imageUrl } : undefined },
            act.params.jidList ? { jidList: act.params.jidList } : undefined
          );
          if (act.params.text?.includes('Weekly Recap'))
            db.prepare(`INSERT INTO admin_logs(admin_id,action,details,created_at) VALUES('agent:marketing','agent_weekly_recap',?,CURRENT_TIMESTAMP)`).run(JSON.stringify(act.params));
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
