import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../store/AuthContext';
import PromptBox from '../components/text-to-video/PromptBox';
import VideoHistory from '../components/text-to-video/VideoHistory';
import LoginModal from '../components/LoginModal';

export default function TextToVideoPage() {
  const { isAuthenticated } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const requireAuth = useCallback((): boolean => {
    if (!isAuthenticated) {
      setIsLoginModalOpen(true);
      return false;
    }
    return true;
  }, [isAuthenticated]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-b from-[#07070d] via-[#0f0f1e] to-[#07070d] text-white"
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#7c5cff]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#3b82f6]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <div className="border-b border-white/[0.06] bg-[#07070d]/50 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h1 className="text-4xl font-bold bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] bg-clip-text text-transparent">
                AI Video Generator
              </h1>
              <p className="text-white/50 mt-2">
                Transform text prompts into cinematic videos with AI
              </p>
            </motion.div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="space-y-12">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <PromptBox onAuthRequired={requireAuth} />
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <VideoHistory
                title="Your Generated Videos"
                emptyMessage="No videos yet. Create your first video by entering a prompt above!"
                onAuthRequired={requireAuth}
              />
            </motion.section>
          </div>
        </div>
      </div>

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </motion.div>
  );
}
