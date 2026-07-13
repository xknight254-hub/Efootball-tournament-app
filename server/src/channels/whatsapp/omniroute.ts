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
