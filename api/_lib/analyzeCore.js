import { GoogleGenAI } from '@google/genai'
import { readAiConfig } from './config.js'
import { SYSTEM_PROMPT, RESPONSE_SCHEMA_HINT, GEMINI_RESPONSE_SCHEMA } from './prompt.js'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB of raw image data, matches the client-side upload limit
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
])
const REQUEST_TIMEOUT_MS = 55_000

/** True unless the host explicitly marks this as a production deployment. */
function isDevEnv(env) {
  return (env.NODE_ENV || '').toLowerCase() !== 'production'
}

/**
 * Framework-agnostic core. Takes a parsed JSON body, returns { status, body }.
 * Used by the Vercel-style serverless function AND by the Vite dev middleware,
 * so local development and deployment behave identically.
 *
 * The image is only ever held in memory for the duration of this single
 * request. It is never written to disk, never logged, and never stored.
 *
 * @param {object} body - parsed JSON request body, e.g. { image, fileName }
 * @param {Record<string,string>} env - process.env (or a test double)
 * @param {{ createClient?: (apiKey:string) => { models: { generateContent: Function } } }} deps
 *   Injectable client factory, used by tests to simulate Gemini responses
 *   (including real-shaped success and failure payloads) without making a
 *   network call or needing a real API key.
 */
export async function analyzeImage(body, env = process.env, deps = {}) {
  const createClient = deps.createClient || ((apiKey) => new GoogleGenAI({ apiKey }))
  const dev = isDevEnv(env)
  const config = readAiConfig(env)

  if (!config.configured) {
    return {
      status: 503,
      body: {
        error: 'ai_not_configured',
        message: 'AI Analysis requires a Gemini API key. Set GEMINI_API_KEY on the server to enable it.',
      },
    }
  }

  const validation = validateBody(body)
  if (validation.error) {
    return { status: 400, body: validation.error }
  }

  const { mime, base64, fileName } = validation.value

  let response
  try {
    const client = createClient(config.apiKey)

    response = await client.models.generateContent({
      model: config.model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Analyse this image for exposed information before it is shared.${
                fileName ? `\nOriginal file name: ${fileName}` : ''
              }\n\n${RESPONSE_SCHEMA_HINT}`,
            },
            { inlineData: { mimeType: mime, data: base64 } },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        httpOptions: { timeout: REQUEST_TIMEOUT_MS },
      },
    })
  } catch (err) {
    if (dev) logServerError('Gemini request failed', err)
    return { status: mapErrorStatus(err), body: mapErrorBody(err, { dev, apiKey: config.apiKey }) }
  }

  const blockReason = response?.promptFeedback?.blockReason
  if (blockReason) {
    return {
      status: 422,
      body: {
        error: 'ai_blocked',
        message: 'The AI provider declined to analyse this image.',
        ...(dev ? { detail: `blockReason: ${blockReason}` } : {}),
      },
    }
  }

  const content = extractText(response)
  const parsed = parseModelJson(content)

  if (!parsed) {
    if (dev) logServerError('Gemini response could not be parsed as JSON', null)
    return {
      status: 502,
      body: {
        error: 'ai_malformed_json',
        message: 'The AI response could not be parsed into a privacy report.',
        ...(dev ? { detail: redact(String(content || '').slice(0, 500), config.apiKey) } : {}),
      },
    }
  }

  return {
    status: 200,
    body: {
      engine: 'ai',
      model: config.model,
      report: normaliseReport(parsed),
    },
  }
}

function extractText(response) {
  try {
    if (typeof response?.text === 'string') return response.text
  } catch {
    /* fall through to manual extraction below */
  }
  const parts = response?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('')
}

/** Never leak the API key, a stack trace, or a raw provider payload to the client. */
function mapErrorStatus(err) {
  if (err?.name === 'AbortError') return 504
  const status = Number(err?.status)
  if (status === 401 || status === 403) return 502
  if (status === 429) return 429
  if (status === 404) return 502
  if (Number.isFinite(status) && status >= 400 && status < 600) return 502
  return 502
}

/**
 * Turns an SDK/network error into a safe, user-facing body.
 *
 * In development (`NODE_ENV !== 'production'`) a `detail` field with the
 * provider's own error message is included (API key always stripped out),
 * so a future integration problem — a bad model name, a malformed schema, a
 * provider-side validation error — surfaces immediately instead of being
 * flattened into an opaque "HTTP 502". In production `detail` is omitted.
 */
function mapErrorBody(err, { dev = false, apiKey = '' } = {}) {
  const detail = dev ? redact(extractErrorDetail(err), apiKey) : undefined
  const withDetail = (body) => (detail ? { ...body, detail } : body)

  if (err?.name === 'AbortError') {
    return withDetail({ error: 'ai_timeout', message: 'The AI provider did not respond in time.' })
  }
  const status = Number(err?.status)
  if (status === 401 || status === 403) {
    return withDetail({
      error: 'ai_invalid_key',
      message: 'The server\u2019s Gemini API key was rejected. Check GEMINI_API_KEY on the server.',
    })
  }
  if (status === 429) {
    return withDetail({
      error: 'ai_rate_limited',
      message: 'The Gemini API rate limit was reached. Try again shortly.',
    })
  }
  if (status === 404) {
    return withDetail({
      error: 'ai_model_unavailable',
      message: 'The configured Gemini model is not available for this API key. Try a different GEMINI_MODEL.',
    })
  }
  if (Number.isFinite(status) && status >= 400) {
    return withDetail({
      error: 'ai_request_failed',
      message: `The AI provider rejected the request (HTTP ${status}).`,
    })
  }
  // Network failure, DNS error, connection refused, etc.
  return withDetail({
    error: 'ai_unreachable',
    message: 'Could not reach the AI provider. Check the server network connection.',
  })
}

/** Pulls the most useful human-readable message out of an SDK error, if any. */
function extractErrorDetail(err) {
  const status = Number(err?.status)
  const parts = []
  if (Number.isFinite(status)) parts.push(`HTTP ${status}`)
  if (err?.message) parts.push(String(err.message).slice(0, 400))
  const causeMessage = err?.cause?.message
  if (causeMessage && causeMessage !== err?.message) parts.push(String(causeMessage).slice(0, 200))
  return parts.join(' — ') || 'Unknown error'
}

/** Defence in depth: strip the configured API key out of any text before it can leave the server. */
function redact(text, apiKey) {
  if (!text) return text
  if (!apiKey) return text
  return text.split(apiKey).join('[redacted]')
}

/**
 * Development-only server log. Never includes the API key or image bytes —
 * only the error shape, which is what you need to diagnose an integration
 * problem (bad model name, malformed schema, auth failure, ...).
 */
function logServerError(label, err) {
  console.error(`[tracedetector:ai] ${label}`, err ? { status: err.status, name: err.name, message: err.message } : '')
}

function validateBody(body) {
  if (!body || typeof body !== 'object') {
    return { error: { error: 'invalid_request', message: 'Expected a JSON body.' } }
  }

  const dataUrl = typeof body.image === 'string' ? body.image.trim() : ''
  if (!dataUrl) {
    return { error: { error: 'missing_image', message: 'No image was provided.' } }
  }

  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl)
  if (!match) {
    return {
      error: {
        error: 'invalid_image',
        message: 'The image must be a base64 data URL.',
      },
    }
  }

  const mime = match[1].toLowerCase()
  if (!ALLOWED_MIME.has(mime)) {
    return {
      error: {
        error: 'unsupported_type',
        message: `Unsupported image type: ${mime}.`,
      },
    }
  }

  const base64 = match[2].replace(/\s/g, '')
  const approxBytes = Math.floor((base64.length * 3) / 4)
  if (approxBytes > MAX_IMAGE_BYTES) {
    return {
      error: {
        error: 'image_too_large',
        message: 'The image exceeds the 8 MB analysis limit.',
      },
    }
  }

  const rawName = typeof body.fileName === 'string' ? body.fileName : ''
  return {
    value: {
      mime,
      base64,
      fileName: rawName.slice(0, 180).replace(/[\r\n]/g, ' '),
    },
  }
}

/** Models occasionally wrap JSON in prose or a markdown fence. Recover gracefully. */
export function parseModelJson(content) {
  if (typeof content !== 'string' || !content.trim()) return null

  const attempts = []
  attempts.push(content.trim())

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content)
  if (fenced) attempts.push(fenced[1].trim())

  const first = content.indexOf('{')
  const last = content.lastIndexOf('}')
  if (first !== -1 && last > first) attempts.push(content.slice(first, last + 1))

  for (const candidate of attempts) {
    try {
      const value = JSON.parse(candidate)
      if (value && typeof value === 'object') return value
    } catch {
      /* try next strategy */
    }
  }
  return null
}

const SEVERITIES = new Set(['critical', 'high', 'medium', 'low'])
const CATEGORIES = new Set([
  'personal-information',
  'contact',
  'location',
  'identifier',
  'credential',
  'code',
  'workplace',
  'metadata',
  'other',
])

/** Defensive normalisation: never trust model output shape. */
export function normaliseReport(raw) {
  if (!raw || typeof raw !== 'object') raw = {}
  const findingsRaw = Array.isArray(raw.findings) ? raw.findings : []

  const findings = findingsRaw
    .filter((f) => f && typeof f === 'object')
    // A finding must name something; empty objects are hallucination noise.
    .filter((f) => str(f.type, 80) || str(f.description, 400))
    .slice(0, 40)
    .map((f) => {
      const severity = String(f.severity || '').toLowerCase()
      return {
        category: CATEGORIES.has(String(f.category || '').toLowerCase())
          ? String(f.category).toLowerCase()
          : 'other',
        type: str(f.type, 80) || 'Potentially sensitive content',
        severity: SEVERITIES.has(severity) ? severity : 'medium',
        confidence: clamp01(typeof f.confidence === 'number' ? f.confidence : 0.6),
        description: str(f.description, 400),
        evidence: str(f.evidence, 160),
        locationHint: str(f.locationHint, 120),
        box: normaliseBox(f.box),
      }
    })

  return {
    summary: str(raw.summary, 600),
    imageKind: str(raw.imageKind, 40).toLowerCase() || 'other',
    extractedText: str(raw.extractedText, 6000),
    findings,
  }
}

function normaliseBox(box) {
  if (!box || typeof box !== 'object') return null
  const nums = ['x', 'y', 'w', 'h'].map((k) => Number(box[k]))
  if (nums.some((n) => !Number.isFinite(n))) return null
  let [x, y, w, h] = nums
  // Some models answer in percentages or pixels of a 1000px canvas.
  if (nums.some((n) => n > 1.5)) {
    const scale = nums.some((n) => n > 100) ? 1000 : 100
    x /= scale
    y /= scale
    w /= scale
    h /= scale
  }
  x = clamp01(x)
  y = clamp01(y)
  w = clamp01(w)
  h = clamp01(h)
  if (w <= 0.002 || h <= 0.002) return null
  if (x + w > 1) w = 1 - x
  if (y + h > 1) h = 1 - y
  return { x, y, w, h }
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function str(value, max) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}
