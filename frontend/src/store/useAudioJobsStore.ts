import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getJobStatus, getMyGenerations } from "../lib/api";

export interface AudioJob {
  id?: string;
  job_id: string;
  type: "short" | "long";
  status: "queued" | "processing" | "completed" | "failed" | "expired";
  progress: number;
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
  updateJob: (job_id: string, updates: Partial<AudioJob>) => void;
  removeJob: (job_id: string) => void;
  getJob: (job_id: string) => AudioJob | undefined;
  cleanupJobs: () => void;
  syncWithBackend: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  fetchGenerations: () => Promise<void>;
  resetJobs: () => void;
  isPolling: boolean;
}

const dedupeGenerations = (jobs: AudioJob[]) => {
  const map = new Map<string, AudioJob>();
  let removedCount = 0;

  for (const job of jobs) {
    const id = job.job_id || job.id;
    if (!id) {
      continue;
    }

    const normalized: AudioJob = { ...job, job_id: id };
    if (!map.has(id)) {
      map.set(id, normalized);
    } else {
      removedCount += 1;
    }
  }

  const deduped = Array.from(map.values());
  if (removedCount > 0) {
    console.log("DEDUPED_GENERATIONS", { before: jobs.length, after: deduped.length, removedCount });
  }
  return deduped;
};

export const useAudioJobsStore = create<AudioJobsState>()(
  persist(
    (set, get) => ({
      jobs: [],
      isPolling: false,

      addJob: (job) =>
        set((state) => {
          const normalized: AudioJob = { ...job, job_id: job.job_id ?? job.id ?? "" };
          const jobs = dedupeGenerations([normalized, ...state.jobs]);
          console.log("ADD_JOB", {
            id: normalized.job_id,
            before: state.jobs.length,
            after: jobs.length,
          });
          return { jobs };
        }),

      updateJob: (job_id, updates) =>
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.job_id === job_id ? { ...job, ...updates } : job
          ),
        })),

      removeJob: (job_id) =>
        set((state) => ({
          jobs: state.jobs.filter((job) => job.job_id !== job_id),
        })),

      getJob: (job_id) => get().jobs.find((j) => j.job_id === job_id),

      cleanupJobs: () => {
        const now = new Date().getTime();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        const SEVEN_DAYS = 7 * ONE_DAY;

        set((state) => {
          const jobs = dedupeGenerations(state.jobs).filter((job) => {
            const createdAt = new Date(job.createdAt).getTime();
            if (job.status === "failed" && now - createdAt > ONE_DAY) return false;
            if ((job.status === "completed" || job.status === "expired") && now - createdAt > SEVEN_DAYS) return false;
            return true;
          });
          console.log("CLEANUP_JOBS", { before: state.jobs.length, after: jobs.length });
          return { jobs };
        });
      },

      resetJobs: () => {
        console.log("RESET_JOBS");
        set({ jobs: [] });
      },

      fetchGenerations: async () => {
        console.log("FETCHING_GENERATIONS");
        try {
          const response = await getMyGenerations();
          const backendJobs = response.items.map((item) => ({
            job_id: item.job_id,
            type: item.type as AudioJob["type"],
            status: item.status as AudioJob["status"],
            progress: item.status === "completed" ? 100 : 0,
            text: `Generated ${item.type} audio`,
            voice: item.voice,
            createdAt: item.created_at,
            completedAt: item.completed_at || undefined,
            chunks_completed: item.status === "processing" ? 0 : undefined,
            total_chunks: item.status === "processing" ? 1 : undefined,
          })) as AudioJob[];

          const currentJobs = get().jobs.filter((job) =>
            job.status === "queued" || job.status === "processing"
          );
          const jobs = dedupeGenerations([...backendJobs, ...currentJobs]);
          console.log("GENERATIONS_RECEIVED", response.items.length);
          console.log("HISTORY_STATE_UPDATED", jobs.length);
          set({ jobs });
        } catch (err: any) {
          console.error("FETCH_GENERATIONS_FAILED", err);
          throw err;
        }
      },

      syncWithBackend: async () => {
        const { jobs, updateJob } = get();
        const pendingJobs = jobs.filter(
          (j) => j.status === "queued" || j.status === "processing"
        );

        console.log("SYNC_WITH_BACKEND", { pending: pendingJobs.length });

        if (pendingJobs.length === 0) {
          get().stopPolling();
          return;
        }

        for (const job of pendingJobs) {
          try {
            const status = await getJobStatus(job.job_id);
            const normalizedStatus = status.status === "pending" ? "queued" : status.status;
            updateJob(job.job_id, {
              status: normalizedStatus as AudioJob["status"],
              progress: status.progress,
              chunks_completed: status.completed_chunks,
              total_chunks: status.total_chunks,
              completedAt: normalizedStatus === "completed" ? new Date().toISOString() : undefined,
            });
          } catch (err: any) {
            if (err.response?.status === 404) {
              updateJob(job.job_id, { status: "expired", error: "Job record not found on server" });
            }
            console.error(`Failed to sync job ${job.job_id}:`, err);
          }
        }
      },

      startPolling: () => {
        if (get().isPolling) return;
        console.log("POLLING_START");
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
          console.log("POLLING_CLEANUP");
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
          state.jobs = state.jobs.map((job) => {
            if (job.audioUrl && job.audioUrl.startsWith("blob:")) {
              delete job.audioUrl;
            }
            if (job.previewUrl && job.previewUrl.startsWith("blob:")) {
              delete job.previewUrl;
            }
            if (!job.job_id && job.id) {
              job.job_id = job.id;
            }
            return job;
          });
          state.jobs = dedupeGenerations(state.jobs);
        }
        return state;
      },
      onRehydrateStorage: () => (state) => {
        if (state?.jobs) {
          const jobs = dedupeGenerations(state.jobs);
          if (jobs.length !== state.jobs.length) {
            console.log("REHYDRATE_DEDUPED", { before: state.jobs.length, after: jobs.length });
            state.jobs = jobs;
          }
        }
      },
      partialize: (state) => ({ 
        jobs: state.jobs.map(({ ...job }: any) => {
          // Extra safety measure
          delete job.audioUrl;
          delete job.previewUrl;
          return job;
        }) 
      }),
      version: 2,
    }
  )
);
