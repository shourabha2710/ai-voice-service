import { useRef, useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../store/AuthContext';
import { Loader2 } from 'lucide-react';

interface GoogleLoginButtonProps {
  onLoginComplete?: () => void;
}

let gsiInitialized = false;

function loadGsiScript(): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      if (typeof google !== 'undefined' && google.accounts) {
        resolve();
        return;
      }
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export default function GoogleLoginButton({ onLoginComplete }: GoogleLoginButtonProps) {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [gsiReady, setGsiReady] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const authInProgress = useRef(false);
  const mountedRef = useRef(true);

  const handleGoogleResponse = useCallback(async (credential: string) => {
    if (authInProgress.current) return;
    authInProgress.current = true;
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credential }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Google login failed' }));
        throw new Error(err.detail || 'Google login failed');
      }

      const data = await res.json();
      await login(data.access_token, data.refresh_token);
      toast.success('Welcome back!');
      onLoginComplete?.();
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
      authInProgress.current = false;
    }
  }, [login, onLoginComplete]);

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      await loadGsiScript();

      if (!mountedRef.current) return;

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId || clientId === 'your-google-client-id.apps.googleusercontent.com') {
        console.warn('Google Client ID not configured in VITE_GOOGLE_CLIENT_ID');
        return;
      }

      if (gsiInitialized) {
        setGsiReady(true);
        return;
      }

      if (typeof google === 'undefined' || !google.accounts) {
        const maxWait = 10000;
        const poll = async () => {
          for (let i = 0; i < maxWait / 100; i++) {
            if (typeof google !== 'undefined' && google.accounts) {
              initializeGsi(clientId);
              if (mountedRef.current) setGsiReady(true);
              return;
            }
            await new Promise((r) => setTimeout(r, 100));
          }
          console.error('Google Identity Services failed to load');
        };
        poll();
        return;
      }

      initializeGsi(clientId);
      if (mountedRef.current) setGsiReady(true);
    };

    init();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  function initializeGsi(clientId: string) {
    if (gsiInitialized) return;
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response: { credential?: string }) => {
        if (response.credential) {
          handleGoogleResponse(response.credential);
        }
      },
      cancel_on_tap_outside: false,
    });
    gsiInitialized = true;
  }

  useEffect(() => {
    if (!gsiReady || !buttonRef.current || isLoading) return;

    let cancelled = false;

    const timeout = setTimeout(() => {
      if (cancelled || !buttonRef.current || !gsiReady || isLoading) return;
      try {
        buttonRef.current.innerHTML = '';
        google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          shape: 'rectangular',
          theme: 'filled_blue',
          size: 'large',
          width: 320,
          text: 'continue_with',
          logo_alignment: 'left',
        });
      } catch {
        // render may fail if container is detached
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [gsiReady, isLoading]);

  return (
    <div className="w-full flex justify-center py-2">
      <div className="relative min-h-[50px]">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[#07070d]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-[#7c5cff]" size={24} />
              <span className="text-xs text-[#8888a0]">Signing in...</span>
            </div>
          </div>
        )}
        <div
          ref={buttonRef}
          className={`transition-opacity duration-200 ${isLoading ? 'pointer-events-none opacity-30' : ''}`}
        />
      </div>
    </div>
  );
}
