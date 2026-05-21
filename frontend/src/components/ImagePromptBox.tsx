import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Wand2, Loader2 } from 'lucide-react';
import { generateImage } from '../lib/api';
import { useImageJobsStore } from '../store/useImageJobsStore';
import toast from 'react-hot-toast';

const PROMPT_SUGGESTIONS = [
  'A futuristic city at sunset',
  'Digital art landscape with mountains',
  'Abstract colorful waves',
  'Steampunk robot portrait',
  'Glowing neon forest',
];

interface ImagePromptBoxProps {
  onGenerate?: () => void;
  onAuthRequired?: () => boolean;
}

export default function ImagePromptBox({ onGenerate, onAuthRequired }: ImagePromptBoxProps) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { addJob, startPolling } = useImageJobsStore();

  const handleGenerate = useCallback(async () => {
    console.log('GENERATE_BUTTON_CLICKED', { prompt: prompt.trim().slice(0, 80) });

    if (!prompt.trim()) {
      console.log('GENERATE_SKIPPED_EMPTY_PROMPT');
      toast.error('Please enter a prompt');
      return;
    }

    if (!onAuthRequired?.()) {
      console.log('GENERATE_AUTH_REQUIRED');
      return;
    }

    console.log('GENERATE_REQUEST_STARTING', { prompt: prompt.trim().slice(0, 80) });

    try {
      setIsLoading(true);
      const response = await generateImage({ prompt: prompt.trim() });

      console.log('GENERATE_RESPONSE_RECEIVED', { id: response.id, status: response.status });

      // Add to local store
      addJob({
        ...response,
        localCreatedAt: new Date().getTime(),
      });

      // Start polling for updates
      startPolling();

      toast.success('Image generation started!');
      setPrompt('');
      onGenerate?.();
    } catch (error: any) {
      console.error('GENERATE_ERROR', error);
      const message = error.response?.data?.detail || error.message || 'Failed to generate image';
      toast.error(message);
    } finally {
      setIsLoading(false);
      console.log('GENERATE_REQUEST_COMPLETE');
    }
  }, [prompt, addJob, startPolling, onGenerate]);

  const handleQuickSuggest = (suggestion: string) => {
    setPrompt(suggestion);
  };

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
      {/* Main Card */}
      <div className="bg-gradient-to-br from-[#12121f]/60 to-[#1a1a2e]/60 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6 shadow-2xl">
        {/* Title */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-[#7c5cff]" />
            Generate Image
          </h2>
          <p className="text-white/50 text-sm">
            Describe the image you want to create
          </p>
        </div>

        {/* Prompt Input */}
        <div className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="E.g., A serene mountain landscape with golden sunlight, autumn colors, misty valleys..."
            disabled={isLoading}
            className="w-full h-32 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#7c5cff] focus:ring-1 focus:ring-[#7c5cff]/50 resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />

          {/* Character Count */}
          <div className="flex justify-between items-center text-xs text-white/40">
            <span>{prompt.length} / 2048 characters</span>
            {prompt.length > 1800 && (
              <span className="text-yellow-400">Approaching limit</span>
            )}
          </div>

          {/* Quick Suggestions */}
          <div>
            <p className="text-xs text-white/40 mb-2">Quick suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {PROMPT_SUGGESTIONS.map((suggestion) => (
                <motion.button
                  key={suggestion}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleQuickSuggest(suggestion)}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-full text-xs text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
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
                Generate Image
              </>
            )}
          </motion.button>

          {/* Hint */}
          <p className="text-xs text-white/40 text-center">
            💡 Press Ctrl+Enter to generate quickly
          </p>
        </div>
      </div>
    </motion.div>
  );
}
