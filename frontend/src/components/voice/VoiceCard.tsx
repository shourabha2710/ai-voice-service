import { motion } from "framer-motion";
import { Check } from "lucide-react";
import VoicePreviewButton from "./VoicePreviewButton";
import { Voice } from "../../lib/api";
import { formatVoiceName, getFlag } from "../../lib/utils";

interface VoiceCardProps {
  voice: Voice;
  isSelected: boolean;
  onSelect: (shortName: string) => void;
  playingVoice: string | null;
  onPlay: (voice: string) => void;
  onStop: () => void;
}

export default function VoiceCard({
  voice,
  isSelected,
  onSelect,
  playingVoice,
  onPlay,
  onStop,
}: VoiceCardProps) {
  const isPlaying = playingVoice === voice.ShortName;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01, backgroundColor: "rgba(255,255,255,0.03)" }}
      onClick={() => onSelect(voice.ShortName)}
      className={`group flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
        isSelected
          ? "bg-[rgba(124,92,255,0.08)] border-[rgba(124,92,255,0.3)]"
          : "bg-transparent border-transparent hover:border-[rgba(255,255,255,0.08)]"
      }`}
    >
      <div className="flex-shrink-0 text-xl w-8 h-8 flex items-center justify-center bg-[rgba(255,255,255,0.03)] rounded-lg">
        {getFlag(voice.Locale)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-sm font-semibold truncate ${isSelected ? "text-[#a78bfa]" : "text-[#e8e8f0]"}`}>
            {formatVoiceName(voice.FriendlyName)}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
            voice.Gender === "Female" 
              ? "text-pink-400 border-pink-400/20 bg-pink-400/5" 
              : "text-blue-400 border-blue-400/20 bg-blue-400/5"
          }`}>
            {voice.Gender}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[#555570]">
          <span>{voice.Locale}</span>
          <span>•</span>
          <span className="truncate">{voice.SuggestedCodec.split('-')[1]}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <VoicePreviewButton
          voice={voice.ShortName}
          isPlaying={isPlaying}
          onPlay={onPlay}
          onStop={onStop}
        />
        <div className={`flex items-center justify-center w-5 h-5 rounded-full border transition-all duration-300 ${
          isSelected 
            ? "bg-[#7c5cff] border-[#7c5cff] text-white" 
            : "bg-transparent border-[rgba(255,255,255,0.1)] text-transparent group-hover:border-[rgba(124,92,255,0.3)]"
        }`}>
          <Check size={12} strokeWidth={3} />
        </div>
      </div>
    </motion.div>
  );
}
