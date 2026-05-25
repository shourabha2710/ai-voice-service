import { motion } from 'framer-motion';
import { formatSpeed, formatETA, formatFileSize } from '../../utils/formatters';

interface DownloadProgressBarProps {
  percent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  speed: number | null;
  eta: number | null;
}

export default function DownloadProgressBar({
  percent,
  downloadedBytes,
  totalBytes,
  speed,
  eta,
}: DownloadProgressBarProps) {
  const pct = percent ?? 0;
  const clamped = Math.min(Math.max(pct, 0), 100);

  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-[#7c5cff]">{clamped}%</span>
          {speed != null && speed > 0 && (
            <span className="text-white/40">{formatSpeed(speed)}</span>
          )}
          {eta != null && eta > 0 && (
            <span className="text-white/40">ETA: {formatETA(eta)}</span>
          )}
        </div>
        {downloadedBytes != null && totalBytes != null && totalBytes > 0 && (
          <span className="text-white/30">
            {formatFileSize(downloadedBytes)} / {formatFileSize(totalBytes)}
          </span>
        )}
      </div>
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#3b82f6]"
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
