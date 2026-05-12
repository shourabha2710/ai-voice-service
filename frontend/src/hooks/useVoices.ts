import { useState, useEffect } from 'react';
import { getVoices, Voice } from '../lib/api';

export function useVoices() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVoices() {
      try {
        const data = await getVoices();
        setVoices(data);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch voices');
      } finally {
        setLoading(false);
      }
    }
    fetchVoices();
  }, []);

  return { voices, loading, error };
}
