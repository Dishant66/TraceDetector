import Icon from '../ui/Icon.jsx'
import { scrollToSection } from '../../hooks/useHashRoute.js'

export default function Footer({ route, navigate }) {
  const year = new Date().getFullYear()

  const sectionLink = (id, label) => (
    <li key={id}>
      <button type="button" className="link-button" onClick={() => scrollToSection(id, navigate, route)}>
        {label}
      </button>
    </li>
  )

  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="logo">
            <span className="logo-mark">
              <Icon name="shield" size={18} strokeWidth={1.9} />
            </span>
            TraceDetector
          </span>
          <p>Know what your image reveals before you share it.</p>
        </div>

        <div className="footer-cols">
          <div className="footer-col">
            <h4>Product</h4>
            <ul>
              <li>
                <button type="button" className="link-button" onClick={() => navigate('/analyze')}>
                  Analyze an image
                </button>
              </li>
              {sectionLink('how-it-works', 'How it works')}
              {sectionLink('detects', 'What we detect')}
              {sectionLink('why', 'Why it matters')}
            </ul>
          </div>
          <div className="footer-col">
            <h4>Privacy</h4>
            <ul>
              <li>
                <span>Images are never stored</span>
              </li>
              <li>
                <span>On-device scan stays local</span>
              </li>
              <li>
                <span>API keys stay server-side</span>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Built for</h4>
            <ul>
              <li>
                <span>Future of Work &amp; Automation</span>
              </li>
              <li>
                <span>React · Vite · JavaScript</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="container footer-bottom">
        <span>© {year} TraceDetector — hackathon project.</span>
        <span>Automated analysis is an aid, not a guarantee. Always review images yourself.</span>
      </div>
    </footer>
  )
}
