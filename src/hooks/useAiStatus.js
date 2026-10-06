import { useEffect, useState } from 'react'
import { fetchAiStatus } from '../services/aiClient.js'

/**
 * Asks the server once whether a real AI provider is wired up.
 * Never throws: if the /api routes are not deployed, the app simply runs in
 * On-Device + Demo mode.
 */
export function useAiStatus() {
  const [status, setStatus] = useState({
    aiConfigured: false,
    model: null,
    provider: null,
    reachable: false,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    fetchAiStatus().then((result) => {
      if (!cancelled) setStatus({ ...result, loading: false })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return status
}
