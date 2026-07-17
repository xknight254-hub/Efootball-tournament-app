import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../../api';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';

// ─── Template catalog (mirrors server TEMPLATES) ─────────────────
const TEMPLATES = [
  'tournament-announcement', 'registration-open', 'fixture', 'match-reminder',
  'halftime', 'final-score', 'standings', 'top-scorers', 'player-of-the-match',
  'champion', 'live-now', 'new-season', 'maintenance', 'feature-announcement',
] as const;

const TEMPLATE_LABEL: Record<string, string> = {
  'tournament-announcement': 'Tournament Announcement',
  'registration-open': 'Registration Open',
  fixture: 'Fixture',
  'match-reminder': 'Match Reminder',
  halftime: 'Halftime',
  'final-score': 'Final Score',
  standings: 'Standings',
  'top-scorers': 'Top Scorers',
  'player-of-the-match': 'Player of the Match',
  champion: 'Champion',
  'live-now': 'Live Now',
  'new-season': 'New Season',
  maintenance: 'Maintenance',
  'feature-announcement': 'Feature Announcement',
};

const SIZES = ['1080x1080', '1080x1350', '1920x1080', '1080x1920', '1200x628'] as const;
const ACCENTS = ['gold', 'teal', 'pink', 'live'] as const;

// Which optional fields each template supports.
const FIELDS: Record<string, { key: string; label: string; placeholder?: string; textarea?: boolean }[]> = {
  all: [
    { key: 'title', label: 'Title', placeholder: 'Weekend Cup' },
    { key: 'subtitle', label: 'Subtitle', placeholder: '32 Players' },
    { key: 'cta', label: 'CTA', placeholder: 'Register Now' },
    { key: 'tournamentCode', label: 'Tournament Code', placeholder: 'TOSS-7F3A' },
    { key: 'qrText', label: 'QR Link (optional)', placeholder: 'https://toss.gg/join?code=TOSS-7F3A' },
  ],
  match: [
    { key: 'teamA', label: 'Team A', placeholder: 'xKnight' },
    { key: 'teamB', label: 'Team B', placeholder: 'ShadowFC' },
    { key: 'scoreA', label: 'Score A', placeholder: '3' },
    { key: 'scoreB', label: 'Score B', placeholder: '2' },
    { key: 'round', label: 'Round', placeholder: 'Quarter Final' },
    { key: 'stage', label: 'Stage', placeholder: 'Knockouts' },
    { key: 'period', label: 'Period', placeholder: '1st Half' },
    { key: 'countdown', label: 'Countdown', placeholder: '02:14:55' },
  ],
  prize: [{ key: 'prize', label: 'Prize', placeholder: 'KES 5,000' }, { key: 'date', label: 'Date', placeholder: 'Sat 8PM' }, { key: 'registrationDeadline', label: 'Deadline', placeholder: 'Fri 11:59PM' }],
  body: [{ key: 'body', label: 'Body', placeholder: 'Supporting text...', textarea: true }],
  footer: [{ key: 'footer', label: 'Footer', placeholder: 'Tap to register' }],
  player: [
    { key: 'pName', label: 'Player Name', placeholder: 'xKnight' },
    { key: 'pTeam', label: 'Player Team', placeholder: 'TOSS Elite' },
    { key: 'pStat', label: 'Player Stat', placeholder: 'MVP' },
  ],
  rows: [{ key: 'rowsText', label: 'Table Rows (one per line: Position | Name | Value)', placeholder: '1 | xKnight | 9', textarea: true }],
};

function fieldsFor(tpl: string) {
  const base = [...FIELDS.all];
  if (['fixture', 'match-reminder', 'halftime', 'final-score', 'live-now'].includes(tpl)) base.push(...FIELDS.match);
  if (['tournament-announcement', 'registration-open', 'champion'].includes(tpl)) base.push(...FIELDS.prize);
  if (['new-season', 'maintenance', 'feature-announcement'].includes(tpl)) base.push(...FIELDS.body);
  if (['tournament-announcement', 'registration-open', 'match-reminder', 'new-season', 'feature-announcement'].includes(tpl)) base.push(...FIELDS.footer);
  if (['player-of-the-match', 'champion'].includes(tpl)) base.push(...FIELDS.player);
  if (['standings', 'top-scorers'].includes(tpl)) base.push(...FIELDS.rows);
  return base;
}

export function BrandStudio({ initialCampaign }: { initialCampaign?: any }) {
  const { success: toastOk, error: toastErr } = useToast();
  const [template, setTemplate] = useState<string>(initialCampaign?.template || 'tournament-announcement');
  const [size, setSize] = useState<string>(initialCampaign?.size || '1080x1080');
  const [accent, setAccent] = useState<string>(initialCampaign?.accent || 'gold');
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    if (initialCampaign) {
      for (const k of ['title', 'subtitle', 'cta', 'tournamentCode', 'prize', 'date', 'registrationDeadline', 'teamA', 'teamB', 'scoreA', 'scoreB', 'round', 'stage', 'period', 'countdown', 'body', 'footer', 'pName', 'pTeam', 'pStat']) {
        if (initialCampaign[k] != null && initialCampaign[k] !== '') v[k] = String(initialCampaign[k]);
      }
    }
    return v;
  });
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(initialCampaign?.heroImageUrl || null);
  const [sponsorLogoUrl, setSponsorLogoUrl] = useState<string | null>(initialCampaign?.sponsorLogoUrl || null);
  const [uploading, setUploading] = useState(false);
  const [uploadingSponsor, setUploadingSponsor] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sponsorRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setVal = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));

  const buildCampaign = useCallback((): any => {
    const c: any = { template, size, accent };
    for (const f of fieldsFor(template)) {
      const v = vals[f.key];
      if (v === undefined || v === '') continue;
      if (f.key === 'scoreA' || f.key === 'scoreB') c[f.key] = Number(v);
      else c[f.key] = v;
    }
    // featured player
    if (['player-of-the-match', 'champion'].includes(template)) {
      if (vals.pName) c.featuredPlayer = { name: vals.pName, team: vals.pTeam || undefined, stat: vals.pStat || undefined };
    }
    // table rows
    if (['standings', 'top-scorers'].includes(template) && vals.rowsText) {
      c.rows = vals.rowsText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const [pos, name, val] = l.split('|').map((x) => x.trim());
        const top = pos === '1' || pos?.toUpperCase() === '1';
        return `<div class="row${top ? ' top' : ''}"><div class="pos">${pos ?? ''}</div><div class="name">${name ?? ''}</div><div class="val">${val ?? ''}</div></div>`;
      });
    }
    // uploaded media asset (hero/sponsor)
    if (heroImageUrl) c.heroImageUrl = heroImageUrl;
    if (sponsorLogoUrl) c.sponsorLogoUrl = sponsorLogoUrl;
    return c;
  }, [template, size, accent, vals, heroImageUrl, sponsorLogoUrl]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const r = await api.marketing.upload(file);
      setHeroImageUrl(r.url);
      toastOk('Asset uploaded');
    } catch (e: any) {
      toastErr(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadSponsor = async (file: File) => {
    setUploadingSponsor(true);
    try {
      const r = await api.marketing.upload(file);
      setSponsorLogoUrl(r.url);
      toastOk('Sponsor logo uploaded');
    } catch (e: any) {
      toastErr(e.message || 'Upload failed');
    } finally {
      setUploadingSponsor(false);
    }
  };

  const doRender = useCallback(async () => {
    setRendering(true);
    try {
      const r = await api.marketing.render(buildCampaign());
      setPreview(r.url);
    } catch (e: any) {
      toastErr(e.message || 'Render failed');
      setPreview(null);
    } finally {
      setRendering(false);
    }
  }, [buildCampaign, toastErr]);

  // Live preview: debounce on any change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { doRender(); }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [doRender]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const c = buildCampaign();
      await api.marketing.publish(c, vals.title || c.title || '');
      toastOk('Published to WhatsApp Status');
    } catch (e: any) {
      toastErr(e.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const handleTemplate = (t: string) => { setTemplate(t); setVals({}); setPreview(null); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Brand Studio</h2>
          <p className="text-[var(--color-text-muted)] text-sm mt-1">Render branded marketing assets from templates. Design is controlled by brand.json — you only supply copy.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Editor ─── */}
        <div className="rounded-xl p-5 space-y-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          {/* Template */}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-2">Template</label>
            <select value={template} onChange={(e) => handleTemplate(e.target.value)}
              className="input-field text-sm w-full">
              {TEMPLATES.map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}
            </select>
          </div>

          {/* Size + Accent */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-2">Size</label>
              <select value={size} onChange={(e) => setSize(e.target.value)} className="input-field text-sm w-full">
                {SIZES.map((s) => <option key={s} value={s}>{s.replace('x', ' × ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-2">Accent</label>
              <select value={accent} onChange={(e) => setAccent(e.target.value)} className="input-field text-sm w-full">
                {ACCENTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {/* Media asset (hero / sponsor) */}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-2">Media Asset (optional)</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => fileRef.current?.click()} isLoading={uploading} className="text-sm">
                {uploading ? 'Uploading…' : 'Upload image'}
              </Button>
              {heroImageUrl && (
                <div className="flex items-center gap-2">
                  <img src={heroImageUrl} alt="asset" className="w-12 h-12 rounded-lg object-cover" style={{ border: '1px solid var(--color-border)' }} />
                  <button onClick={() => setHeroImageUrl(null)} className="text-xs" style={{ color: '#f87171' }}>Remove</button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-[var(--color-text-dim)] mt-1">Used as hero/sponsor image on feature & announcement templates.</p>
          </div>

          {/* Sponsor logo upload */}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-2">Sponsor Logo (optional)</label>
            <input ref={sponsorRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadSponsor(f); }} />
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => sponsorRef.current?.click()} isLoading={uploadingSponsor} className="text-sm">
                {uploadingSponsor ? 'Uploading…' : 'Upload sponsor'}
              </Button>
              {sponsorLogoUrl && (
                <div className="flex items-center gap-2">
                  <img src={sponsorLogoUrl} alt="sponsor" className="h-8 rounded object-contain" style={{ border: '1px solid var(--color-border)' }} />
                  <button onClick={() => setSponsorLogoUrl(null)} className="text-xs" style={{ color: '#f87171' }}>Remove</button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-[var(--color-text-dim)] mt-1">Shown on announcement, feature & registration templates.</p>
          </div>

          {/* Dynamic fields */}
          <div className="space-y-3">
            {fieldsFor(template).map((f) => (
              <div key={f.key}>
                <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-1">{f.label}</label>
                {f.textarea ? (
                  <textarea value={vals[f.key] || ''} onChange={(e) => setVal(f.key, e.target.value)}
                    placeholder={f.placeholder} rows={f.key === 'rowsText' ? 5 : 3}
                    className="input-field text-sm w-full font-mono" />
                ) : (
                  <input type="text" value={vals[f.key] || ''} onChange={(e) => setVal(f.key, e.target.value)}
                    placeholder={f.placeholder} className="input-field text-sm w-full" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ─── Preview ─── */}
        <div className="rounded-xl p-5 flex flex-col" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Live Preview</h3>
            {rendering && <span className="text-xs text-[var(--color-text-muted)]">Rendering…</span>}
          </div>
          <div className="flex-1 flex items-center justify-center rounded-lg overflow-hidden min-h-[320px]"
            style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}>
            {preview ? (
              <img src={preview} alt="preview" className="max-w-full max-h-[70vh] object-contain" />
            ) : (
              <span className="text-[var(--color-text-muted)] text-sm">Loading preview…</span>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            {preview && (
              <a href={preview} target="_blank" rel="noreferrer" className="flex-1">
                <Button variant="neon" className="w-full">Download</Button>
              </a>
            )}
            <Button variant="primary" onClick={handlePublish} isLoading={publishing} className="flex-1">
              {publishing ? 'Publishing…' : 'Publish to Status'}
            </Button>
          </div>
          <p className="text-[10px] text-[var(--color-text-dim)] mt-2 text-center">
            Publishing posts the rendered image to the connected WhatsApp Status broadcast.
          </p>
        </div>
      </div>
    </div>
  );
}
