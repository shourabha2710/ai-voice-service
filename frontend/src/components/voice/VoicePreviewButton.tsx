import { useState, useRef, useEffect } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateShortAudio } from "../../lib/api";
import toast from "react-hot-toast";

interface VoicePreviewButtonProps {
  voice: string;
  isPlaying: boolean;
  onPlay: (voice: string) => void;
  onStop: () => void;
}

export default function VoicePreviewButton({
  voice,
  isPlaying,
  onPlay,
  onStop,
}: VoicePreviewButtonProps) {
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const handleTogglePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isPlaying) {
      stopPlayback();
      return;
    }

    try {
      setLoading(true);
      onPlay(voice); // Tell parent we are trying to play

      const { blob } = await generateShortAudio({
        text: "Hello! This is a preview of my voice. How do I sound?",
        voice: voice,
        rate: "+0%",
        pitch: "+0Hz",
      });

      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => {
        stopPlayback();
      };

      audio.onerror = () => {
        toast.error("Failed to play preview");
        stopPlayback();
      };

      await audio.play();
      setLoading(false);
    } catch (err) {
      console.error("Preview failed:", err);
      toast.error("Preview unavailable");
      setLoading(false);
      onStop();
    }
  };

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setLoading(false);
    onStop();
  };

  useEffect(() => {
    // If parent tells us to stop (because someone else started)
    if (!isPlaying && (audioRef.current || loading)) {
      stopPlayback();
    }
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={handleTogglePlay}
      disabled={loading && !isPlaying}
      className={`relative flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-300 ${
        isPlaying 
          ? "bg-[#7c5cff] border-[#7c5cff] shadow-[0_0_15px_rgba(124,92,255,0.5)]" 
          : "bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] hover:border-[#7c5cff] hover:bg-[rgba(124,92,255,0.1)]"
      }`}
    >
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Loader2 size={14} className="animate-spin text-white" />
          </motion.div>
        ) : isPlaying ? (
          <motion.div
            key="stop"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Square size={12} fill="white" className="text-white" />
          </motion.div>
        ) : (
          <motion.div
            key="play"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Play size={12} fill="white" className="text-white ml-0.5" />
          </motion.div>
        )}
      </AnimatePresence>

      {(isPlaying || loading) && (
        <motion.div
          layoutId="pulse"
          className={`absolute inset-0 rounded-full -z-10 ${loading ? "bg-white/20" : "bg-[#7c5cff]"}`}
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
}
