import { useState } from "react";
import { motion } from "framer-motion";
import { Mic2, ChevronRight, Settings2 } from "lucide-react";
import { Voice } from "../../lib/api";
import { formatVoiceName, getFlag } from "../../lib/utils";
import VoiceSettingsSidebar from "./VoiceSettingsSidebar";

interface VoiceSelectorProps {
  voices: Voice[];
  selectedVoice: string;
  onSelect: (voice: string) => void;
  isLoading?: boolean;
}

export default function VoiceSelector({
  voices,
  selectedVoice,
  onSelect,
  isLoading,
}: VoiceSelectorProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const currentVoice = voices.find((v) => v.ShortName === selectedVoice);

  return (
    <>
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-[#555570] mb-2 tracking-wide uppercase">
          Voice Engine
        </label>
        
        <motion.button
          whileHover={{ scale: 1.01, backgroundColor: "rgba(255,255,255,0.02)" }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setIsSidebarOpen(true)}
          disabled={isLoading}
          className="w-full flex items-center justify-between p-4 bg-[#12121f]/50 border border-white/5 rounded-2xl transition-all duration-300 group hover:border-[#7c5cff]/30"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#0a0a14] border border-white/5 flex items-center justify-center text-xl shadow-inner group-hover:border-[#7c5cff]/20 group-hover:shadow-[0_0_15px_rgba(124,92,255,0.1)] transition-all">
              {currentVoice ? getFlag(currentVoice.Locale) : <Mic2 size={20} className="text-[#33334d]" />}
            </div>
            
            <div className="text-left">
              <h3 className="text-sm font-bold text-white leading-tight mb-1">
                {currentVoice ? formatVoiceName(currentVoice.FriendlyName) : "Select Voice"}
              </h3>
              <div className="flex items-center gap-2 text-[10px] text-[#555570] font-medium uppercase tracking-wider">
                <Settings2 size={10} />
                {currentVoice ? `${currentVoice.Gender} • ${currentVoice.Locale}` : "Configure voice settings"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[#33334d] group-hover:text-[#7c5cff] transition-colors">
            <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Settings</span>
            <ChevronRight size={18} />
          </div>
        </motion.button>
      </div>

      <VoiceSettingsSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        voices={voices}
        selectedVoice={selectedVoice}
        onApply={onSelect}
      />
    </>
  );
}
