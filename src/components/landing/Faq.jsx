import { useState } from 'react'
import Icon from '../ui/Icon.jsx'
import { FAQS } from '../../data/content.js'

export default function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <section className="section section-alt" id="faq">
      <div className="container faq-wrap">
        <div className="section-head">
          <span className="eyebrow">
            <Icon name="question" size={13} />
            Straight answers
          </span>
          <h2>What TraceDetector does — and what it doesn&apos;t</h2>
          <p className="lede">
            A privacy tool that is vague about its own limits is not a privacy tool. Here is exactly
            how it behaves.
          </p>
        </div>

        <div className="faq-list">
          {FAQS.map((item, index) => {
            const isOpen = open === index
            return (
              <div key={item.q} className={`faq-item card ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="faq-q"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : index)}
                >
                  <span>{item.q}</span>
                  <Icon name="chevronDown" size={18} />
                </button>
                <div className="faq-a" hidden={!isOpen}>
                  <p>{item.a}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
