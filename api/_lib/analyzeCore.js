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
// Three 12s attempts plus 1s/2s backoffs on each of two models cap the worst
// case near 78s, below the browser's 90s network and 95s UI timeouts.
const REQUEST_TIMEOUT_MS = 12_000
const MAX_REQUEST_ATTEMPTS = 3
const RETRY_BACKOFF_MS = [1_000, 2_000]
const RETRYABLE_HTTP_STATUS_CODES = [429, 500, 502, 503, 504]
const RETRYABLE_HTTP_STATUS_SET = new Set(RETRYABLE_HTTP_STATUS_CODES)
const TRANSIENT_PROVIDER_STATUSES = new Set(['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED'])
// Candidate-level content-filter outcomes. When the model stops for one of
// these reasons there are no usable text parts; surfacing ai_blocked (rather
// than ai_malformed_json) tells the caller the image was declined, not that
// the provider returned corrupt JSON.
const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'IMAGE_SAFETY',
  'RECITATION',
  'IMAGE_RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'IMAGE_PROHIBITED_CONTENT',
  'SPII',
])

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
        message: 'AI Analysis requires a Gemini API key. Set TRACEDETECTOR_AI_API_KEY on the server to enable it.',
      },
    }
  }

  const validation = validateBody(body)
  if (validation.error) {
    return { status: 400, body: validation.error }
  }

  const { mime, base64, fileName } = validation.value
  // A fresh request object per attempt: primary retries and the fallback
  // model all send an identical, valid structured-output configuration, and
  // no attempt can observe mutations made by an earlier SDK call.
  const buildRequest = () => buildGeminiRequest({ mime, base64, fileName })

  let client
  try {
    client = createClient(config.apiKey)
  } catch (err) {
    if (dev) logServerError('Gemini client initialization failed', getProviderFailureInfo(err))
    return providerErrorResponse(err)
  }

  const wait = deps.sleep || sleep
  let response
  let model = config.model

  try {
    response = await generateContentWithRetries(client, model, buildRequest, { wait, dev })
  } catch (primaryError) {
    const canUseFallback =
      isTransientProviderError(primaryError) &&
      config.fallbackModel &&
      config.fallbackModel !== config.model

    if (!canUseFallback) {
      return providerErrorResponse(primaryError)
    }

    if (dev) {
      logServerError('Primary model retries exhausted; trying configured fallback', getProviderFailureInfo(primaryError))
    }

    model = config.fallbackModel
    try {
      response = await generateContentWithRetries(client, model, buildRequest, { wait, dev })
    } catch (fallbackError) {
      return providerErrorResponse(fallbackError)
    }
  }

  const blockReason = response?.promptFeedback?.blockReason
  if (blockReason) {
    return {
      status: 422,
      body: {
        error: 'ai_blocked',
        message: 'The AI provider declined to analyse this image.',
      },
    }
  }

  const finishReason = firstCandidateFinishReason(response)
  if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
    return {
      status: 422,
      body: {
        error: 'ai_blocked',
        message: 'The AI provider declined to analyse this image.',
      },
    }
  }

  const content = extractModelText(response)
  const parsed = parseModelJson(content)

  // The structured-output contract requires a report object carrying a
  // findings array. Anything else — wrong-shaped JSON, a bare array, a
  // truncated payload — must be an error, never a silent "no findings"
  // verdict: a false-negative privacy report is worse than no report.
  if (!parsed || !isReportPayload(parsed)) {
    if (dev) {
      logServerError('Gemini response could not be parsed as JSON', {
        httpStatus: null,
        providerStatus: null,
        transient: false,
        finishReason,
        hasText: content.length > 0,
        textLength: content.length,
      })
    }
    return {
      status: 502,
      body: {
        error: 'ai_malformed_json',
        message: 'The AI response could not be parsed into a privacy report.',
      },
    }
  }

  return {
    status: 200,
    body: {
      engine: 'ai',
      model,
      report: normaliseReport(parsed),
    },
  }
}

/**
 * Builds the Gemini generateContent payload: native multimodal image input
 * plus the enforced structured-output configuration (application/json
 * constrained by the TraceDetector response schema). Called fresh for every
 * attempt so primary retries and the fallback model always send the same
 * valid configuration.
 */
function buildGeminiRequest({ mime, base64, fileName }) {
  return {
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
      httpOptions: {
        timeout: REQUEST_TIMEOUT_MS,
        // The SDK defaults to five attempts with backoff up to 60 seconds.
        // Set one SDK attempt so our own small, explicit retry budget controls
        // total latency and fallback timing.
        retryOptions: {
          attempts: 1,
          httpStatusCodes: RETRYABLE_HTTP_STATUS_CODES,
        },
      },
    },
  }
}

async function generateContentWithRetries(client, model, buildRequest, { wait, dev }) {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await client.models.generateContent({ ...buildRequest(), model })
    } catch (err) {
      const failure = getProviderFailureInfo(err)
      if (dev) {
        logServerError(`Gemini request attempt ${attempt} failed`, {
          ...failure,
          attempt,
          maxAttempts: MAX_REQUEST_ATTEMPTS,
        })
      }

      if (!failure.transient || attempt === MAX_REQUEST_ATTEMPTS) {
        throw err
      }

      await wait(RETRY_BACKOFF_MS[attempt - 1])
    }
  }

  // The bounded loop either returns a response or throws the last error.
  throw new Error('Gemini request attempts exhausted unexpectedly.')
}

/**
 * Obtains the generated text from a @google/genai GenerateContentResponse.
 *
 * The SDK exposes the output as a `text` accessor (a getter returning
 * `string | undefined` on real responses): the concatenation of the
 * non-thought text parts of the first candidate. Prefer it, then fall back
 * to a manual part walk with the same semantics. Thought parts and non-text
 * parts (function calls, inline data, …) are skipped: thinking models emit
 * reasoning text that would otherwise pollute the JSON payload and break
 * parsing even though the answer part itself is valid.
 */
export function extractModelText(response) {
  if (!response || typeof response !== 'object') return ''

  try {
    const direct = response.text
    if (typeof direct === 'string') return direct
    if (typeof direct === 'function') {
      const called = direct.call(response)
      if (typeof called === 'string') return called
    }
  } catch {
    /* fall through to the manual part walk below */
  }

  const candidates = Array.isArray(response.candidates) ? response.candidates : []
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts
    if (!Array.isArray(parts)) continue
    const text = parts
      .filter((part) => part && typeof part === 'object')
      .filter((part) => part.thought !== true)
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
    if (text) return text
  }
  return ''
}

function firstCandidateFinishReason(response) {
  const reason = response?.candidates?.[0]?.finishReason
  return typeof reason === 'string' ? reason.trim().toUpperCase() : null
}

/** Minimal TraceDetector contract: a report object carrying a findings array. */
function isReportPayload(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.findings)
}

/** Classify provider failures without exposing their raw messages to the browser or logs. */
function providerErrorResponse(err) {
  const failure = getProviderFailureInfo(err)

  if (failure.transient) {
    return {
      status: 503,
      body: {
        error: 'ai_provider_unavailable',
        message: 'AI analysis is temporarily unavailable. Please try again in a moment.',
      },
    }
  }

  if (failure.httpStatus === 401 || failure.httpStatus === 403) {
    return {
      status: 502,
      body: {
        error: 'ai_invalid_key',
        message: 'The Gemini API key was rejected. Check the server configuration.',
      },
    }
  }

  if (failure.httpStatus === 404) {
    return {
      status: 502,
      body: {
        error: 'ai_model_unavailable',
        message: 'The configured Gemini model is not available for this API key.',
      },
    }
  }

  if (failure.httpStatus !== null && failure.httpStatus >= 400) {
    return {
      status: 502,
      body: {
        error: 'ai_request_failed',
        message: 'The AI provider could not process this request.',
      },
    }
  }

  return {
    status: 502,
    body: {
      error: 'ai_unreachable',
      message: 'Could not reach the AI provider. Check the server network connection.',
    },
  }
}

function getProviderFailureInfo(err) {
  const httpStatus = extractHttpStatus(err)
  const providerStatus = extractProviderStatus(err)
  const timedOut = err?.name === 'AbortError' || err?.name === 'TimeoutError'

  // Explicit auth, model-not-found and other HTTP failures take precedence
  // over incidental status text in a provider message.
  const transient =
    httpStatus !== null
      ? RETRYABLE_HTTP_STATUS_SET.has(httpStatus)
      : TRANSIENT_PROVIDER_STATUSES.has(providerStatus) || timedOut

  return { httpStatus, providerStatus, transient }
}

function isTransientProviderError(err) {
  return getProviderFailureInfo(err).transient
}

function extractHttpStatus(err) {
  const directCandidates = [err?.status, err?.response?.status, err?.error?.code]
  for (const candidate of directCandidates) {
    const status = parseHttpStatus(candidate)
    if (status !== null) return status
  }

  const payload = parseProviderErrorPayload(err?.message)
  for (const candidate of [payload?.error?.code, payload?.code]) {
    const status = parseHttpStatus(candidate)
    if (status !== null) return status
  }

  return null
}

function parseHttpStatus(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) {
    return value
  }
  if (typeof value === 'string' && /^\s*\d{3}\s*$/.test(value)) {
    return Number(value.trim())
  }
  return null
}

function extractProviderStatus(err) {
  const payload = parseProviderErrorPayload(err?.message)
  const candidates = [
    err?.status,
    err?.code,
    err?.error?.status,
    err?.cause?.status,
    payload?.error?.status,
    payload?.status,
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const status = candidate.trim().toUpperCase()
    if (TRANSIENT_PROVIDER_STATUSES.has(status)) return status
  }

  // Some transport layers flatten Google's JSON error into a message string.
  const flattened = String(err?.message || '').match(/\b(UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED)\b/i)
  return flattened ? flattened[1].toUpperCase() : null
}

function parseProviderErrorPayload(message) {
  if (typeof message !== 'string') return null
  try {
    const payload = JSON.parse(message)
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Server-side development log containing only whitelisted status metadata. Never logs response content. */
function logServerError(
  label,
  {
    httpStatus = null,
    providerStatus = null,
    transient = false,
    attempt,
    maxAttempts,
    finishReason,
    hasText,
    textLength,
  } = {},
) {
  console.warn(`[tracedetector:ai] ${label}`, {
    httpStatus,
    providerStatus,
    transient,
    ...(attempt === undefined ? {} : { attempt }),
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
    ...(finishReason === undefined ? {} : { finishReason }),
    ...(hasText === undefined ? {} : { hasText }),
    ...(textLength === undefined ? {} : { textLength }),
  })
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

/**
 * Parses the model's JSON payload out of the generated text.
 *
 * With structured output enforced the text is normally raw JSON. Fenced
 * blocks (```json … ```, any tag/casing) and brace-slicing exist only as
 * defensive last-resort paths for models that wrap the payload despite the
 * responseMimeType/responseSchema configuration. Only plain objects are
 * accepted — arrays and primitives are never a valid report.
 */
export function parseModelJson(content) {
  if (typeof content !== 'string') return null
  const text = content.replace(/^\uFEFF/, '').trim()
  if (!text) return null

  const candidates = [text]

  // Defensive path: try the inside of every fenced block, in order.
  const fencePattern = /```([^`\n]*)\n?([\s\S]*?)```/g
  let fence
  while ((fence = fencePattern.exec(text)) !== null && candidates.length <= 10) {
    const inner = (fence[2] || '').trim()
    if (inner && inner !== text && !candidates.includes(inner)) candidates.push(inner)
  }

  // Last resort: the outermost brace span (handles prose around JSON and
  // unclosed fences from truncated output that still happens to be complete).
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const sliced = text.slice(first, last + 1).trim()
    if (sliced !== text && !candidates.includes(sliced)) candidates.push(sliced)
  }

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate)
      if (value && typeof value === 'object' && !Array.isArray(value)) return value
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
