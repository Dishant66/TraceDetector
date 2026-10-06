import Icon from '../ui/Icon.jsx'
import { categoryMeta, severityMeta } from '../../data/taxonomy.js'

const SOURCE_LABEL = {
  ai: 'AI vision',
  pattern: 'Pattern match',
  metadata: 'File metadata',
  barcode: 'Barcode scan',
  filename: 'File name',
  demo: 'Demo sample',
}

export default function FindingCard({ finding, active, onActivate }) {
  const category = categoryMeta(finding.category)
  const severity = severityMeta(finding.severity)

  return (
    <article
      className={`finding sev-${finding.severity}`}
      data-active={active}
      onMouseEnter={() => onActivate(finding.id)}
      onFocus={() => onActivate(finding.id)}
      tabIndex={0}
    >
      <header className="finding-head">
        <span className="finding-index">{finding.index}</span>
        <span className="finding-icon">
          <Icon name={category.icon} size={16} />
        </span>
        <div className="finding-title">
          <h3>{finding.type}</h3>
          <p>{category.label}</p>
        </div>
        <span className="badge badge-sev">{severity.label}</span>
      </header>

      <p className="finding-desc">{finding.description}</p>

      {finding.evidence && (
        <p className="finding-evidence">
          <span>Detected</span>
          <code>{finding.evidence}</code>
        </p>
      )}

      <div className="finding-meta">
        <span title="Where this appears">
          <Icon name={finding.box ? 'pin' : 'info'} size={13} />
          {finding.locationHint || 'Location not reported'}
        </span>
        <span title="How this was found">
          <Icon name="cpu" size={13} />
          {SOURCE_LABEL[finding.source] || 'Analysis'}
        </span>
        <span title="Engine confidence">
          <Icon name="gauge" size={13} />
          {Math.round((finding.confidence ?? 0.8) * 100)}% confidence
        </span>
      </div>

      <div className="finding-rec">
        <Icon name="shield" size={15} />
        <div>
          <strong>Recommendation</strong>
          <p>{finding.recommendation}</p>
        </div>
      </div>
    </article>
  )
}
