# The Boring Dev — by Khali

A no-nonsense AI coding assistant. Minimal, premium UI with light/dark mode.
Static frontend + one Vercel serverless function that fans out across several
free LLM providers (automatic failover, so you rarely hit a daily limit).

## Stack
- `index.html` / `style.css` / `script.js` — the interface (no framework)
- `api/chat.js` — Vercel serverless function; talks to the AI providers
- Providers (in priority order): Groq, OpenRouter, NVIDIA NIM, Mistral, SambaNova

## Deploy (Vercel)
1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project → import the repo**. No build settings needed.
3. In **Settings → Environment Variables**, add the keys you have (at least one):
   - `GROQ_API_KEY` — https://console.groq.com/keys
   - `OPENROUTER_API_KEY` — https://openrouter.ai/keys
   - `NVIDIA_API_KEY` — https://build.nvidia.com
   - `MISTRAL_API_KEY` — https://console.mistral.ai/api-keys
   - `SAMBANOVA_API_KEY` — https://cloud.sambanova.ai
4. Deploy. Done.

## Notes
- Keys live only in Vercel env vars — never in the code or the browser.
- Won't run by just opening `index.html` (needs `/api/chat`). Use `vercel dev`
  locally, or the deployed URL.
- To add/remove a provider, edit the `PROVIDERS` list in `api/chat.js`.

See `.env.example` for the full list of variables.
