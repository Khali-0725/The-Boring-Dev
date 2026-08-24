// api/chat.js — Vercel Serverless Function
// Multi-provider failover: tries several free OpenAI-compatible providers
// in order. If one is rate-limited or errors, it falls through to the next.
// Only providers whose API key env var is set will be used.
//
// Set the keys you have in Vercel -> Settings -> Environment Variables.

const SYSTEM_PROMPT =
  "You are The Boring Dev, a no-nonsense coding assistant made by Khali. " +
  "You are calm, direct, and a little deadpan. No hype, no filler, no emoji. " +
  "Give correct, practical help: short explanations, working code, honest caveats. " +
  "If something is a bad idea, say so plainly.";

// All endpoints below speak the OpenAI /chat/completions format.
// Add or remove entries freely — order = priority.
// Simplified to a single provider for now: Mistral (fastest confirmed working).
// To re-add failover later, just add more entries to this list — the loop below
// already handles trying them in order. You can override the model with the
// MISTRAL_MODEL env var in Vercel without editing code.
const PROVIDERS = [
  {
    name: "mistral",
    url: "https://api.mistral.ai/v1/chat/completions",
    keyEnv: "MISTRAL_API_KEY",
    model: process.env.MISTRAL_MODEL || "mistral-small-latest",
  },
];

async function callProvider(p, messages) {
  const key = process.env[p.keyEnv];
  if (!key) return { skip: true };

  // don't let a slow/hanging provider stall the whole request
  // Keep this well under Vercel's 10s function limit so failover still fits.
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 7000);

  let resp;
  try {
    resp = await fetch(p.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model: p.model,
        temperature: 0.6,
        max_tokens: 1024,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const why = e && e.name === "AbortError" ? "timeout" : "network error";
    return { retryable: true, error: p.name + ": " + why };
  }
  clearTimeout(timer);

  // rate-limited or server error -> let caller try the next provider
  if (resp.status === 429 || resp.status >= 500) {
    return { retryable: true, error: p.name + ": HTTP " + resp.status };
  }
  if (!resp.ok) {
    const detail = await resp.text();
    return { error: p.name + ": " + detail.slice(0, 200) };
  }

  const data = await resp.json();
  const reply =
    data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
  if (!reply) return { retryable: true, error: p.name + ": empty reply" };

  return { reply: reply, provider: p.name };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const configured = PROVIDERS.filter((p) => process.env[p.keyEnv]);
  if (configured.length === 0) {
    res.status(500).json({
      error:
        "No providers configured. Add at least one API key (e.g. GROQ_API_KEY) in Vercel settings.",
    });
    return;
  }

  const body =
    typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const history = Array.isArray(body.messages) ? body.messages : [];
  const messages = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-20)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 8000) }));

  const tried = [];
  for (const p of configured) {
    const out = await callProvider(p, messages);
    if (out.skip) continue;
    if (out.reply) {
      res.status(200).json({ reply: out.reply, provider: out.provider });
      return;
    }
    tried.push(out.error || p.name);
    if (out.retryable) continue; // rate-limited -> next provider
    // hard error (bad key/model): still try the next as a fallback
  }

  res.status(502).json({
    error: "All providers failed or are rate-limited right now. Try again shortly.",
    tried: tried,
  });
}
