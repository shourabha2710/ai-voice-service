import { Link, useLocation } from 'react-router-dom'
import { Volume2, BookOpen, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../store/AuthContext'
import LoginModal from './LoginModal'

const links = [
  { path: '/', label: 'Home' },
  { path: '/generator', label: 'Audio' },
  { path: '/images', label: 'Images' },
  { path: '/jobs', label: 'Jobs' },
  { path: '/features', label: 'Features' },
  { path: '/about', label: 'About' },
]

function AvatarImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="w-7 h-7 rounded-full object-cover"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
        const parent = (e.target as HTMLImageElement).parentElement;
        if (parent) {
          const fallback = document.createElement('div');
          fallback.className = 'w-7 h-7 rounded-full bg-gradient-to-br from-[#7c5cff] to-[#3b82f6] flex items-center justify-center text-xs font-bold text-white';
          fallback.textContent = alt.charAt(0).toUpperCase();
          parent.prepend(fallback);
        }
      }}
    />
  )
}

export default function Navbar() {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const { user, logout, isLoading, isAuthenticated } = useAuth()

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 bg-[#07070d]/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#3b82f6] text-sm font-bold text-white shadow-lg shadow-[#7c5cff]/30">
              <Volume2 size={16} />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              Vox<span className="text-[#a78bfa]">Forge</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.path}
                to={l.path}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  location.pathname === l.path
                    ? 'bg-white/[0.08] text-white'
                    : 'text-[#8888a0] hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <a
                href="http://localhost:8000/api/v1/tts/docs"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-3.5 py-2 text-xs font-medium text-[#8888a0] no-underline transition-all duration-200 hover:border-white/[0.14] hover:text-white hover:bg-white/[0.04]"
              >
                <BookOpen size={14} />
                <span>API</span>
              </a>
            </div>

            {!isLoading && (
              isAuthenticated && user ? (
                <div className="relative group ml-2">
                  <div className="flex items-center gap-2 cursor-pointer bg-white/[0.04] border border-white/[0.06] rounded-full pl-1 pr-3 py-1 hover:bg-white/[0.08] transition-all">
                    {user.avatar_url ? (
                      <AvatarImage src={user.avatar_url} alt={user.full_name} />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7c5cff] to-[#3b82f6] flex items-center justify-center text-xs font-bold text-white">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-white hidden sm:block">{user.full_name}</span>
                  </div>
                  <div className="absolute right-0 mt-2 w-48 py-2 bg-[#0f0f1e] rounded-xl border border-white/[0.06] shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                    <div className="px-4 py-2 border-b border-white/[0.06] mb-1 text-xs text-[#8888a0]">
                      {user.email}
                      <div className="mt-1 flex gap-2">
                        <span className="bg-[#7c5cff]/20 text-[#a78bfa] px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase">{user.plan}</span>
                        <span className="bg-white/10 text-white px-2 py-0.5 rounded text-[10px] font-bold">{user.credits} CR</span>
                      </div>
                    </div>
                    <button
                      onClick={() => logout()}
                      className="w-full text-left px-4 py-2 text-sm text-[#f43f5e] hover:bg-white/[0.04] transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="ml-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] rounded-lg shadow-lg shadow-[#7c5cff]/20 hover:shadow-[#7c5cff]/40 transition-all hover:scale-105"
                >
                  Sign In
                </button>
              )
            )}

            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center justify-center p-2 rounded-lg text-[#8888a0] hover:text-white md:hidden ml-1"
            >
              {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-white/[0.06] bg-[#07070d] overflow-hidden"
            >
              <div className="flex flex-col p-4 gap-1">
                {links.map((l) => (
                  <Link
                    key={l.path}
                    to={l.path}
                    onClick={() => setIsOpen(false)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      location.pathname === l.path
                        ? 'bg-[rgba(124,92,255,0.1)] text-[#a78bfa]'
                        : 'text-[#8888a0] hover:bg-white/[0.04]'
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
                <a
                  href="http://localhost:8000/api/v1/tts/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-3 text-sm font-medium text-[#8888a0] flex items-center gap-2"
                >
                  <BookOpen size={16} />
                  API Documentation
                </a>

                {!isLoading && isAuthenticated && user && (
                  <button
                    onClick={() => {
                      logout()
                      setIsOpen(false)
                    }}
                    className="mt-2 px-4 py-3 rounded-xl text-sm font-medium text-[#f43f5e] bg-white/[0.02] hover:bg-white/[0.04] text-left"
                  >
                    Sign Out
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </>
  )
}
