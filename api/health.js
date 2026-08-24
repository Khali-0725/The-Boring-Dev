// api/health.js — provider diagnostics
// Visit /api/health in your browser to see which providers are working.
// It sends a tiny "ping" to every configured provider and reports the result.
// Never exposes your API keys — only whether each key is set and if it responds.

const PROVIDERS = [
  { name: "mistral",    url: "https://api.mistral.ai/v1/chat/completions",             keyEnv: "MISTRAL_API_KEY",    model: process.env.MISTRAL_MODEL    || "mistral-small-latest" },
  { name: "groq",       url: "https://api.groq.com/openai/v1/chat/completions",        keyEnv: "GROQ_API_KEY",       model: process.env.GROQ_MODEL       || "openai/gpt-oss-120b" },
  { name: "sambanova",  url: "https://api.sambanova.ai/v1/chat/completions",           keyEnv: "SAMBANOVA_API_KEY",  model: process.env.SAMBANOVA_MODEL  || "Meta-Llama-3.3-70B-Instruct" },
  { name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions",          keyEnv: "OPENROUTER_API_KEY", model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free" },
  { name: "nvidia",     url: "https://integrate.api.nvidia.com/v1/chat/completions",   keyEnv: "NVIDIA_API_KEY",     model: process.env.NVIDIA_MODEL     || "meta/llama-3.3-70b-instruct" },
];

async function pingProvider(p) {
  const key = process.env[p.keyEnv];
  if (!key) return { provider: p.name, configured: false, ok: false, note: "no key set" };

  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 12000);

  const started = Date.now();
  let resp;
  try {
    resp = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: p.model,
        max_tokens: 5,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const why = e && e.name === "AbortError" ? "timeout (>12s)" : "network error";
    return { provider: p.name, configured: true, ok: false, model: p.model, error: why };
  }
  clearTimeout(timer);

  const ms = Date.now() - started;
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 160);
    return { provider: p.name, configured: true, ok: false, model: p.model, status: resp.status, error: detail, ms };
  }

  const data = await resp.json().catch(function () { return null; });
  const reply =
    data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;

  return { provider: p.name, configured: true, ok: !!reply, model: p.model, status: resp.status, ms };
}

export default async function handler(req, res) {
  const results = await Promise.all(PROVIDERS.map(pingProvider));
  const working = results.filter((r) => r.ok).map((r) => r.provider);
  const configured = results.filter((r) => r.configured).map((r) => r.provider);

  res.status(200).json({
    summary: {
      configured: configured.length + " provider(s) with a key: " + (configured.join(", ") || "none"),
      working: working.length + " provider(s) responding: " + (working.join(", ") || "none"),
    },
    providers: results,
  });
}
