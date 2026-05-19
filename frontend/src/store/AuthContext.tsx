import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';

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
  login: (accessToken: string, refreshToken: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = '/api/v1/auth';

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

  const clearTokens = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setUser(null);
  }, []);

  const fetchAndSetUser = useCallback(async (accessToken: string): Promise<User> => {
    const userData = await fetchUser(accessToken);
    setUser(userData);
    return userData;
  }, []);

  const login = useCallback(async (accessToken: string, refreshToken: string): Promise<User> => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    setToken(accessToken);
    const userData = await fetchAndSetUser(accessToken);
    return userData;
  }, [fetchAndSetUser]);

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
      await fetchAndSetUser(tokens.access_token);
      return true;
    } catch {
      clearTokens();
      return false;
    }
  }, [fetchAndSetUser, clearTokens]);

  useEffect(() => {
    let mounted = true;

    const restore = async () => {
      setIsLoading(true);
      const storedToken = localStorage.getItem('access_token');
      const storedRefresh = localStorage.getItem('refresh_token');

      if (!storedToken) {
        if (mounted) setIsLoading(false);
        return;
      }

      setToken(storedToken);

      try {
        await fetchAndSetUser(storedToken);
      } catch {
        if (storedRefresh) {
          const ok = await refreshTokens(storedRefresh);
          if (ok && mounted) {
            localStorage.setItem('access_token', ok.access_token);
            localStorage.setItem('refresh_token', ok.refresh_token);
            setToken(ok.access_token);
            try {
              await fetchAndSetUser(ok.access_token);
            } catch {
              clearTokens();
            }
          } else {
            clearTokens();
          }
        } else {
          clearTokens();
        }
      }

      if (mounted) setIsLoading(false);
    };

    restore();
    return () => { mounted = false; };
  }, [fetchAndSetUser, clearTokens]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
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
