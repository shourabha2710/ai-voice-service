import { motion } from 'framer-motion'
import { Sparkles, ArrowRight } from 'lucide-react'

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
}

export default function Hero() {
  return (
    <section className="relative px-6 pt-40 pb-16 text-center sm:pt-44 sm:pb-20">
      <motion.div
        className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-[#7c5cff]/20 bg-[#7c5cff]/10 px-4 py-1.5 text-sm font-medium text-[#a78bfa]"
        {...fadeUp}
        transition={{ duration: 0.5 }}
      >
        <Sparkles size={14} />
        AI-Powered Neural TTS Engine
      </motion.div>

      <motion.h1
        className="mx-auto mt-5 max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-6xl md:text-7xl lg:text-8xl"
        {...fadeUp}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        Text to Speech,
        <br />
        <span className="bg-gradient-to-r from-[#7c5cff] via-[#a78bfa] to-[#3b82f6] bg-clip-text text-transparent">
          Powered by AI
        </span>
      </motion.h1>

      <motion.p
        className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[#8888a0]"
        {...fadeUp}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        Convert your text into natural-sounding speech using advanced neural
        voice synthesis. Premium voices with real-time generation.
      </motion.p>

      <motion.div
        className="mt-8 flex items-center justify-center gap-4"
        {...fadeUp}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <a
          href="#generate"
          className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] px-6 py-3.5 text-sm font-semibold text-white no-underline shadow-lg shadow-[#7c5cff]/30 transition-all duration-300 hover:shadow-xl hover:shadow-[#7c5cff]/40 hover:-translate-y-0.5"
        >
          Start Generating
          <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
        </a>
      </motion.div>
    </section>
  )
}
