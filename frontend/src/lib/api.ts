import axios from "axios";

const API_BASE_URL = "http://localhost:8000/api/v1/tts";

const api = axios.create({
  baseURL: API_BASE_URL,
});

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
  error: string | null;
}

export const getVoices = async (): Promise<Voice[]> => {
  const response = await api.get("/voices");
  return response.data;
};

export const generateShortAudio = async (data: {
  text: string;
  voice: string;
  rate?: string;
  pitch?: string;
}, config?: import("axios").AxiosRequestConfig): Promise<{ blob: Blob; jobId: string | null }> => {
  const response = await api.post("/generate", data, {
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
  const response = await api.post("/generate-long-audio", data);
  return response.data;
};

export const getJobStatus = async (jobId: string): Promise<JobProgress> => {
  const response = await api.get(`/job/${jobId}`);
  return response.data;
};

export const downloadJobResult = async (jobId: string, config?: import("axios").AxiosRequestConfig): Promise<Blob> => {
  const response = await api.get(`/job/${jobId}/download`, {
    responseType: "blob",
    ...config,
  });
  return response.data;
};

export const deleteJob = async (jobId: string): Promise<{ message: string }> => {
  const response = await api.delete(`/job/${jobId}`);
  return response.data;
};

export default api;
