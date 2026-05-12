import { motion, AnimatePresence } from "framer-motion";
import { X, Search, User, Users, Info, Settings2, Mic2, Play, Square, Loader2, Check, ArrowRight } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { Voice } from "../../lib/api";
import { formatVoiceName, getFlag } from "../../lib/utils";
import VoicePreviewButton from "./VoicePreviewButton";
import toast from "react-hot-toast";

interface VoiceSettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  voices: Voice[];
  selectedVoice: string;
  onApply: (voice: string) => void;
}

import { useVoicePreview } from "../../hooks/useVoicePreview";

export default function VoiceSettingsSidebar({
  isOpen,
  onClose,
  voices,
  selectedVoice,
  onApply,
}: VoiceSettingsSidebarProps) {
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("all");
  const [tempSelected, setTempSelected] = useState(selectedVoice);
  
  const { playingVoice, isLoading: previewLoading, play: playPreview, stop: stopPreview } = useVoicePreview();

  // Sync temp selection with actual selection when sidebar opens
  useEffect(() => {
    if (isOpen) {
      setTempSelected(selectedVoice);
    }
  }, [isOpen, selectedVoice]);

  const filteredVoices = useMemo(() => {
    return voices.filter((v) => {
      const matchesGender = gender === "all" || v.Gender === gender;
      const searchLower = search.toLowerCase();
      const matchesSearch =
        v.FriendlyName.toLowerCase().includes(searchLower) ||
        v.ShortName.toLowerCase().includes(searchLower) ||
        v.Locale.toLowerCase().includes(searchLower);
      return matchesGender && matchesSearch;
    });
  }, [voices, gender, search]);

  const currentVoice = useMemo(
    () => voices.find((v) => v.ShortName === tempSelected),
    [voices, tempSelected]
  );

  // Close on ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 z-[101] h-full w-full sm:w-[480px] bg-[#07070d] border-l border-white/10 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-6 border-b border-white/5 bg-[#0a0a14]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#3b82f6] flex items-center justify-center shadow-lg shadow-[#7c5cff]/20">
                  <Settings2 size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white leading-none mb-1">Voice Settings</h2>
                  <p className="text-xs text-[#8888a0]">Browse and select AI voices</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/5 text-[#555570] hover:text-white transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sticky Filters */}
            <div className="px-6 py-5 space-y-4 bg-[#0a0a14]/50 border-b border-white/5">
              {/* Search */}
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555570] group-focus-within:text-[#7c5cff] transition-colors" size={16} />
                <input
                  type="text"
                  placeholder="Search by name, language or locale..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#12121f] border border-white/5 rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-[#33334d] outline-none focus:border-[#7c5cff]/50 focus:bg-[#12121f]/80 transition-all"
                />
              </div>

              {/* Gender Tabs */}
              <div className="flex p-1 bg-[#12121f] rounded-xl border border-white/5">
                {[
                  { id: "all", label: "All", icon: <Users size={14} /> },
                  { id: "Male", label: "Male", icon: <User size={14} /> },
                  { id: "Female", label: "Female", icon: <User size={14} /> },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setGender(tab.id)}
                    className={`relative flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold transition-all duration-300 z-10 ${
                      gender === tab.id ? "text-white" : "text-[#555570] hover:text-[#8888a0]"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {gender === tab.id && (
                      <motion.div
                        layoutId="active-tab"
                        className="absolute inset-0 bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] rounded-lg -z-10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice List */}
            <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar bg-[#07070d]">
              <div className="grid gap-3">
                <AnimatePresence mode="popLayout">
                  {filteredVoices.length > 0 ? (
                    filteredVoices.map((v, idx) => (
                      <VoiceSidebarCard
                        key={v.ShortName}
                        voice={v}
                        isSelected={tempSelected === v.ShortName}
                        onSelect={() => setTempSelected(v.ShortName)}
                        isPlaying={playingVoice === v.ShortName}
                        onPlay={playPreview}
                        onStop={stopPreview}
                        index={idx}
                      />
                    ))
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="py-20 text-center"
                    >
                      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                        <Mic2 size={30} className="text-[#33334d]" />
                      </div>
                      <p className="text-[#555570] text-sm">No voices found matching your search</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/5 bg-[#0a0a14] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#555570] font-bold mb-1">Current Selection</p>
                  <p className="text-sm font-bold text-white truncate max-w-[280px]">
                    {currentVoice ? formatVoiceName(currentVoice.FriendlyName) : "None selected"}
                  </p>
                </div>
                {currentVoice && (
                  <div className="text-xl">
                    {getFlag(currentVoice.Locale)}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-semibold text-sm hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onApply(tempSelected);
                    onClose();
                  }}
                  className="flex-[1.5] py-3.5 rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] text-white font-semibold text-sm shadow-lg shadow-[#7c5cff]/20 hover:shadow-[#7c5cff]/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                >
                  Apply Voice
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface VoiceSidebarCardProps {
  voice: Voice;
  isSelected: boolean;
  onSelect: () => void;
  isPlaying: boolean;
  onPlay: (v: string) => void;
  onStop: () => void;
  index: number;
}

function VoiceSidebarCard({ voice, isSelected, onSelect, isPlaying, onPlay, onStop, index }: VoiceSidebarCardProps) {
  // Generate pseudo-tags for premium feel
  const tags = useMemo(() => {
    const defaultTags = ["Natural", "Neural"];
    if (voice.FriendlyName.includes("Natural")) defaultTags.push("Premium");
    if (voice.ShortName.includes("News")) defaultTags.push("Journalistic");
    if (voice.ShortName.includes("Cheerful")) defaultTags.push("Upbeat");
    return defaultTags;
  }, [voice]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4) }}
      onClick={onSelect}
      className={`group relative p-4 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden ${
        isSelected
          ? "bg-gradient-to-br from-[rgba(124,92,255,0.15)] to-[rgba(59,130,246,0.15)] border-[#7c5cff]/40 shadow-[0_0_30px_rgba(124,92,255,0.1)]"
          : "bg-[#12121f]/40 border-white/[0.03] hover:border-white/10 hover:bg-[#12121f]/60"
      }`}
    >
      {isSelected && (
        <motion.div
          layoutId="active-border"
          className="absolute inset-0 border-2 border-[#7c5cff]/50 rounded-2xl pointer-events-none"
          initial={false}
        />
      )}

      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`text-sm font-bold truncate ${isSelected ? "text-white" : "text-[#e8e8f0]"}`}>
              {formatVoiceName(voice.FriendlyName)}
            </h3>
            {isSelected && (
              <div className="flex-shrink-0 w-4 h-4 rounded-full bg-[#7c5cff] flex items-center justify-center">
                <Check size={10} className="text-white" strokeWidth={3} />
              </div>
            )}
          </div>
          <p className="text-[11px] text-[#555570] flex items-center gap-1.5">
            <span className="text-base leading-none">{getFlag(voice.Locale)}</span>
            {voice.Locale}
          </p>
        </div>
        
        <VoicePreviewButton
          voice={voice.ShortName}
          isPlaying={isPlaying}
          onPlay={onPlay}
          onStop={onStop}
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mt-auto">
        <span className={`text-[9px] px-2 py-0.5 rounded-md border ${
          voice.Gender === "Female" 
            ? "text-pink-400 border-pink-400/20 bg-pink-400/5" 
            : "text-blue-400 border-blue-400/20 bg-blue-400/5"
        }`}>
          {voice.Gender}
        </span>
        {tags.map(tag => (
          <span key={tag} className="text-[9px] px-2 py-0.5 rounded-md border border-white/5 bg-white/5 text-[#8888a0]">
            {tag}
          </span>
        ))}
      </div>

      {isPlaying && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#12121f]">
          <motion.div
            className="h-full bg-gradient-to-r from-[#7c5cff] to-[#3b82f6]"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          />
        </div>
      )}
    </motion.div>
  );
}
