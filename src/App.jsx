import { useCallback, useState } from 'react'
import Navbar from './components/layout/Navbar.jsx'
import Footer from './components/layout/Footer.jsx'
import LandingPage from './pages/LandingPage.jsx'
import AnalyzePage from './pages/AnalyzePage.jsx'
import { useHashRoute } from './hooks/useHashRoute.js'
import { useAiStatus } from './hooks/useAiStatus.js'

export default function App() {
  const { route, navigate } = useHashRoute()
  const aiStatus = useAiStatus()
  const [demoRequest, setDemoRequest] = useState(0)

  // A non-zero token asks AnalyzePage (which may not be mounted yet) to start
  // the demo. AnalyzePage clears it once consumed, so navigating back later
  // never replays it.
  const startDemo = useCallback(() => {
    setDemoRequest((n) => n + 1)
    navigate('/analyze')
  }, [navigate])

  const clearDemoRequest = useCallback(() => setDemoRequest(0), [])

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <Navbar route={route} navigate={navigate} aiStatus={aiStatus} />

      <main id="main">
        {route === '/analyze' ? (
          <AnalyzePage aiStatus={aiStatus} demoRequest={demoRequest} onDemoStarted={clearDemoRequest} />
        ) : (
          <LandingPage navigate={navigate} aiStatus={aiStatus} onStartDemo={startDemo} />
        )}
      </main>

      <Footer route={route} navigate={navigate} />
    </>
  )
}
