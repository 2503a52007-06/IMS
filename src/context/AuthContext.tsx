import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { SafeUser } from '../types';

interface AuthContextValue {
  user: SafeUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, portalScope?: 'traveler' | 'staff') => Promise<SafeUser>;
  register: (name: string, email: string, password: string) => Promise<SafeUser>;
  logout: () => void;
  authHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const TOKEN_KEY = 'voyageinr_jwt';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function hydrateUser() {
      if (!token) {
        if (active) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error('Session invalid');
        }
        const data = (await res.json()) as { user: SafeUser };
        if (active) {
          setUser(data.user);
        }
      } catch {
        if (active) {
          logout();
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    hydrateUser();
    return () => {
      active = false;
    };
  }, [token, logout]);

  const login = useCallback(
    async (email: string, password: string, portalScope: 'traveler' | 'staff' = 'traveler') => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, portalScope }),
      });
      const data = (await res.json()) as { token?: string; user?: SafeUser; error?: string };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Invalid credentials.');
      }
      setToken(data.token);
      setUser(data.user);
      try {
        localStorage.setItem(TOKEN_KEY, data.token);
      } catch {
        // Ignore storage errors
      }
      return data.user;
    },
    []
  );

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = (await res.json()) as { token?: string; user?: SafeUser; error?: string };
    if (!res.ok || !data.token || !data.user) {
      throw new Error(data.error || 'Registration failed.');
    }
    setToken(data.token);
    setUser(data.user);
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
    } catch {
      // Ignore storage errors
    }
    return data.user;
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, authHeaders }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
