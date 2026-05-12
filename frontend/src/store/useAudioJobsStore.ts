import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getJobStatus } from "../lib/api";

export interface AudioJob {
  id: string;
  type: "short" | "long";
  status: "queued" | "processing" | "completed" | "failed" | "expired";
  progress: number;
  // NOTE: We no longer persist blob URLs here.
  // audioUrl is now used only as a metadata hint for the manager or temporary memory
  text: string;
  voice: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  chunks_completed?: number;
  total_chunks?: number;
}

interface AudioJobsState {
  jobs: AudioJob[];
  addJob: (job: AudioJob) => void;
  updateJob: (id: string, updates: Partial<AudioJob>) => void;
  removeJob: (id: string) => void;
  getJob: (id: string) => AudioJob | undefined;
  cleanupJobs: () => void;
  syncWithBackend: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  isPolling: boolean;
}

export const useAudioJobsStore = create<AudioJobsState>()(
  persist(
    (set, get) => ({
      jobs: [],
      isPolling: false,

      addJob: (job) =>
        set((state) => ({
          jobs: [job, ...state.jobs],
        })),

      updateJob: (id, updates) =>
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === id ? { ...job, ...updates } : job
          ),
        })),

      removeJob: (id) =>
        set((state) => ({
          jobs: state.jobs.filter((job) => job.id !== id),
        })),

      getJob: (id) => get().jobs.find((j) => j.id === id),

      cleanupJobs: () => {
        const now = new Date().getTime();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        const SEVEN_DAYS = 7 * ONE_DAY;

        set((state) => ({
          jobs: state.jobs.filter((job) => {
            const createdAt = new Date(job.createdAt).getTime();
            if (job.status === "failed" && now - createdAt > ONE_DAY) return false;
            if ((job.status === "completed" || job.status === "expired") && now - createdAt > SEVEN_DAYS) return false;
            return true;
          }),
        }));
      },

      syncWithBackend: async () => {
        const { jobs, updateJob } = get();
        const pendingJobs = jobs.filter(
          (j) => j.status === "queued" || j.status === "processing"
        );

        if (pendingJobs.length === 0) {
          get().stopPolling();
          return;
        }

        for (const job of pendingJobs) {
          try {
            const status = await getJobStatus(job.id);
            updateJob(job.id, {
              status: status.status,
              progress: status.progress,
              chunks_completed: status.chunks_completed,
              total_chunks: status.total_chunks,
              completedAt: status.status === "completed" ? new Date().toISOString() : undefined,
            });
          } catch (err: any) {
            if (err.response?.status === 404) {
              updateJob(job.id, { status: "expired", error: "Job record not found on server" });
            }
            console.error(`Failed to sync job ${job.id}:`, err);
          }
        }
      },

      startPolling: () => {
        if (get().isPolling) return;
        set({ isPolling: true });
        get().syncWithBackend();
        
        // Use a window property or local interval variable if needed, but in Zustand it's easier to use a module level variable
        if (!(window as any).__audioJobsPoller) {
          (window as any).__audioJobsPoller = setInterval(() => {
            if (get().isPolling) {
              get().syncWithBackend();
            } else {
              get().stopPolling();
            }
          }, 3000);
        }
      },

      stopPolling: () => {
        set({ isPolling: false });
        if ((window as any).__audioJobsPoller) {
          clearInterval((window as any).__audioJobsPoller);
          (window as any).__audioJobsPoller = null;
        }
      },
    }),
    {
      name: "voxforge_audio_jobs_v2", // Bumped version to v2 for clean migration
      storage: createJSONStorage(() => localStorage),
      // Migration logic to remove old blob URLs and handle schema changes
      migrate: (persistedState: any, version: number) => {
        const state = persistedState as { jobs: any[] };
        if (state.jobs) {
          state.jobs = state.jobs.map(job => {
            // Remove any blob URLs unconditionally
            if (job.audioUrl && job.audioUrl.startsWith('blob:')) {
              delete job.audioUrl;
            }
            if (job.previewUrl && job.previewUrl.startsWith('blob:')) {
              delete job.previewUrl;
            }
            return job;
          });
        }
        return state;
      },
      partialize: (state) => ({ 
        jobs: state.jobs.map(({ ...job }: any) => {
          // Extra safety measure
          delete job.audioUrl;
          delete job.previewUrl;
          return job;
        }) 
      }),
      version: 1,
    }
  )
);
