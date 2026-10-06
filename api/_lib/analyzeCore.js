import { readAiConfig } from './config.js'
import { SYSTEM_PROMPT, RESPONSE_SCHEMA_HINT } from './prompt.js'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB of raw image data
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
])
const REQUEST_TIMEOUT_MS = 60_000

/**
 * Framework-agnostic core. Takes a parsed JSON body, returns { status, body }.
 * Used by the Vercel-style serverless function AND by the Vite dev middleware,
 * so local development and deployment behave identically.
 */
export async function analyzeImage(body, env = process.env) {
  const config = readAiConfig(env)

  if (!config.configured) {
    return {
      status: 503,
      body: {
        error: 'ai_not_configured',
        message:
          'No AI provider is configured on the server. Set TRACEDETECTOR_AI_API_KEY to enable AI analysis.',
      },
    }
  }

  const validation = validateBody(body)
  if (validation.error) {
    return { status: 400, body: validation.error }
  }

  const { dataUrl, fileName } = validation.value

  let response
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyse this image for exposed information before it is shared.${
                  fileName ? `\nOriginal file name: ${fileName}` : ''
                }\n\n${RESPONSE_SCHEMA_HINT}`,
              },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
      }),
    })
  } catch (err) {
    clearTimeout(timer)
    const aborted = err && err.name === 'AbortError'
    return {
      status: 504,
      body: {
        error: aborted ? 'ai_timeout' : 'ai_unreachable',
        message: aborted
          ? 'The AI provider did not respond in time.'
          : 'Could not reach the AI provider. Check the server network connection.',
      },
    }
  }
  clearTimeout(timer)

  if (!response.ok) {
    const detail = await safeText(response)
    return {
      status: 502,
      body: {
        error: 'ai_request_failed',
        message: `The AI provider rejected the request (HTTP ${response.status}).`,
        // Never echo the key; provider messages are truncated.
        detail: detail.slice(0, 300),
      },
    }
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    return {
      status: 502,
      body: { error: 'ai_bad_response', message: 'The AI provider returned a non-JSON response.' },
    }
  }

  const content = payload?.choices?.[0]?.message?.content
  const parsed = parseModelJson(content)

  if (!parsed) {
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
      model: config.model,
      report: normaliseReport(parsed),
    },
  }
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

  const approxBytes = Math.floor((match[2].replace(/\s/g, '').length * 3) / 4)
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
      dataUrl,
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

async function safeText(response) {
  try {
    return await response.text()
  } catch {
    return ''
  }
}
