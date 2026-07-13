// AI WhatsApp Assistant — Phase 2 natural-language layer.
// Routes free-text (EN + Kiswahili) to the existing DB-backed handlers.
// Design constraints (modeled on the doc-04 assistant spec): never invent
// tournament data; verify before any state change; on low confidence, ask
// a clarifying question and flag for human review — do NOT guess blindly.
//
// The LLM hook is an intentional extension point: when WHATSAPP_AI_MODEL is
// set, `interpret()` can delegate to it. The deterministic rules below
// cover the common cases and always run first, so the assistant works with
// zero external dependencies and can be verified offline.

export interface Intent {
  action: 'help' | 'table' | 'rank' | 'fixtures' | 'me' | 'join' | 'pay' | 'signup' | 'unknown';
  arg?: string;       // tournament id or raw payment text
  confidence: number; // 0..1
  clarification?: string; // non-empty => ask the user, do not act
  needsReview?: boolean; // route to human (logged)
}

// EN + SW keywords. Kept small + explicit so behaviour is testable.
// NOTE: "mechi"/"shindano" are tournament words but they collide with the
// fixtures id sense ("mechi 20" = fixtures for #20), so they live only in
// ID_RE below, not in KW.table.
const KW = {
  help: /\b(help|saidia|msaada|how|commands?|menu)\b/i,
  table: /\b(tournaments?|tourney|table|list|open)\b/i,
  rank: /\b(rank|rankings?|top|best players?|wachezaji|mabingwa)\b/i,
  fixtures: /\b(fixtures?|matches?|matchi|draw|ratiba|games?)\b/i,
  me: /\b(my|mine|stats?|profile|wangu|hesabu yangu)\b/i,
  join: /\b(join|register|ingia|jiandikishe|sign up|signup|shiriki)\b/i,
  pay: /\b(pay|lipa|malipo|payment|stakabadhi|confirmed?)\b/i,
};

// Detect an explicit tournament id like "#20", "tournament 20", "mechi 20".
const ID_RE = /(?:#|tournament|mechi|shindano|id)[\s:]*(\d{1,6})\b/i;

export function interpret(text: string): Intent {
  const t = (text || '').trim();
  if (!t) return { action: 'help', confidence: 1 };

  // 1) Payment confirmation (M-Pesa) — highest priority, trust the text.
  if (MPESA_RECEIPT_TEST(t)) {
    return { action: 'pay', arg: t, confidence: 0.95 };
  }

  // 2) Explicit keyword intents.
  if (KW.help.test(t)) return { action: 'help', confidence: 0.9 };
  if (KW.me.test(t)) return { action: 'me', confidence: 0.9 };

  const idMatch = t.match(ID_RE);
  // Fallback: a bare number when a join/fixtures keyword is present
  // (e.g. "ratiba ya 20", "I want to join 20").
  const kwPresent = KW.join.test(t) || KW.fixtures.test(t);
  const bareId = !idMatch && kwPresent ? t.match(/\b(\d{1,6})\b/) : null;
  const id = idMatch ? idMatch[1] : bareId ? bareId[1] : undefined;

  // 3) Id-bearing intents FIRST (so "mechi 20" -> fixtures, not table).
  if (KW.join.test(t)) {
    if (!id)
      return {
        action: 'unknown',
        confidence: 0.4,
        clarification: '🤔 Which tournament? Send e.g. `join 20` or "join tournament 20".',
      };
    return { action: 'join', arg: id, confidence: 0.85 };
  }

  if (KW.fixtures.test(t)) {
    if (!id)
      return {
        action: 'unknown',
        confidence: 0.4,
        clarification: '🤔 Which tournament? Send e.g. `fixtures 20`.',
      };
    return { action: 'fixtures', arg: id, confidence: 0.85 };
  }

  if (KW.table.test(t)) return { action: 'table', confidence: 0.8 };
  if (KW.rank.test(t)) return { action: 'rank', confidence: 0.8 };

  if (KW.pay.test(t)) {
    // "pay" mentioned but no M-Pesa receipt yet -> ask them to forward it.
    return {
      action: 'unknown',
      confidence: 0.5,
      clarification:
        '💰 To pay, forward your M-Pesa confirmation SMS (the one with the receipt code). For joining, include the tournament, e.g. `pay 20 <confirmation>`.',
    };
  }

  // 4) Low confidence — do NOT invent. Ask + flag for human review.
  return {
    action: 'unknown',
    confidence: 0.1,
    clarification:
      "🤔 I didn't catch that. Try: `table`, `rank`, `fixtures <id>`, `join <id>`, `me`, or `help`.",
    needsReview: true,
  };
}

// Local copy of the M-Pesa receipt test (avoids importing the regex from
// commands.ts, keeping this module self-contained + unit-testable).
function MPESA_RECEIPT_TEST(t: string): boolean {
  const RECEIPT = /\b([A-Z0-9]{8,12})\b/;
  const CTX = /m-?pesa|confirmed|mpesa|receipt|till|buy goods/i;
  return RECEIPT.test(t) && CTX.test(t);
}
