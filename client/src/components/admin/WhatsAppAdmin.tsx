import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/Button';

const token = () => localStorage.getItem('token') || '';
  const auth = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

interface Settings {
  enabled: boolean;
  mpesaTill: string;
  aiEnabled: boolean;
  aiModel: string;
  broadcastGroupJid: string | null;
  hasApiKey: boolean;
  connectionState: string;
  modelOptions: string[];
  reminderEnabled: boolean;
  statusEnabled: boolean;
  reminderHours: number;
}

interface LowConf { id: number; details: string; payload: string; created_at: string; }
interface Payment {
  id: number; user_id: number; tournament_id: number; amount: number;
  receipt_code: string | null; till: string | null; status: string;
  source: string | null; verified_by: number | null; review_note: string | null;
  created_at: string; username: string | null; phone: string | null;
  tournament_name: string | null;
}
interface ResultReview {
  id: number; match_id: number; uploader_username: string | null;
  ocr_score_left: number | null; ocr_score_right: number | null;
  ocr_team_left: string | null; ocr_team_right: string | null;
  verification_status: string; verification_confidence: number | null;
  fraud_score: number | null; screenshot_url: string | null;
  created_at: string; player1_username: string | null; player2_username: string | null;
  player1_id: number | null; player2_id: number | null;
}

type Sub = 'gateway' | 'ai' | 'payments' | 'link' | 'results';

export function WhatsAppAdmin() {
  const [sub, setSub] = useState<Sub>('gateway');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Partial<Settings>>({});
  const [saved, setSaved] = useState('');

  const [lowconf, setLowconf] = useState<LowConf[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [resolving, setResolving] = useState<number | null>(null);

  const [results, setResults] = useState<ResultReview[]>([]);
  const [selectedResult, setSelectedResult] = useState<ResultReview | null>(null);
  const [resWinner, setResWinner] = useState<number | 0>(0);
  const [resS1, setResS1] = useState('');
  const [resS2, setResS2] = useState('');
  const [resMsg, setResMsg] = useState('');

  const [linkUserId, setLinkUserId] = useState('');
  const [linkToken, setLinkToken] = useState('');
  const [linkMsg, setLinkMsg] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/whatsapp/settings', { headers: auth() });
      if (r.ok) { const d = await r.json(); setSettings(d); setForm(d); }
    } catch {}
  }, []);

  const loadLowconf = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/whatsapp/lowconf', { headers: auth() });
      if (r.ok) { const d = await r.json(); setLowconf(d.items || []); }
    } catch {}
  }, []);

  const loadPayments = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/whatsapp/payments?status=pending', { headers: auth() });
      if (r.ok) { const d = await r.json(); setPayments(d.items || []); }
    } catch {}
  }, []);

  const loadResults = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/whatsapp/result-reviews', { headers: auth() });
      if (r.ok) { const d = await r.json(); setResults(d.items || []); }
    } catch {}
  }, []);

  const resolveResult = async (id: number) => {
    setResMsg('');
    try {
      const r = await fetch(`/api/admin/whatsapp/result-reviews/${id}/resolve`, {
        method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId: resWinner, player1Score: Number(resS1), player2Score: Number(resS2) }),
      });
      const d = await r.json();
      if (r.ok) { setSelectedResult(null); loadResults(); }
      else setResMsg(d.error || 'Failed');
    } catch { setResMsg('Network error'); }
  };

  useEffect(() => { if (sub === 'gateway') loadSettings(); }, [sub, loadSettings]);
  useEffect(() => { if (sub === 'ai') loadLowconf(); }, [sub, loadLowconf]);
  useEffect(() => { if (sub === 'payments') loadPayments(); }, [sub, loadPayments]);
  useEffect(() => { if (sub === 'results') loadResults(); }, [sub, loadResults]);

  const saveSettings = async () => {
    try {
      const r = await fetch('/api/admin/whatsapp/settings', {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (r.ok) { setSaved('Saved'); setSettings(await r.json()); setTimeout(() => setSaved(''), 2500); }
      else setSaved('Failed to save');
    } catch { setSaved('Network error'); }
  };

  const resolveLowconf = async (id: number) => {
    setResolving(id);
    try {
      await fetch(`/api/admin/whatsapp/lowconf/${id}/resolve`, { method: 'POST', headers: auth() });
      loadLowconf();
    } catch {} finally { setResolving(null); }
  };

  const verifyPayment = async (id: number) => {
    try {
      await fetch(`/api/admin/whatsapp/payments/${id}/verify`, {
        method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Verified by admin (WhatsApp-reported M-Pesa)' }),
      });
      loadPayments();
    } catch {}
  };

  const genLink = async () => {
    setLinkMsg(''); setLinkToken('');
    const uid = parseInt(linkUserId);
    if (!uid) { setLinkMsg('Enter a valid user ID'); return; }
    try {
      const r = await fetch('/api/admin/whatsapp/link-token', {
        method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid }),
      });
      const d = await r.json();
      if (r.ok) setLinkToken(d.token);
      else setLinkMsg(d.error || 'Failed');
    } catch { setLinkMsg('Network error'); }
  };

  const [statusText, setStatusText] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const publishStatus = async () => {
    setStatusMsg('');
    try {
      const r = await fetch('/api/admin/whatsapp/status', {
        method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: statusText }),
      });
      const d = await r.json();
      if (r.ok) { setStatusMsg('Published'); setStatusText(''); }
      else setStatusMsg(d.error || 'Failed');
    } catch { setStatusMsg('Network error'); }
  };

  const [reminderMsg, setReminderMsg] = useState('');
  const runReminders = async () => {
    setReminderMsg('');
    try {
      const r = await fetch('/api/admin/whatsapp/reminders/run', { method: 'POST', headers: auth() });
      const d = await r.json();
      if (r.ok) setReminderMsg(`Sent ${d.sent} reminder(s)`);
      else setReminderMsg(d.error || 'Failed');
    } catch { setReminderMsg('Network error'); }
  };

  const connColor: Record<string, string> = {
    connected: '#22c55e', qr: '#f59e0b', disconnected: '#ef4444',
    logged_out: '#ef4444', unknown: '#71717a',
  };

  const subs: { key: Sub; label: string; badge?: number }[] = [
    { key: 'gateway', label: 'Gateway' },
    { key: 'ai', label: 'AI Review', badge: lowconf.length },
    { key: 'payments', label: 'Payments', badge: payments.length },
    { key: 'results', label: 'Results', badge: results.length },
    { key: 'link', label: 'Link Tokens' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        {subs.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
            style={sub === s.key ? { background: 'rgba(249,115,22,0.15)', color: '#fff' } : { color: 'var(--color-text-muted)' }}>
            {s.label}
            {s.badge ? <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: '#ef4444', color: '#fff' }}>{s.badge}</span> : null}
          </button>
        ))}
      </div>

      {sub === 'gateway' && (
        <div className="space-y-4">
          {settings && (
            <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Gateway Status</h3>
                <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: `${connColor[settings.connectionState] || '#71717a'}20`, color: connColor[settings.connectionState] || '#71717a' }}>
                  {settings.connectionState}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg" style={{ background: 'var(--color-bg-surface)' }}>
                  <p className="text-xs text-[var(--color-text-muted)]">AI Key</p>
                  <p className="text-white font-medium">{settings.hasApiKey ? 'Configured' : 'Missing'}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--color-bg-surface)' }}>
                  <p className="text-xs text-[var(--color-text-muted)]">Channel</p>
                  <p className="text-white font-medium">{settings.enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
              </div>
            </div>
          )}
          <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <h3 className="text-base font-semibold text-white">Configuration</h3>
            <Toggle label="WhatsApp channel enabled" value={!!form.enabled} onChange={v => setForm({ ...form, enabled: v })} />
            <Field label="M-Pesa Till (payments must reference this)" value={form.mpesaTill || ''} onChange={v => setForm({ ...form, mpesaTill: v })} placeholder="e.g. 123456" />
            <Toggle label="AI assistant (Omniroute intent extraction)" value={!!form.aiEnabled} onChange={v => setForm({ ...form, aiEnabled: v })} />
            <div>
              <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-1">AI Model</label>
              <select value={form.aiModel || ''} onChange={e => setForm({ ...form, aiModel: e.target.value })} className="input-field text-sm">
                {(settings?.modelOptions || ['oc/deepseek-v4-flash-free']).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <Field label="Broadcast group JID (optional)" value={form.broadcastGroupJid || ''} onChange={v => setForm({ ...form, broadcastGroupJid: v || null })} placeholder="e.g. 1234567890-abcdef@g.us" />
            <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Reminders & Status</p>
              <Toggle label="Send result-due reminders (every 15 min)" value={!!form.reminderEnabled} onChange={v => setForm({ ...form, reminderEnabled: v })} />
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1">
                  <Field label="Reminder after (hours, no result)" value={String(form.reminderHours ?? 1)} onChange={v => setForm({ ...form, reminderHours: Number(v) || 1 })} placeholder="1" />
                </div>
                <Button variant="neon" onClick={runReminders}>Run now</Button>
              </div>
              {reminderMsg && <p className="text-xs" style={{ color: reminderMsg.includes('Failed') ? '#ef4444' : '#22c55e' }}>{reminderMsg}</p>}
              <div className="mt-2">
                <Toggle label="Publish broadcasts to WhatsApp Status" value={!!form.statusEnabled} onChange={v => setForm({ ...form, statusEnabled: v })} />
              </div>
              <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--color-bg-surface)' }}>
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Post to WhatsApp Status (manual)</p>
                <textarea value={statusText} onChange={e => setStatusText(e.target.value)} rows={3} placeholder="Tournament finals live now! Watch on TOSS..."
                  className="input-field text-sm w-full resize-none" />
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="neon" onClick={publishStatus}>Publish</Button>
                  {statusMsg && <span className="text-xs" style={{ color: statusMsg.includes('Failed') || statusMsg.includes('error') ? '#ef4444' : '#22c55e' }}>{statusMsg}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button variant="neon" onClick={saveSettings}>Save</Button>
              {saved && <span className="text-xs" style={{ color: saved.includes('Failed') || saved.includes('error') ? '#ef4444' : '#22c55e' }}>{saved}</span>}
            </div>
          </div>
        </div>
      )}

      {sub === 'ai' && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-muted)]">{lowconf.length} low-confidence messages awaiting review</p>
          {lowconf.map(l => {
            let parsed: any = {};
            try { parsed = JSON.parse(l.payload || '{}'); } catch {}
            return (
              <div key={l.id} className="p-3 rounded-xl" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white break-words">{(parsed.text as string) || l.details}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">from {parsed.phone || 'unknown'} · {new Date(l.created_at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => resolveLowconf(l.id)} disabled={resolving === l.id}
                    className="px-3 py-1 rounded-lg text-xs font-medium shrink-0"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                    {resolving === l.id ? '...' : 'Resolve'}
                  </button>
                </div>
              </div>
            );
          })}
          {lowconf.length === 0 && <p className="text-center text-[var(--color-text-muted)] py-8">No pending AI reviews</p>}
        </div>
      )}

      {sub === 'payments' && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-muted)]">{payments.length} WhatsApp-reported payments pending verification</p>
          {payments.map(p => (
            <div key={p.id} className="p-3 rounded-xl flex items-center justify-between gap-2" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="min-w-0">
                <p className="text-sm text-white">User {p.username || p.user_id} · Tournament {p.tournament_name || p.tournament_id}</p>
                <p className="text-xs text-[var(--color-text-muted)]">Ksh {p.amount} · Receipt {p.receipt_code || 'n/a'} · Till {p.till || 'n/a'} · {new Date(p.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => verifyPayment(p.id)}
                className="px-3 py-1 rounded-lg text-xs font-medium shrink-0"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                Verify
              </button>
            </div>
          ))}
          {payments.length === 0 && <p className="text-center text-[var(--color-text-muted)] py-8">No pending payments</p>}
        </div>
      )}

      {sub === 'results' && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-muted)]">{results.length} WhatsApp result submissions pending review</p>
          {results.map(r => (
            <div key={r.id} className="p-3 rounded-xl" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white">Match #{r.match_id} — {r.player1_username || 'P1'} vs {r.player2_username || 'P2'}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    OCR {r.ocr_score_left ?? '?'}-{r.ocr_score_right ?? '?'}
                    {r.ocr_team_left ? ` (${r.ocr_team_left} / ${r.ocr_team_right})` : ''} ·
                    conf {r.verification_confidence ?? '?'}% · fraud {r.fraud_score ?? '?'}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">by {r.uploader_username || 'unknown'} · {new Date(r.created_at).toLocaleString()}</p>
                </div>
                <button onClick={() => { setSelectedResult(r); setResWinner(r.player1_id || 0); setResS1(String(r.ocr_score_left ?? '')); setResS2(String(r.ocr_score_right ?? '')); setResMsg(''); }}
                  className="px-3 py-1 rounded-lg text-xs font-medium shrink-0"
                  style={{ background: 'rgba(249,115,22,0.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.25)' }}>
                  Review
                </button>
              </div>
              {r.screenshot_url && (
                <img src={r.screenshot_url} alt="submission" className="mt-2 rounded-lg max-h-40 object-contain" />
              )}
            </div>
          ))}
          {results.length === 0 && <p className="text-center text-[var(--color-text-muted)] py-8">No pending result reviews</p>}
        </div>
      )}

      {selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedResult(null)}>
          <div className="rounded-2xl p-5 w-full max-w-md space-y-3" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white">Resolve Match #{selectedResult.match_id}</h3>
            {selectedResult.screenshot_url && <img src={selectedResult.screenshot_url} alt="submission" className="rounded-lg max-h-56 object-contain w-full" />}
            <p className="text-xs text-[var(--color-text-muted)]">
              OCR: {selectedResult.ocr_score_left ?? '?'}-{selectedResult.ocr_score_right ?? '?'} ·
              {selectedResult.ocr_team_left || '?'} vs {selectedResult.ocr_team_right || '?'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-[var(--color-text-muted)] block mb-1">P1 score</label>
                <input type="number" value={resS1} onChange={e => setResS1(e.target.value)} className="input-field text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-muted)] block mb-1">P2 score</label>
                <input type="number" value={resS2} onChange={e => setResS2(e.target.value)} className="input-field text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-muted)] block mb-1">Winner</label>
                <select value={resWinner} onChange={e => setResWinner(Number(e.target.value))} className="input-field text-sm">
                  <option value={selectedResult.player1_id || 0}>{selectedResult.player1_username || 'P1'}</option>
                  <option value={selectedResult.player2_id || 0}>{selectedResult.player2_username || 'P2'}</option>
                </select>
              </div>
            </div>
            {resMsg && <p className="text-xs" style={{ color: '#ef4444' }}>{resMsg}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSelectedResult(null)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--color-border)', color: 'var(--color-text-muted)' }}>Cancel</button>
              <Button variant="neon" onClick={() => resolveResult(selectedResult.id)}>Confirm Result</Button>
            </div>
          </div>
        </div>
      )}

      {sub === 'link' && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-base font-semibold text-white">Generate Link Token</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Mint a token an existing app user pastes in WhatsApp as <code>link &lt;token&gt;</code> to bind their account.</p>
          <div className="flex gap-2">
            <input type="number" value={linkUserId} onChange={e => setLinkUserId(e.target.value)} placeholder="User ID"
              className="input-field text-sm w-32" />
            <Button variant="neon" onClick={genLink}>Generate</Button>
          </div>
          {linkMsg && <p className="text-xs" style={{ color: '#ef4444' }}>{linkMsg}</p>}
          {linkToken && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.15)' }}>
              <p className="text-xs text-[var(--color-text-muted)] mb-1">Token (expires in 7 days):</p>
              <code className="text-sm text-[#fb923c] break-all">{linkToken}</code>
              <button onClick={() => navigator.clipboard?.writeText(linkToken)}
                className="ml-3 px-2 py-1 rounded text-xs" style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}>Copy</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
      <button onClick={() => onChange(!value)}
        className="w-12 h-6 rounded-full transition-colors relative"
        style={{ background: value ? '#F97316' : 'var(--color-border)' }}>
        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: value ? '22px' : '2px' }} />
      </button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="input-field text-sm w-full" />
    </div>
  );
}
