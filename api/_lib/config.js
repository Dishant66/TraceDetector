/**
 * Server-side AI configuration.
 *
 * The API key is ONLY ever read here, on the server. It is never bundled into
 * the client, never returned by any endpoint and never logged.
 *
 * Supported environment variables (see .env.example):
 *   TRACEDETECTOR_AI_API_KEY   - required to enable real AI analysis
 *   TRACEDETECTOR_AI_BASE_URL  - OpenAI-compatible base URL (default: OpenAI)
 *   TRACEDETECTOR_AI_MODEL     - vision-capable model id
 */

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'

export function readAiConfig(env = process.env) {
  const apiKey =
    env.TRACEDETECTOR_AI_API_KEY || env.OPENAI_API_KEY || env.AI_API_KEY || ''

  const baseUrl = (
    env.TRACEDETECTOR_AI_BASE_URL ||
    env.OPENAI_BASE_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, '')

  const model = env.TRACEDETECTOR_AI_MODEL || env.OPENAI_MODEL || DEFAULT_MODEL

  return {
    apiKey: apiKey.trim(),
    baseUrl,
    model,
    configured: Boolean(apiKey && apiKey.trim()),
  }
}

/** Public, key-free description of the backend for the UI. */
export function publicAiStatus(env = process.env) {
  const { configured, model, baseUrl } = readAiConfig(env)
  return {
    aiConfigured: configured,
    model: configured ? model : null,
    provider: configured ? hostOf(baseUrl) : null,
  }
}

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
