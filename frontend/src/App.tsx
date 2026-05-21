import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'

import AnimatedBackground from './components/AnimatedBackground'
import Navbar from './components/Navbar'
import Footer from './components/Footer'

// Pages
import LandingPage from './pages/LandingPage'
import GeneratorPage from './pages/GeneratorPage'
import ImageGeneratorPage from './pages/ImageGeneratorPage'
import JobsPage from './pages/JobsPage'
import FeaturesPage from './pages/FeaturesPage'
import AboutPage from './pages/AboutPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function AnimatedRoutes() {
  const location = useLocation()
  
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageWrapper><LandingPage /></PageWrapper>} />
        <Route path="/generator" element={<PageWrapper><GeneratorPage /></PageWrapper>} />
        <Route path="/images" element={<PageWrapper><ImageGeneratorPage /></PageWrapper>} />
        <Route path="/jobs" element={<PageWrapper><JobsPage /></PageWrapper>} />
        <Route path="/features" element={<PageWrapper><FeaturesPage /></PageWrapper>} />
        <Route path="/about" element={<PageWrapper><AboutPage /></PageWrapper>} />
        <Route path="*" element={<PageWrapper><NotFound /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  )
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="relative z-10 pt-20"
    >
      {children}
    </motion.main>
  )
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <h1 className="text-6xl font-black text-[#7c5cff] mb-4">404</h1>
      <h2 className="text-2xl font-bold mb-6">Page Not Found</h2>
      <p className="text-[#8888a0] max-w-md mb-8">
        The page you are looking for doesn't exist or has been moved to a new location.
      </p>
      <a href="/" className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] text-white font-semibold shadow-lg shadow-[#7c5cff]/20">
        Go Back Home
      </a>
    </div>
  )
}

export default function App() {
  return (
    <Router>
      <div className="relative min-h-screen bg-[#07070d] text-[#e8e8f0] font-sans selection:bg-[#7c5cff]/30 selection:text-white">
        <ScrollToTop />
        <AnimatedBackground />
        <Navbar />
        <AnimatedRoutes />
        <Footer />
        
        <Toaster
          position="bottom-right"
          containerStyle={{ zIndex: 200 }}
          toastOptions={{
            duration: 3500,
            style: {
              background: '#0f0f1e',
              color: '#e8e8f0',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 500,
              backdropFilter: 'blur(12px)',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#0f0f1e' },
            },
            error: {
              iconTheme: { primary: '#f43f5e', secondary: '#0f0f1e' },
            },
          }}
        />
      </div>
    </Router>
  )
}
