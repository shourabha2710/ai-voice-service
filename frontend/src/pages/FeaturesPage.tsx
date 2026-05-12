import { motion } from "framer-motion";
import {
  Mic,
  Zap,
  FileText,
  Globe,
  Download,
  Layers,
  Activity,
  Star,
} from "lucide-react";
import FeatureCard from "../components/FeatureCard";

const features = [
  {
    icon: <Mic size={18} />,
    title: "Ultra Realistic Voices",
    description:
      "Choose from 400+ neural voices across multiple languages and accents. Each voice is crafted to sound natural and lifelike, making your content engaging and professional.",
    color: "rgba(124,92,255,0.12)",
  },
  {
    icon: <FileText size={18} />,
    title: "Long Audio Generation",
    description:
      "Process documents up to 50,000 characters with automatic chunking and seamless merging. Perfect for audiobooks, podcasts, and long-form content.",
    color: "rgba(6,182,212,0.12)",
  },
  {
    icon: <Zap size={18} />,
    title: "Fast Processing",
    description:
      "Generate high-quality speech in seconds. Fine-tune speed and pitch to match your exact requirements. Real-time generation for short audio.",
    color: "rgba(59,130,246,0.12)",
  },
  {
    icon: <Globe size={18} />,
    title: "Multi-Language Support",
    description:
      "Support for 100+ languages including English, Hindi, Spanish, French, German, Japanese, Korean, Chinese, Arabic, and many more.",
    color: "rgba(16,185,129,0.12)",
  },
  {
    icon: <Download size={18} />,
    title: "Download MP3 Instantly",
    description:
      "Get your generated audio as high-quality MP3 files ready for download and use in your projects. No conversion needed.",
    color: "rgba(245,158,11,0.12)",
  },
  {
    icon: <Layers size={18} />,
    title: "Background Processing",
    description:
      "Long audio jobs run in the background. Close the page and come back later — your audio will be waiting. Job status tracking included.",
    color: "rgba(236,72,153,0.12)",
  },
  {
    icon: <Activity size={18} />,
    title: "Real-time Progress Tracking",
    description:
      "Watch your long audio jobs progress in real-time with detailed chunk-by-chunk updates, percentage completion, and status notifications.",
    color: "rgba(139,92,246,0.12)",
  },
  {
    icon: <Star size={18} />,
    title: "No API Key Required",
    description:
      "Unlike other TTS services, we don't require any API keys or authentication. Just start generating speech immediately.",
    color: "rgba(14,165,233,0.12)",
  },
];

export default function FeaturesPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="py-10"
    >
      <div className="max-w-[1200px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Powerful Features
          </h1>
          <p className="text-sm text-[#8888a0] max-w-lg mx-auto leading-relaxed">
            Everything you need to convert text into natural-sounding speech.
            No compromises, no hidden fees.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <FeatureCard key={f.title} {...f} index={i} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
