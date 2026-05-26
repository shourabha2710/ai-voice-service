import { motion } from 'framer-motion';

interface GenerationProgressBarProps {
  progress: number;
  status: string;
}

const PROGRESS_LABELS: Record<number, string> = {
  0: 'Queued...',
  10: 'Initializing...',
  15: 'Preparing image service...',
  30: 'Generating AI frames...',
  60: 'Applying cinematic transitions...',
  85: 'Encoding video...',
  95: 'Generating thumbnail...',
  100: 'Completed!',
};

export default function GenerationProgressBar({ progress, status }: GenerationProgressBarProps) {
  const label = PROGRESS_LABELS[Math.floor(progress / 10) * 10] || `${progress}%`;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/60">{label}</span>
        <span className="text-xs font-mono text-[#7c5cff]">{progress}%</span>
      </div>
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] rounded-full"
        />
      </div>
      {status === 'processing' && progress < 100 && (
        <div className="flex items-center gap-2 mt-2">
          <div className="w-2 h-2 rounded-full bg-[#7c5cff] animate-pulse" />
          <span className="text-[10px] text-white/40">Processing...</span>
        </div>
      )}
    </div>
  );
}
