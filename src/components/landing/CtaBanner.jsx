import Icon from '../ui/Icon.jsx'

export default function CtaBanner({ onAnalyze, onDemo }) {
  return (
    <section className="section cta-section">
      <div className="container">
        <div className="cta card">
          <div className="cta-glow" aria-hidden="true" />
          <div className="cta-content">
            <span className="eyebrow">
              <Icon name="shield" size={13} />
              Two seconds, before you share
            </span>
            <h2>Check the image first. Every time.</h2>
            <p className="lede">
              Upload a screenshot, a photo of a document, or anything you are about to post. You
              will know exactly what it reveals — and what to remove — in under a minute.
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary btn-lg" onClick={onAnalyze}>
                <Icon name="scan" size={18} />
                Analyze an Image
              </button>
              <button type="button" className="btn btn-ghost btn-lg" onClick={onDemo}>
                <Icon name="play" size={16} />
                Run the demo analysis
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
