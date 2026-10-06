import { useState } from 'react'
import Icon from '../ui/Icon.jsx'

/** Secondary evidence: raw metadata tags and the text the engine read back. */
export default function DetailsPanel({ analysis }) {
  const [tab, setTab] = useState('metadata')
  const tags = Object.entries(analysis.metadata?.tags || {})
  const hasText = Boolean(analysis.extractedText?.trim())

  if (!tags.length && !hasText && !analysis.notes?.length) return null

  const tabs = [
    { id: 'metadata', label: 'File metadata', count: tags.length, show: true },
    { id: 'text', label: 'Text read from image', count: null, show: hasText },
  ].filter((t) => t.show)

  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0].id

  return (
    <section className="details card">
      <header className="panel-head">
        <div>
          <h2>
            <Icon name="layers" size={17} />
            Analysis evidence
          </h2>
          <p>The raw data behind the findings above.</p>
        </div>
        {tabs.length > 1 && (
          <div className="details-tabs" role="tablist" aria-label="Evidence type">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active === t.id}
                className="details-tab"
                data-active={active === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.count ? <span>{t.count}</span> : null}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="details-body">
        {active === 'metadata' &&
          (tags.length ? (
            <dl className="meta-table">
              {tags.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="details-empty">
              <Icon name="check" size={15} />
              No embedded metadata was found in this file — nothing extra travels with it.
            </p>
          ))}

        {active === 'text' && (
          <pre className="extracted-text">{analysis.extractedText}</pre>
        )}
      </div>

      {analysis.notes?.length > 0 && (
        <ul className="details-notes">
          {analysis.notes.map((note) => (
            <li key={note}>
              <Icon name="info" size={13} />
              {note}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
