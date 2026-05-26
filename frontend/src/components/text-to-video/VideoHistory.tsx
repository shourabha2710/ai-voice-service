import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, Film } from 'lucide-react';
import { useTextToVideoStore } from '../../store/useTextToVideoStore';
import VideoGenerationCard from './VideoGenerationCard';
import VideoPreviewPlayer from './VideoPreviewPlayer';
import type { VideoGeneration } from '../../lib/api';

interface VideoHistoryProps {
  title?: string;
  emptyMessage?: string;
  onAuthRequired?: () => boolean;
}

export default function VideoHistory({
  title = 'Your Generated Videos',
  emptyMessage = 'No videos yet. Create your first video by entering a prompt above!',
  onAuthRequired,
}: VideoHistoryProps) {
  const { jobs, fetchVideos } = useTextToVideoStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoGeneration | null>(null);

  useEffect(() => {
    const loadVideos = async () => {
      try {
        setIsLoading(true);
        setError(null);
        await fetchVideos();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load videos';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };
    loadVideos();
  }, [fetchVideos]);

  const handleVideoDeleted = async () => {
    try {
      await fetchVideos();
    } catch (err) {
      console.error('Failed to refresh videos:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="w-8 h-8 text-[#7c5cff] animate-spin" />
        <p className="text-white/50">Loading your videos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex flex-col items-center gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <div className="text-center">
          <p className="text-red-300 font-semibold">Failed to load videos</p>
          <p className="text-red-200/50 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
          <Film className="w-8 h-8 text-white/20" />
        </div>
        <p className="text-white/50 text-center">{emptyMessage}</p>
      </div>
    );
  }

  const sortedJobs = [...jobs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <p className="text-white/50 text-xs">Total</p>
          <p className="text-white font-bold text-lg">{jobs.length}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <p className="text-white/50 text-xs">Completed</p>
          <p className="text-emerald-400 font-bold text-lg">
            {jobs.filter((j) => j.status === 'completed').length}
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <p className="text-white/50 text-xs">Generating</p>
          <p className="text-blue-400 font-bold text-lg">
            {jobs.filter((j) => j.status === 'pending' || j.status === 'processing').length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <AnimatePresence mode="popLayout">
          {sortedJobs.map((job) => (
            <VideoGenerationCard
              key={job.id}
              video={job}
              onDelete={handleVideoDeleted}
              onView={() => setPreviewVideo(job)}
              onAuthRequired={onAuthRequired}
            />
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {previewVideo && (
          <VideoPreviewPlayer
            video={previewVideo}
            onClose={() => setPreviewVideo(null)}
            onAuthRequired={onAuthRequired}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
