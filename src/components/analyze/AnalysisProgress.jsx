import Icon from '../ui/Icon.jsx'
import { STAGES, ENGINES } from '../../services/analysisService.js'

/**
 * Staged progress experience. The stage index is driven by real service
 * callbacks, with a floor so the sequence always reads as progress and never
 * sits on a single frame.
 */
export default function AnalysisProgress({ stageIndex, engine, imageUrl, onCancel }) {
  const clamped = Math.min(stageIndex, STAGES.length - 1)
  const percent = Math.min(97, Math.round(((clamped + 0.65) / STAGES.length) * 100))
  const engineMeta = ENGINES[engine]

  return (
    <div className="progress-wrap card card-pad">
      <div className="progress-head">
        <span className="badge badge-engine" data-engine={engine}>
          <Icon name={engine === 'ai' ? 'sparkle' : engine === 'local' ? 'cpu' : 'play'} size={12} />
          {engineMeta.label}
        </span>
        <h2>Analysing your image</h2>
        <p className="lede">Your image is analysed for potentially exposed information.</p>
      </div>

      <div className="progress-body">
        <div className="progress-visual">
          {imageUrl ? (
            <div className="progress-image">
              <img src={imageUrl} alt="" />
              <span className="scanline" />
              <span className="progress-grid" />
            </div>
          ) : (
            <div className="progress-image progress-image-empty">
              <Icon name="image" size={30} />
            </div>
          )}
        </div>

        <div className="progress-stages">
          <div className="progress-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Analysis progress">
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="progress-percent">{percent}%</span>

          <ol>
            {STAGES.map((stage, index) => {
              const state = index < clamped ? 'done' : index === clamped ? 'active' : 'todo'
              return (
                <li key={stage.id} data-state={state}>
                  <span className="stage-mark">
                    {state === 'done' ? <Icon name="check" size={12} strokeWidth={2.4} /> : <span className="stage-pulse" />}
                  </span>
                  <span className="stage-text">
                    <strong>{stage.label}</strong>
                    <em>{stage.detail}</em>
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      <div className="progress-foot">
        <p>
          <Icon name="clock" size={14} />
          This usually takes a few seconds. You can cancel at any time.
        </p>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onCancel}>
          <Icon name="close" size={14} />
          Cancel analysis
        </button>
      </div>
    </div>
  )
}
