import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LogIn } from 'lucide-react';
import GoogleLoginButton from './GoogleLoginButton';
import { useAuth } from '../store/AuthContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { isAuthenticated } = useAuth();

  // Auto-close modal when authentication succeeds
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      console.log('AUTH_MODAL_CLOSING');
      onClose();
    }
  }, [isAuthenticated, isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleLoginComplete = () => {
    console.log('LOGIN_SUCCESS');
    // Modal will auto-close via the isAuthenticated effect above
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto w-full max-w-md"
            >
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#07070d] p-8 shadow-2xl">
                <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-[#7c5cff]/20 blur-[80px]" />
                <div className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-[#3b82f6]/20 blur-[80px]" />

                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 rounded-lg p-2 text-[#8888a0] transition-colors hover:bg-white/5 hover:text-white"
                >
                  <X size={20} />
                </button>

                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7c5cff]/20 to-[#3b82f6]/20 ring-1 ring-white/10">
                    <LogIn className="text-[#7c5cff]" size={32} />
                  </div>

                  <h2 className="mb-2 text-2xl font-bold tracking-tight text-white">
                    Welcome to Vox<span className="text-[#a78bfa]">Forge</span>
                  </h2>
                  <p className="mb-8 text-sm text-[#8888a0]">
                    Sign in to access your personal history, higher generation limits, and exclusive features.
                  </p>

                  <div className="w-full space-y-4">
                    <GoogleLoginButton onLoginComplete={handleLoginComplete} />

                    <div className="relative flex items-center py-4">
                      <div className="flex-grow border-t border-white/10" />
                      <span className="mx-4 flex-shrink-0 text-xs text-[#8888a0]">Secure login via Google</span>
                      <div className="flex-grow border-t border-white/10" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
