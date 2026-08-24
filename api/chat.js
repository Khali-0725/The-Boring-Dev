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
const PROVIDERS = [
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  },
  {
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
    model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3:free",
  },
  {
    name: "nvidia",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    keyEnv: "NVIDIA_API_KEY",
    model: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
  },
  {
    name: "mistral",
    url: "https://api.mistral.ai/v1/chat/completions",
    keyEnv: "MISTRAL_API_KEY",
    model: process.env.MISTRAL_MODEL || "mistral-small-latest",
  },
  {
    name: "sambanova",
    url: "https://api.sambanova.ai/v1/chat/completions",
    keyEnv: "SAMBANOVA_API_KEY",
    model: process.env.SAMBANOVA_MODEL || "Meta-Llama-3.3-70B-Instruct",
  },
];

async function callProvider(p, messages) {
  const key = process.env[p.keyEnv];
  if (!key) return { skip: true };

  // don't let a slow/hanging provider stall the whole request
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 15000);

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
