import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Download, Trash2, AlertCircle, Loader2, Eye, Film, Copy } from 'lucide-react';
import api, { VideoGeneration, downloadGeneratedVideo, deleteVideoGeneration } from '../../lib/api';
import GenerationProgressBar from './GenerationProgressBar';
import toast from 'react-hot-toast';

interface VideoGenerationCardProps {
  video: VideoGeneration;
  onDelete?: () => void;
  onView?: () => void;
  onAuthRequired?: () => boolean;
}

export default function VideoGenerationCard({ video, onDelete, onView, onAuthRequired }: VideoGenerationCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let currentObjectUrl: string | null = null;

    const loadThumbnail = async () => {
      if (video.status !== 'completed' || !video.thumbnail_path) return;

      try {
        const response = await api.get(`/text-to-video/${video.id}/thumbnail`, {
          responseType: 'blob',
        });
        if (cancelled) return;

        const blob = response.data as Blob;
        currentObjectUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(currentObjectUrl);
          return;
        }

        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = currentObjectUrl;
        setThumbnailUrl(currentObjectUrl);
      } catch {
        // Thumbnail may not be available yet
      }
    };

    loadThumbnail();

    return () => {
      cancelled = true;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        objectUrlRef.current = null;
      }
    };
  }, [video.id, video.status, video.thumbnail_path]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handleDownload = async () => {
    if (!video.video_path) {
      toast.error('Video not available');
      return;
    }
    if (!onAuthRequired?.()) return;

    try {
      setIsDownloading(true);
      const blob = await downloadGeneratedVideo(video.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-video-${video.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Video downloaded');
    } catch {
      toast.error('Failed to download video');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!onAuthRequired?.()) return;
    if (!confirm('Delete this video?')) return;

    try {
      setIsDeleting(true);
      await deleteVideoGeneration(video.id);
      toast.success('Video deleted');
      onDelete?.();
    } catch {
      toast.error('Failed to delete video');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(video.prompt);
    toast.success('Prompt copied');
  };

  const getStatusColor = () => {
    switch (video.status) {
      case 'completed':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'processing':
      case 'pending':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-white/5 text-white/50 border-white/10';
    }
  };

  const getStatusIcon = () => {
    switch (video.status) {
      case 'pending':
      case 'processing':
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const hasVideo = video.status === 'completed' && video.video_path;
  const isProcessing = video.status === 'pending' || video.status === 'processing';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="group relative bg-gradient-to-br from-[#1a1a2e] to-[#0f3460] rounded-2xl overflow-hidden border border-white/10 hover:border-[#7c5cff]/50 transition-all duration-300 shadow-lg hover:shadow-[0_0_20px_rgba(124,92,255,0.3)]"
    >
      {/* Thumbnail / Video Preview */}
      <div className="relative w-full aspect-video bg-black/30">
        {hasVideo ? (
          thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={video.prompt}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-12 h-12 text-white/20" />
            </div>
          )
        ) : isProcessing ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
            {video.progress_percent !== null && video.progress_percent > 0 ? (
              <div className="w-full max-w-xs">
                <GenerationProgressBar progress={video.progress_percent} status={video.status} />
              </div>
            ) : (
              <>
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                <p className="text-xs text-white/50">Generating video...</p>
              </>
            )}
          </div>
        ) : video.status === 'failed' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-xs text-red-300 text-center px-2">Generation failed</p>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-12 h-12 text-white/20" />
          </div>
        )}

        {hasVideo && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={onView}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20"
            >
              <Eye className="w-5 h-5 text-white" />
            </motion.button>
          </div>
        )}

        {/* Duration badge */}
        {video.duration_seconds && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] text-white/80">
            {video.duration_seconds}s
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-3 bg-[#0f0f1e]/80 backdrop-blur-sm border-t border-white/5">
        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border mb-2 ${getStatusColor()}`}>
          {getStatusIcon()}
          <span className="capitalize">{video.status}</span>
        </div>

        <p className="text-xs text-white/70 line-clamp-2 mb-1 group-hover:line-clamp-none transition-all">
          {video.prompt}
        </p>

        <div className="text-[10px] text-white/40 space-y-1 mb-3">
          <p>{video.resolution} · {video.aspect_ratio}</p>
          <p>{new Date(video.created_at).toLocaleDateString()}</p>
        </div>

        {video.error_message && (
          <p className="text-[10px] text-red-300 mb-2 line-clamp-2">
            Error: {video.error_message}
          </p>
        )}

        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDownload}
            disabled={isDownloading || !hasVideo}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] text-white text-xs font-semibold hover:shadow-lg hover:shadow-[#7c5cff]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isDownloading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <Download className="w-3 h-3" />
                Download
              </>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCopyPrompt}
            className="px-2 py-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 text-xs font-semibold border border-white/10 hover:border-white/20 transition-all"
          >
            <Copy className="w-3 h-3" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-2 py-1.5 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs font-semibold border border-red-500/20 hover:border-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isDeleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
