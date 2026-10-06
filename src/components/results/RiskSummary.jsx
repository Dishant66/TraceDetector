import Icon from '../ui/Icon.jsx'
import { ENGINES } from '../../services/analysisService.js'
import { SEVERITY_ORDER, severityMeta } from '../../data/taxonomy.js'
import { formatBytes } from '../../utils/file.js'

const ENGINE_ICON = { ai: 'sparkle', local: 'cpu', demo: 'play' }

export default function RiskSummary({ analysis }) {
  const { risk, engine, image } = analysis
  const engineMeta = ENGINES[engine]
  const total = Math.max(1, risk.total)

  return (
    <section className="risk card card-pad">
      <div className="risk-top">
        <div>
          <span className="badge badge-engine" data-engine={engine}>
            <Icon name={ENGINE_ICON[engine]} size={12} />
            {engineMeta.label}
            {analysis.model ? ` · ${analysis.model}` : ''}
          </span>
          <h2>Overall privacy risk</h2>
          <p className="risk-file">
            {image.name}
            {image.width ? ` · ${image.width}×${image.height}` : ''}
            {image.size ? ` · ${formatBytes(image.size)}` : ''}
          </p>
        </div>
      </div>

      <div className="risk-body">
        <div className={`risk-score sev-${risk.level}`}>
          <div className="score-ring" style={{ '--value': risk.score, '--ring-color': 'var(--sev)' }}>
            <div className="score-ring-inner">
              <strong>{risk.score}</strong>
              <span>/ 100</span>
            </div>
          </div>
          <span className="badge badge-sev">{risk.label}</span>
        </div>

        <div className="risk-detail">
          <h3>{risk.headline}</h3>
          <p className="risk-summary-text">{analysis.summary || risk.detail}</p>

          <div className="risk-counts">
            {SEVERITY_ORDER.map((id) => {
              const count = risk.counts[id]
              return (
                <div key={id} className={`risk-count sev-${id}`} data-empty={count === 0}>
                  <strong>{count}</strong>
                  <span>{severityMeta(id).label}</span>
                  <i style={{ width: `${(count / total) * 100}%` }} />
                </div>
              )
            })}
            <div className="risk-count sev-safe" data-empty={risk.total !== 0}>
              <strong>{risk.total === 0 ? '✓' : 0}</strong>
              <span>Safe</span>
              <i style={{ width: risk.total === 0 ? '100%' : '0%' }} />
            </div>
          </div>
        </div>
      </div>

      <div className={`notice ${engine === 'demo' ? 'notice-warn' : 'notice-info'} risk-disclaimer`}>
        <Icon name={engine === 'demo' ? 'alert' : 'info'} size={16} />
        <span>
          <strong>{engineMeta.label}.</strong> {engineMeta.disclaimer}
        </span>
      </div>
    </section>
  )
}
