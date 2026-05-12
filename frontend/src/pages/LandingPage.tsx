import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Star,
  Mic,
  Zap,
  FileText,
  Globe,
  Download,
  Layers,
  Activity,
} from "lucide-react";
import FeatureCard from "../components/FeatureCard";
import StatCounter from "../components/StatCounter";

const features = [
  {
    icon: <Mic size={18} />,
    title: "Ultra Realistic Voices",
    description:
      "Choose from 400+ neural voices across multiple languages and accents. Each voice is crafted to sound natural and lifelike.",
    color: "rgba(124,92,255,0.12)",
  },
  {
    icon: <FileText size={18} />,
    title: "Long Audio Generation",
    description:
      "Process documents up to 50,000 characters with automatic chunking and seamless merging for extended content.",
    color: "rgba(6,182,212,0.12)",
  },
  {
    icon: <Zap size={18} />,
    title: "Fast Processing",
    description:
      "Generate high-quality speech in seconds. Fine-tune speed and pitch to match your exact requirements.",
    color: "rgba(59,130,246,0.12)",
  },
  {
    icon: <Globe size={18} />,
    title: "Multi-Language Support",
    description:
      "Support for 100+ languages including English, Hindi, Spanish, French, German, Japanese, and many more.",
    color: "rgba(16,185,129,0.12)",
  },
  {
    icon: <Download size={18} />,
    title: "Download MP3 Instantly",
    description:
      "Get your generated audio as high-quality MP3 files ready for download and use in your projects.",
    color: "rgba(245,158,11,0.12)",
  },
  {
    icon: <Layers size={18} />,
    title: "Background Processing",
    description:
      "Long audio jobs run in the background. Close the page and come back later — your audio will be waiting.",
    color: "rgba(236,72,153,0.12)",
  },
  {
    icon: <Activity size={18} />,
    title: "Real-time Progress Tracking",
    description:
      "Watch your long audio jobs progress in real-time with detailed chunk-by-chunk updates and percentage completion.",
    color: "rgba(139,92,246,0.12)",
  },
  {
    icon: <Mic size={18} />,
    title: "Voice Customization",
    description:
      "Adjust speech rate, pitch, and select from male/female voices to get the perfect sound for your content.",
    color: "rgba(14,165,233,0.12)",
  },
];

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Content Creator",
    content:
      "This TTS service has transformed how I create content. The voices are incredibly natural and the long audio support is a game-changer.",
    rating: 5,
  },
  {
    name: "Marcus Johnson",
    role: "Developer",
    content:
      "The API is clean and well-documented. I integrated it into my app in under an hour. The background job processing is brilliant.",
    rating: 5,
  },
  {
    name: "Priya Sharma",
    role: "Podcast Producer",
    content:
      "Finally, a TTS service that handles long-form content properly. The chunking and merging works flawlessly for my podcast scripts.",
    rating: 5,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div>
      <motion.section
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="pt-[100px] pb-[60px] text-center relative"
      >
        <div className="max-w-[1200px] mx-auto px-6">
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[rgba(124,92,255,0.1)] border border-[rgba(124,92,255,0.2)] text-[#a78bfa] text-xs font-medium mb-6"
          >
            <Star size={12} fill="#a78bfa" />
            AI-Powered Neural TTS
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-[clamp(2.5rem,6vw,4.5rem)] font-extrabold tracking-[-0.03em] leading-[1.1] mb-5"
          >
            Generate Human-Like{" "}
            <span className="bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] bg-clip-text text-transparent">
              AI Voices
            </span>{" "}
            Instantly
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-[clamp(1rem,2vw,1.2rem)] text-[#8888a0] max-w-[560px] mx-auto mb-8 leading-relaxed"
          >
            Fast, realistic, multilingual AI voice generation powered by
            advanced text-to-speech technology. No API keys required.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="flex items-center justify-center gap-4 flex-wrap"
          >
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/generator")}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] text-white text-sm font-semibold border-none cursor-pointer shadow-[0_0_30px_rgba(124,92,255,0.3)] transition-shadow duration-300 hover:shadow-[0_0_50px_rgba(124,92,255,0.3)]"
            >
              Try Now
              <ArrowRight size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() =>
                document
                  .getElementById("features-section")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-[rgba(255,255,255,0.1)] text-[#e8e8f0] text-sm font-semibold bg-transparent cursor-pointer transition-all duration-200 hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.2)]"
            >
              View Demo
            </motion.button>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="mt-16 flex items-center justify-center gap-8 flex-wrap"
          >
            <div className="flex -space-x-2">
              {[
                "https://i.pravatar.cc/40?u=1",
                "https://i.pravatar.cc/40?u=2",
                "https://i.pravatar.cc/40?u=3",
                "https://i.pravatar.cc/40?u=4",
              ].map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="w-8 h-8 rounded-full border-2 border-[#07070d]"
                />
              ))}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1 text-[#fbbf24]">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={12} fill="#fbbf24" stroke="none" />
                ))}
              </div>
              <p className="text-xs text-[#8888a0] mt-0.5">
                Trusted by 2,000+ creators
              </p>
            </div>
          </motion.div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="py-16 border-y border-[rgba(255,255,255,0.04)]"
      >
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCounter
              end={400}
              suffix="+"
              label="Neural Voices"
              icon={<Mic size={18} />}
            />
            <StatCounter
              end={100}
              suffix="+"
              label="Languages"
              icon={<Globe size={18} />}
            />
            <StatCounter
              end={50}
              suffix="K"
              label="Max Characters"
              icon={<FileText size={18} />}
            />
            <StatCounter
              end={99}
              suffix="%"
              label="Uptime"
              icon={<Activity size={18} />}
            />
          </div>
        </div>
      </motion.section>

      <motion.section
        id="features-section"
        className="py-20"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <div className="max-w-[1200px] mx-auto px-6">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center text-[28px] font-bold tracking-tight mb-12"
          >
            Everything You Need for Voice
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <FeatureCard key={f.title} {...f} index={i} />
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section
        className="py-20 bg-[rgba(255,255,255,0.01)]"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <div className="max-w-[1200px] mx-auto px-6">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center text-[28px] font-bold tracking-tight mb-12"
          >
            Loved by Creators
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-7 bg-[#0d0d1a] border border-[rgba(255,255,255,0.06)] rounded-[24px]"
              >
                <div className="flex items-center gap-1 mb-3 text-[#fbbf24]">
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} size={14} fill="#fbbf24" stroke="none" />
                  ))}
                </div>
                <p className="text-sm text-[#8888a0] leading-relaxed mb-4">
                  "{t.content}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7c5cff] to-[#3b82f6] flex items-center justify-center text-white text-xs font-bold">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#e8e8f0]">
                      {t.name}
                    </div>
                    <div className="text-xs text-[#8888a0]">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      <footer className="border-t border-[rgba(255,255,255,0.06)] py-6 text-center text-xs text-[#555570]">
        <div className="max-w-[1200px] mx-auto px-6">
          AI Voice Studio &mdash; AI Text to Speech &middot; Powered by edge-tts
          &amp; FastAPI
        </div>
      </footer>
    </div>
  );
}
