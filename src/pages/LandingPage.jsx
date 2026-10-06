import Hero from '../components/landing/Hero.jsx'
import HowItWorks from '../components/landing/HowItWorks.jsx'
import DetectionGrid from '../components/landing/DetectionGrid.jsx'
import WhyItMatters from '../components/landing/WhyItMatters.jsx'
import Faq from '../components/landing/Faq.jsx'
import CtaBanner from '../components/landing/CtaBanner.jsx'
import { scrollToSection } from '../hooks/useHashRoute.js'

export default function LandingPage({ navigate, aiStatus, onStartDemo }) {
  const goAnalyze = () => navigate('/analyze')
  const goHow = () => scrollToSection('how-it-works', navigate, '/')

  return (
    <>
      <Hero onAnalyze={goAnalyze} onHowItWorks={goHow} aiStatus={aiStatus} />
      <HowItWorks onAnalyze={goAnalyze} onDemo={onStartDemo} />
      <DetectionGrid />
      <WhyItMatters />
      <Faq />
      <CtaBanner onAnalyze={goAnalyze} onDemo={onStartDemo} />
    </>
  )
}
