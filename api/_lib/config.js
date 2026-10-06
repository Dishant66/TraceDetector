/**
 * Server-side AI configuration.
 *
 * The API key is ONLY ever read here, on the server. It is never bundled into
 * the client, never returned by any endpoint and never logged.
 *
 * Supported environment variables (see .env.example):
 *   GEMINI_API_KEY   - required to enable real AI analysis (Google Gemini)
 *   GEMINI_MODEL     - a Gemini multimodal/vision-capable model id
 */

// A broadly-available, vision-capable Flash model. Kept as a fallback only —
// the model actually used is always read from GEMINI_MODEL so it can be
// changed without touching any code if a given key/account cannot access it.
const DEFAULT_MODEL = 'gemini-2.5-flash'

export function readAiConfig(env = process.env) {
  const apiKey = (env.GEMINI_API_KEY || '').trim()
  const model = (env.GEMINI_MODEL || '').trim() || DEFAULT_MODEL

  return {
    apiKey,
    model,
    configured: Boolean(apiKey),
  }
}

/** Public, key-free description of the backend for the UI. */
export function publicAiStatus(env = process.env) {
  const { configured, model } = readAiConfig(env)
  return {
    aiConfigured: configured,
    model: configured ? model : null,
    provider: configured ? 'Google Gemini' : null,
  }
}
