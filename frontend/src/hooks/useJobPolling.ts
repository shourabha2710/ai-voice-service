import { useState, useEffect, useCallback, useRef } from 'react';
import { getJobStatus, JobProgress, downloadJobResult } from '../lib/api';
import toast from 'react-hot-toast';

export function useJobPolling() {
  const [job, setJob] = useState<JobProgress | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setJob(null);
    setAudioUrl(null);
    setPolling(false);
  }, [audioUrl]);

  const fetchStatus = useCallback(async (jobId: string) => {
    console.log('JOB_POLLING_FETCH_STATUS', { jobId });
    try {
      const status = await getJobStatus(jobId);
      setJob(status);

      if (status.status === 'completed') {
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
        setPolling(false);
        
        // Auto download or prepare audio URL
        const blob = await downloadJobResult(jobId);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        toast.success('Audio generation completed!');
      } else if (status.status === 'failed') {
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
        setPolling(false);
        toast.error(`Generation failed: ${status.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error('Polling error:', err);
    }
  }, []);

  const startPolling = useCallback((jobId: string) => {
    cleanup();
    setPolling(true);
    fetchStatus(jobId);
    
    // Add to local storage for persistence across page refreshes
    const existingIds: string[] = JSON.parse(localStorage.getItem('jobIds') || '[]');
    const uniqueIds = [jobId, ...existingIds.filter((id) => id !== jobId)];
    localStorage.setItem('jobIds', JSON.stringify(uniqueIds));
    console.log('JOB_POLLING_STORE_IDS', { jobId, count: uniqueIds.length });

    pollingInterval.current = setInterval(() => {
      fetchStatus(jobId);
    }, 3000);
  }, [cleanup, fetchStatus]);

  useEffect(() => {
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
      // Revoke URL on unmount to prevent leaks
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return { job, audioUrl, setAudioUrl, polling, startPolling, cleanup };
}
