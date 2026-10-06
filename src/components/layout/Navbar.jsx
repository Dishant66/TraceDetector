import { useEffect, useState } from 'react'
import Icon from '../ui/Icon.jsx'
import { scrollToSection } from '../../hooks/useHashRoute.js'

const SECTIONS = [
  { id: 'how-it-works', label: 'How it works' },
  { id: 'detects', label: 'What we detect' },
  { id: 'why', label: 'Why it matters' },
]

export default function Navbar({ route, navigate, aiStatus }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const goSection = (id) => {
    setOpen(false)
    scrollToSection(id, navigate, route)
  }

  const statusLabel = aiStatus?.aiConfigured ? 'AI engine online' : 'Demo + on-device mode'

  return (
    <header className="nav" data-scrolled={scrolled}>
      <div className="container nav-inner">
        <a
          className="logo"
          href="#/"
          onClick={(e) => {
            e.preventDefault()
            navigate('/')
          }}
        >
          <span className="logo-mark">
            <Icon name="shield" size={18} strokeWidth={1.9} />
          </span>
          TraceDetector
        </a>

        <nav className="nav-links" aria-label="Primary">
          <a
            className="nav-link"
            href="#/"
            aria-current={route === '/' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault()
              navigate('/')
            }}
          >
            Home
          </a>
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className="nav-link"
              onClick={() => goSection(section.id)}
            >
              {section.label}
            </button>
          ))}
          <a
            className="nav-link"
            href="#/analyze"
            aria-current={route === '/analyze' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault()
              navigate('/analyze')
            }}
          >
            Analyze
          </a>
        </nav>

        <div className="nav-actions">
          <span className="badge nav-status" title={statusLabel}>
            <span
              className="badge-dot"
              style={{ color: aiStatus?.aiConfigured ? 'var(--safe)' : 'var(--medium)' }}
            />
            {statusLabel}
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/analyze')}>
            <Icon name="scan" size={16} />
            Analyze an Image
          </button>
        </div>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? 'close' : 'menu'} size={20} />
        </button>
      </div>

      <div className="nav-mobile" data-open={open}>
        <a
          className="nav-link"
          href="#/"
          onClick={(e) => {
            e.preventDefault()
            navigate('/')
            setOpen(false)
          }}
        >
          Home
        </a>
        {SECTIONS.map((section) => (
          <button key={section.id} type="button" className="nav-link" onClick={() => goSection(section.id)}>
            {section.label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            navigate('/analyze')
            setOpen(false)
          }}
        >
          <Icon name="scan" size={16} />
          Analyze an Image
        </button>
      </div>
    </header>
  )
}
