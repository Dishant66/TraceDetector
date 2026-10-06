import test from 'node:test'
import assert from 'node:assert/strict'

import { scanText, redact } from '../src/utils/patterns.js'
import { computeRiskScore } from '../src/utils/scoring.js'
import { buildChecklist } from '../src/utils/checklist.js'
import { readImageMetadata } from '../src/utils/metadata.js'
import { normaliseReport, parseModelJson, analyzeImage } from '../api/_lib/analyzeCore.js'
import { readAiConfig, publicAiStatus } from '../api/_lib/config.js'
import { GEMINI_RESPONSE_SCHEMA } from '../api/_lib/prompt.js'
import { ApiError, Type } from '@google/genai'

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

test('the public status never leaks the API key', () => {
  const env = { GEMINI_API_KEY: 'super-secret', GEMINI_MODEL: 'some-model' }
  const status = publicAiStatus(env)
  assert.equal(status.aiConfigured, true)
  assert.equal(status.model, 'some-model')
  assert.ok(!JSON.stringify(status).includes('super-secret'))
  assert.equal(readAiConfig(env).apiKey, 'super-secret')
})

test('a blank GEMINI_MODEL falls back to a sane default instead of breaking', () => {
  const config = readAiConfig({ GEMINI_API_KEY: 'k' })
  assert.ok(config.model && typeof config.model === 'string')
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
    return { text: modelJson, promptFeedback: undefined }
  })

  const result = await analyzeImage(
    { image: TINY_PNG, fileName: 'screenshot.png' },
    { GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-2.5-flash', NODE_ENV: 'production' },
    { createClient },
  )

  assert.equal(result.status, 200)
  assert.equal(result.body.engine, 'ai')
  assert.equal(result.body.model, 'gemini-2.5-flash')
  assert.equal(result.body.report.findings.length, 1)
  assert.equal(result.body.report.findings[0].category, 'contact')
  assert.equal(result.body.report.findings[0].type, 'Email Address')
  assert.ok(result.body.report.findings[0].box)
})

test('an invalid Gemini API key never leaks into the response, and is friendly', async () => {
  const createClient = fakeClient(async () => {
    throw new ApiError({ message: 'API key not valid. Please pass a valid API key.', status: 401 })
  })

  const result = await analyzeImage(
    { image: TINY_PNG },
    { GEMINI_API_KEY: 'super-secret-key', NODE_ENV: 'production' },
    { createClient },
  )

  assert.equal(result.status, 502)
  assert.equal(result.body.error, 'ai_invalid_key')
  assert.ok(!JSON.stringify(result.body).includes('super-secret-key'))
  assert.equal(result.body.detail, undefined, 'no detail field in production')
})

test('rate limiting is reported as 429 with a friendly message', async () => {
  const createClient = fakeClient(async () => {
    throw new ApiError({ message: 'Resource exhausted', status: 429 })
  })
  const result = await analyzeImage({ image: TINY_PNG }, { GEMINI_API_KEY: 'k' }, { createClient })
  assert.equal(result.status, 429)
  assert.equal(result.body.error, 'ai_rate_limited')
})

test('in development, provider error detail is included (with the key redacted if present)', async () => {
  const createClient = fakeClient(async () => {
    throw new ApiError({ message: 'Invalid JSON payload received. Unknown name "foo": super-secret-key leaked here', status: 400 })
  })

  const result = await analyzeImage(
    { image: TINY_PNG },
    { GEMINI_API_KEY: 'super-secret-key', NODE_ENV: 'development' },
    { createClient },
  )

  assert.equal(result.status, 502)
  assert.ok(result.body.detail, 'expected a detail field in development')
  assert.ok(result.body.detail.includes('HTTP 400'))
  assert.ok(!result.body.detail.includes('super-secret-key'), 'the API key must always be redacted')
})

test('a malformed (non-JSON) Gemini reply is reported, never crashes the handler', async () => {
  const createClient = fakeClient(async () => ({ text: 'I cannot help with that request.' }))
  const result = await analyzeImage({ image: TINY_PNG }, { GEMINI_API_KEY: 'k', NODE_ENV: 'production' }, { createClient })
  assert.equal(result.status, 502)
  assert.equal(result.body.error, 'ai_malformed_json')
})

test('a prompt blocked by the provider is reported as 422, not a crash', async () => {
  const createClient = fakeClient(async () => ({ promptFeedback: { blockReason: 'SAFETY' } }))
  const result = await analyzeImage({ image: TINY_PNG }, { GEMINI_API_KEY: 'k', NODE_ENV: 'production' }, { createClient })
  assert.equal(result.status, 422)
  assert.equal(result.body.error, 'ai_blocked')
})

test('a network failure (no status code) is reported as ai_unreachable', async () => {
  const createClient = fakeClient(async () => {
    throw new TypeError('fetch failed')
  })
  const result = await analyzeImage({ image: TINY_PNG }, { GEMINI_API_KEY: 'k', NODE_ENV: 'production' }, { createClient })
  assert.equal(result.status, 502)
  assert.equal(result.body.error, 'ai_unreachable')
})
