import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Volume2,
  Play,
  Download,
  Loader2,
  Sparkles,
  Mic,
  Waves,
  Music,
  AlertCircle,
} from 'lucide-react'
import type { Voice, JobProgress } from '../types'
import { fetchVoices, generateShortAudio, startLongAudioJob, getJobStatus, downloadJobAudio } from '../lib/api'

const MAX_SHORT = 5000
const MAX_LONG = 50000

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-6">
      {[3, 6, 4, 8, 5, 7, 3, 6, 4, 8, 5, 7].map((h, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-[#7c5cff] transition-all duration-300"
          style={{
            height: active ? h * 2.5 : h,
            opacity: active ? 0.8 : 0.2,
            animation: active ? `waveform 0.8s ease-in-out ${i * 0.1}s infinite` : 'none',
          }}
        />
      ))}
    </div>
  )
}

export default function TTSGenerator() {
  const [text, setText] = useState('')
  const [voices, setVoices] = useState<Voice[]>([])
  const [filteredVoices, setFilteredVoices] = useState<Voice[]>([])
  const [selectedVoice, setSelectedVoice] = useState('')
  const [genderFilter, setGenderFilter] = useState('all')
  const [rate, setRate] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [loading, setLoading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioName, setAudioName] = useState('speech.mp3')
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchVoices()
      .then((v) => {
        const sorted = v.sort((a, b) => a.Locale.localeCompare(b.Locale))
        setVoices(sorted)
        setFilteredVoices(sorted)
        if (sorted.length > 0) setSelectedVoice(sorted[0].ShortName)
      })
      .catch(() => {
        toast.error('Could not load voices. Is the server running?')
        setSelectedVoice('en-US-GuyNeural')
      })
  }, [])

  useEffect(() => {
    const f = genderFilter === 'all'
      ? voices
      : voices.filter((v) => v.Gender === genderFilter)
    setFilteredVoices(f)
    if (f.length > 0) {
      const stillExists = f.some((v) => v.ShortName === selectedVoice)
      if (!stillExists) setSelectedVoice(f[0].ShortName)
    }
  }, [genderFilter, voices, selectedVoice])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const currentVoice = voices.find((v) => v.ShortName === selectedVoice)

  const getFlag = (locale: string) => {
    const map: Record<string, string> = {
      en: '\u{1F1FA}\u{1F1F8}',
      es: '\u{1F1EA}\u{1F1F8}',
      fr: '\u{1F1EB}\u{1F1F7}',
      de: '\u{1F1E9}\u{1F1EA}',
      pt: '\u{1F1E7}\u{1F1F7}',
      it: '\u{1F1EE}\u{1F1F9}',
      ja: '\u{1F1EF}\u{1F1F5}',
      ko: '\u{1F1F0}\u{1F1F7}',
      zh: '\u{1F1E8}\u{1F1F3}',
      ar: '\u{1F1F8}\u{1F1E6}',
      ru: '\u{1F1F7}\u{1F1FA}',
      hi: '\u{1F1EE}\u{1F1F3}',
    }
    const prefix = locale.slice(0, 2).toLowerCase()
    return map[prefix] || '\u{1F310}'
  }

  const generate = useCallback(async () => {
    const t = text.trim()
    if (!t) {
      toast.error('Please enter some text to convert.')
      return
    }
    if (t.length > MAX_LONG) {
      toast.error(`Text exceeds ${MAX_LONG.toLocaleString()} character limit.`)
      return
    }

    setLoading(true)
    setAudioUrl(null)
    setProgress(null)

    const rateStr = rate >= 0 ? `+${rate}%` : `${rate}%`
    const pitchStr = pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`
    const voice = selectedVoice

    try {
      if (t.length <= MAX_SHORT) {
        const { blob } = await generateShortAudio({ text: t, voice, rate: rateStr, pitch: pitchStr })
        showAudio(blob, 'speech.mp3')
      } else {
        const { job_id } = await startLongAudioJob({ text: t, voice, rate: rateStr, pitch: pitchStr })
        await pollJob(job_id)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Generation failed'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [text, selectedVoice, rate, pitch])

  function showAudio(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    setAudioUrl(url)
    setAudioName(name)
    setProgress(null)
  }

  async function pollJob(jobId: string) {
    setProgress({
      job_id: jobId,
      status: 'pending',
      progress: 0,
      completed_chunks: 0,
      total_chunks: 1,
      message: 'Starting...',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      output_file: null,
      error: null,
    })

    return new Promise<void>((resolve, reject) => {
      pollRef.current = setInterval(async () => {
        try {
          const job = await getJobStatus(jobId)
          setProgress(job)

          if (job.status === 'completed') {
            if (pollRef.current !== null) {
              clearInterval(pollRef.current)
              pollRef.current = null
            }
            const blob = await downloadJobAudio(jobId)
            showAudio(blob, `long_speech_${jobId}.mp3`)
            resolve()
          } else if (job.status === 'failed') {
            if (pollRef.current !== null) {
              clearInterval(pollRef.current)
              pollRef.current = null
            }
            reject(new Error(job.error || 'Job failed'))
          }
        } catch (e) {
          if (pollRef.current !== null) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
          reject(e)
        }
      }, 1500)
    })
  }

  return (
    <section id="generate" className="relative px-6 pb-28">
      <div className="mx-auto max-w-2xl">
        <AnimatePresence mode="wait">
          <motion.div
            key="card"
            className="glass-card relative overflow-hidden rounded-2xl p-8 sm:p-10"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
          >
            <div className="mb-7">
              <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7c5cff]/20 to-[#7c5cff]/5">
                  <Mic size={16} className="text-[#a78bfa]" />
                </div>
                Voice Generator
              </h2>
              <p className="mt-1 text-sm text-[#8888a0]">
                Enter your text, choose a voice, and generate premium audio instantly.
              </p>
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-xs font-semibold text-[#8888a0]">
                TEXT
              </label>
              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type or paste your text here..."
                  maxLength={MAX_LONG}
                  rows={5}
                  className="w-full resize-y rounded-xl border border-white/[0.06] bg-[#0f0f1e] px-5 py-4 pr-20 text-sm leading-relaxed text-[#e8e8f0] outline-none transition-all duration-200 placeholder:text-[#555570] focus:border-[#7c5cff] focus:shadow-[0_0_0_3px_rgba(124,92,255,0.12)]"
                />
                <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-[#0f0f1e] px-2.5 py-1 text-xs text-[#555570]">
                  <span className={text.length > MAX_SHORT ? 'text-[#a78bfa]' : ''}>
                    {text.length.toLocaleString()}
                  </span>
                  {' '}/ {MAX_LONG.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#8888a0]">
                  VOICE
                </label>
                <div className="relative">
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.06] bg-[#0f0f1e] px-4 py-2.5 pr-10 text-sm font-medium text-[#e8e8f0] outline-none transition-all duration-200 focus:border-[#7c5cff] focus:shadow-[0_0_0_3px_rgba(124,92,255,0.12)]"
                  >
                    {filteredVoices.map((v) => (
                      <option key={v.ShortName} value={v.ShortName}>
                        {getFlag(v.Locale)} {v.FriendlyName || v.ShortName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#8888a0]">
                  GENDER
                </label>
                <div className="relative">
                  <select
                    value={genderFilter}
                    onChange={(e) => setGenderFilter(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.06] bg-[#0f0f1e] px-4 py-2.5 pr-10 text-sm font-medium text-[#e8e8f0] outline-none transition-all duration-200 focus:border-[#7c5cff] focus:shadow-[0_0_0_3px_rgba(124,92,255,0.12)]"
                  >
                    <option value="all">All Voices</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#8888a0]">SPEED</label>
                  <span className="min-w-[3rem] text-right text-xs font-semibold text-[#a78bfa]">
                    {rate >= 0 ? `+${rate}%` : `${rate}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#8888a0]">PITCH</label>
                  <span className="min-w-[3rem] text-right text-xs font-semibold text-[#a78bfa]">
                    {pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  value={pitch}
                  onChange={(e) => setPitch(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="mb-6 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0f0f1e] px-4 py-3">
              <div className="h-2 w-2 animate-pulse-soft rounded-full bg-[#7c5cff]" />
              <span className="text-xs text-[#8888a0]">
                {currentVoice
                  ? `${currentVoice.FriendlyName || currentVoice.ShortName} \u00B7 ${currentVoice.Locale} \u00B7 ${currentVoice.Gender}`
                  : 'Select a voice to preview details'}
              </span>
            </div>

            <button
              onClick={generate}
              disabled={loading || !text.trim()}
              className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#7c5cff]/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#7c5cff]/35 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
            >
              <div className="absolute inset-0 bg-white/0 transition-all duration-300 group-hover:bg-white/[0.06]" />
              <span className="relative flex items-center justify-center gap-2.5">
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play size={16} fill="currentColor" />
                    Generate Speech
                  </>
                )}
              </span>
            </button>

            <AnimatePresence>
              {progress && progress.status !== 'completed' && (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-5 overflow-hidden"
                >
                  <div className="rounded-xl border border-white/[0.06] bg-[#0f0f1e] p-4">
                    <div className="mb-2 flex items-center justify-between text-xs text-[#8888a0]">
                      <span>{progress.message || 'Processing...'}</span>
                      <span>{Math.round(progress.progress)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#3b82f6]"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress.progress}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                    {progress.total_chunks > 1 && (
                      <p className="mt-1.5 text-[10px] text-[#555570]">
                        Chunk {progress.completed_chunks} of {progress.total_chunks}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {audioUrl && (
                <motion.div
                  key="player"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  className="mt-5 overflow-hidden"
                >
                  <div className="rounded-xl border border-white/[0.06] bg-[#0f0f1e] p-5">
                    <div className="mb-3.5 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Music size={14} className="text-[#06b6d4]" />
                        Generated Audio
                      </h3>
                      <span className="rounded-full border border-[#06b6d4]/20 bg-[#06b6d4]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#06b6d4]">
                        Ready
                      </span>
                    </div>

                    <div className="mb-3 flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2">
                      <WaveformBars active={isPlaying} />
                      <span className="text-[11px] text-[#555570]">
                        {isPlaying ? 'Playing...' : 'Ready to play'}
                      </span>
                    </div>

                    <audio
                      ref={audioRef}
                      src={audioUrl}
                      controls
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      className="mb-3"
                    />

                    <a
                      href={audioUrl}
                      download={audioName}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#7c5cff]/20 bg-[#7c5cff]/10 px-4 py-2 text-xs font-semibold text-[#a78bfa] no-underline transition-all duration-200 hover:bg-[#7c5cff]/20 hover:border-[#7c5cff]/35"
                    >
                      <Download size={14} />
                      Download
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
