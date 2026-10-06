/**
 * Thin client for the server-side AI endpoints.
 *
 * The browser never sees an API key: it posts the image to a same-origin
 * /api route, and the server (Vite dev middleware locally, a serverless
 * function in production) adds the credential.
 */

const STATUS_TIMEOUT_MS = 6000
const ANALYZE_TIMEOUT_MS = 70_000

export const FRIENDLY_ERRORS = {
  ai_not_configured:
    'No AI provider is configured on the server, so AI Analysis is unavailable. On-Device Scan and Demo Analysis still work.',
  ai_timeout: 'The AI provider took too long to respond. Try again, or run an On-Device Scan.',
  ai_unreachable: 'The AI provider could not be reached. Check your connection and try again.',
  ai_request_failed: 'The AI provider rejected the request. Check the server API key and model name.',
  ai_bad_response: 'The AI provider returned something unexpected.',
  ai_malformed_json: 'The AI response could not be read as a privacy report. Try running the analysis again.',
  image_too_large: 'The image is too large for AI analysis. Try a smaller export.',
  unsupported_type: 'That image type cannot be sent for AI analysis.',
  network: 'The analysis service is not responding. You can still run an On-Device Scan or Demo Analysis.',
}

/** @returns {{ aiConfigured:boolean, model:string|null, provider:string|null, reachable:boolean }} */
export async function fetchAiStatus() {
  try {
    const response = await fetchWithTimeout('/api/status', { method: 'GET' }, STATUS_TIMEOUT_MS)
    if (!response.ok) throw new Error('status unavailable')
    const data = await response.json()
    return {
      aiConfigured: Boolean(data.aiConfigured),
      model: data.model || null,
      provider: data.provider || null,
      reachable: true,
    }
  } catch {
    // Static hosting without the API routes is a completely valid deployment.
    return { aiConfigured: false, model: null, provider: null, reachable: false }
  }
}

/**
 * @throws {Error & { code:string }} with a user-ready message.
 * @returns {{ engine:'ai', model:string, report:object }}
 */
export async function requestAiAnalysis({ dataUrl, fileName }) {
  let response
  try {
    response = await fetchWithTimeout(
      '/api/analyze',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, fileName }),
      },
      ANALYZE_TIMEOUT_MS,
    )
  } catch (err) {
    throw annotate(new Error(FRIENDLY_ERRORS.network), err?.name === 'AbortError' ? 'ai_timeout' : 'network')
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw annotate(new Error(FRIENDLY_ERRORS.ai_bad_response), 'ai_bad_response')
  }

  if (!response.ok) {
    const code = payload?.error || 'ai_request_failed'
    throw annotate(new Error(FRIENDLY_ERRORS[code] || payload?.message || FRIENDLY_ERRORS.ai_request_failed), code)
  }

  if (!payload?.report || !Array.isArray(payload.report.findings)) {
    throw annotate(new Error(FRIENDLY_ERRORS.ai_malformed_json), 'ai_malformed_json')
  }

  return payload
}

function annotate(error, code) {
  error.code = code
  return error
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
