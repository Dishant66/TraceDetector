/**
 * Server-side AI configuration.
 *
 * The API key is ONLY ever read here, on the server. It is never bundled into
 * the client, never returned by any endpoint and never logged.
 *
 * Supported environment variables (see .env.example):
 *   TRACEDETECTOR_AI_API_KEY   - required to enable real AI analysis (Google Gemini)
 *   TRACEDETECTOR_AI_MODEL     - the primary Gemini multimodal/vision-capable model id
 *   TRACEDETECTOR_AI_FALLBACK_MODEL - optional model used after transient primary failures
 *
 * `GEMINI_API_KEY` / `GEMINI_MODEL` are also accepted as a fallback for
 * compatibility with deployments that already set the plain Gemini names.
 * `TRACEDETECTOR_AI_*` takes precedence when both are present.
 */

// Default primary model, overridable by TRACEDETECTOR_AI_MODEL.
const DEFAULT_MODEL = 'gemini-3.8-flash'

export function readAiConfig(env = process.env) {
  const apiKey = (env.TRACEDETECTOR_AI_API_KEY || env.GEMINI_API_KEY || '').trim()
  const model = (env.TRACEDETECTOR_AI_MODEL || env.GEMINI_MODEL || '').trim() || DEFAULT_MODEL
  const fallbackModel = (env.TRACEDETECTOR_AI_FALLBACK_MODEL || '').trim()

  return {
    apiKey,
    model,
    fallbackModel,
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
