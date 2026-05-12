import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, Users, Languages } from 'lucide-react'
import type { Voice } from '../types'
import { fetchVoices } from '../lib/api'

const localeNames: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  pt: 'Portuguese', it: 'Italian', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', ar: 'Arabic', ru: 'Russian', hi: 'Hindi',
  nl: 'Dutch', pl: 'Polish', sv: 'Swedish', da: 'Danish',
  fi: 'Finnish', no: 'Norwegian', cs: 'Czech', ro: 'Romanian',
  vi: 'Vietnamese', th: 'Thai', tr: 'Turkish', el: 'Greek',
  hu: 'Hungarian', uk: 'Ukrainian',
}

function getLang(locale: string) {
  const code = locale.slice(0, 2).toLowerCase()
  return localeNames[code] || code.toUpperCase()
}

export default function VoiceLibrary() {
  const [voices, setVoices] = useState<Voice[]>([])
  const [search, setSearch] = useState('')
  const [langFilter, setLangFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchVoices()
      .then((v) => {
        setVoices(v.sort((a, b) => a.Locale.localeCompare(b.Locale)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const languages = useMemo(() => {
    const set = new Set<string>()
    for (const v of voices) {
      const l = getLang(v.Locale)
      set.add(l)
    }
    return Array.from(set).sort()
  }, [voices])

  const filtered = useMemo(() => {
    return voices.filter((v) => {
      if (genderFilter !== 'all' && v.Gender !== genderFilter) return false
      if (langFilter !== 'all' && getLang(v.Locale) !== langFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const name = (v.FriendlyName || v.ShortName).toLowerCase()
        const loc = v.Locale.toLowerCase()
        if (!name.includes(q) && !loc.includes(q)) return false
      }
      return true
    })
  }, [voices, search, langFilter, genderFilter])

  return (
    <section id="voices" className="relative px-6 pb-28">
      <div className="mx-auto max-w-6xl">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
        >
          <h2 className="text-3xl font-bold tracking-tight">
            Voice <span className="text-gradient">Library</span>
          </h2>
          <p className="mt-2 text-sm text-[#8888a0]">
            Browse through {voices.length.toLocaleString()} neural voices across{' '}
            {languages.length} languages
          </p>
        </motion.div>

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#555570]" />
            <input
              type="text"
              placeholder="Search voices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-[#0f0f1e] py-2.5 pl-9 pr-4 text-sm text-[#e8e8f0] outline-none transition-all duration-200 placeholder:text-[#555570] focus:border-[#7c5cff] focus:shadow-[0_0_0_3px_rgba(124,92,255,0.12)]"
            />
          </div>
          <div className="relative">
            <Languages size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#555570]" />
            <select
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-[#0f0f1e] py-2.5 pl-9 pr-10 text-sm text-[#e8e8f0] outline-none transition-all duration-200 focus:border-[#7c5cff] focus:shadow-[0_0_0_3px_rgba(124,92,255,0.12)]"
            >
              <option value="all">All Languages</option>
              {languages.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Users size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#555570]" />
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-[#0f0f1e] py-2.5 pl-9 pr-10 text-sm text-[#e8e8f0] outline-none transition-all duration-200 focus:border-[#7c5cff] focus:shadow-[0_0_0_3px_rgba(124,92,255,0.12)]"
            >
              <option value="all">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 shimmer rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] py-16 text-center">
            <p className="text-sm text-[#555570]">No voices match your filters.</p>
          </div>
        ) : (
          <motion.div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
          >
            {filtered.map((v, i) => (
              <motion.div
                key={v.ShortName}
                className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent p-4 transition-all duration-300 hover:border-[#7c5cff]/20 hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#7c5cff]/5"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 20) * 0.03 }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-lg">{getLang(v.Locale)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      v.Gender === 'Male'
                        ? 'bg-[#3b82f6]/10 text-[#3b82f6]'
                        : 'bg-[#ec4899]/10 text-[#ec4899]'
                    }`}
                  >
                    {v.Gender === 'Male' ? 'M' : 'F'}
                  </span>
                </div>
                <p className="truncate text-sm font-medium">
                  {v.FriendlyName || v.ShortName}
                </p>
                <p className="mt-0.5 text-[11px] text-[#555570]">{v.Locale}</p>
                <div className="absolute top-0 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-[#7c5cff] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-40" />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  )
}
