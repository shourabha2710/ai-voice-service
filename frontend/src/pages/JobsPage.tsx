import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  Search,
  Trash2,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  getJobStatus,
  downloadJobResult,
  deleteJob,
} from "../lib/api";
import type { JobProgress } from "../lib/api";

interface JobItem extends JobProgress {
  localId: string;
  deleting?: boolean;
}

const statusColors: Record<string, string> = {
  pending: "text-[#f59e0b] bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.2)]",
  processing:
    "text-[#3b82f6] bg-[rgba(59,130,246,0.12)] border-[rgba(59,130,246,0.2)]",
  completed:
    "text-[#06b6d4] bg-[rgba(6,182,212,0.12)] border-[rgba(6,182,212,0.2)]",
  failed:
    "text-[#ef4444] bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.2)]",
};

export default function JobsPage() {
  const [jobIds, setJobIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("jobIds") || "[]");
    } catch {
      return [];
    }
  });
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const saveJobIds = useCallback((ids: string[]) => {
    setJobIds(ids);
    localStorage.setItem("jobIds", JSON.stringify(ids));
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const results: JobItem[] = [];
    for (const id of jobIds) {
      try {
        const job = await getJobStatus(id);
        results.push({ ...job, localId: id });
      } catch {
        results.push({
          job_id: id,
          localId: id,
          status: "failed",
          progress: 0,
          completed_chunks: 0,
          total_chunks: 0,
          created_at: "",
          updated_at: "",
          error: "Job not found",
        });
      }
    }
    setJobs(results);
    setLoading(false);
  }, [jobIds]);

  useEffect(() => {
    if (jobIds.length > 0) {
      fetchJobs();
      const interval = setInterval(fetchJobs, 5000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
      setJobs([]);
    }
  }, [jobIds, fetchJobs]);

  const handleDelete = async (jobId: string) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.job_id === jobId ? { ...j, deleting: true } : j
      )
    );
    try {
      await deleteJob(jobId);
      saveJobIds(jobIds.filter((id) => id !== jobId));
      toast.success("Job deleted");
    } catch {
      toast.error("Failed to delete job");
      setJobs((prev) =>
        prev.map((j) =>
          j.job_id === jobId ? { ...j, deleting: false } : j
        )
      );
    }
  };

  const handleDownload = async (jobId: string) => {
    try {
      const blob = await downloadJobResult(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `long_speech_${jobId}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch {
      toast.error("Failed to download audio. Job may still be processing.");
    }
  };

  const filteredJobs = jobs.filter((j) => {
    const matchesSearch = j.job_id
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="py-10"
    >
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
            <p className="text-sm text-[#8888a0] mt-1">
              Track and manage your long audio generation jobs
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={fetchJobs}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.06)] text-[#8888a0] text-xs font-medium bg-transparent cursor-pointer transition-all duration-200 hover:text-[#e8e8f0] hover:bg-[rgba(255,255,255,0.04)]"
          >
            <RefreshCw size={14} />
            Refresh
          </motion.button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555570]"
            />
            <input
              type="text"
              placeholder="Search by job ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[#12121f] border border-[rgba(255,255,255,0.06)] rounded-xl text-[#e8e8f0] text-sm outline-none transition-all duration-200 focus:border-[#7c5cff] focus:shadow-[0_0_0_3px_rgba(124,92,255,0.12)] placeholder:text-[#555570]"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 pr-10 bg-[#12121f] border border-[rgba(255,255,255,0.06)] rounded-xl text-[#e8e8f0] text-sm font-medium appearance-none cursor-pointer outline-none transition-all duration-200 focus:border-[#7c5cff]"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <div className="absolute top-1/2 right-3 -translate-y-1/2 w-2 h-2 border-r-2 border-b-2 border-[#555570] rotate-45 pointer-events-none mt-[-3px]" />
          </div>
        </div>

        {/* Jobs List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-[16px] bg-gradient-to-r from-[#12121f] via-[rgba(255,255,255,0.03)] to-[#12121f] bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]"
              />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[rgba(124,92,255,0.06)] flex items-center justify-center mb-4">
              <Clock size={28} className="text-[#555570]" />
            </div>
            <p className="text-sm text-[#555570]">
              {jobIds.length === 0
                ? "No jobs yet. Generate long audio to see it here."
                : "No jobs match your filters."}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="space-y-3">
              {filteredJobs.map((job) => (
                <motion.div
                  key={job.job_id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-4 p-5 bg-[#0d0d1a] border border-[rgba(255,255,255,0.06)] rounded-[16px] transition-all duration-200 hover:border-[rgba(124,92,255,0.15)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <code className="text-xs text-[#555570] font-mono">
                        {job.job_id.slice(0, 8)}...
                      </code>
                      <span
                        className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${statusColors[job.status] || ""}`}
                      >
                        {job.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-[#555570]">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {job.created_at
                          ? new Date(job.created_at).toLocaleString()
                          : "N/A"}
                      </span>
                      {job.total_chunks > 0 && (
                        <span>
                          {job.completed_chunks}/{job.total_chunks} chunks
                        </span>
                      )}
                      <span>{Math.round(job.progress)}%</span>
                    </div>
                    {job.error && (
                      <p className="text-[11px] text-[#ef4444] mt-1">
                        {job.error}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {job.status === "processing" && (
                      <Loader2
                        size={16}
                        className="text-[#3b82f6] animate-spin"
                      />
                    )}
                    {job.status === "completed" && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleDownload(job.job_id)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[rgba(6,182,212,0.1)] border border-[rgba(6,182,212,0.2)] text-[#06b6d4] text-xs font-semibold cursor-pointer transition-all duration-200 hover:bg-[rgba(6,182,212,0.18)]"
                      >
                        <Download size={12} />
                        Download
                      </motion.button>
                    )}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleDelete(job.job_id)}
                      disabled={job.deleting}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.15)] text-[#ef4444] text-xs font-semibold cursor-pointer transition-all duration-200 hover:bg-[rgba(239,68,68,0.15)] disabled:opacity-50"
                    >
                      {job.deleting ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      Delete
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
