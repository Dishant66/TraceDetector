import Icon from '../ui/Icon.jsx'
import DashboardPreview from './DashboardPreview.jsx'
import { TRUST_POINTS } from '../../data/content.js'

export default function Hero({ onAnalyze, onHowItWorks, aiStatus }) {
  return (
    <section className="hero">
      <div className="container hero-inner">
        <div className="hero-copy">
          <span className="eyebrow">
            <Icon name="bolt" size={13} />
            Future of Work &amp; Automation
          </span>

          <p className="hero-brand">TraceDetector</p>
          <h1>
            Know what your image <span className="grad">reveals</span> before you share it.
          </h1>

          <p className="lede hero-lede">
            TraceDetector uses AI-assisted analysis to find what an image is quietly giving away —
            personal details, contact information, ID and document numbers, passwords and API keys,
            QR codes, confidential workplace content and hidden file metadata — then tells you
            exactly what to remove before you hit send.
          </p>

          <div className="btn-row hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={onAnalyze}>
              <Icon name="scan" size={18} />
              Analyze an Image
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={onHowItWorks}>
              <Icon name="play" size={16} />
              See How It Works
            </button>
          </div>

          <ul className="hero-trust">
            {TRUST_POINTS.map((point) => (
              <li key={point.label}>
                <Icon name={point.icon} size={15} />
                {point.label}
              </li>
            ))}
          </ul>

          <p className="hero-mode">
            <span
              className="badge-dot"
              style={{ color: aiStatus?.aiConfigured ? 'var(--safe)' : 'var(--medium)' }}
            />
            {aiStatus?.aiConfigured
              ? `AI engine connected${aiStatus.model ? ` · ${aiStatus.model}` : ''}. Full AI Analysis available.`
              : 'No AI provider configured — On-Device Scan and a clearly labelled Demo Analysis are ready to use.'}
          </p>
        </div>

        <DashboardPreview />
      </div>
    </section>
  )
}
