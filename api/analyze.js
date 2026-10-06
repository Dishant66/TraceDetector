import { analyzeImage } from './_lib/analyzeCore.js'

/**
 * POST /api/analyze
 *
 * Deployment target: any Node serverless platform that uses the
 * (req, res) signature (Vercel, Netlify Functions w/ adapter, Express, ...).
 * The same logic is mounted on the Vite dev server by `devApiPlugin`,
 * so `npm run dev` behaves exactly like production.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'method_not_allowed', message: 'Use POST.' }))
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = null
    }
  }
  if (!body) body = await readJsonBody(req)

  const { status, body: payload } = await analyzeImage(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 12 * 1024 * 1024) return null
    chunks.push(chunk)
  }
  if (!chunks.length) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}
