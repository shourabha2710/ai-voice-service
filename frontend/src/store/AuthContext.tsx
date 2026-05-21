import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useAudioJobsStore } from './useAudioJobsStore';

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  plan: string;
  credits: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authReady: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = 'http://localhost:8000/api/v1/auth';

async function fetchUser(token: string): Promise<User> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch user');
  }
  return res.json();
}

async function refreshTokens(refreshToken: string): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  const clearTokens = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setUser(null);
  }, []);

  const fetchAndSetUser = useCallback(async (accessToken: string): Promise<User> => {
    console.log('AUTH_FETCH_USER');
    const userData = await fetchUser(accessToken);
    setUser(userData);
    return userData;
  }, []);

  const initializeAuthAndHistory = useCallback(async (accessToken: string): Promise<User> => {
    console.log('AUTH_INITIALIZE_START');
    const userData = await fetchAndSetUser(accessToken);
    console.log('AUTH_RESTORED', userData);
    try {
      await useAudioJobsStore.getState().fetchGenerations();
    } catch (err) {
      console.error('AUTH_HISTORY_FETCH_FAILED', err);
    }
    return userData;
  }, [fetchAndSetUser]);

  const login = useCallback(async (accessToken: string, refreshToken: string): Promise<User> => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    setToken(accessToken);
    const userData = await initializeAuthAndHistory(accessToken);
    setAuthReady(true);
    console.log('LOGIN_SUCCESS');
    console.log('AUTH_STATE_UPDATED', { isAuthenticated: true, user: userData.email });
    console.log('AUTH_LOGIN_COMPLETE', userData);
    console.log('AUTH_READY', true);
    return userData;
  }, [initializeAuthAndHistory]);

  const logout = useCallback(async () => {
    const storedRefresh = localStorage.getItem('refresh_token');
    const storedAccess = localStorage.getItem('access_token');

    if (storedRefresh && storedAccess) {
      try {
        await fetch(`${API_BASE}/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${storedAccess}`,
          },
          body: JSON.stringify({ refresh_token: storedRefresh }),
        });
      } catch {
        // best-effort
      }
    }

    clearTokens();
    useAudioJobsStore.getState().stopPolling?.();
    useAudioJobsStore.getState().resetJobs?.();
    localStorage.removeItem('jobIds');
    console.log('AUTH_LOGOUT_CLEAR_HISTORY');
    setAuthReady(false);
  }, [clearTokens]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const storedRefresh = localStorage.getItem('refresh_token');
    if (!storedRefresh) return false;

    const tokens = await refreshTokens(storedRefresh);
    if (!tokens) {
      clearTokens();
      return false;
    }

    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    setToken(tokens.access_token);

    try {
      await initializeAuthAndHistory(tokens.access_token);
      setAuthReady(true);
      console.log('AUTH_REFRESH_COMPLETE');
      console.log('AUTH_READY', true);
      return true;
    } catch {
      clearTokens();
      return false;
    }
  }, [clearTokens, initializeAuthAndHistory]);

  useEffect(() => {
    let mounted = true;

    const restore = async () => {
      console.log('AUTH_RESTORE_START');
      setIsLoading(true);
      const storedToken = localStorage.getItem('access_token');
      const storedRefresh = localStorage.getItem('refresh_token');

      if (!storedToken) {
        if (mounted) {
          setIsLoading(false);
          setAuthReady(true);
          console.log('AUTH_READY', true);
        }
        console.log('AUTH_RESTORE_NO_TOKEN');
        return;
      }

      console.log('TOKEN_FOUND', true);
      setToken(storedToken);

      try {
        await initializeAuthAndHistory(storedToken);
        console.log('AUTH_RESTORE_SUCCESS');
      } catch {
        console.log('AUTH_RESTORE_FAILED');
        if (storedRefresh) {
          const ok = await refreshTokens(storedRefresh);
          if (ok && mounted) {
            localStorage.setItem('access_token', ok.access_token);
            localStorage.setItem('refresh_token', ok.refresh_token);
            setToken(ok.access_token);
            try {
              await initializeAuthAndHistory(ok.access_token);
              console.log('AUTH_REFRESH_SUCCESS');
            } catch {
              clearTokens();
              console.log('AUTH_REFRESH_FETCH_FAILED');
            }
          } else {
            clearTokens();
            console.log('AUTH_REFRESH_FAILED');
          }
        } else {
          clearTokens();
        }
      }

      if (mounted) {
        setIsLoading(false);
        setAuthReady(true);
        console.log('AUTH_READY', true);
      }
    };

    restore();
    return () => { mounted = false; };
  }, [initializeAuthAndHistory, clearTokens]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        authReady,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
