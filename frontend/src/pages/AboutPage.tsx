import { motion } from "framer-motion";
import { Mic, Github, Globe, Heart } from "lucide-react";

const team = [
  {
    name: "AI Voice Studio Team",
    role: "Building the future of voice synthesis",
    avatar: "V",
  },
];

export default function AboutPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="py-10"
    >
      <div className="max-w-[800px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-12"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7c5cff] to-[#3b82f6] flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(124,92,255,0.3)]">
            <Mic size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            About AI Voice Studio
          </h1>
          <p className="text-sm text-[#8888a0] max-w-lg mx-auto leading-relaxed">
            We're building the most accessible, high-quality text-to-speech
            platform powered by cutting-edge neural voice technology.
          </p>
        </motion.div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-7 bg-[#0d0d1a] border border-[rgba(255,255,255,0.06)] rounded-[24px]"
          >
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Heart size={16} className="text-[#a78bfa]" />
              Our Mission
            </h2>
            <p className="text-sm text-[#8888a0] leading-relaxed">
              Our mission is to democratize voice synthesis technology. We
              believe that high-quality text-to-speech should be accessible to
              everyone — from individual creators to large enterprises. By
              leveraging Microsoft Edge's advanced neural voices and wrapping
              them in a clean, powerful API, we make it effortless to add
              natural-sounding speech to any application.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-7 bg-[#0d0d1a] border border-[rgba(255,255,255,0.06)] rounded-[24px]"
          >
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Globe size={16} className="text-[#a78bfa]" />
              Technology
            </h2>
            <p className="text-sm text-[#8888a0] leading-relaxed">
              Built on a modern stack — Python FastAPI backend with edge-tts
              for neural voice synthesis, React frontend with Tailwind CSS and
              Framer Motion. The service supports 400+ voices across 100+
              languages, background job processing for long-form content, and
              automatic audio chunking and merging via FFmpeg.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="p-7 bg-[#0d0d1a] border border-[rgba(255,255,255,0.06)] rounded-[24px]"
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Github size={16} className="text-[#a78bfa]" />
              Open Source
            </h2>
            <p className="text-sm text-[#8888a0] leading-relaxed mb-4">
              This project is open source and available on GitHub. We welcome
              contributions, feedback, and collaboration from the community.
            </p>
            <a
              href="#"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[rgba(124,92,255,0.1)] border border-[rgba(124,92,255,0.2)] text-[#a78bfa] text-xs font-semibold no-underline transition-all duration-200 hover:bg-[rgba(124,92,255,0.18)]"
            >
              <Github size={14} />
              View on GitHub
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="p-7 bg-[#0d0d1a] border border-[rgba(255,255,255,0.06)] rounded-[24px] text-center"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#3b82f6] flex items-center justify-center mx-auto mb-3 text-white font-bold">
              {team[0].avatar}
            </div>
            <h3 className="text-base font-semibold">{team[0].name}</h3>
            <p className="text-xs text-[#8888a0] mt-1">{team[0].role}</p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
