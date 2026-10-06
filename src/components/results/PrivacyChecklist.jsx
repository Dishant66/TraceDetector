import Icon from '../ui/Icon.jsx'

const STATUS = {
  clear: { icon: 'check', label: 'Clear' },
  risk: { icon: 'close', label: 'Needs attention' },
  unknown: { icon: 'question', label: 'Not checked' },
}

export default function PrivacyChecklist({ checklist }) {
  const clear = checklist.filter((i) => i.status === 'clear').length
  const risk = checklist.filter((i) => i.status === 'risk').length
  const unknown = checklist.filter((i) => i.status === 'unknown').length

  return (
    <section className="checklist card">
      <header className="panel-head">
        <div>
          <h2>
            <Icon name="shield" size={17} />
            Before you share this image
          </h2>
          <p>
            {clear} clear · {risk} need{risk === 1 ? 's' : ''} attention
            {unknown ? ` · ${unknown} not checked by this engine` : ''}
          </p>
        </div>
      </header>

      <ul className="checklist-items">
        {checklist.map((item) => {
          const meta = STATUS[item.status]
          return (
            <li key={item.id} data-status={item.status}>
              <span className="check-mark">
                <Icon name={meta.icon} size={13} strokeWidth={2.6} />
              </span>
              <div>
                <strong>{item.label}</strong>
                <em>{item.detail}</em>
              </div>
              <span className="check-status">{meta.label}</span>
            </li>
          )
        })}
      </ul>

      {unknown > 0 && (
        <p className="checklist-foot">
          <Icon name="info" size={14} />
          Items marked “not checked” were not verified by this engine, so they are never shown as
          safe.
        </p>
      )}
    </section>
  )
}
