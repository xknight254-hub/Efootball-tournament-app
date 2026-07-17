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

import { omnirouteChat } from './omniroute.js';

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

const ACTIONS = ['help', 'table', 'rank', 'fixtures', 'me', 'join', 'pay', 'signup', 'unknown'];

// LLM-backed intent extraction. The model returns ONLY a JSON object
// {action, arg} from the fixed enum; it never produces free-form prose,
// so it cannot invent tournament data. On any failure we fall back to the
// deterministic `interpret` (which is fully offline + testable).
export async function interpretWithLLM(
  text: string,
  llm: { baseUrl: string; apiKey: string; model: string }
): Promise<Intent> {
  const sys =
    'You are TOSS, the support assistant for a Kenyan eFootball tournament platform. ' +
    'You NEVER say you are an AI, bot, assistant, model, or chatbot. ' +
    'You NEVER narrate your reasoning — no "let me analyze", "this is case A/B", "according to the rules", "first I need to", or any internal monologue. ' +
    'Output ONLY a JSON object and nothing else: {"action":"<one>","arg":"<optional id or text>"}. ' +
    `Allowed actions: ${ACTIONS.join(', ')}. ` +
    'Use action "join" or "pay" when the user wants to enter/pay for a tournament (include the id in arg). ' +
    'Use "fixtures" for match lists, "table" for open tournaments, "rank" for leaderboards, ' +
    '"me" for the user\'s own stats, "help" for the menu. ' +
    'If unclear, return {"action":"unknown"}. Do not add any text outside the JSON.';
  try {
    const raw = await omnirouteChat(sys, text, {
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      timeoutMs: 8000,
    });
    const json = extractJson(raw);
    if (json && typeof json.action === 'string' && ACTIONS.includes(json.action)) {
      const action = json.action as Intent['action'];
      const intent: Intent = {
        action,
        arg: typeof json.arg === 'string' ? json.arg : undefined,
        confidence: 0.95,
      };
      // A bare "pay" with no receipt text still needs the user to forward it.
      if (action === 'pay' && !MPESA_RECEIPT_TEST(intent.arg || text)) {
        return {
          action: 'unknown',
          confidence: 0.5,
          clarification:
            '💰 To pay, forward your M-Pesa confirmation SMS (the one with the receipt code). For joining, include the tournament, e.g. `pay 20 <confirmation>`.',
        };
      }
      return intent;
    }
  } catch {
    // network/parse failure -> fall through to deterministic
  }
  return interpret(text);
}

// Defensive guard: scrub any leaked reasoning or AI self-disclosure from
// text that could reach the user. If a model ever emits a monologue or
// admits it is an AI, replace it with a clean support line so players
// never see the machinery (and never doubt it is a real TOSS rep).
const LEAK_RE =
  /(let me analyze|let's analyze|first,? i need|i need to (decide|determine)|this is (case|clearly)|according to (the )?rules|okay,? let's|we need to (decide|determine)|the message (is|starts)|breaking down|key (points|rule)|i am (an )?ai|i'm an ai|as an ai|i am a (bot|chatbot|model|language model)|i am a virtual)/i;

export function sanitizeReply(reply: string): string {
  const s = (reply || '').trim();
  if (!s) return s;
  if (LEAK_RE.test(s)) {
    return "Hey! I'm TOSS support. Send `help` to see what I can do, or ask me how to join a tournament.";
  }
  return s;
}

function extractJson(s: string): { action?: string; arg?: unknown } | null {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── Tool-calling assistant (real data, no guessing) ──────────
// Conversational-first: builds a persona from the multi-selected agents,
// answers naturally, and uses tools only when it needs REAL DB data.
// If no tool is needed it still returns a conversational reply (never ''
// unless something truly fails) so the caller never falls back to the
// command menu for an ordinary message.
import { AgentTool } from './tools.js';
import { omnirouteChatWithTools } from './omniroute.js';
import { whatsappConfig } from './config.js';
import { buildPersonaPrompt, getAgentAssignments } from './tools.js';

export async function runAssistantWithTools(
  text: string,
  llm: { baseUrl: string; apiKey: string; model: string },
  tools: AgentTool[]
): Promise<string> {
  const persona = buildPersonaPrompt(getAgentAssignments());
  const sys =
    persona +
    ' Keep EVERY reply SHORT and LIVELY — max 2 sentences, under ~40 words. ' +
    'Warm, energetic Kenyan tone. One light emoji is fine. ' +
    'NEVER use bullet lists, headers, or "firstly/secondly". Guide the user to the NEXT step in one line. ' +
    'Use your tools for real tournament data (fees, fixtures, standings, their account). ' +
    'Never invent numbers or names. HARD RULE: never narrate reasoning, never mention tools, ' +
    'or your own process. Output ONLY the user-facing reply, no preamble.';
  const opts = {
    baseUrl: llm.baseUrl,
    apiKey: llm.apiKey,
    model: llm.model,
    timeoutMs: 12000,
  };
  try {
    const first = await omnirouteChatWithTools(sys, text, opts, tools);
    // Tool path: execute handler(s), feed back, synthesize.
    if (first.toolCalls.length > 0) {
      const toolMessages: any[] = [];
      for (const tc of first.toolCalls) {
        const tool = tools.find((t) => t.name === tc.name);
        let result: any;
        if (!tool) {
          result = { error: `unknown tool: ${tc.name}` };
        } else {
          try {
            result = await tool.handler(tc.arguments || {});
          } catch (e) {
            result = { error: (e as Error).message };
          }
        }
        toolMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      const followUp = [
        { role: 'system', content: sys },
        { role: 'user', content: text },
        {
          role: 'assistant',
          content: first.content || '',
          tool_calls: first.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
          })),
        },
        ...toolMessages,
      ];
      const second = await omnirouteChatWithTools(sys, text, opts, tools, followUp);
      const out = (second.content || '').trim();
      if (out) return out;
    }
    // No tool needed: the model's direct reply (if any) is the answer.
    const direct = (first.content || '').trim();
    if (direct) return direct;
    // Last resort: a pure chat call (no tools) so we always answer.
    const chat = await omnirouteChat(sys, text, opts);
    const plain = (chat || '').trim();
    return plain;
  } catch {
    return '';
  }
}
