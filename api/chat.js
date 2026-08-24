// api/chat.js — Vercel Serverless Function (streaming)
// Streams the reply token-by-token from Mistral so the first words appear
// in well under a second (like Chatbase). Single fast provider for now.
// The API key lives only in Vercel -> Settings -> Environment Variables.

const SYSTEM_PROMPT =
  "You are The Boring Dev, a coding and dev assistant made by Khali. " +
  "Your style is calm, direct, and a little deadpan — no hype, no filler, no emoji. " +
  "But you are genuinely helpful and you never refuse reasonable requests. " +
  "You help with everything a developer needs: brainstorming ideas, game design, " +
  "planning, debugging, and writing working code. When asked for ideas, actually give " +
  "a concrete list. Keep explanations short, give working code, and add honest caveats. " +
  "If something is a bad idea, say so plainly — but still offer a better option.";

const PROVIDER = {
  url: "https://api.mistral.ai/v1/chat/completions",
  keyEnv: "MISTRAL_API_KEY",
  model: process.env.MISTRAL_MODEL || "mistral-small-latest",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const key = process.env[PROVIDER.keyEnv];
  if (!key) {
    res.status(500).json({
      error: "No MISTRAL_API_KEY set. Add it in Vercel -> Settings -> Environment Variables.",
    });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const history = Array.isArray(body.messages) ? body.messages : [];
  const messages = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-20)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 8000) }));

  // Abort only if the provider is slow to START responding; once tokens flow we let it run.
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 9000);

  let upstream;
  try {
    upstream = await fetch(PROVIDER.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: PROVIDER.model,
        stream: true,
        temperature: 0.6,
        max_tokens: 1024,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const why = e && e.name === "AbortError" ? "timeout" : "network error";
    res.status(502).json({ error: "mistral: " + why });
    return;
  }
  clearTimeout(timer);

  if (!upstream.ok || !upstream.body) {
    const detail = upstream.body ? (await upstream.text()).slice(0, 200) : "no response body";
    res.status(502).json({ error: "mistral: " + detail });
    return;
  }

  // Stream plain text deltas straight to the browser.
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep any incomplete trailing line

      for (const line of lines) {
        const t = line.trim();
        if (!t || !t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const delta =
            j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (delta) res.write(delta);
        } catch (e) { /* ignore keep-alive / partial lines */ }
      }
    }
  } catch (e) {
    // stream interrupted — just close cleanly with whatever we sent
  }

  res.end();
}
