import { loadEnv } from 'vite'
import { analyzeImage } from '../api/_lib/analyzeCore.js'
import { publicAiStatus } from '../api/_lib/config.js'

const MAX_BODY_BYTES = 12 * 1024 * 1024

/**
 * Mounts the /api endpoints on the Vite dev server (and `vite preview`).
 *
 * Why: the AI key must never reach the browser. The browser talks to a
 * same-origin /api/* route; only this server-side code reads the key from the
 * environment. In production the identical handlers in /api run as serverless
 * functions, so there is no behavioural drift between dev and deploy.
 */
export function devApiPlugin() {
  let env = process.env

  const middleware = async (req, res, next) => {
    const url = (req.url || '').split('?')[0]
    if (!url.startsWith('/api/')) return next()

    try {
      if (url === '/api/status') {
        return json(res, 200, publicAiStatus(env))
      }

      if (url === '/api/analyze') {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          return json(res, 405, { error: 'method_not_allowed', message: 'Use POST.' })
        }
        const body = await readJson(req)
        const result = await analyzeImage(body, env)
        return json(res, result.status, result.body)
      }

      return json(res, 404, { error: 'not_found', message: `Unknown endpoint ${url}` })
    } catch (err) {
      return json(res, 500, {
        error: 'server_error',
        message: err?.message || 'Unexpected server error.',
      })
    }
  }

  return {
    name: 'tracedetector-dev-api',
    configResolved(config) {
      // Make .env / .env.local values (without the VITE_ prefix) available
      // to the server-side handlers only.
      env = { ...process.env, ...loadEnv(config.mode, config.root, '') }
    },
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

function json(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large.')
    chunks.push(chunk)
  }
  if (!chunks.length) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}
