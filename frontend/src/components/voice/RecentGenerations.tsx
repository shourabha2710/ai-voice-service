import { motion, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle2, AlertCircle, Loader2, Trash2, Search, History, Sparkles, FilterX } from "lucide-react";
import { useAudioJobsStore, AudioJob } from "../../store/useAudioJobsStore";
import { useState, useMemo } from "react";
import { formatVoiceName, getFlag } from "../../lib/utils";
import AudioPlayerCard from "../AudioPlayerCard";

export default function RecentGenerations() {
  const { jobs, removeJob, cleanupJobs } = useAudioJobsStore();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesSearch = job.text.toLowerCase().includes(search.toLowerCase()) || 
                           job.voice.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === "all" || job.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [jobs, search, filter]);

  if (jobs.length === 0) return null;

  return (
    <div className="mt-16 space-y-8 max-w-full overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7c5cff]/10 flex items-center justify-center">
              <History size={22} className="text-[#a78bfa]" />
            </div>
            Generation History
          </h2>
          <p className="text-xs text-[#555570] ml-13 font-medium">Your creative journey, persisted and ready to replay.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#33334d] group-focus-within:text-[#7c5cff] transition-colors" size={15} />
            <input 
              type="text"
              placeholder="Search history..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#12121f]/50 border border-white/5 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white outline-none focus:border-[#7c5cff]/30 focus:bg-[#12121f] w-full md:w-64 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-2 bg-[#12121f]/50 p-1 rounded-xl border border-white/5">
            {["all", "completed", "processing", "expired"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  filter === f ? "bg-[#7c5cff] text-white shadow-lg shadow-[#7c5cff]/20" : "text-[#555570] hover:text-[#8888a0]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button 
            onClick={cleanupJobs}
            className="p-2.5 rounded-xl bg-[#12121f]/50 border border-white/5 text-[#555570] hover:text-red-400 hover:border-red-400/20 transition-all group"
            title="Cleanup history"
          >
            <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <AnimatePresence mode="popLayout">
          {filteredJobs.length > 0 ? (
            filteredJobs.map((job) => (
              <JobHistoryCard key={job.id} job={job} onRemove={() => removeJob(job.id)} />
            ))
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 text-center border-2 border-dashed border-white/[0.03] rounded-[32px]"
            >
              <div className="w-16 h-16 rounded-full bg-white/[0.02] flex items-center justify-center mx-auto mb-4">
                <FilterX size={24} className="text-[#33334d]" />
              </div>
              <p className="text-sm text-[#555570] font-medium">No generations found for current filter.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function JobHistoryCard({ job, onRemove }: { job: AudioJob; onRemove: () => void }) {
  const isExpired = job.status === "expired";
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className={`group relative p-6 rounded-[28px] border transition-all duration-500 overflow-hidden ${
        isExpired 
          ? "bg-[#07070d] border-white/5 opacity-60" 
          : "bg-gradient-to-br from-[#0d0d1a] to-[#07070d] border-white/[0.04] hover:border-[#7c5cff]/20 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
      }`}
    >
      {/* Dynamic Background Glow */}
      {!isExpired && (
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#7c5cff]/5 blur-[100px] group-hover:bg-[#7c5cff]/10 transition-all duration-700" />
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
        {/* Job Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 ${
              job.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
              job.status === "failed" ? "bg-red-500/10 text-red-400 border border-red-500/20" : 
              job.status === "expired" ? "bg-white/5 text-[#555570] border border-white/10" :
              "bg-[#7c5cff]/10 text-[#a78bfa] border border-[#7c5cff]/20"
            }`}>
              {job.status === "processing" ? <Loader2 size={12} className="animate-spin" /> : 
               job.status === "completed" ? <CheckCircle2 size={12} /> : 
               job.status === "expired" ? <AlertCircle size={12} /> : <AlertCircle size={12} />}
              {job.status}
            </span>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.02] border border-white/[0.04]">
              <Sparkles size={10} className="text-[#7c5cff]" />
              <span className="text-[10px] text-[#8888a0] font-bold uppercase tracking-widest">{job.type} Generation</span>
            </div>
            <span className="text-[10px] text-[#33334d] font-bold tracking-tight uppercase">{new Date(job.createdAt).toLocaleString()}</span>
          </div>
          
          <h3 className="text-base font-bold text-white mb-3 line-clamp-2 leading-relaxed">
            {job.text}
          </h3>
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-lg">
              {getFlag(job.voice)}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">{formatVoiceName(job.voice)}</span>
              <span className="text-[10px] text-[#555570] font-medium">{job.voice}</span>
            </div>
          </div>
        </div>

        {/* Action / Player Section */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
          {job.status === "completed" && (
            <div className="w-full sm:w-[400px]">
              <AudioPlayerCard jobId={job.id} hideIcon />
            </div>
          )}

          {job.status === "processing" && (
            <div className="w-full sm:w-[280px] bg-white/[0.02] p-4 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-[#7c5cff]" />
                  <span className="text-[11px] font-bold text-white uppercase tracking-widest">Processing</span>
                </div>
                <span className="text-sm font-black text-[#7c5cff]">{job.progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-gradient-to-r from-[#7c5cff] to-[#3b82f6]"
                  initial={{ width: 0 }}
                  animate={{ width: `${job.progress}%` }}
                  transition={{ type: "spring", bounce: 0, duration: 0.8 }}
                />
              </div>
              {job.chunks_completed !== undefined && (
                <p className="text-[10px] text-[#555570] mt-3 font-bold uppercase tracking-tighter">
                  Synced: {job.chunks_completed} / {job.total_chunks} segments
                </p>
              )}
            </div>
          )}

          {isExpired && (
            <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-400/80 italic text-sm">
              <AlertCircle size={16} />
              Generation Expired on Server
            </div>
          )}

          {job.status === "failed" && (
            <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10">
              <p className="text-xs text-red-400 font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                <AlertCircle size={12} />
                Failed
              </p>
              <p className="text-xs text-[#555570] font-medium">{job.error || "Connection timeout"}</p>
            </div>
          )}

          <div className="flex items-center h-full border-l border-white/5 pl-4 ml-2">
            <button 
              onClick={onRemove}
              className="p-3 rounded-xl hover:bg-red-500/10 text-[#33334d] hover:text-red-400 transition-all"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
