import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getImageHistory, getImageDetail, ImageGeneration } from '../lib/api';

interface ImageJob extends ImageGeneration {
  localCreatedAt?: number; // For sorting optimistically added items
}

interface UseImageJobsStore {
  jobs: ImageJob[];
  isPolling: boolean;
  _pollingIntervalId: ReturnType<typeof setInterval> | null;
  
  // Actions
  addJob: (job: ImageJob) => void;
  updateJob: (id: string, updates: Partial<ImageJob>) => void;
  removeJob: (id: string) => void;
  setJobs: (jobs: ImageJob[]) => void;
  
  // Deduplication
  dedupeImages: (images: ImageJob[]) => ImageJob[];
  
  // Polling
  startPolling: () => void;
  stopPolling: () => void;
  
  // Fetch
  fetchImages: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
}

const dedupeImages = (images: ImageJob[]): ImageJob[] => {
  const seen = new Map<string, ImageJob>();
  
  for (const img of images) {
    if (!seen.has(img.id) || (img.status === 'completed' && seen.get(img.id)?.status !== 'completed')) {
      seen.set(img.id, img);
    }
  }
  
  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
};

export const useImageJobsStore = create<UseImageJobsStore>()(
  subscribeWithSelector((set, get) => ({
    jobs: [],
    isPolling: false,
    _pollingIntervalId: null,

    addJob: (job) => set((state) => ({
      jobs: dedupeImages([job, ...state.jobs]),
    })),

    updateJob: (id, updates) => set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id ? { ...job, ...updates } : job
      ),
    })),

    removeJob: (id) => set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== id),
    })),

    setJobs: (jobs) => set({ jobs: dedupeImages(jobs) }),

    dedupeImages,

    startPolling: () => {
      const state = get();
      if (state.isPolling) {
        console.log('POLLING_ALREADY_ACTIVE');
        return;
      }

      console.log('POLLING_STARTED');
      set({ isPolling: true });

      const intervalId = setInterval(async () => {
        const currentState = get();
        const pendingJobs = currentState.jobs.filter(
          (job) => job.status === 'pending' || job.status === 'processing'
        );

        if (pendingJobs.length === 0) {
          console.log('POLLING_STOPPED_NO_PENDING');
          currentState.stopPolling();
          return;
        }

        try {
          await currentState.syncWithBackend();
        } catch (error) {
          console.error('POLLING_ERROR', error);
        }
      }, 3000); // Poll every 3 seconds

      set({ _pollingIntervalId: intervalId });

      window.addEventListener('beforeunload', () => clearInterval(intervalId));
    },

    stopPolling: () => {
      const state = get();
      if (state._pollingIntervalId) {
        clearInterval(state._pollingIntervalId);
        console.log('POLLING_INTERVAL_CLEARED');
      }
      set({ isPolling: false, _pollingIntervalId: null });
      console.log('POLLING_STOPPED');
    },

    fetchImages: async () => {
      console.log('FETCHING_IMAGES');
      try {
        const response = await getImageHistory(0, 100);
        const images = response.items.map((item) => ({
          ...item,
          localCreatedAt: new Date(item.created_at).getTime(),
        }));

        set((state) => {
          const pending = state.jobs.filter(
            (job) => job.status === 'pending' || job.status === 'processing'
          );
          const deduped = dedupeImages([...images, ...pending]);
          console.log('IMAGES_RECEIVED', response.items.length);
          console.log('IMAGE_STATE_UPDATED', deduped.length);
          return { jobs: deduped };
        });
      } catch (error) {
        console.error('FETCH_IMAGES_FAILED', error);
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

      console.log('SYNC_IMAGES_WITH_BACKEND', { pending: pendingJobs.length });

      for (const job of pendingJobs) {
        try {
          const updated = await getImageDetail(job.id);
          state.updateJob(job.id, {
            status: updated.status,
            image_path: updated.image_path,
            image_url: updated.image_url,
            generation_time_seconds: updated.generation_time_seconds,
            error_message: updated.error_message,
            completed_at: updated.completed_at,
          });
        } catch (error) {
          console.error('SYNC_IMAGE_ERROR', { id: job.id, error });
        }
      }
    },
  }))
);
