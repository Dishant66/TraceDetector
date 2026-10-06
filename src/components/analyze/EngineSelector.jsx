import Icon from '../ui/Icon.jsx'
import { ENGINES } from '../../services/analysisService.js'

const ICONS = { ai: 'sparkle', local: 'cpu', demo: 'play' }

export default function EngineSelector({ value, onChange, aiStatus, disabled }) {
  const options = [
    {
      ...ENGINES.ai,
      icon: ICONS.ai,
      available: Boolean(aiStatus?.aiConfigured),
      note: aiStatus?.aiConfigured
        ? `Connected${aiStatus.model ? ` · ${aiStatus.model}` : ''}`
        : 'No API key configured on the server',
    },
    { ...ENGINES.local, icon: ICONS.local, available: true, note: 'Always available · runs in your browser' },
    { ...ENGINES.demo, icon: ICONS.demo, available: true, note: 'Sample data · uses a bundled mock image' },
  ]

  return (
    <fieldset className="engines" disabled={disabled}>
      <legend className="engines-legend">
        <Icon name="cpu" size={14} />
        Analysis engine
      </legend>

      <div className="engine-options" role="radiogroup" aria-label="Analysis engine">
        {options.map((option) => {
          const selected = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className="engine-option"
              data-selected={selected}
              data-tone={option.tone}
              disabled={disabled || !option.available}
              onClick={() => onChange(option.id)}
            >
              <span className="engine-head">
                <span className="engine-icon">
                  <Icon name={option.icon} size={16} />
                </span>
                <strong>{option.label}</strong>
                {!option.available && <span className="engine-flag">Unavailable</span>}
              </span>
              <span className="engine-desc">{option.description}</span>
              <span className="engine-note">
                <span
                  className="badge-dot"
                  style={{
                    color: !option.available
                      ? 'var(--text-faint)'
                      : option.id === 'demo'
                        ? 'var(--medium)'
                        : 'var(--safe)',
                  }}
                />
                {option.note}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
