import { useCallback, useEffect, useState } from 'react'

/**
 * Minimal hash router — zero dependencies, works on any static host
 * (GitHub Pages, Netlify drop, file://) with no server rewrites.
 */
function currentRoute() {
  const raw = window.location.hash.replace(/^#/, '')
  const [path] = raw.split('?')
  const clean = (path || '/').replace(/\/+$/, '') || '/'
  return clean.startsWith('/') ? clean : `/${clean}`
}

export function useHashRoute() {
  const [route, setRoute] = useState(currentRoute)

  useEffect(() => {
    const onChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((to, { scroll = true } = {}) => {
    const target = to.startsWith('#') ? to.slice(1) : to
    if (currentRoute() === target.split('?')[0]) {
      if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    window.location.hash = target
    if (scroll) {
      // Let the route render before resetting scroll position.
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
    }
  }, [])

  return { route, navigate }
}

/** Smoothly scrolls to an in-page section, switching to the landing page first. */
export function scrollToSection(id, navigate, currentRouteValue) {
  const go = () => {
    const target = document.getElementById(id)
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  if (currentRouteValue !== '/') {
    navigate('/', { scroll: false })
    setTimeout(go, 90)
  } else {
    go()
  }
}
