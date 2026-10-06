import { useState } from 'react'
import Icon from '../ui/Icon.jsx'

/**
 * Image + findings overlay.
 *
 * Boxes are only drawn for findings whose engine actually returned
 * coordinates. Everything else is listed in an explicit "no region reported"
 * group — TraceDetector never invents a location to make the demo look good.
 */
export default function ImageFindings({ analysis, activeId, onActivate }) {
  const [showOverlays, setShowOverlays] = useState(true)

  const located = analysis.findings.filter((f) => f.box)
  const unlocated = analysis.findings.filter((f) => !f.box)

  return (
    <section className="image-findings card">
      <header className="panel-head">
        <div>
          <h2>
            <Icon name="eye" size={17} />
            Image findings
          </h2>
          <p>
            {located.length
              ? `${located.length} of ${analysis.findings.length} findings have a reported region.`
              : 'No regions were reported for this image.'}
          </p>
        </div>
        {located.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowOverlays((v) => !v)}
            aria-pressed={showOverlays}
          >
            <Icon name={showOverlays ? 'eyeOff' : 'eye'} size={14} />
            {showOverlays ? 'Hide overlays' : 'Show overlays'}
          </button>
        )}
      </header>

      <div className="image-stage">
        <div className="image-frame">
          <img src={analysis.image.dataUrl} alt={`Analysed image: ${analysis.image.name}`} />

          {showOverlays &&
            located.map((finding) => {
              const isActive = activeId === finding.id
              return (
                <button
                  key={finding.id}
                  type="button"
                  className={`overlay-box sev-${finding.severity}`}
                  data-active={isActive}
                  style={{
                    left: `${finding.box.x * 100}%`,
                    top: `${finding.box.y * 100}%`,
                    width: `${finding.box.w * 100}%`,
                    height: `${finding.box.h * 100}%`,
                  }}
                  onClick={() => onActivate(isActive ? null : finding.id)}
                  onMouseEnter={() => onActivate(finding.id)}
                  aria-label={`${finding.type}, ${finding.severity} severity`}
                  title={`${finding.index}. ${finding.type}`}
                >
                  <span className="overlay-tag">{finding.index}</span>
                  <span className="overlay-label">{finding.type}</span>
                </button>
              )
            })}
        </div>
      </div>

      <div className="image-foot">
        {located.length > 0 && (
          <div className="overlay-legend">
            {['critical', 'high', 'medium', 'low'].map((sev) => (
              <span key={sev} className={`legend-item sev-${sev}`}>
                <i />
                {sev}
              </span>
            ))}
          </div>
        )}

        {unlocated.length > 0 && (
          <div className="notice notice-info">
            <Icon name="info" size={16} />
            <span>
              <strong>
                {unlocated.length} finding{unlocated.length === 1 ? '' : 's'} without a region.
              </strong>{' '}
              {unlocated.some((f) => f.category === 'metadata')
                ? 'Some of these live in the file’s hidden metadata rather than in the picture. '
                : ''}
              The engine did not return coordinates, so nothing is highlighted for them — they are
              listed with a written location instead:{' '}
              {unlocated
                .slice(0, 4)
                .map((f) => f.type)
                .join(', ')}
              {unlocated.length > 4 ? ` +${unlocated.length - 4} more` : ''}.
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
