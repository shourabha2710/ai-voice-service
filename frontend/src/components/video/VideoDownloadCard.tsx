import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, Trash2, CheckCircle, Clock, XCircle, AlertCircle,
  Music, Video, FileDown, Copy, X, Youtube, Image,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { VideoDownload, VideoDownloadStatus } from '../../types';
import { formatDuration, formatFileSize, formatDate } from '../../utils/formatters';
import DownloadProgressBar from './DownloadProgressBar';

const statusConfig: Record<VideoDownloadStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Clock },
  downloading: { label: 'Downloading', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Loader2 },
  processing: { label: 'Processing', color: 'text-purple-400', bg: 'bg-purple-500/10', icon: Loader2 },
  completed: { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle },
  failed: { label: 'Failed', color: 'text-rose-400', bg: 'bg-rose-500/10', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'text-gray-400', bg: 'bg-gray-500/10', icon: X },
};

function platformIcon(platform: string) {
  return platform === 'youtube' ? Youtube : Image;
}

interface VideoDownloadCardProps {
  job: VideoDownload;
  onDelete: (id: string) => Promise<void>;
  onDownload: (job: VideoDownload) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  deletingId: string | null;
  downloadingId: string | null;
  cancellingId: string | null;
}

export default function VideoDownloadCard({
  job,
  onDelete,
  onDownload,
  onCancel,
  deletingId,
  downloadingId,
  cancellingId,
}: VideoDownloadCardProps) {
  const [imgError, setImgError] = useState(false);
  const isActive = job.status === 'pending' || job.status === 'downloading' || job.status === 'processing';
  const StatusIcon = statusConfig[job.status]?.icon || Clock;
  const PlatformIcon = platformIcon(job.platform);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(job.url).then(() => {
      toast.success('Link copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy link');
    });
  }, [job.url]);

  const handleCancel = useCallback(async () => {
    await onCancel(job.id);
  }, [job.id, onCancel]);

  const handleDelete = useCallback(async () => {
    await onDelete(job.id);
  }, [job.id, onDelete]);

  const handleDownload = useCallback(async () => {
    await onDownload(job);
  }, [job, onDownload]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group bg-gradient-to-br from-[#12121f]/40 to-[#1a1a2e]/40 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.12] hover:bg-[#12121f]/60 transition-all duration-300"
    >
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-20 h-24 sm:h-20 rounded-xl bg-white/5 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {job.thumbnail_url && !imgError ? (
            <img
              src={job.thumbnail_url}
              alt={job.title || ''}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <PlatformIcon className="w-8 h-8 text-white/20" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {job.title || 'Untitled'}
              </p>
              <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5 flex-wrap">
                <span className="flex items-center gap-1 capitalize">
                  <PlatformIcon size={12} />
                  {job.platform}
                </span>
                <span>•</span>
                <span className="font-mono">{job.download_type.toUpperCase()}</span>
                {job.duration_seconds != null && (
                  <>
                    <span>•</span>
                    <span>{formatDuration(job.duration_seconds)}</span>
                  </>
                )}
                {job.file_size_bytes != null && (
                  <>
                    <span>•</span>
                    <span>{formatFileSize(job.file_size_bytes)}</span>
                  </>
                )}
                <span>•</span>
                <span>{formatDate(job.created_at)}</span>
              </div>
            </div>
          </div>

          {isActive && (
            <DownloadProgressBar
              percent={job.progress_percent}
              downloadedBytes={job.downloaded_bytes}
              totalBytes={job.total_bytes}
              speed={job.download_speed}
              eta={job.eta_seconds}
            />
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${statusConfig[job.status]?.bg || 'bg-white/5'} ${statusConfig[job.status]?.color || 'text-white/50'}`}>
              <StatusIcon size={12} className={job.status === 'downloading' || job.status === 'processing' ? 'animate-spin' : ''} />
              {statusConfig[job.status]?.label || job.status}
            </span>
            {job.error_message && (
              <span className="text-xs text-rose-400/60 truncate max-w-[200px]" title={job.error_message}>
                <AlertCircle size={10} className="inline mr-0.5" />
                {job.error_message}
              </span>
            )}
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-stretch gap-1.5 flex-shrink-0">
          {(job.status === 'pending' || job.status === 'downloading') && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCancel}
              disabled={cancellingId === job.id}
              className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              title="Cancel download"
            >
              {cancellingId === job.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <X size={16} />
              )}
            </motion.button>
          )}

          {job.status === 'completed' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              disabled={downloadingId === job.id}
              className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              title="Download file"
            >
              {downloadingId === job.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown size={16} />
              )}
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCopyLink}
            className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-all"
            title="Copy URL"
          >
            <Copy size={16} />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDelete}
            disabled={deletingId === job.id}
            className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title="Delete"
          >
            {deletingId === job.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 size={16} />
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
