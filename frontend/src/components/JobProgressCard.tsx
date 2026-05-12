import { motion } from "framer-motion";
import { Loader2, Activity, Clock, CheckCircle, XCircle } from "lucide-react";
import type { JobProgress } from "../lib/api";

interface JobProgressCardProps {
  job: JobProgress;
}

export default function JobProgressCard({ job }: JobProgressCardProps) {
  const isProcessing = job.status === "processing" || job.status === "pending";
  const isFailed = job.status === "failed";
  const isCompleted = job.status === "completed";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6 bg-[#12121f] border border-[rgba(255,255,255,0.06)] rounded-2xl"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isProcessing ? "bg-[rgba(59,130,246,0.1)] text-[#3b82f6]" :
            isFailed ? "bg-[rgba(239,68,68,0.1)] text-[#ef4444]" :
            "bg-[rgba(16,185,129,0.1)] text-[#10b981]"
          }`}>
            {isProcessing ? <Activity size={20} className="animate-pulse" /> : 
             isFailed ? <XCircle size={20} /> : 
             <CheckCircle size={20} />}
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight">
              {isProcessing ? "Processing Job" : isFailed ? "Job Failed" : "Job Completed"}
            </h3>
            <p className="text-[11px] text-[#555570] font-mono">
              ID: {job.job_id}
            </p>
          </div>
        </div>
        <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
          isProcessing ? "border-[rgba(59,130,246,0.2)] text-[#3b82f6]" :
          isFailed ? "border-[rgba(239,68,68,0.2)] text-[#ef4444]" :
          "border-[rgba(16,185,129,0.2)] text-[#10b981]"
        }`}>
          {job.status}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-2 text-[11px]">
            <span className="text-[#8888a0]">Progress</span>
            <span className="font-semibold text-[#a78bfa]">{Math.round(job.progress)}%</span>
          </div>
          <div className="h-1.5 bg-[#0d0d1a] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${job.progress}%` }}
              className={`h-full ${isFailed ? "bg-[#ef4444]" : "bg-gradient-to-r from-[#7c5cff] to-[#3b82f6]"}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-[#0d0d1a] border border-[rgba(255,255,255,0.03)] rounded-xl">
            <div className="flex items-center gap-2 mb-1 text-[10px] text-[#555570]">
              <Clock size={11} />
              Chunks
            </div>
            <div className="text-sm font-bold">
              {job.completed_chunks} / {job.total_chunks}
            </div>
          </div>
          <div className="p-3 bg-[#0d0d1a] border border-[rgba(255,255,255,0.03)] rounded-xl">
            <div className="flex items-center gap-2 mb-1 text-[10px] text-[#555570]">
              <Loader2 size={11} className={isProcessing ? "animate-spin" : ""} />
              Updated
            </div>
            <div className="text-[11px] font-semibold text-[#8888a0]">
              {job.updated_at ? new Date(job.updated_at).toLocaleTimeString() : "Pending"}
            </div>
          </div>
        </div>

        {job.error && (
          <div className="p-3 bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.1)] rounded-xl text-[11px] text-[#ef4444]">
            <span className="font-bold">Error:</span> {job.error}
          </div>
        )}
      </div>
    </motion.div>
  );
}
