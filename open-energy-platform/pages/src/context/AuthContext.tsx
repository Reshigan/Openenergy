// ═══════════════════════════════════════════════════════════════════════════
// Auth Context Provider — MFA challenge + refresh-token rotation + session revoke on logout
// ═══════════════════════════════════════════════════════════════════════════

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { api, setAuthToken, User, AuthContextType, RegisterData, MfaRequiredError, LockoutError, SsoTokenBundle } from '../lib/api';

export { api };

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
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
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  };

  // On mount: attempt to restore session from oe_refresh httpOnly cookie.
  // The server rotates the cookie and returns a fresh access token.
  // Guard: skip the POST entirely on a cold load when there is no sign a session
  // exists. oe_refresh is httpOnly so we can't see it; setAuthToken() drops a
  // non-httpOnly oe_session_present flag cookie on login/refresh-success and
  // clears it on logout. No flag ⇒ no cookie ⇒ /auth/refresh would 400 and spam
  // the console on every first visit.
  useEffect(() => {
    const hasSessionFlag = typeof document !== 'undefined' && document.cookie.includes('oe_session_present');
    if (!hasSessionFlag) {
      // No cookie flag — but a seeded localStorage['token'] (Playwright helpers,
      // SSO landings) is already sent on every request by api.ts; restore the
      // context from it too so a full reload doesn't bounce a valid session to
      // /login. /auth/me is the validator: a dead token 401s in refreshUser and
      // clears both stores.
      let seeded: string | null = null;
      try { seeded = localStorage.getItem('token'); } catch { /* private mode */ }
      if (seeded) {
        setToken(seeded); // refreshUser() fires via the token useEffect below
        return;
      }
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await api.post('/auth/refresh', {});
        if (res.data?.success) {
          const { token: accessToken } = res.data.data;
          setAuthToken(accessToken);
          setToken(accessToken);
          return; // refreshUser() fires via the token useEffect below
        }
      } catch {
        // No valid cookie — start unauthenticated
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (token) refreshUser();
  }, [token]);

  const login = async (email: string, password: string, mfaCode?: string) => {
    const payload: Record<string, unknown> = { email, password };
    if (mfaCode) payload.mfa_code = mfaCode;
    try {
      const response = await api.post('/auth/login', payload);
      if (response.data.success) {
        const { token: accessToken, participant } = response.data.data;
        setAuthToken(accessToken);
        setToken(accessToken);
        setUser(participant);
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

  // Accept a token bundle produced by an SSO callback (see /sso-landing).
  // The oe_refresh cookie is set server-side; we only need the access token here.
  const acceptSsoTokens = (bundle: SsoTokenBundle) => {
    setAuthToken(bundle.token);
    setLoading(true);
    setToken(bundle.token);
    // refreshUser() fires via the token useEffect
  };

  const logout = () => {
    // Server clears both cookies; withCredentials ensures the cookie is sent.
    api.post('/auth/logout', {}).catch(() => {});
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser, acceptSsoTokens }}>
      {children}
    </AuthContext.Provider>
  );
}
