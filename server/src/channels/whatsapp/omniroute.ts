// Minimal Omniroute client — OpenAI-compatible chat completions over the
// Omniroute gateway. The gateway is OpenRouter-compatible but streams SSE
// even for non-streaming requests, so we must parse the SSE text stream
// (never resp.json()). See businessos-ai-gateway skill for the contract.
//
// This module is intentionally tiny: it only ever returns the assistant's
// raw text. The WhatsApp assistant uses it strictly as an *intent
// extractor* — the LLM outputs JSON describing an action, which is then
// executed by the deterministic, DB-backed handlers. The LLM never produces
// user-facing tournament data, so it cannot invent results.

export interface OmnirouteOpts {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export async function omnirouteChat(
  system: string,
  user: string,
  opts: OmnirouteOpts
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const resp = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 200,
        stream: true,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Omniroute ${resp.status}: ${body.slice(0, 200)}`);
    }
    const text = await resp.text();
    return parseSseContent(text);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Tool-calling variant ─────────────────────────────────────
// Same gateway quirk (SSE even for non-streaming) but ALSO accumulates
// streaming tool_calls fragments, then (optionally) runs a follow-up
// synthesis turn with the tool results fed back as `tool` messages.
export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface ToolChatResult {
  content: string;
  toolCalls: ToolCall[];
}

interface RawToolCall {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

export async function omnirouteChatWithTools(
  system: string,
  user: string,
  opts: OmnirouteOpts,
  tools: { name: string; description: string; parameters: any }[],
  followUpMessages?: any[]
): Promise<ToolChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12000);
  try {
    const messages = followUpMessages ?? [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const body: any = {
      model: opts.model,
      messages,
      max_tokens: 600,
      stream: true,
      tools: tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      tool_choice: 'auto',
    };
    const resp = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`Omniroute ${resp.status}: ${t.slice(0, 200)}`);
    }
    const raw = await resp.text();
    return parseSseToolChat(raw);
  } finally {
    clearTimeout(timer);
  }
}

// Parse an SSE stream that may carry either content deltas and/or
// tool_calls fragments (each fragment: index, id, function.name,
// function.arguments — arguments arrive as incremental JSON-string chunks
// that must be concatenated per index).
function parseSseToolChat(raw: string): ToolChatResult {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const dataLines = lines.filter((l) => l.startsWith('data:'));
  let content = '';
  const byIndex: RawToolCall[] = [];
  if (dataLines.length === 0) {
    try {
      const obj = JSON.parse(raw);
      const msg = obj?.choices?.[0]?.message;
      return {
        content: msg?.content ?? '',
        toolCalls: (msg?.tool_calls ?? []).map((tc: any) => ({
          id: tc.id,
          name: tc.function?.name,
          arguments: safeParse(tc.function?.arguments),
        })),
      };
    } catch {
      return { content: raw, toolCalls: [] };
    }
  }
  for (const line of dataLines) {
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const obj = JSON.parse(payload);
      const delta = obj?.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === 'string') content += delta.content;
      const tcs = delta.tool_calls;
      if (Array.isArray(tcs)) {
        for (const tc of tcs as RawToolCall[]) {
          const i = tc.index ?? 0;
          if (!byIndex[i]) byIndex[i] = { id: tc.id, function: {} };
          if (tc.id) byIndex[i].id = tc.id;
          if (tc.function?.name) {
            byIndex[i].function = byIndex[i].function || {};
            byIndex[i].function!.name = tc.function.name;
          }
          if (typeof tc.function?.arguments === 'string') {
            byIndex[i].function = byIndex[i].function || {};
            byIndex[i].function!.arguments =
              (byIndex[i].function!.arguments || '') + tc.function.arguments;
          }
        }
      }
    } catch {
      // ignore non-JSON preamble
    }
  }
  const toolCalls: ToolCall[] = byIndex
    .filter(Boolean)
    .map((tc) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
      name: tc.function?.name || '',
      arguments: safeParse(tc.function?.arguments),
    }));
  return { content, toolCalls };
}

function safeParse(s: string | undefined): any {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// SSE: lines like `data: {...}`; terminal `data: [DONE]`. Accumulate
// choices[0].delta.content. Falls back to a single JSON object if no
// `data:` lines are present.
function parseSseContent(raw: string): string {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const dataLines = lines.filter((l) => l.startsWith('data:'));
  if (dataLines.length === 0) {
    try {
      const obj = JSON.parse(raw);
      return obj?.choices?.[0]?.message?.content ?? obj?.choices?.[0]?.delta?.content ?? '';
    } catch {
      return raw;
    }
  }
  let out = '';
  for (const line of dataLines) {
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const obj = JSON.parse(payload);
      const delta = obj?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') out += delta;
    } catch {
      // ignore non-JSON preamble (e.g. "OPENROUTER PROCESSING")
    }
  }
  return out;
}
