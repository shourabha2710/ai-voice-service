import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  getVideoGenerationHistory,
  getVideoGenerationDetail,
  VideoGeneration,
} from '../lib/api';

interface VideoGenerationJob extends VideoGeneration {
  localCreatedAt?: number;
}

interface UseTextToVideoStore {
  jobs: VideoGenerationJob[];
  isPolling: boolean;
  _pollingIntervalId: ReturnType<typeof setInterval> | null;

  addJob: (job: VideoGenerationJob) => void;
  updateJob: (id: string, updates: Partial<VideoGenerationJob>) => void;
  removeJob: (id: string) => void;
  setJobs: (jobs: VideoGenerationJob[]) => void;

  startPolling: () => void;
  stopPolling: () => void;

  fetchVideos: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
}

const dedupeVideos = (videos: VideoGenerationJob[]): VideoGenerationJob[] => {
  const seen = new Map<string, VideoGenerationJob>();
  for (const v of videos) {
    if (!seen.has(v.id) || (v.status === 'completed' && seen.get(v.id)?.status !== 'completed')) {
      seen.set(v.id, v);
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
};

export const useTextToVideoStore = create<UseTextToVideoStore>()(
  subscribeWithSelector((set, get) => ({
    jobs: [],
    isPolling: false,
    _pollingIntervalId: null,

    addJob: (job) => set((state) => ({
      jobs: dedupeVideos([job, ...state.jobs]),
    })),

    updateJob: (id, updates) => set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id ? { ...job, ...updates } : job
      ),
    })),

    removeJob: (id) => set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== id),
    })),

    setJobs: (jobs) => set({ jobs: dedupeVideos(jobs) }),

    startPolling: () => {
      const state = get();
      if (state.isPolling) return;

      set({ isPolling: true });

      const intervalId = setInterval(async () => {
        const currentState = get();
        const pendingJobs = currentState.jobs.filter(
          (job) => job.status === 'pending' || job.status === 'processing'
        );

        if (pendingJobs.length === 0) {
          currentState.stopPolling();
          return;
        }

        try {
          await currentState.syncWithBackend();
        } catch (error) {
          console.error('POLLING_ERROR', error);
        }
      }, 3000);

      set({ _pollingIntervalId: intervalId });
      window.addEventListener('beforeunload', () => clearInterval(intervalId));
    },

    stopPolling: () => {
      const state = get();
      if (state._pollingIntervalId) {
        clearInterval(state._pollingIntervalId);
      }
      set({ isPolling: false, _pollingIntervalId: null });
    },

    fetchVideos: async () => {
      try {
        const response = await getVideoGenerationHistory(0, 100);
        const items = response.items.map((item) => ({
          ...item,
          localCreatedAt: new Date(item.created_at).getTime(),
        }));

        set((state) => {
          const pending = state.jobs.filter(
            (job) => job.status === 'pending' || job.status === 'processing'
          );
          return { jobs: dedupeVideos([...items, ...pending]) };
        });
      } catch (error) {
        console.error('FETCH_VIDEOS_FAILED', error);
        throw error;
      }
    },

    syncWithBackend: async () => {
      const state = get();
      const pendingJobs = state.jobs.filter(
        (job) => job.status === 'pending' || job.status === 'processing'
      );

      if (pendingJobs.length === 0) {
        state.stopPolling();
        return;
      }

      for (const job of pendingJobs) {
        try {
          const updated = await getVideoGenerationDetail(job.id);
          state.updateJob(job.id, {
            status: updated.status,
            video_path: updated.video_path,
            video_url: updated.video_url,
            thumbnail_path: updated.thumbnail_path,
            thumbnail_url: updated.thumbnail_url,
            duration_seconds: updated.duration_seconds,
            progress_percent: updated.progress_percent,
            error_message: updated.error_message,
            completed_at: updated.completed_at,
          });
        } catch (error) {
          console.error('SYNC_VIDEO_ERROR', { id: job.id, error });
        }
      }
    },
  }))
);
