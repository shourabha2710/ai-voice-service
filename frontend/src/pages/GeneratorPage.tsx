import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  Play,
  Loader2,
  Clock,
  Mic,
  Gauge,
  Sparkles,
} from "lucide-react";
import { useVoices } from "../hooks/useVoices";
import {
  generateShortAudio,
  generateLongAudio as apiGenerateLong,
} from "../lib/api";
import { GeneratorSkeleton } from "../components/Skeleton";
import VoiceSelector from "../components/voice/VoiceSelector";
import RecentGenerations from "../components/voice/RecentGenerations";
import { useAudioJobsStore } from "../store/useAudioJobsStore";
import { nanoid } from "nanoid";
import AudioPlayerCard from "../components/AudioPlayerCard";

export default function GeneratorPage() {
  const { voices, loading: voicesLoading } = useVoices();
  const { addJob, removeJob, syncWithBackend, cleanupJobs, isPolling, startPolling } = useAudioJobsStore();

  const [text, setText] = useState("");
  const [voice, setVoice] = useState("en-US-JennyNeural");
  const [rate, setRate] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [lastJobId, setLastJobId] = useState<string | null>(null);

  useEffect(() => {
    if (voices.length > 0 && !voice) {
      setVoice(voices[0]?.ShortName || "en-US-JennyNeural");
    }
  }, [voices, voice]);

  useEffect(() => {
    syncWithBackend();
    cleanupJobs();
    // No need for global interval here anymore, the store manages polling when active
  }, []);

  const handleGenerate = async (type: "short" | "long" = "short") => {
    if (!text.trim()) {
      toast.error("Please enter some text to convert.");
      return;
    }

    const rateStr = rate >= 0 ? `+${rate}%` : `${rate}%`;
    const pitchStr = pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`;

    setGenerating(true);

    try {
      if (type === "long" || text.length > 5000) {
        const result = await apiGenerateLong({
          text,
          voice,
          rate: rateStr,
          pitch: pitchStr,
        });
        
        addJob({
          id: result.job_id,
          type: "long",
          status: "queued",
          progress: 0,
          text: text.substring(0, 100),
          voice,
          createdAt: new Date().toISOString(),
        });

        setLastJobId(result.job_id);
        toast.success("Long audio job started!");
        startPolling();
      } else {
        const tempId = `temp-${nanoid(8)}`;
        
        const { jobId: serverJobId } = await generateShortAudio({
          text,
          voice,
          rate: rateStr,
          pitch: pitchStr,
        });
        
        const finalId = serverJobId || tempId;
        
        addJob({
          id: finalId,
          type: "short",
          status: "completed",
          progress: 100,
          text: text.substring(0, 100),
          voice,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });

        setLastJobId(finalId);
        toast.success("Audio generated successfully!");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-10"
    >
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Left Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="bg-[#0d0d1a] border border-white/[0.06] rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#7c5cff] to-transparent opacity-50" />
              
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-[#7c5cff]/10 text-[#a78bfa]">
                    <Mic size={20} />
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Voice Generator</h2>
                </div>
                <p className="text-sm text-[#555570] font-medium">Craft perfect speech with AI neural voices.</p>
              </div>

              {voicesLoading ? (
                <GeneratorSkeleton />
              ) : (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold text-[#555570] mb-3 tracking-[0.2em] uppercase">Input Text</label>
                    <div className="relative group/text">
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Type your script here..."
                        maxLength={50000}
                        rows={6}
                        className="w-full p-5 bg-[#12121f]/50 border border-white/5 rounded-2xl text-[#e8e8f0] text-sm leading-relaxed transition-all focus:border-[#7c5cff]/40 focus:bg-[#12121f] outline-none placeholder:text-[#33334d]"
                      />
                      <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur-md border border-white/5 text-[10px] font-bold text-[#555570]">
                        <span className={text.length > 40000 ? "text-orange-400" : ""}>{text.length.toLocaleString()}</span>
                        <span className="opacity-30">/</span>
                        <span>50,000</span>
                      </div>
                    </div>
                  </div>

                  <VoiceSelector
                    voices={voices}
                    selectedVoice={voice}
                    onSelect={setVoice}
                    isLoading={voicesLoading}
                  />

                  <div className="flex gap-4 pt-2">
                    <motion.button
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleGenerate("short")}
                      disabled={generating || isPolling}
                      className="flex-1 py-4 px-6 rounded-2xl bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] text-white font-bold text-sm shadow-lg shadow-[#7c5cff]/20 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      {generating && !isPolling ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                      Generate Short
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleGenerate("long")}
                      disabled={generating || isPolling}
                      className="flex-1 py-4 px-6 rounded-2xl border border-white/5 bg-white/[0.02] text-white font-bold text-sm hover:bg-white/[0.05] disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      <Clock size={18} />
                      Long Audio
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Right Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="bg-[#0d0d1a] border border-white/[0.06] rounded-[32px] p-8 h-full shadow-2xl relative overflow-hidden flex flex-col">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#7c5cff] to-transparent opacity-50" />
              
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-[#3b82f6]/10 text-[#60a5fa]">
                    <Gauge size={20} />
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Real-time Output</h2>
                </div>
                <p className="text-sm text-[#555570] font-medium">Monitor your active generation status.</p>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                {lastJobId ? (
                  <div className="space-y-6">
                    <AudioPlayerCard jobId={lastJobId} />
                    <div className="flex items-center gap-2 justify-center">
                      <Sparkles size={12} className="text-[#a78bfa] animate-pulse" />
                      <span className="text-[10px] font-bold text-[#555570] uppercase tracking-[0.2em]">Ready for download</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-6 py-12">
                    <div className="relative inline-block">
                      <div className="absolute inset-0 bg-[#7c5cff]/20 blur-3xl rounded-full" />
                      <div className="relative w-20 h-20 rounded-[24px] bg-[#12121f] border border-white/5 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                        <Mic size={32} className="text-[#33334d]" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-white font-bold mb-2">No Active Generation</h3>
                      <p className="text-xs text-[#555570] max-w-[240px] mx-auto leading-relaxed">
                        Start your first generation to see the interactive player and metrics here.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-[#555570] uppercase tracking-[0.2em]">System Ready</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        <RecentGenerations />
      </div>
    </motion.div>
  );
}
