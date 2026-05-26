import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Download, Loader2 } from 'lucide-react';
import api, { VideoGeneration, downloadGeneratedVideo } from '../../lib/api';
import toast from 'react-hot-toast';

interface VideoPreviewPlayerProps {
  video: VideoGeneration;
  onClose: () => void;
  onAuthRequired?: () => boolean;
}

export default function VideoPreviewPlayer({ video, onClose, onAuthRequired }: VideoPreviewPlayerProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let currentObjectUrl: string | null = null;

    const loadVideo = async () => {
      if (video.status !== 'completed' || !video.video_path) {
        setError('Video not ready');
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get(`/text-to-video/${video.id}/file`, {
          responseType: 'blob',
        });

        if (cancelled) return;

        const blob = response.data as Blob;
        currentObjectUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(currentObjectUrl);
          return;
        }

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        objectUrlRef.current = currentObjectUrl;
        setVideoUrl(currentObjectUrl);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.status === 404 ? 'Video file not found' : 'Failed to load video');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadVideo();

    return () => {
      cancelled = true;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        objectUrlRef.current = null;
      }
    };
  }, [video.id, video.status, video.video_path]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const handleDownload = async () => {
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-[#0f0f1e] border border-white/10 rounded-3xl overflow-hidden max-w-3xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-white font-semibold truncate mr-4">{video.prompt}</h3>
          <div className="flex items-center gap-2">
            {video.status === 'completed' && (
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="p-2 rounded-xl bg-[#7c5cff]/20 text-[#7c5cff] hover:bg-[#7c5cff]/30 transition-all disabled:opacity-50"
              >
                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 text-white/60 hover:bg-white/20 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-black">
          {isLoading ? (
            <div className="flex items-center justify-center aspect-video">
              <Loader2 className="w-8 h-8 text-[#7c5cff] animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center aspect-video text-white/50 text-sm">{error}</div>
          ) : videoUrl ? (
            <video
              src={videoUrl}
              controls
              autoPlay
              className="w-full max-h-[70vh]"
              style={{ aspectRatio: video.aspect_ratio === '9:16' ? '9/16' : '16/9' }}
            />
          ) : null}
        </div>

        <div className="p-4 text-sm text-white/50 space-y-1">
          {video.duration_seconds && <p>Duration: {video.duration_seconds}s</p>}
          <p>Resolution: {video.resolution} · {video.aspect_ratio}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
