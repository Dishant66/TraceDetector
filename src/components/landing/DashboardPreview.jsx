import { useEffect, useState } from 'react'
import Icon from '../ui/Icon.jsx'

const ROWS = [
  { id: 1, type: 'API Secret Key', where: 'Terminal window', severity: 'critical', icon: 'key' },
  { id: 2, type: 'Home Address', where: 'Employee record', severity: 'high', icon: 'pin' },
  { id: 3, type: 'Email Address', where: 'Contact field', severity: 'medium', icon: 'mail' },
  { id: 4, type: 'QR Code', where: 'Visitor pass card', severity: 'medium', icon: 'qr' },
  { id: 5, type: 'EXIF GPS Location', where: 'File metadata', severity: 'high', icon: 'layers' },
]

const TARGET = 87

/**
 * Animated product mock for the hero. Purely decorative — it never claims to
 * be a live analysis, and the real dashboard uses the same visual language.
 */
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

export default function DashboardPreview() {
  // Respect reduced motion by starting at the final state instead of animating.
  const [score, setScore] = useState(() => (prefersReducedMotion() ? TARGET : 0))
  const [visible, setVisible] = useState(() => (prefersReducedMotion() ? ROWS.length : 0))

  useEffect(() => {
    if (prefersReducedMotion()) return undefined

    let frame
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 1400)
      const eased = 1 - Math.pow(1 - t, 3)
      setScore(Math.round(TARGET * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    const timers = ROWS.map((_, i) => setTimeout(() => setVisible((v) => Math.max(v, i + 1)), 420 + i * 170))

    return () => {
      cancelAnimationFrame(frame)
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
    <div className="preview" aria-hidden="true">
      <div className="preview-glow" />
      <div className="preview-card card">
        <div className="preview-top">
          <div className="preview-dots">
            <span />
            <span />
            <span />
          </div>
          <span className="preview-title">Privacy Report · onboarding-screenshot.png</span>
          <span className="badge badge-engine">
            <Icon name="sparkle" size={12} />
            AI Analysis
          </span>
        </div>

        <div className="preview-body">
          <div className="preview-score">
            <div
              className="score-ring"
              style={{
                '--value': score,
                '--ring-color': 'var(--critical)',
              }}
            >
              <div className="score-ring-inner">
                <strong>{score}</strong>
                <span>risk</span>
              </div>
            </div>
            <div className="preview-score-meta">
              <span className="badge sev-critical badge-sev">Critical risk</span>
              <p>3 critical · 2 high · 4 medium findings</p>
              <div className="preview-bars">
                <span style={{ '--w': '46%', background: 'var(--critical)' }} />
                <span style={{ '--w': '28%', background: 'var(--high)' }} />
                <span style={{ '--w': '18%', background: 'var(--medium)' }} />
                <span style={{ '--w': '8%', background: 'var(--low)' }} />
              </div>
            </div>
          </div>

          <ul className="preview-rows">
            {ROWS.map((row, i) => (
              <li
                key={row.id}
                className={`preview-row sev-${row.severity}`}
                data-visible={i < visible}
                style={{ '--delay': `${i * 60}ms` }}
              >
                <span className="preview-row-icon">
                  <Icon name={row.icon} size={15} />
                </span>
                <span className="preview-row-text">
                  <strong>{row.type}</strong>
                  <em>{row.where}</em>
                </span>
                <span className="badge badge-sev">{row.severity}</span>
              </li>
            ))}
          </ul>

          <div className="preview-foot">
            <Icon name="shield" size={14} />
            Before you share: 2 of 8 checks need attention
          </div>
        </div>
      </div>

      <div className="preview-chip preview-chip-a card">
        <Icon name="key" size={15} />
        <div>
          <strong>Secret key visible</strong>
          <span>Rotate &amp; crop before sharing</span>
        </div>
      </div>

      <div className="preview-chip preview-chip-b card">
        <Icon name="layers" size={15} />
        <div>
          <strong>GPS in EXIF</strong>
          <span>Exact capture location</span>
        </div>
      </div>
    </div>
  )
}
