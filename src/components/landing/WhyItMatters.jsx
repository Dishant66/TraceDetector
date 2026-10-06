import Icon from '../ui/Icon.jsx'
import { WHY_IT_MATTERS } from '../../data/content.js'

export default function WhyItMatters() {
  return (
    <section className="section" id="why">
      <div className="container">
        <div className="section-head center">
          <span className="eyebrow">
            <Icon name="users" size={13} />
            Why it matters
          </span>
          <h2>Modern work runs on screenshots</h2>
          <p className="lede">
            Sharing an image is now a reflex — in chat, in tickets, in demos, in applications. The
            review step never scaled with it. TraceDetector is that review step, automated.
          </p>
        </div>

        <div className="why-grid">
          {WHY_IT_MATTERS.map((item) => (
            <article key={item.id} className="why-card card card-pad card-hover">
              <span className="why-icon">
                <Icon name={item.icon} size={18} />
              </span>
              <span className="why-stat">{item.stat}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>

        <div className="why-note card card-pad">
          <Icon name="bolt" size={20} />
          <div>
            <h3>The automation angle</h3>
            <p>
              The fix for accidental data exposure was never "be more careful". It is putting an
              automated check in the two seconds before a human clicks share — fast enough that
              nobody skips it, specific enough that people actually act on it.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
