export interface Voice {
  FriendlyName: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  SuggestedCodec: string;
}

export interface JobProgress {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  completed_chunks: number;
  total_chunks: number;
  created_at: string;
  updated_at: string;
  output_file: string | null;
  message?: string | null;
  error: string | null;
}

export type VideoPlatform = 'youtube' | 'instagram';
export type DownloadType = 'audio' | 'video';
export type VideoDownloadStatus = 'pending' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface VideoDownload {
  id: string;
  user_id: string;
  url: string;
  title: string | null;
  platform: VideoPlatform;
  download_type: DownloadType;
  status: VideoDownloadStatus;
  file_size: number | null;
  thumbnail_url: string | null;
  file_path: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  progress_percent: number | null;
  downloaded_bytes: number | null;
  total_bytes: number | null;
  download_speed: number | null;
  eta_seconds: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface VideoDownloadRequest {
  url: string;
  download_type: DownloadType;
}

export interface VideoListResponse {
  items: VideoDownload[];
  total: number;
  page: number;
  page_size: number;
}

export interface CancelResponse {
  success: boolean;
  message: string;
}
