import axios from "axios";

const API_BASE_URL = "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: API_BASE_URL,
});

let refreshPromise: Promise<{ access_token: string; refresh_token: string } | null> | null = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  console.log('API_AUTH_HEADER', { hasToken: !!token });
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
              });
              if (!res.ok) return null;
              return res.json();
            } catch {
              return null;
            } finally {
              refreshPromise = null;
            }
          })();
        }

        const tokens = await refreshPromise;
        if (tokens) {
          localStorage.setItem('access_token', tokens.access_token);
          localStorage.setItem('refresh_token', tokens.refresh_token);
          error.config.headers.Authorization = `Bearer ${tokens.access_token}`;
          return api(error.config);
        }
      }
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
    return Promise.reject(error);
  }
);

export interface Voice {
  FriendlyName: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  SuggestedCodec: string;
}

export interface JobProgress {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  completed_chunks: number;
  total_chunks: number;
  created_at: string;
  updated_at: string;
  output_file: string | null;
  message?: string | null;
  error: string | null;
}

export interface GenerationItem {
  id: string;
  job_id: string;
  type: string;
  status: string;
  voice: string;
  text_length: number;
  audio_path: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface GenerationListResponse {
  items: GenerationItem[];
  total: number;
  page: number;
  page_size: number;
}

export const getMyGenerations = async (
  skip = 0,
  limit = 20,
  status?: string
): Promise<GenerationListResponse> => {
  console.log('API_REQUEST', { path: '/generations/me', skip, limit, status });
  const response = await api.get('/generations/me', {
    params: {
      skip,
      limit,
      status,
    },
  });
  return response.data;
};

export const getVoices = async (): Promise<Voice[]> => {
  const response = await api.get("/tts/voices");
  return response.data;
};

export const fetchVoices = getVoices;

export const generateShortAudio = async (data: {
  text: string;
  voice: string;
  rate?: string;
  pitch?: string;
}, config?: import("axios").AxiosRequestConfig): Promise<{ blob: Blob; jobId: string | null }> => {
  const response = await api.post("/tts/generate", data, {
    responseType: "blob",
    ...config,
  });
  const jobId = response.headers["x-job-id"] || null;
  return { blob: response.data, jobId };
};

export const generateLongAudio = async (data: {
  text: string;
  voice: string;
  rate?: string;
  pitch?: string;
  chunk_size?: number;
}): Promise<{ job_id: string; message: string }> => {
  const response = await api.post("/tts/generate-long-audio", data);
  return response.data;
};

export const startLongAudioJob = generateLongAudio;

export const getJobStatus = async (jobId: string): Promise<JobProgress> => {
  const response = await api.get(`/tts/job/${jobId}`);
  return response.data;
};

export const downloadJobResult = async (jobId: string, config?: import("axios").AxiosRequestConfig): Promise<Blob> => {
  const response = await api.get(`/tts/job/${jobId}/download`, {
    responseType: "blob",
    ...config,
  });
  return response.data;
};

export const downloadJobAudio = async (jobId: string, config?: import("axios").AxiosRequestConfig): Promise<Blob> =>
  downloadJobResult(jobId, config);

export const deleteJob = async (jobId: string): Promise<{ message: string }> => {
  const response = await api.delete(`/tts/job/${jobId}`);
  return response.data;
};

// Image Generation APIs
export interface ImageGeneration {
  id: string;
  user_id: string;
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  image_path: string | null;
  image_url?: string | null;
  provider: string;
  generation_time_seconds: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ImageGenerationRequest {
  prompt: string;
}

export interface ImageHistoryResponse {
  items: ImageGeneration[];
  total: number;
  page: number;
  page_size: number;
}

export const generateImage = async (data: ImageGenerationRequest): Promise<ImageGeneration> => {
  console.log('GENERATE_API_CALL_START', { path: '/images/generate', prompt: data.prompt.slice(0, 80) });
  console.log('GENERATE_API_TOKEN', { hasToken: !!localStorage.getItem('access_token') });
  const response = await api.post('/images/generate', data);
  console.log('GENERATE_API_CALL_SUCCESS', { status: response.status, id: response.data?.id });
  return response.data;
};

export const getImageHistory = async (
  skip = 0,
  limit = 20,
  status?: string
): Promise<ImageHistoryResponse> => {
  console.log('API_REQUEST', { path: '/images/history', skip, limit, status });
  const response = await api.get('/images/history', {
    params: {
      skip,
      limit,
      status_filter: status,
    },
  });
  return response.data;
};

export const getImageDetail = async (imageId: string): Promise<ImageGeneration> => {
  console.log('API_REQUEST', { path: `/images/${imageId}` });
  const response = await api.get(`/images/${imageId}`);
  return response.data;
};

export const downloadImage = async (imageId: string): Promise<Blob> => {
  console.log('API_REQUEST', { path: `/images/${imageId}/file` });
  const response = await api.get(`/images/${imageId}/file`, {
    responseType: 'blob',
  });
  return response.data;
};

export const deleteImage = async (imageId: string): Promise<void> => {
  console.log('API_REQUEST', { path: `/images/${imageId}` });
  await api.delete(`/images/${imageId}`);
};

export default api;
