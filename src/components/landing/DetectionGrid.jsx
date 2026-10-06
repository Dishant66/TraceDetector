import Icon from '../ui/Icon.jsx'
import { DETECTION_GROUPS } from '../../data/content.js'

export default function DetectionGrid() {
  return (
    <section className="section section-alt" id="detects">
      <div className="container">
        <div className="section-head center">
          <span className="eyebrow">
            <Icon name="eye" size={13} />
            What we detect
          </span>
          <h2>Eight categories of exposure, one pass</h2>
          <p className="lede">
            TraceDetector combines a vision model with deterministic pattern checks and a real
            metadata parser, so obvious leaks and invisible ones both surface in the same report.
          </p>
        </div>

        <div className="detect-grid">
          {DETECTION_GROUPS.map((group) => (
            <article key={group.id} className="detect-card card card-pad card-hover">
              <span className="detect-icon">
                <Icon name={group.icon} size={19} />
              </span>
              <h3>{group.title}</h3>
              <p>{group.text}</p>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>
                    <Icon name="check" size={13} />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
