import { publicAiStatus } from './_lib/config.js'

/**
 * GET /api/status
 * Tells the UI whether a real AI backend is available. Returns no secrets.
 */
export default function handler(req, res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(publicAiStatus()))
}
