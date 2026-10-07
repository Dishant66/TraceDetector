/**
 * Server-side AI configuration.
 *
 * The API key is ONLY ever read here, on the server. It is never bundled into
 * the client, never returned by any endpoint and never logged.
 *
 * Supported environment variables (see .env.example):
 *   TRACEDETECTOR_AI_API_KEY   - required to enable real AI analysis (Google Gemini)
 *   TRACEDETECTOR_AI_MODEL     - the single Gemini multimodal/vision-capable model id
 *
 * The legacy `GEMINI_API_KEY` / `GEMINI_MODEL` names are also accepted when
 * their corresponding TRACEDETECTOR_AI_* variable is not set.
 */

// Default single model, overridable by TRACEDETECTOR_AI_MODEL.
const DEFAULT_MODEL = 'gemini-3.8-flash'

export function readAiConfig(env = process.env) {
  const apiKey = (env.TRACEDETECTOR_AI_API_KEY || env.GEMINI_API_KEY || '').trim()
  const model = (env.TRACEDETECTOR_AI_MODEL || env.GEMINI_MODEL || '').trim() || DEFAULT_MODEL

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
