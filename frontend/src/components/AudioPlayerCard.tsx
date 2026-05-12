import { useState, useRef, useEffect } from "react";
import { Play, Pause, Download, AlertCircle, Loader2, Volume2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { audioUrlManager } from "../lib/audioUrlManager";
import toast from "react-hot-toast";

interface AudioPlayerCardProps {
  jobId?: string;
  audioUrl?: string; // Legacy support or direct URL
  hideIcon?: boolean;
}

type PlayerStatus = "idle" | "loading" | "buffering" | "playing" | "paused" | "failed";

export default function AudioPlayerCard({ jobId, audioUrl: initialUrl, hideIcon }: AudioPlayerCardProps) {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playableUrl, setPlayableUrl] = useState<string | null>(
    initialUrl && !initialUrl.startsWith("blob:") ? initialUrl : null
  );
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize playback
  const handlePlay = async () => {
    if (!jobId && !playableUrl) {
      toast.error("No audio source available");
      return;
    }

    try {
      // 1. If we don't have a URL yet, fetch it
      if (!playableUrl && jobId) {
        setStatus("loading");
        const url = await audioUrlManager.getPlayableUrl(jobId);
        setPlayableUrl(url);
      }

      // 2. Play the audio
      if (audioRef.current) {
        if (status === "playing") {
          audioRef.current.pause();
          setStatus("paused");
        } else {
          setStatus("buffering");
          const playPromise = audioRef.current.play();
          
          if (playPromise !== undefined) {
            playPromise
              .then(() => setStatus("playing"))
              .catch((error) => {
                console.error("[AudioPlayer] Playback failed:", error);
                setStatus("failed");
                toast.error("Playback failed. Please try again.");
              });
          }
        }
      }
    } catch (error) {
      setStatus("failed");
      toast.error("Failed to load audio from server");
    }
  };

  const handleDownload = async () => {
    if (!jobId && !playableUrl) return;
    
    try {
      const url = playableUrl || (jobId ? await audioUrlManager.getPlayableUrl(jobId) : null);
      if (!url) return;
      
      const a = document.createElement("a");
      a.href = url;
      a.download = `voxforge_${jobId || "audio"}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      toast.error("Download failed");
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const total = audioRef.current.duration;
      setProgress((current / total) * 100);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      if (status === "buffering") setStatus("playing");
    }
  };

  const onEnded = () => {
    setStatus("idle");
    setProgress(0);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (jobId) {
        audioUrlManager.cleanupUrl(jobId);
      }
    };
  }, [jobId]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative w-full group"
    >
      <div className="bg-[#12121f]/60 backdrop-blur-xl border border-white/[0.05] rounded-2xl p-4 shadow-2xl overflow-hidden">
        {/* Progress Bar (Background) */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#7c5cff]/5 to-[#3b82f6]/5 pointer-events-none" />
        
        <div className="flex items-center gap-4 relative z-10">
          {/* Main Toggle Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handlePlay}
            disabled={status === "loading"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
              status === "playing" 
                ? "bg-white text-black" 
                : status === "failed"
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-gradient-to-br from-[#7c5cff] to-[#3b82f6] text-white shadow-lg shadow-[#7c5cff]/20"
            }`}
          >
            <AnimatePresence mode="wait">
              {status === "loading" || status === "buffering" ? (
                <motion.div key="loader" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                  <Loader2 size={20} />
                </motion.div>
              ) : status === "playing" ? (
                <motion.div key="pause" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Pause size={20} fill="currentColor" />
                </motion.div>
              ) : status === "failed" ? (
                <motion.div key="retry" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                  <RotateCcw size={20} />
                </motion.div>
              ) : (
                <motion.div key="play" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Play size={20} fill="currentColor" className="ml-1" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Info & Progress */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-2">
              {!hideIcon && (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${status === "playing" ? "bg-emerald-500 animate-pulse" : "bg-[#33334d]"}`} />
                  <span className="text-[10px] font-bold text-[#555570] uppercase tracking-widest">
                    {status === "playing" ? "Live Playback" : status === "loading" ? "Fetching..." : "Ready"}
                  </span>
                </div>
              )}
              <span className="text-[10px] font-medium text-[#555570] font-mono">
                {formatTime(audioRef.current?.currentTime || 0)} / {formatTime(duration)}
              </span>
            </div>

            {/* Waveform / Seekbar Placeholder */}
            <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden cursor-pointer group/bar">
              <div 
                className="absolute inset-0 bg-white/10 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const pct = x / rect.width;
                  if (audioRef.current) {
                    audioRef.current.currentTime = pct * audioRef.current.duration;
                  }
                }}
              />
              <motion.div
                className="h-full bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] relative"
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", damping: 20, stiffness: 100 }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg scale-0 group-hover/bar:scale-100 transition-transform" />
              </motion.div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.05)" }}
              whileTap={{ scale: 0.9 }}
              onClick={handleDownload}
              className="p-2.5 rounded-xl text-[#555570] hover:text-white transition-colors"
              title="Download MP3"
            >
              <Download size={18} />
            </motion.button>
          </div>
        </div>

        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          src={playableUrl || ""}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onEnded={onEnded}
          onWaiting={() => setStatus("buffering")}
          onPlaying={() => setStatus("playing")}
          onError={() => {
            if (playableUrl) {
              setStatus("failed");
              console.error("[AudioPlayer] Audio element error");
            }
          }}
        />
      </div>
    </motion.div>
  );
}

function formatTime(seconds: number) {
  if (isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
