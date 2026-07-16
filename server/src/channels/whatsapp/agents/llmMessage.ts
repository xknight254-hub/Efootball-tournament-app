/**
 * LLM messaging layer (Option B orchestration).
 *
 * The deterministic agents decide WHAT to say (action type + draft text).
 * This module is the VOICE: it rewrites each draft into a human-sounding
 * WhatsApp message via the LLM, preserving every number/name/fee/date/command.
 *
 * Failure mode is safe: if the LLM is unreachable or errors, the original
 * draft is returned unchanged so messaging never breaks.
 */
import { omnirouteChat } from '../omniroute.js';
import { whatsappConfig } from '../config.js';

const POLISH_SYS =
  'CRITICAL: you will be given a draft WhatsApp message. Output ONLY the rewritten message. ' +
  'Any text other than the message itself (explanations, notes about the rules, descriptions of what you did) is a CRITICAL FAILURE. ' +
  'You are the voice of TOSS, a Kenyan eFootball tournament platform. ' +
  'Rewrite the draft so it sounds like a real, friendly human staff member texting on WhatsApp ' +
  '— NOT a bot, NOT formal, NOT corporate. ' +
  'RULES (non-negotiable): ' +
  '1) PRESERVE every proper noun EXACTLY — usernames, player names, and tournament titles ' +
  '(e.g. "Zidama", "Xknight") must appear unchanged. ' +
  '2) PRESERVE every number, fee, date, and command (e.g. "join 21") EXACTLY. ' +
  '3) Do NOT drop information the draft contains — only improve tone/voice, never summarize or shorten the meaning. ' +
  '4) Never say you are AI, a bot, an assistant, or a model. Never explain what you are. ' +
  '5) 1-3 short lines. Emojis sparse and only if the draft already used them. ' +
  'Output ONLY the rewritten message. Do not write about the draft, the rules, or your process. ' +
  'If you add any commentary you have failed.';

// Safety net: the model sometimes narrates its rewriting. Strip any line that
// is meta-talk rather than the message itself.
const META = /(we need to|the draft|i (should|will|must)|let'?s (produce|rewrite|check|output)|output only|rules?:|check:|preserve|we (must|can|should)|you are (the voice|given)|any text other|critical failure|i?m (rewriting|given))/i;
function stripMeta(text: string): string {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const kept = lines.filter(l => !META.test(l));
  const out = (kept.length ? kept : lines).join('\n').trim();
  return out;
}

/**
 * Rewrite a draft message into human-sounding copy.
 * @param draft  the agent's original text
 * @param hint   short context (action type + description) to keep intent
 * @returns polished text, or `draft` unchanged on any failure
 */
export async function polishMessage(draft: string, hint = ''): Promise<string> {
  const text = (draft || '').toString().trim();
  if (!text) return draft;
  if (!whatsappConfig.aiEnabled || !whatsappConfig.omnirouteKey) return draft;
  try {
    const out = await omnirouteChat(
      POLISH_SYS,
      `Context: ${hint || 'event-driven message'}\n\nDraft:\n${text}`,
      {
        baseUrl: whatsappConfig.omnirouteBase,
        apiKey: whatsappConfig.omnirouteKey,
        model: whatsappConfig.aiModel,
        timeoutMs: 8000,
      }
    );
    const polished = stripMeta(out || '').trim();
    return polished || draft;
  } catch {
    return draft;
  }
}
