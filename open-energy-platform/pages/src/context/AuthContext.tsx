// ═══════════════════════════════════════════════════════════════════════════
// Auth Context Provider — MFA challenge + refresh-token rotation + session revoke on logout
// ═══════════════════════════════════════════════════════════════════════════

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { api, User, AuthContextType, RegisterData, MfaRequiredError, LockoutError } from '../lib/api';

export { api };

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/auth/me');
      if (response.data.success) {
        setUser(response.data.data);
      }
    } catch {
      setToken(null);
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('refresh_expires_at');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, [token]);

  const login = async (email: string, password: string, mfaCode?: string) => {
    const payload: Record<string, unknown> = { email, password };
    if (mfaCode) payload.mfa_code = mfaCode;
    try {
      const response = await api.post('/auth/login', payload);
      if (response.data.success) {
        const { token: accessToken, refresh_token, refresh_expires_at, participant } = response.data.data;
        setToken(accessToken);
        setUser(participant);
        localStorage.setItem('token', accessToken);
        if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
        if (refresh_expires_at) localStorage.setItem('refresh_expires_at', refresh_expires_at);
      } else {
        throw new Error(response.data.error || 'Login failed');
      }
    } catch (err: unknown) {
      const anyErr = err as { response?: { status?: number; data?: { error?: string; code?: string; retry_after_seconds?: number } }; message?: string };
      const status = anyErr?.response?.status;
      const data = anyErr?.response?.data;
      if (status === 401 && data?.code === 'MFA_REQUIRED') throw new MfaRequiredError(email);
      if (status === 429 && data?.code === 'LOCKED_OUT') throw new LockoutError(data.retry_after_seconds || 900);
      throw new Error(data?.error || anyErr?.message || 'Login failed');
    }
  };

  const register = async (data: RegisterData) => {
    const response = await api.post('/auth/register', data);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Registration failed');
    }
  };

  const logout = () => {
    const refreshToken = localStorage.getItem('refresh_token');
    // Best-effort server-side revoke; don't block the UI on it.
    if (refreshToken) {
      api.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('refresh_expires_at');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
