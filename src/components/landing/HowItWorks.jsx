import Icon from '../ui/Icon.jsx'
import { STEPS } from '../../data/content.js'

export default function HowItWorks({ onAnalyze, onDemo }) {
  return (
    <section className="section" id="how-it-works">
      <div className="container">
        <div className="section-head center">
          <span className="eyebrow">
            <Icon name="list" size={13} />
            How it works
          </span>
          <h2>Three steps between you and a safer share</h2>
          <p className="lede">
            No setup, no account, no jargon. Drop in an image and TraceDetector does the reading for
            you.
          </p>
        </div>

        <ol className="steps">
          {STEPS.map((step, index) => (
            <li key={step.id} className="step card card-pad card-hover">
              <span className="step-number">{step.number}</span>
              <span className="step-icon">
                <Icon name={step.icon} size={22} />
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              {index < STEPS.length - 1 && (
                <span className="step-arrow" aria-hidden="true">
                  <Icon name="arrowRight" size={18} />
                </span>
              )}
            </li>
          ))}
        </ol>

        <div className="steps-cta">
          <button type="button" className="btn btn-primary" onClick={onAnalyze}>
            <Icon name="upload" size={16} />
            Try it with your own image
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDemo}>
            <Icon name="play" size={15} />
            Watch the demo analysis
          </button>
        </div>
      </div>
    </section>
  )
}
