import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getMyVideoDownloads, getVideoDownloadDetail, cancelVideoDownload } from '../lib/api';
import type { VideoDownload, VideoDownloadStatus } from '../types';

interface VideoJob extends VideoDownload {
  localCreatedAt?: number;
}

interface UseVideoDownloadsStore {
  jobs: VideoJob[];
  isPolling: boolean;
  _pollingIntervalId: ReturnType<typeof setInterval> | null;

  addJob: (job: VideoJob) => void;
  updateJob: (id: string, updates: Partial<VideoJob>) => void;
  removeJob: (id: string) => void;
  setJobs: (jobs: VideoJob[]) => void;

  dedupeDownloads: (downloads: VideoJob[]) => VideoJob[];

  startPolling: () => void;
  stopPolling: () => void;

  fetchDownloads: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
}

const dedupeDownloads = (downloads: VideoJob[]): VideoJob[] => {
  const seen = new Map<string, VideoJob>();

  for (const d of downloads) {
    if (!seen.has(d.id) || (d.status === 'completed' && seen.get(d.id)?.status !== 'completed')) {
      seen.set(d.id, d);
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
};

export const useVideoDownloadsStore = create<UseVideoDownloadsStore>()(
  subscribeWithSelector((set, get) => ({
    jobs: [],
    isPolling: false,
    _pollingIntervalId: null,

    addJob: (job) => set((state) => ({
      jobs: dedupeDownloads([job, ...state.jobs]),
    })),

    updateJob: (id, updates) => set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id ? { ...job, ...updates } : job
      ),
    })),

    removeJob: (id) => set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== id),
    })),

    setJobs: (jobs) => set({ jobs: dedupeDownloads(jobs) }),

    dedupeDownloads,

    startPolling: () => {
      const state = get();
      if (state.isPolling) return;

      set({ isPolling: true });

      const intervalId = setInterval(async () => {
        const currentState = get();
        const activeJobs = currentState.jobs.filter(
          (job) => job.status === 'pending' || job.status === 'downloading' || job.status === 'processing'
        );

        if (activeJobs.length === 0) {
          currentState.stopPolling();
          return;
        }

        try {
          await currentState.syncWithBackend();
        } catch (error) {
          console.error('VIDEO_POLLING_ERROR', error);
        }
      }, 2000);

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

    fetchDownloads: async () => {
      try {
        const response = await getMyVideoDownloads(0, 100);
        const downloads = response.items.map((item) => ({
          ...item,
          localCreatedAt: new Date(item.created_at).getTime(),
        }));

        set((state) => {
          const active = state.jobs.filter(
            (job) => job.status === 'pending' || job.status === 'downloading' || job.status === 'processing'
          );
          const deduped = dedupeDownloads([...downloads, ...active]);
          return { jobs: deduped };
        });
      } catch (error) {
        console.error('FETCH_VIDEO_DOWNLOADS_FAILED', error);
        throw error;
      }
    },

    syncWithBackend: async () => {
      const state = get();
      const activeJobs = state.jobs.filter(
        (job) => job.status === 'pending' || job.status === 'downloading' || job.status === 'processing'
      );

      if (activeJobs.length === 0) {
        state.stopPolling();
        return;
      }

      for (const job of activeJobs) {
        try {
          const updated = await getVideoDownloadDetail(job.id);
          state.updateJob(job.id, {
            status: updated.status as VideoDownloadStatus,
            title: updated.title,
            thumbnail_url: updated.thumbnail_url,
            file_size: updated.file_size,
            file_path: updated.file_path,
            file_size_bytes: updated.file_size_bytes,
            duration_seconds: updated.duration_seconds,
            progress_percent: updated.progress_percent,
            downloaded_bytes: updated.downloaded_bytes,
            total_bytes: updated.total_bytes,
            download_speed: updated.download_speed,
            eta_seconds: updated.eta_seconds,
            error_message: updated.error_message,
            completed_at: updated.completed_at,
          });
        } catch (error) {
          console.error('SYNC_VIDEO_ERROR', { id: job.id, error });
        }
      }
    },

    cancelJob: async (id: string) => {
      const state = get();
      state.updateJob(id, { status: 'cancelled' as VideoDownloadStatus });
      try {
        await cancelVideoDownload(id);
      } catch (error) {
        console.error('CANCEL_VIDEO_ERROR', { id, error });
        state.updateJob(id, { status: 'failed' as VideoDownloadStatus, error_message: 'Cancel failed' });
      }
    },
  }))
);
