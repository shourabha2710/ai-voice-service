import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../store/AuthContext';
import { useVideoDownloadsStore } from '../store/useVideoDownloadsStore';
import { startVideoDownload, downloadVideoFile, deleteVideoDownload } from '../lib/api';
import LoginModal from '../components/LoginModal';
import VideoDownloadCard from '../components/video/VideoDownloadCard';
import VideoFilters from '../components/video/VideoFilters';
import type { FilterType, SortType } from '../components/video/VideoFilters';
import type { VideoDownload } from '../types';
import toast from 'react-hot-toast';
import {
  Download, Music, Video, Loader2, AlertCircle,
  FileDown, ExternalLink, CheckCircle, Youtube, Image,
} from 'lucide-react';

const YOUTUBE_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
const INSTAGRAM_REGEX = /^(https?:\/\/)?(www\.)?instagram\.com\/(reel|p)\/.+/;

function validateUrl(url: string): { valid: boolean; platform: 'youtube' | 'instagram' | null; error?: string } {
  if (!url.trim()) {
    return { valid: false, platform: null, error: 'Please enter a URL' };
  }
  if (YOUTUBE_REGEX.test(url.trim())) {
    return { valid: true, platform: 'youtube' };
  }
  if (INSTAGRAM_REGEX.test(url.trim())) {
    return { valid: true, platform: 'instagram' };
  }
  return { valid: false, platform: null, error: 'Please enter a valid YouTube or Instagram Reel URL' };
}

export default function VideoDownloaderPage() {
  const { isAuthenticated } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const requireAuth = useCallback((): boolean => {
    if (!isAuthenticated) {
      setIsLoginModalOpen(true);
      return false;
    }
    return true;
  }, [isAuthenticated]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-b from-[#07070d] via-[#0f0f1e] to-[#07070d] text-white"
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#7c5cff]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#3b82f6]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <div className="border-b border-white/[0.06] bg-[#07070d]/50 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] bg-clip-text text-transparent">
                Video & Audio Downloader
              </h1>
              <p className="text-white/50 mt-2 text-sm sm:text-base">
                Download videos and audio from YouTube and Instagram Reels
              </p>
            </motion.div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="space-y-8 sm:space-y-12">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <VideoDownloadForm onAuthRequired={requireAuth} />
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <VideoDownloadHistory onAuthRequired={requireAuth} />
            </motion.section>
          </div>
        </div>
      </div>

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </motion.div>
  );
}

function VideoDownloadForm({ onAuthRequired }: { onAuthRequired: () => boolean }) {
  const [url, setUrl] = useState('');
  const [downloadType, setDownloadType] = useState<'audio' | 'video'>('audio');
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { addJob, startPolling } = useVideoDownloadsStore();

  const handleSubmit = useCallback(async () => {
    setValidationError(null);

    if (!url.trim()) {
      setValidationError('Please enter a URL');
      return;
    }

    const validation = validateUrl(url);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid URL');
      return;
    }

    if (!onAuthRequired()) return;

    try {
      setIsLoading(true);
      const response = await startVideoDownload({ url: url.trim(), download_type: downloadType });

      addJob({
        ...response,
        localCreatedAt: new Date().getTime(),
      });

      startPolling();
      toast.success('Download started!');
      setUrl('');
      setValidationError(null);
    } catch (error: any) {
      const message = error.response?.data?.detail || error.message || 'Failed to start download';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [url, downloadType, addJob, startPolling, onAuthRequired]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const detectedPlatform = url.trim()
    ? (YOUTUBE_REGEX.test(url.trim()) ? 'youtube' : INSTAGRAM_REGEX.test(url.trim()) ? 'instagram' : null)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl mx-auto"
    >
      <div className="bg-gradient-to-br from-[#12121f]/60 to-[#1a1a2e]/60 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-2xl">
        <div className="mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <Download className="w-5 h-5 sm:w-6 sm:h-6 text-[#7c5cff]" />
            Download Media
          </h2>
          <p className="text-white/50 text-xs sm:text-sm">
            Paste a YouTube or Instagram Reel URL to get started
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                <ExternalLink size={18} />
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setValidationError(null); }}
                onKeyDown={handleKeyDown}
                placeholder="https://www.youtube.com/watch?v=... or https://www.instagram.com/reel/..."
                disabled={isLoading}
                className="w-full pl-11 pr-4 py-3 sm:py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#7c5cff] focus:ring-1 focus:ring-[#7c5cff]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
              />
            </div>
            {validationError && (
              <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} />
                {validationError}
              </p>
            )}
            {detectedPlatform && !validationError && (
              <p className="text-emerald-400/60 text-xs mt-1.5 flex items-center gap-1">
                <CheckCircle size={12} />
                {detectedPlatform === 'youtube' ? 'YouTube URL detected' : 'Instagram URL detected'}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs text-white/40 mb-2">Download type:</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDownloadType('audio')}
                disabled={isLoading}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  downloadType === 'audio'
                    ? 'bg-[#7c5cff] text-white shadow-lg shadow-[#7c5cff]/20'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Music size={16} />
                Audio (MP3)
              </button>
              <button
                type="button"
                onClick={() => setDownloadType('video')}
                disabled={isLoading}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  downloadType === 'video'
                    ? 'bg-[#7c5cff] text-white shadow-lg shadow-[#7c5cff]/20'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Video size={16} />
                Video (MP4)
              </button>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={isLoading || !url.trim()}
            className="w-full py-3 sm:py-3.5 rounded-2xl bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] text-white font-bold text-base sm:text-lg hover:shadow-lg hover:shadow-[#7c5cff]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Starting download...
              </>
            ) : (
              <>
                <FileDown className="w-5 h-5" />
                {downloadType === 'audio' ? 'Download Audio' : 'Download Video'}
              </>
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-gradient-to-br from-[#12121f]/40 to-[#1a1a2e]/40 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-4 animate-pulse">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-20 h-24 sm:h-20 rounded-xl bg-white/5" />
        <div className="flex-1 space-y-3">
          <div className="h-4 bg-white/5 rounded w-3/4" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
          <div className="h-2 bg-white/5 rounded w-full" />
        </div>
        <div className="flex sm:flex-col gap-1.5">
          <div className="w-9 h-9 rounded-xl bg-white/5" />
          <div className="w-9 h-9 rounded-xl bg-white/5" />
        </div>
      </div>
    </div>
  );
}

function VideoDownloadHistory({ onAuthRequired }: { onAuthRequired: () => boolean }) {
  const { jobs, fetchDownloads, removeJob, startPolling, stopPolling, cancelJob } = useVideoDownloadsStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortType, setSortType] = useState<SortType>('newest');

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        await fetchDownloads();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load downloads';
        setError(message);
        console.error('Failed to load downloads:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [fetchDownloads]);

  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === 'pending' || j.status === 'downloading' || j.status === 'processing'
    );
    if (hasActive) startPolling();
    return () => stopPolling();
  }, [jobs, startPolling, stopPolling]);

  const handleCancel = useCallback(async (id: string) => {
    if (!onAuthRequired()) return;
    setCancellingId(id);
    await cancelJob(id);
    setCancellingId(null);
    toast.success('Download cancelled');
  }, [cancelJob, onAuthRequired]);

  const handleDelete = useCallback(async (id: string) => {
    if (!onAuthRequired()) return;
    try {
      setDeletingId(id);
      await deleteVideoDownload(id);
      removeJob(id);
      toast.success('Download removed');
    } catch (error: any) {
      const message = error.response?.data?.detail || error.message || 'Failed to delete';
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  }, [removeJob, onAuthRequired]);

  const handleRetry = useCallback(async (job: VideoDownload) => {
    if (!onAuthRequired()) return;
    try {
      const response = await startVideoDownload({ url: job.url, download_type: job.download_type });
      const store = useVideoDownloadsStore.getState();
      store.addJob({
        ...response,
        localCreatedAt: new Date().getTime(),
      });
      store.startPolling();
      toast.success('Download retried!');
    } catch (error: any) {
      const message = error.response?.data?.detail || error.message || 'Failed to retry';
      toast.error(message);
    }
  }, [onAuthRequired]);

  const handleDownload = useCallback(async (job: VideoDownload) => {
    if (!onAuthRequired()) return;
    if (job.status !== 'completed' || !job.file_path) {
      toast.error('File not available yet');
      return;
    }
    try {
      setDownloadingId(job.id);
      const blob = await downloadVideoFile(job.id);
      const ext = job.download_type === 'audio' ? 'mp3' : 'mp4';
      const filename = `${job.title || 'download'}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('File downloaded');
    } catch (error: any) {
      const message = error.response?.data?.detail || error.message || 'Failed to download file';
      toast.error(message);
    } finally {
      setDownloadingId(null);
    }
  }, [onAuthRequired]);

  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (j) =>
          (j.title && j.title.toLowerCase().includes(q)) ||
          j.url.toLowerCase().includes(q)
      );
    }

    if (filterType === 'audio') {
      result = result.filter((j) => j.download_type === 'audio');
    } else if (filterType === 'video') {
      result = result.filter((j) => j.download_type === 'video');
    } else if (filterType !== 'all') {
      result = result.filter((j) => j.status === filterType);
    }

    if (sortType === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    return result;
  }, [jobs, searchQuery, filterType, sortType]);

  if (isLoading) {
    return (
      <div className="w-full">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">Your Downloads</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">Your Downloads</h2>
        <div className="w-full bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <div className="text-center">
            <p className="text-red-300 font-semibold">Failed to load downloads</p>
            <p className="text-red-200/50 text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={() => { setError(null); setIsLoading(true); fetchDownloads().finally(() => setIsLoading(false)); }}
            className="px-4 py-2 rounded-xl bg-red-500/20 text-red-300 text-sm font-medium hover:bg-red-500/30 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeCount = jobs.filter((j) => j.status === 'pending' || j.status === 'downloading' || j.status === 'processing').length;
  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;
  const cancelledCount = jobs.filter((j) => j.status === 'cancelled').length;

  if (jobs.length === 0) {
    return (
      <div className="w-full">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">Your Downloads</h2>
        <div className="w-full flex flex-col items-center justify-center py-12 sm:py-16 gap-4 bg-gradient-to-br from-[#12121f]/30 to-[#1a1a2e]/30 rounded-3xl border border-white/[0.06]">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/5 flex items-center justify-center">
            <Download className="w-6 h-6 sm:w-8 sm:h-8 text-white/20" />
          </div>
          <p className="text-white/50 text-center max-w-md text-sm sm:text-base px-4">
            No downloads yet. Paste a YouTube or Instagram Reel URL above to get started!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">Your Downloads</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 sm:p-3">
          <p className="text-white/50 text-[10px] sm:text-xs">Active</p>
          <p className="text-blue-400 font-bold text-sm sm:text-lg">{activeCount}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 sm:p-3">
          <p className="text-white/50 text-[10px] sm:text-xs">Completed</p>
          <p className="text-emerald-400 font-bold text-sm sm:text-lg">{completedCount}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 sm:p-3">
          <p className="text-white/50 text-[10px] sm:text-xs">Failed</p>
          <p className="text-rose-400 font-bold text-sm sm:text-lg">{failedCount}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 sm:p-3">
          <p className="text-white/50 text-[10px] sm:text-xs">Cancelled</p>
          <p className="text-gray-400 font-bold text-sm sm:text-lg">{cancelledCount}</p>
        </div>
      </div>

      {jobs.length > 1 && (
        <div className="mb-6">
          <VideoFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterType={filterType}
            onFilterChange={setFilterType}
            sortType={sortType}
            onSortChange={setSortType}
            totalCount={jobs.length}
            filteredCount={filteredJobs.length}
          />
        </div>
      )}

      {filteredJobs.length === 0 ? (
        <div className="w-full flex flex-col items-center justify-center py-12 gap-3 bg-white/[0.02] rounded-2xl border border-dashed border-white/[0.06]">
          <Search size={24} className="text-white/20" />
          <p className="text-white/40 text-sm">No downloads match your filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredJobs.map((job) => (
              <VideoDownloadCard
                key={job.id}
                job={job}
                onDelete={handleDelete}
                onDownload={handleDownload}
                onCancel={handleCancel}
                deletingId={deletingId}
                downloadingId={downloadingId}
                cancellingId={cancellingId}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Search({ size, className }: { size?: number; className?: string }) {
  return (
    <svg width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
