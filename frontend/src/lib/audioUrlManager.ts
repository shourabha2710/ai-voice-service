/**
 * Audio URL Manager
 * 
 * Responsibilities:
 * - Fetches audio binary from backend
 * - Manages temporary in-memory Object URLs
 * - Handles automatic cleanup and revocation
 * - Prevents memory leaks by tracking active URLs
 * - Prevents duplicate fetching
 * - Abort controller and timeout support
 */

import { downloadJobResult } from "./api";

class AudioUrlManager {
  private urlMap: Map<string, string> = new Map(); // JobId -> ObjectURL
  private fetchPromises: Map<string, Promise<string>> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  /**
   * Gets a playable Object URL for a given job.
   * Prevents duplicate requests.
   */
  async getPlayableUrl(jobId: string, timeoutMs = 15000): Promise<string> {
    if (this.urlMap.has(jobId)) {
      return this.urlMap.get(jobId)!;
    }

    if (this.fetchPromises.has(jobId)) {
      return this.fetchPromises.get(jobId)!;
    }

    const controller = new AbortController();
    this.abortControllers.set(jobId, controller);
    
    // Using setTimeout directly for timeout error handling instead of AbortSignal.timeout for better compatibility
    const timeoutId = setTimeout(() => {
      controller.abort(new Error("timeout"));
    }, timeoutMs);

    const promise = (async () => {
      try {
        const blob = await downloadJobResult(jobId, { signal: controller.signal });
        const url = URL.createObjectURL(blob);
        this.urlMap.set(jobId, url);
        return url;
      } catch (error: any) {
        if (error?.message === "timeout" || controller.signal.aborted) {
          throw new Error("Network timeout while fetching audio");
        }
        console.error(`[AudioUrlManager] Failed to fetch audio for job ${jobId}:`, error);
        throw error;
      } finally {
        clearTimeout(timeoutId);
        this.fetchPromises.delete(jobId);
        this.abortControllers.delete(jobId);
      }
    })();

    this.fetchPromises.set(jobId, promise);
    return promise;
  }

  /**
   * Revokes a specific URL and removes it from the map
   */
  cleanupUrl(jobId: string): void {
    const url = this.urlMap.get(jobId);
    if (url) {
      URL.revokeObjectURL(url);
      this.urlMap.delete(jobId);
    }
    const controller = this.abortControllers.get(jobId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(jobId);
    }
    this.fetchPromises.delete(jobId);
  }

  /**
   * Revokes all managed URLs. Call this on app unmount or logout.
   */
  cleanupAll(): void {
    this.abortControllers.forEach((controller) => controller.abort());
    this.abortControllers.clear();
    this.fetchPromises.clear();
    this.urlMap.forEach((url) => URL.revokeObjectURL(url));
    this.urlMap.clear();
  }
}

export const audioUrlManager = new AudioUrlManager();
