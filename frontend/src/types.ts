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
