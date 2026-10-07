import test from 'node:test'
import assert from 'node:assert/strict'

import { scanText, redact } from '../src/utils/patterns.js'
import { computeRiskScore } from '../src/utils/scoring.js'
import { buildChecklist } from '../src/utils/checklist.js'
import { readImageMetadata } from '../src/utils/metadata.js'
import { normaliseReport, parseModelJson, analyzeImage, extractModelText } from '../api/_lib/analyzeCore.js'
import { readAiConfig, publicAiStatus } from '../api/_lib/config.js'
import { GEMINI_RESPONSE_SCHEMA, SYSTEM_PROMPT } from '../api/_lib/prompt.js'
import { ApiError, GenerateContentResponse, Type } from '@google/genai'
import { createServer } from 'vite'
import { FRIENDLY_ERRORS, requestAiAnalysis } from '../src/services/aiClient.js'

/* ----------------------------- detectors ------------------------------ */

test('detects an email address and redacts it', () => {
  const [hit] = scanText('Contact: dana.whitfield@northwind.com for access')
  assert.equal(hit.type, 'Email Address')
  assert.equal(hit.severity, 'medium')
  assert.ok(!hit.evidence.includes('dana.whitfield'), 'evidence must be redacted')
})

test('detects AWS keys and secret keys as critical', () => {
  const hits = scanText('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE and sk-abcdefghijklmnopqrst')
  const types = hits.map((h) => h.type)
  assert.ok(types.includes('AWS Access Key ID'))
  assert.ok(types.includes('API Secret Key'))
  assert.ok(hits.every((h) => h.category !== 'credential' || h.severity === 'critical'))
})

test('payment cards must pass the Luhn check', () => {
  const valid = scanText('card 4111 1111 1111 1111').map((h) => h.type)
  const invalid = scanText('order 1234 5678 9012 3456').map((h) => h.type)
  assert.ok(valid.includes('Payment Card Number'))
  assert.ok(!invalid.includes('Payment Card Number'))
})

test('a card number is not reported as a 12-digit national ID', () => {
  const types = scanText('card 4111 1111 1111 1111').map((h) => h.type)
  assert.ok(!types.includes('National ID (12-digit)'))
})

test('clean text produces no findings', () => {
  assert.deepEqual(scanText('A photo of a cat sitting on a fence.'), [])
})

test('redact never returns the original secret', () => {
  assert.notEqual(redact('sk-super-secret-value', 'credential'), 'sk-super-secret-value')
  assert.ok(redact('priya@example.com').endsWith('@example.com'))
})

/* ------------------------------ scoring ------------------------------- */

test('no findings scores zero and reads as safe', () => {
  const risk = computeRiskScore([])
  assert.equal(risk.score, 0)
  assert.equal(risk.level, 'safe')
})

test('one critical finding always lands in the critical band', () => {
  const risk = computeRiskScore([{ severity: 'critical', confidence: 0.9 }])
  assert.ok(risk.score >= 80, `expected >= 80, got ${risk.score}`)
  assert.equal(risk.level, 'critical')
})

test('scores saturate below 100 and stay ordered', () => {
  const many = Array.from({ length: 12 }, () => ({ severity: 'critical', confidence: 1 }))
  const few = [{ severity: 'low', confidence: 1 }]
  assert.ok(computeRiskScore(many).score <= 99)
  assert.ok(computeRiskScore(many).score > computeRiskScore(few).score)
})

/* ----------------------------- checklist ------------------------------ */

test('checklist never claims "clear" for a check the engine cannot run', () => {
  const items = buildChecklist([], { text: false, metadata: true, codes: false })
  const byId = Object.fromEntries(items.map((i) => [i.id, i.status]))
  assert.equal(byId.passwords, 'unknown')
  assert.equal(byId.codes, 'unknown')
  assert.equal(byId.geotag, 'clear')
})

test('checklist flags a risk when a matching finding exists', () => {
  const items = buildChecklist(
    [{ category: 'credential', type: 'API Secret Key', detectorId: 'openai-key' }],
    { text: true, metadata: true, codes: true },
  )
  assert.equal(items.find((i) => i.id === 'secrets').status, 'risk')
  assert.equal(items.find((i) => i.id === 'contact').status, 'clear')
})

/* ------------------------- metadata (real bytes) ----------------------- */

function jpegWithExifGps() {
  // Minimal little-endian TIFF: IFD0 -> GPS IFD with lat/lon rationals.
  const header = Buffer.alloc(8)
  header.write('II', 0, 'ascii')
  header.writeUInt16LE(0x2a, 2)
  header.writeUInt32LE(8, 4)

  const entry = (tag, type, count, valueLE) => {
    const e = Buffer.alloc(12)
    e.writeUInt16LE(tag, 0)
    e.writeUInt16LE(type, 2)
    e.writeUInt32LE(count, 4)
    valueLE.copy(e, 8)
    return e
  }
  const u32 = (n) => {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(n)
    return b
  }

  const ifd0Size = 2 + 1 * 12 + 4
  const gpsOffset = 8 + ifd0Size
  const gpsSize = 2 + 4 * 12 + 4
  const dataOffset = gpsOffset + gpsSize

  const ifd0 = Buffer.concat([
    (() => {
      const b = Buffer.alloc(2)
      b.writeUInt16LE(1)
      return b
    })(),
    entry(0x8825, 4, 1, u32(gpsOffset)),
    Buffer.alloc(4),
  ])

  const rat = (triples) => {
    const b = Buffer.alloc(24)
    triples.forEach(([n, d], i) => {
      b.writeUInt32LE(n, i * 8)
      b.writeUInt32LE(d, i * 8 + 4)
    })
    return b
  }
  const latData = rat([[12, 1], [58, 1], [2345, 100]])
  const lonData = rat([[77, 1], [35, 1], [1198, 100]])

  const gps = Buffer.concat([
    (() => {
      const b = Buffer.alloc(2)
      b.writeUInt16LE(4)
      return b
    })(),
    entry(0x0001, 2, 2, Buffer.from('N\0\0\0', 'ascii')),
    entry(0x0002, 5, 3, u32(dataOffset)),
    entry(0x0003, 2, 2, Buffer.from('E\0\0\0', 'ascii')),
    entry(0x0004, 5, 3, u32(dataOffset + 24)),
    Buffer.alloc(4),
  ])

  const tiff = Buffer.concat([header, ifd0, gps, latData, lonData])
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff])
  const len = Buffer.alloc(2)
  len.writeUInt16BE(payload.length + 2)

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe1]),
    len,
    payload,
    Buffer.from([0xff, 0xd9]),
  ])
}

test('reads GPS coordinates out of real JPEG EXIF bytes', () => {
  const buf = jpegWithExifGps()
  const meta = readImageMetadata(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  assert.equal(meta.format, 'JPEG')
  assert.equal(meta.hasExif, true)
  assert.ok(meta.gps, 'expected GPS coordinates')
  assert.ok(Math.abs(meta.gps.lat - 12.973181) < 0.001)
  assert.ok(Math.abs(meta.gps.lon - 77.586661) < 0.001)
})

test('a file with no metadata reports nothing rather than guessing', () => {
  const plain = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0])
  const meta = readImageMetadata(plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength))
  assert.equal(meta.hasExif, false)
  assert.equal(meta.gps, null)
})

/* -------------------------- AI response safety ------------------------- */

test('parses JSON out of a fenced model response', () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(parseModelJson('Sure! {"a":2} hope that helps'), { a: 2 })
  assert.equal(parseModelJson('I cannot help with that.'), null)
})

test('normalises a hostile AI payload without throwing', () => {
  const report = normaliseReport({
    summary: 42,
    findings: [
      {},
      { type: 'Email Address', severity: 'EXTREME', confidence: 9, box: { x: 8, y: 22, w: 34, h: 4 } },
      { type: 'Tiny', box: { x: 'a', y: null, w: 1, h: 1 } },
      { description: 'something odd', box: { x: 0.1, y: 0.1, w: 5, h: 5 } },
    ],
  })
  assert.equal(report.summary, '')
  assert.equal(report.findings.length, 3, 'empty objects are dropped')

  const [email] = report.findings
  assert.equal(email.severity, 'medium', 'unknown severities fall back to medium')
  assert.ok(email.confidence <= 1)
  assert.ok(email.box.x > 0.07 && email.box.x < 0.09, 'percentage boxes are rescaled')

  assert.equal(report.findings[1].box, null, 'non-numeric boxes are dropped')
  const clamped = report.findings[2].box
  assert.ok(clamped.x + clamped.w <= 1.0001, 'boxes are clamped inside the image')
})

/* ----------------------------- server config --------------------------- */

test('AI is reported as unconfigured when no key is present', () => {
  const status = publicAiStatus({})
  assert.equal(status.aiConfigured, false)
  assert.equal(status.model, null)
})

test('the public status never leaks the API key or optional fallback model', () => {
  const env = {
    TRACEDETECTOR_AI_API_KEY: 'super-secret',
    TRACEDETECTOR_AI_MODEL: 'some-model',
    TRACEDETECTOR_AI_FALLBACK_MODEL: 'fallback-model',
  }
  const status = publicAiStatus(env)
  assert.equal(status.aiConfigured, true)
  assert.equal(status.model, 'some-model')
  assert.ok(!JSON.stringify(status).includes('super-secret'))
  assert.ok(!JSON.stringify(status).includes('fallback-model'))
  assert.equal(readAiConfig(env).apiKey, 'super-secret')
})

test('blank model configuration uses the configured primary model default', () => {
  const config = readAiConfig({ TRACEDETECTOR_AI_API_KEY: 'k' })
  assert.ok(config.model && typeof config.model === 'string')
  assert.equal(config.model, 'gemini-3.8-flash')
  assert.equal(config.fallbackModel, '')
})

test('the optional fallback model is read only from its server-side environment variable', () => {
  const config = readAiConfig({
    TRACEDETECTOR_AI_API_KEY: 'k',
    TRACEDETECTOR_AI_MODEL: 'gemini-3.8-flash',
    TRACEDETECTOR_AI_FALLBACK_MODEL: 'gemini-3.5-flash-lite',
  })
  assert.equal(config.model, 'gemini-3.8-flash')
  assert.equal(config.fallbackModel, 'gemini-3.5-flash-lite')
})

test('GEMINI_API_KEY / GEMINI_MODEL are accepted as a fallback, but TRACEDETECTOR_AI_* wins', () => {
  const fallbackOnly = readAiConfig({ GEMINI_API_KEY: 'fallback-key', GEMINI_MODEL: 'fallback-model' })
  assert.equal(fallbackOnly.apiKey, 'fallback-key')
  assert.equal(fallbackOnly.model, 'fallback-model')
  assert.equal(fallbackOnly.configured, true)

  const bothSet = readAiConfig({
    TRACEDETECTOR_AI_API_KEY: 'primary-key',
    TRACEDETECTOR_AI_MODEL: 'primary-model',
    GEMINI_API_KEY: 'fallback-key',
    GEMINI_MODEL: 'fallback-model',
  })
  assert.equal(bothSet.apiKey, 'primary-key')
  assert.equal(bothSet.model, 'primary-model')
})

/* ------------------------- Gemini schema contract ----------------------- */

test('the Gemini response schema uses the uppercase Type enum, not JSON-Schema strings', () => {
  // Gemini's structured-output API rejects lowercase JSON-Schema-style types
  // (e.g. "object") with an HTTP 400 — this previously surfaced to users as a
  // generic 502. Guard against regressing to the wrong casing.
  assert.equal(GEMINI_RESPONSE_SCHEMA.type, Type.OBJECT)
  assert.equal(GEMINI_RESPONSE_SCHEMA.properties.summary.type, Type.STRING)
  assert.equal(GEMINI_RESPONSE_SCHEMA.properties.findings.type, Type.ARRAY)

  const findingSchema = GEMINI_RESPONSE_SCHEMA.properties.findings.items
  assert.equal(findingSchema.type, Type.OBJECT)
  assert.equal(findingSchema.properties.category.type, Type.STRING)
  assert.equal(findingSchema.properties.confidence.type, Type.NUMBER)
  assert.equal(findingSchema.properties.box.type, Type.OBJECT)

  // Constrained string fields must set format:"enum" alongside enum, per the
  // Gemini Schema contract, or the values are not actually enforced.
  for (const field of [GEMINI_RESPONSE_SCHEMA.properties.imageKind, findingSchema.properties.category, findingSchema.properties.severity]) {
    assert.equal(field.format, 'enum')
    assert.ok(Array.isArray(field.enum) && field.enum.length > 0)
  }
})

/* --------------------- analyzeImage end-to-end (mocked) ------------------ */

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function fakeClient(generateContent) {
  return () => ({ models: { generateContent } })
}

test('a successful Gemini call is converted into TraceDetector\u2019s structured report', async () => {
  const modelJson = JSON.stringify({
    summary: 'A screenshot containing one visible email address.',
    imageKind: 'screenshot',
    extractedText: 'Contact: jo****@example.com',
    findings: [
      {
        category: 'contact',
        type: 'Email Address',
        severity: 'medium',
        confidence: 0.9,
        description: 'An email address is visible in the screenshot.',
        evidence: 'jo****@example.com',
        locationHint: 'top-left corner',
        box: { x: 0.1, y: 0.1, w: 0.3, h: 0.05 },
      },
    ],
  })

  const createClient = fakeClient(async (request) => {
    // The image must be forwarded as inline multimodal data, not a URL.
    const imagePart = request.contents[0].parts.find((p) => p.inlineData)
    assert.ok(imagePart, 'expected an inlineData part carrying the image')
    assert.equal(imagePart.inlineData.mimeType, 'image/png')
    assert.equal(request.config.responseMimeType, 'application/json')
    assert.equal(request.config.httpOptions.timeout, 12_000)
    assert.equal(request.config.httpOptions.retryOptions.attempts, 1, 'SDK retries must not compound our retry budget')
    assert.equal(request.model, 'gemini-3.8-flash')
    return { text: modelJson, promptFeedback: undefined }
  })

  const result = await analyzeImage(
    { image: TINY_PNG, fileName: 'screenshot.png' },
    { TRACEDETECTOR_AI_API_KEY: 'test-key', TRACEDETECTOR_AI_MODEL: 'gemini-3.8-flash', NODE_ENV: 'production' },
    { createClient },
  )

  assert.equal(result.status, 200)
  assert.equal(result.body.engine, 'ai')
  assert.equal(result.body.model, 'gemini-3.8-flash')
  assert.equal(result.body.report.findings.length, 1)
  assert.equal(result.body.report.findings[0].category, 'contact')
  assert.equal(result.body.report.findings[0].type, 'Email Address')
  assert.ok(result.body.report.findings[0].box)
})

function geminiError(httpStatus, providerStatus, message = 'Temporary provider failure') {
  return new ApiError({
    status: httpStatus,
    message: JSON.stringify({
      error: { code: httpStatus, status: providerStatus, message },
    }),
  })
}

function noWait() {
  const delays = []
  return { delays, sleep: async (ms) => delays.push(ms) }
}

const NORMALIZED_SUCCESS = JSON.stringify({
  summary: 'A clear image with no visible privacy findings.',
  imageKind: 'photo',
  extractedText: '',
  findings: [],
})

const PRODUCTION_ENV = {
  TRACEDETECTOR_AI_API_KEY: 'test-key',
  TRACEDETECTOR_AI_MODEL: 'gemini-3.8-flash',
  NODE_ENV: 'production',
}

test('Gemini succeeds on its first attempt without waiting', async () => {
  let calls = 0
  const createClient = fakeClient(async () => {
    calls += 1
    return { text: NORMALIZED_SUCCESS }
  })
  const retry = noWait()
  const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient, sleep: retry.sleep })

  assert.equal(calls, 1)
  assert.deepEqual(retry.delays, [])
  assert.equal(result.status, 200)
  assert.equal(result.body.report.summary, 'A clear image with no visible privacy findings.')
  assert.deepEqual(result.body.report.findings, [])
})

test('Gemini retries HTTP 503 once, then returns the normalized report', async () => {
  let calls = 0
  const createClient = fakeClient(async () => {
    calls += 1
    if (calls === 1) throw geminiError(503, 'UNAVAILABLE', 'This model is currently experiencing high demand.')
    return { text: NORMALIZED_SUCCESS }
  })
  const retry = noWait()
  const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient, sleep: retry.sleep })

  assert.equal(calls, 2)
  assert.deepEqual(retry.delays, [1_000])
  assert.equal(result.status, 200)
  assert.equal(result.body.report.summary, 'A clear image with no visible privacy findings.')
  assert.ok(Array.isArray(result.body.report.findings))
})

test('Gemini retries HTTP 504 DEADLINE_EXCEEDED once, then succeeds', async () => {
  let calls = 0
  const createClient = fakeClient(async () => {
    calls += 1
    if (calls === 1) throw geminiError(504, 'DEADLINE_EXCEEDED', 'Deadline expired before operation could complete.')
    return { text: NORMALIZED_SUCCESS }
  })
  const retry = noWait()
  const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient, sleep: retry.sleep })

  assert.equal(calls, 2)
  assert.deepEqual(retry.delays, [1_000])
  assert.equal(result.status, 200)
})

test('the other configured transient HTTP statuses are retried', async () => {
  for (const [status, providerStatus] of [[429, 'RESOURCE_EXHAUSTED'], [500, 'INTERNAL'], [502, 'BAD_GATEWAY']]) {
    let calls = 0
    const createClient = fakeClient(async () => {
      calls += 1
      if (calls === 1) throw geminiError(status, providerStatus)
      return { text: NORMALIZED_SUCCESS }
    })
    const retry = noWait()
    const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient, sleep: retry.sleep })

    assert.equal(result.status, 200, `HTTP ${status} should recover on retry`)
    assert.equal(calls, 2)
    assert.deepEqual(retry.delays, [1_000])
  }
})

test('Gemini symbolic UNAVAILABLE status is retried even without a numeric HTTP status', async () => {
  let calls = 0
  const createClient = fakeClient(async () => {
    calls += 1
    if (calls === 1) {
      throw new ApiError({
        status: 'UNAVAILABLE',
        message: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Please retry.' } }),
      })
    }
    return { text: NORMALIZED_SUCCESS }
  })
  const retry = noWait()
  const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient, sleep: retry.sleep })

  assert.equal(calls, 2)
  assert.deepEqual(retry.delays, [1_000])
  assert.equal(result.status, 200)
})

test('repeated HTTP 503 failures stop after three bounded attempts', async () => {
  let calls = 0
  const createClient = fakeClient(async () => {
    calls += 1
    throw geminiError(503, 'UNAVAILABLE')
  })
  const retry = noWait()
  const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient, sleep: retry.sleep })

  assert.equal(calls, 3)
  assert.deepEqual(retry.delays, [1_000, 2_000])
  assert.equal(result.status, 503)
  assert.equal(result.body.error, 'ai_provider_unavailable')
  assert.equal(result.body.message, 'AI analysis is temporarily unavailable. Please try again in a moment.')
})

test('repeated HTTP 504 failures stop after three bounded attempts', async () => {
  let calls = 0
  const createClient = fakeClient(async () => {
    calls += 1
    throw geminiError(504, 'DEADLINE_EXCEEDED')
  })
  const retry = noWait()
  const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient, sleep: retry.sleep })

  assert.equal(calls, 3)
  assert.deepEqual(retry.delays, [1_000, 2_000])
  assert.equal(result.status, 503)
  assert.equal(result.body.error, 'ai_provider_unavailable')
})

test('primary retries exhaust before the configured fallback model is attempted', async () => {
  const models = []
  const createClient = fakeClient(async (request) => {
    models.push(request.model)
    if (request.model === 'gemini-3.8-flash') throw geminiError(503, 'UNAVAILABLE')
    return { text: NORMALIZED_SUCCESS }
  })
  const retry = noWait()
  const result = await analyzeImage(
    { image: TINY_PNG },
    {
      ...PRODUCTION_ENV,
      TRACEDETECTOR_AI_FALLBACK_MODEL: 'gemini-3.5-flash-lite',
    },
    { createClient, sleep: retry.sleep },
  )

  assert.deepEqual(models, [
    'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
  ])
  assert.deepEqual(retry.delays, [1_000, 2_000])
  assert.equal(result.status, 200)
  assert.equal(result.body.model, 'gemini-3.5-flash-lite')
  assert.equal(result.body.report.summary, 'A clear image with no visible privacy findings.')
})

test('a transient fallback failure also stops after its retry limit and returns a clean error', async () => {
  const models = []
  const createClient = fakeClient(async (request) => {
    models.push(request.model)
    if (request.model === 'gemini-3.8-flash') throw geminiError(503, 'UNAVAILABLE')
    throw geminiError(504, 'DEADLINE_EXCEEDED')
  })
  const retry = noWait()
  const result = await analyzeImage(
    { image: TINY_PNG },
    {
      ...PRODUCTION_ENV,
      TRACEDETECTOR_AI_FALLBACK_MODEL: 'gemini-3.5-flash-lite',
    },
    { createClient, sleep: retry.sleep },
  )

  assert.equal(models.length, 6)
  assert.deepEqual(models.slice(0, 3), Array(3).fill('gemini-3.8-flash'))
  assert.deepEqual(models.slice(3), Array(3).fill('gemini-3.5-flash-lite'))
  assert.deepEqual(retry.delays, [1_000, 2_000, 1_000, 2_000])
  assert.equal(result.status, 503)
  assert.equal(result.body.error, 'ai_provider_unavailable')
  assert.equal(result.body.detail, undefined)
})

test('invalid-key and authentication failures do not retry or invoke the fallback', async () => {
  for (const status of [401, 403]) {
    let calls = 0
    const createClient = fakeClient(async () => {
      calls += 1
      throw new ApiError({ status, message: 'Authentication failed for API key.' })
    })
    const retry = noWait()
    const result = await analyzeImage(
      { image: TINY_PNG },
      { ...PRODUCTION_ENV, TRACEDETECTOR_AI_FALLBACK_MODEL: 'fallback-model' },
      { createClient, sleep: retry.sleep },
    )

    assert.equal(calls, 1)
    assert.deepEqual(retry.delays, [])
    assert.equal(result.status, 502)
    assert.equal(result.body.error, 'ai_invalid_key')
  }
})

test('invalid model HTTP 404 fails immediately without retry or fallback', async () => {
  let calls = 0
  const createClient = fakeClient(async () => {
    calls += 1
    throw new ApiError({ status: 404, message: 'Model not found.' })
  })
  const retry = noWait()
  const result = await analyzeImage(
    { image: TINY_PNG },
    { ...PRODUCTION_ENV, TRACEDETECTOR_AI_FALLBACK_MODEL: 'fallback-model' },
    { createClient, sleep: retry.sleep },
  )

  assert.equal(calls, 1)
  assert.deepEqual(retry.delays, [])
  assert.equal(result.status, 502)
  assert.equal(result.body.error, 'ai_model_unavailable')
})

test('malformed-request HTTP 400 fails immediately without retry or fallback', async () => {
  let calls = 0
  const createClient = fakeClient(async () => {
    calls += 1
    throw new ApiError({ status: 400, message: 'Invalid request format.' })
  })
  const retry = noWait()
  const result = await analyzeImage(
    { image: TINY_PNG },
    { ...PRODUCTION_ENV, TRACEDETECTOR_AI_FALLBACK_MODEL: 'fallback-model' },
    { createClient, sleep: retry.sleep },
  )

  assert.equal(calls, 1)
  assert.deepEqual(retry.delays, [])
  assert.equal(result.status, 502)
  assert.equal(result.body.error, 'ai_request_failed')
})

test('provider messages, API keys, authorization text and image data never reach responses or logs', async () => {
  const secret = 'super-secret-test-api-key'
  const authValue = 'Bearer authorization-secret'
  const sensitiveProviderMessage = `Rejected request. API key ${secret}; Authorization: ${authValue}; image=${TINY_PNG}`
  const createClient = fakeClient(async () => {
    throw geminiError(503, 'UNAVAILABLE', sensitiveProviderMessage)
  })
  const retry = noWait()
  const capturedLogs = []
  const originalWarn = console.warn
  console.warn = (...args) =>
    capturedLogs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))

  let result
  try {
    result = await analyzeImage(
      { image: TINY_PNG },
      { ...PRODUCTION_ENV, TRACEDETECTOR_AI_API_KEY: secret, NODE_ENV: 'development' },
      { createClient, sleep: retry.sleep },
    )
  } finally {
    console.warn = originalWarn
  }

  const externallyVisible = JSON.stringify(result.body)
  const logs = capturedLogs.join('\n')
  for (const sensitive of [secret, authValue, 'Authorization:', TINY_PNG, sensitiveProviderMessage]) {
    assert.ok(!externallyVisible.includes(sensitive), `response leaked ${sensitive.slice(0, 20)}`)
    assert.ok(!logs.includes(sensitive), `server log leaked ${sensitive.slice(0, 20)}`)
  }
  assert.equal(result.body.error, 'ai_provider_unavailable')
  assert.ok(logs.includes('503'))
  assert.ok(logs.includes('UNAVAILABLE'))
})

test('the browser uses only safe friendly errors, never raw provider messages', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const payload of [
      { error: 'ai_provider_unavailable', message: 'Provider error includes API key: browser-secret' },
      { error: 'unrecognized_error', message: 'Authorization: Bearer browser-secret' },
    ]) {
      globalThis.fetch = async () => ({
        ok: false,
        json: async () => payload,
      })

      await assert.rejects(
        requestAiAnalysis({ dataUrl: TINY_PNG, fileName: 'photo.png' }),
        (error) => {
          assert.equal(
            error.message,
            payload.error === 'ai_provider_unavailable'
              ? FRIENDLY_ERRORS.ai_provider_unavailable
              : FRIENDLY_ERRORS.ai_request_failed,
          )
          assert.ok(!error.message.includes('browser-secret'))
          assert.ok(!error.message.includes('Authorization'))
          return true
        },
      )
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('a malformed (non-JSON) Gemini reply is reported, never crashes the handler', async () => {
  const createClient = fakeClient(async () => ({ text: 'I cannot help with that request.' }))
  const result = await analyzeImage({ image: TINY_PNG }, { ...PRODUCTION_ENV }, { createClient })
  assert.equal(result.status, 502)
  assert.equal(result.body.error, 'ai_malformed_json')
})

test('a prompt blocked by the provider is reported as 422, not a crash', async () => {
  const createClient = fakeClient(async () => ({ promptFeedback: { blockReason: 'SAFETY' } }))
  const result = await analyzeImage({ image: TINY_PNG }, { ...PRODUCTION_ENV }, { createClient })
  assert.equal(result.status, 422)
  assert.equal(result.body.error, 'ai_blocked')
})

test('a network failure (no status code) remains a single clean ai_unreachable error', async () => {
  let calls = 0
  const createClient = fakeClient(async () => {
    calls += 1
    throw new TypeError('fetch failed')
  })
  const retry = noWait()
  const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient, sleep: retry.sleep })

  assert.equal(calls, 1)
  assert.deepEqual(retry.delays, [])
  assert.equal(result.status, 502)
  assert.equal(result.body.error, 'ai_unreachable')
})

/* ------------- structured output + SDK response handling ------------- */

/**
 * Builds a real-shaped @google/genai response: a GenerateContentResponse
 * instance whose `text` is the SDK's own getter over candidates / content /
 * parts — the exact shape production returns, not a `{ text }` stub.
 */
function sdkResponse({ parts, finishReason = 'STOP', promptFeedback } = {}) {
  const response = new GenerateContentResponse()
  Object.assign(response, {
    candidates: [{ content: { role: 'model', parts }, finishReason }],
    ...(promptFeedback === undefined ? {} : { promptFeedback }),
  })
  return response
}

function structuredOutputSubset(config) {
  return {
    systemInstruction: config.systemInstruction,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
    responseMimeType: config.responseMimeType,
    responseSchema: config.responseSchema,
  }
}

const RICH_REPORT_JSON = JSON.stringify({
  summary: 'A screenshot showing a visible API key in a terminal window.',
  imageKind: 'screenshot',
  extractedText: 'sk_live_**** connected',
  findings: [
    {
      category: 'credential',
      type: 'API Secret Key',
      severity: 'critical',
      confidence: 0.95,
      description: 'A live API key is visible in the terminal output.',
      evidence: 'sk_live_****',
      locationHint: 'middle of the terminal window',
      box: { x: 0.2, y: 0.4, w: 0.5, h: 0.08 },
    },
  ],
})

test('primary model structured JSON arrives through the real SDK response shape', async () => {
  const createClient = fakeClient(async (request) => {
    const imagePart = request.contents[0].parts.find((p) => p.inlineData)
    assert.ok(imagePart, 'expected an inlineData part carrying the image')
    assert.equal(imagePart.inlineData.mimeType, 'image/png')
    assert.equal(request.config.responseMimeType, 'application/json')
    assert.deepEqual(request.config.responseSchema, GEMINI_RESPONSE_SCHEMA)
    assert.equal(request.config.systemInstruction, SYSTEM_PROMPT)
    assert.equal(request.model, 'gemini-3.8-flash')
    return sdkResponse({ parts: [{ text: RICH_REPORT_JSON }] })
  })

  const result = await analyzeImage({ image: TINY_PNG, fileName: 'screenshot.png' }, PRODUCTION_ENV, {
    createClient,
  })

  assert.equal(result.status, 200)
  assert.equal(result.body.engine, 'ai')
  assert.equal(result.body.model, 'gemini-3.8-flash')
  assert.equal(result.body.report.summary, 'A screenshot showing a visible API key in a terminal window.')
  assert.equal(result.body.report.findings.length, 1)
  assert.equal(result.body.report.findings[0].severity, 'critical')
  assert.deepEqual(result.body.report.findings[0].box, { x: 0.2, y: 0.4, w: 0.5, h: 0.08 })
})

test('fallback model structured JSON is extracted and normalised like the primary', async () => {
  const createClient = fakeClient(async (request) => {
    if (request.model === 'gemini-3.8-flash') throw geminiError(503, 'UNAVAILABLE')
    return sdkResponse({ parts: [{ text: RICH_REPORT_JSON }] })
  })
  const retry = noWait()
  const result = await analyzeImage(
    { image: TINY_PNG },
    { ...PRODUCTION_ENV, TRACEDETECTOR_AI_FALLBACK_MODEL: 'gemini-3.5-flash-lite' },
    { createClient, sleep: retry.sleep },
  )

  assert.equal(result.status, 200)
  assert.equal(result.body.model, 'gemini-3.5-flash-lite')
  assert.equal(result.body.report.findings.length, 1)
  assert.equal(result.body.report.findings[0].type, 'API Secret Key')
  assert.equal(result.body.report.findings[0].category, 'credential')
})

test('primary retries exhaust before a valid structured fallback response, with identical output config', async () => {
  const models = []
  const configs = []
  const createClient = fakeClient(async (request) => {
    models.push(request.model)
    configs.push(request.config)
    if (request.model === 'gemini-3.8-flash') throw geminiError(503, 'UNAVAILABLE')
    return sdkResponse({ parts: [{ text: NORMALIZED_SUCCESS }] })
  })
  const retry = noWait()
  const result = await analyzeImage(
    { image: TINY_PNG },
    { ...PRODUCTION_ENV, TRACEDETECTOR_AI_FALLBACK_MODEL: 'gemini-3.5-flash-lite' },
    { createClient, sleep: retry.sleep },
  )

  assert.deepEqual(models, ['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'])
  assert.deepEqual(retry.delays, [1_000, 2_000])
  assert.equal(result.status, 200)
  assert.equal(result.body.model, 'gemini-3.5-flash-lite')

  // Both models receive the same valid structured-output configuration…
  const [primaryConfig, , , fallbackConfig] = configs
  assert.deepEqual(structuredOutputSubset(primaryConfig), structuredOutputSubset(fallbackConfig))
  assert.equal(primaryConfig.responseMimeType, 'application/json')
  assert.deepEqual(primaryConfig.responseSchema, GEMINI_RESPONSE_SCHEMA)
  // …built fresh per attempt, so no call can observe another's mutations.
  assert.notEqual(primaryConfig, fallbackConfig)
})

test('SDK response extraction matches @google/genai text semantics', () => {
  const json = '{"findings":[]}'

  // Real SDK instance: text getter over a single answer part.
  assert.equal(extractModelText(sdkResponse({ parts: [{ text: json }] })), json)

  // JSON split across several text parts is concatenated.
  assert.equal(extractModelText(sdkResponse({ parts: [{ text: '{"find' }, { text: 'ings":[]}' }] })), json)

  // Thought signatures on the answer part do not hide the text.
  assert.equal(extractModelText(sdkResponse({ parts: [{ thoughtSignature: 'abc123', text: json }] })), json)

  // Thinking-model reasoning parts are excluded, like the SDK getter does.
  const polluted = sdkResponse({
    parts: [{ thought: true, text: 'Reasoning over regions {x:1} carefully' }, { text: json }],
  })
  assert.equal(extractModelText(polluted), json)

  // Same exclusion for plain REST-shaped payloads without the getter.
  assert.equal(
    extractModelText({
      candidates: [
        { content: { parts: [{ thought: true, text: 'notes {draft} here' }, { text: json }] } },
      ],
    }),
    json,
  )

  // Non-text parts never contribute text.
  assert.equal(
    extractModelText(sdkResponse({ parts: [{ functionCall: { name: 'f' } }, { inlineData: { data: 'eA==' } }] })),
    '',
  )

  // Legacy/callable text forms and plain string properties still work.
  assert.equal(extractModelText({ text: json }), json)
  assert.equal(
    extractModelText({ text() { return json } }),
    json,
  )

  // Empty, blocked-shaped and missing responses yield no text.
  assert.equal(extractModelText(sdkResponse({ parts: [] })), '')
  assert.equal(extractModelText({ candidates: [{ finishReason: 'SAFETY' }] }), '')
  assert.equal(extractModelText({}), '')
  assert.equal(extractModelText(null), '')
  assert.equal(extractModelText(undefined), '')
})

test('fenced JSON is recovered only as a defensive fallback path', async () => {
  // End to end: the fallback model wraps JSON in a fence despite structured output.
  const createClient = fakeClient(async (request) => {
    if (request.model === 'gemini-3.8-flash') throw geminiError(503, 'UNAVAILABLE')
    return sdkResponse({ parts: [{ text: `Here is the report:\n\`\`\`json\n${NORMALIZED_SUCCESS}\n\`\`\`` }] })
  })
  const retry = noWait()
  const result = await analyzeImage(
    { image: TINY_PNG },
    { ...PRODUCTION_ENV, TRACEDETECTOR_AI_FALLBACK_MODEL: 'gemini-3.5-flash-lite' },
    { createClient, sleep: retry.sleep },
  )
  assert.equal(result.status, 200)
  assert.equal(result.body.model, 'gemini-3.5-flash-lite')
  assert.equal(result.body.report.summary, 'A clear image with no visible privacy findings.')

  // Unit level: fence tags, casing and prose around the fence are tolerated…
  const payload = '{"findings":[]}'
  assert.deepEqual(parseModelJson(`\`\`\`JSON\n${payload}\n\`\`\``), { findings: [] })
  assert.deepEqual(parseModelJson(`\`\`\` json\n${payload}\n\`\`\``), { findings: [] })
  assert.deepEqual(parseModelJson(`\`\`\`text\n${payload}\n\`\`\``), { findings: [] })
  assert.deepEqual(parseModelJson(`Sure! {"a": broken, but:\n\`\`\`json\n${payload}\n\`\`\` hope this helps`), {
    findings: [],
  })
  // …later fences are tried when an earlier one is not JSON…
  assert.deepEqual(parseModelJson(`\`\`\`\nnot json\n\`\`\`\n\`\`\`json\n${payload}\n\`\`\``), { findings: [] })
  // …and an unclosed fence still recovers via the brace-span rescue.
  assert.deepEqual(parseModelJson(`\`\`\`json\n${payload}`), { findings: [] })

  // …but arbitrary text is never accepted as a report.
  assert.equal(parseModelJson('I cannot help with that request.'), null)
  assert.equal(parseModelJson('```\nno json here\n```'), null)
})

test('malformed model output is reported, never a silent empty report', async () => {
  const cases = [
    ['prose refusal', sdkResponse({ parts: [{ text: 'I cannot help with that request.' }] })],
    ['truncated JSON', sdkResponse({ parts: [{ text: '{"summary": "cut off' }], finishReason: 'MAX_TOKENS' })],
    ['empty parts', sdkResponse({ parts: [] })],
    ['no candidates', (() => { const r = new GenerateContentResponse(); Object.assign(r, {}); return r })()],
  ]

  for (const [name, response] of cases) {
    const createClient = fakeClient(async () => response)
    const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient })
    assert.equal(result.status, 502, `${name} should fail closed`)
    assert.equal(result.body.error, 'ai_malformed_json', `${name} should fail closed`)
  }
})

test('valid JSON with the wrong shape is rejected, not reported as safe', async () => {
  for (const text of ['{"foo":1}', '[1,2,3]', '"just a string"', '{"findings":"nope"}', '{"findings":null}']) {
    const createClient = fakeClient(async () => sdkResponse({ parts: [{ text }] }))
    const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient })
    assert.equal(result.status, 502, `${text} must not become an empty "safe" report`)
    assert.equal(result.body.error, 'ai_malformed_json')
  }

  // The minimal valid contract — an object carrying a findings array — still passes.
  const createClient = fakeClient(async () => sdkResponse({ parts: [{ text: '{"findings":[]}' }] }))
  const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.report.findings, [])

  assert.equal(parseModelJson('[1,2,3]'), null)
})

test('a candidate-level content block is reported as blocked, not malformed JSON', async () => {
  for (const finishReason of ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']) {
    const response = new GenerateContentResponse()
    Object.assign(response, { candidates: [{ finishReason }] })
    const createClient = fakeClient(async () => response)
    const result = await analyzeImage({ image: TINY_PNG }, PRODUCTION_ENV, { createClient })
    assert.equal(result.status, 422, `${finishReason} should be ai_blocked`)
    assert.equal(result.body.error, 'ai_blocked')
  }
})

test('primary 504 exhaustion then a recovering fallback keeps the bounded retry budget', async () => {
  const models = []
  const createClient = fakeClient(async (request) => {
    models.push(request.model)
    if (request.model === 'gemini-3.8-flash') throw geminiError(504, 'DEADLINE_EXCEEDED')
    if (models.filter((m) => m === 'gemini-3.5-flash-lite').length === 1) {
      throw geminiError(503, 'UNAVAILABLE')
    }
    return sdkResponse({ parts: [{ text: NORMALIZED_SUCCESS }] })
  })
  const retry = noWait()
  const result = await analyzeImage(
    { image: TINY_PNG },
    { ...PRODUCTION_ENV, TRACEDETECTOR_AI_FALLBACK_MODEL: 'gemini-3.5-flash-lite' },
    { createClient, sleep: retry.sleep },
  )

  assert.deepEqual(models, [
    'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash-lite',
  ])
  assert.deepEqual(retry.delays, [1_000, 2_000, 1_000])
  assert.equal(result.status, 200)
  assert.equal(result.body.model, 'gemini-3.5-flash-lite')
})

test('parse-failure diagnostics log only safe metadata, never response content', async () => {
  const refusal = 'Unique refusal sentence 7f3a9c that must never be logged'
  const createClient = fakeClient(async () => sdkResponse({ parts: [{ text: refusal }] }))
  const capturedLogs = []
  const originalWarn = console.warn
  console.warn = (...args) =>
    capturedLogs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))

  let result
  try {
    result = await analyzeImage(
      { image: TINY_PNG },
      { ...PRODUCTION_ENV, NODE_ENV: 'development' },
      { createClient },
    )
  } finally {
    console.warn = originalWarn
  }

  assert.equal(result.body.error, 'ai_malformed_json')
  const logs = capturedLogs.join('\n')
  assert.ok(logs.includes('could not be parsed as JSON'))
  assert.ok(logs.includes('STOP'), 'finishReason metadata should aid debugging')
  for (const sensitive of [refusal, TINY_PNG, '7f3a9c']) {
    assert.ok(!logs.includes(sensitive), `server log leaked response content: ${sensitive.slice(0, 24)}`)
    assert.ok(!JSON.stringify(result.body).includes(sensitive))
  }
})

test('On-Device Scan and Demo Analysis still run without calling the AI backend', async () => {
  const server = await createServer({
    configFile: new URL('../vite.config.js', import.meta.url).pathname,
    server: { middlewareMode: true },
    appType: 'custom',
  })
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('unexpected network request')
  }

  try {
    const { runAnalysis } = await server.ssrLoadModule('/src/services/analysisService.js')
    const local = await runAnalysis({
      mode: 'local',
      file: { name: 'photo.png', size: 100, type: 'image/png' },
      dataUrl: TINY_PNG,
    })
    const demo = await runAnalysis({ mode: 'demo' })

    assert.equal(local.engine, 'local')
    assert.ok(Array.isArray(local.checklist))
    assert.equal(demo.engine, 'demo')
    assert.ok(demo.findings.length > 0)
    assert.ok(Array.isArray(demo.checklist))
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
    await server.close()
  }
})
