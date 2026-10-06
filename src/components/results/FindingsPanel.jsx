import { useMemo, useState } from 'react'
import Icon from '../ui/Icon.jsx'
import FindingCard from './FindingCard.jsx'
import { SEVERITY_ORDER, severityMeta } from '../../data/taxonomy.js'

export default function FindingsPanel({ analysis, activeId, onActivate }) {
  const [filter, setFilter] = useState('all')

  const filters = useMemo(() => {
    const available = SEVERITY_ORDER.filter((id) => analysis.risk.counts[id] > 0)
    return [{ id: 'all', label: 'All', count: analysis.findings.length }].concat(
      available.map((id) => ({ id, label: severityMeta(id).label, count: analysis.risk.counts[id] })),
    )
  }, [analysis])

  const shown = filter === 'all' ? analysis.findings : analysis.findings.filter((f) => f.severity === filter)

  return (
    <section className="findings card">
      <header className="panel-head">
        <div>
          <h2>
            <Icon name="list" size={17} />
            Detected findings
          </h2>
          <p>
            {analysis.findings.length} item{analysis.findings.length === 1 ? '' : 's'} to review, sorted by severity.
          </p>
        </div>
      </header>

      {analysis.findings.length > 0 && (
        <div className="finding-filters" role="tablist" aria-label="Filter findings by severity">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={`filter-chip ${item.id !== 'all' ? `sev-${item.id}` : ''}`}
              data-active={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="findings-list" onMouseLeave={() => onActivate(null)}>
        {shown.length === 0 && analysis.findings.length === 0 && (
          <div className="findings-empty">
            <span className="findings-empty-icon">
              <Icon name="check" size={26} strokeWidth={2.2} />
            </span>
            <h3>No exposed information detected</h3>
            <p>
              This analysis found nothing to flag. Automated checks are not perfect — give the image
              one last look before you share it.
            </p>
          </div>
        )}

        {shown.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            active={activeId === finding.id}
            onActivate={onActivate}
          />
        ))}
      </div>
    </section>
  )
}
