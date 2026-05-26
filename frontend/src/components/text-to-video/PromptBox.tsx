import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Wand2, Loader2 } from 'lucide-react';
import { generateVideo } from '../../lib/api';
import { useTextToVideoStore } from '../../store/useTextToVideoStore';
import AspectRatioSelector from './AspectRatioSelector';
import DurationSelector from './DurationSelector';
import toast from 'react-hot-toast';

const PROMPT_SUGGESTIONS = [
  'Cinematic aerial view of a futuristic city at sunset with neon lights',
  'Serene mountain landscape with misty valleys and golden sunlight',
  'Underwater coral reef with colorful fish and sun rays',
  'Ancient forest with magical glowing creatures at night',
  'Space battle scene with starships and nebulae',
];

interface PromptBoxProps {
  onGenerate?: () => void;
  onAuthRequired?: () => boolean;
}

export default function PromptBox({ onGenerate, onAuthRequired }: PromptBoxProps) {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(16);
  const [isLoading, setIsLoading] = useState(false);
  const { addJob, startPolling } = useTextToVideoStore();

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if (!onAuthRequired?.()) return;

    try {
      setIsLoading(true);
      const response = await generateVideo({
        prompt: prompt.trim(),
        duration,
        aspect_ratio: aspectRatio,
        quality: 'standard',
      });

      addJob({
        ...response,
        localCreatedAt: new Date().getTime(),
      });

      startPolling();
      toast.success('Video generation started!');
      setPrompt('');
      onGenerate?.();
    } catch (error: any) {
      const message = error.response?.data?.detail || error.message || 'Failed to generate video';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, duration, aspectRatio, addJob, startPolling, onGenerate]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleGenerate();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl mx-auto"
    >
      <div className="bg-gradient-to-br from-[#12121f]/60 to-[#1a1a2e]/60 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6 shadow-2xl">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-[#7c5cff]" />
            Generate Video
          </h2>
          <p className="text-white/50 text-sm">
            Describe the cinematic video you want to create
          </p>
        </div>

        <div className="space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="E.g., Cinematic aerial view of a futuristic city at sunset with neon lights and flying cars..."
            disabled={isLoading}
            className="w-full h-28 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#7c5cff] focus:ring-1 focus:ring-[#7c5cff]/50 resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />

          <div className="flex justify-between items-center text-xs text-white/40">
            <span>{prompt.length} / 2048 characters</span>
            {prompt.length > 1800 && (
              <span className="text-yellow-400">Approaching limit</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />
            <DurationSelector value={duration} onChange={setDuration} />
          </div>

          <div>
            <p className="text-xs text-white/40 mb-2">Quick suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {PROMPT_SUGGESTIONS.map((suggestion) => (
                <motion.button
                  key={suggestion}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setPrompt(suggestion)}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-full text-xs text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] text-white font-bold text-lg hover:shadow-lg hover:shadow-[#7c5cff]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5" />
                Generate Video
              </>
            )}
          </motion.button>

          <p className="text-xs text-white/40 text-center">
            Press Ctrl+Enter to generate quickly
          </p>
        </div>
      </div>
    </motion.div>
  );
}
