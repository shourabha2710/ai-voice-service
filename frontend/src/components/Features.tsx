import { motion } from 'framer-motion'
import { Mic2, Zap, FileText } from 'lucide-react'

const features = [
  {
    icon: Mic2,
    label: '400+ Neural Voices',
    desc: 'Choose from a vast library of lifelike voices across multiple languages and accents. Find the perfect voice for your content.',
    gradient: 'from-[#7c5cff]/20 to-[#7c5cff]/5',
    iconColor: '#7c5cff',
  },
  {
    icon: Zap,
    label: 'Real-time Generation',
    desc: 'Generate high-quality speech in seconds. Fine-tune speed and pitch to match your exact requirements with precision.',
    gradient: 'from-[#06b6d4]/20 to-[#06b6d4]/5',
    iconColor: '#06b6d4',
  },
  {
    icon: FileText,
    label: 'Long-form Support',
    desc: 'Process documents up to 50,000 characters with automatic chunking and seamless merging for extended content.',
    gradient: 'from-[#3b82f6]/20 to-[#3b82f6]/5',
    iconColor: '#3b82f6',
  },
]

export default function Features() {
  return (
    <section id="features" className="relative px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <motion.h2
          className="text-center text-3xl font-bold tracking-tight"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
        >
          Built for <span className="text-gradient">Voice</span>
        </motion.h2>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.label}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent p-7 transition-all duration-300 hover:border-[#7c5cff]/20 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#7c5cff]/5"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: i * 0.1 }}
            >
              <div
                className="absolute top-0 left-[25%] right-[25%] h-px bg-gradient-to-r from-transparent via-[#7c5cff] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-50"
              />
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: `linear-gradient(135deg, ${f.iconColor}20, ${f.iconColor}08)` }}
              >
                <f.icon size={20} style={{ color: f.iconColor }} />
              </div>
              <h3 className="text-base font-semibold">{f.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#8888a0]">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
