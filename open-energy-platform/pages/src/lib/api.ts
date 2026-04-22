// ═══════════════════════════════════════════════════════════════════════════
// API Client Module — access-token auto-refresh via refresh_token
// ═══════════════════════════════════════════════════════════════════════════

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await axios.post(`${API_BASE}/auth/refresh`, { refresh_token: refreshToken });
      if (res.data?.success) {
        const { token, refresh_token, refresh_expires_at } = res.data.data;
        localStorage.setItem('token', token);
        if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
        if (refresh_expires_at) localStorage.setItem('refresh_expires_at', refresh_expires_at);
        return token as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined;
    const status = error.response?.status;
    const isAuthEndpoint = typeof original?.url === 'string' && /\/auth\/(login|refresh|register|forgot-password|reset-password|verify-email)/.test(original.url);
    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers = original.headers || {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        return api.request(original);
      }
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('refresh_expires_at');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// User interface
export interface User {
  id: string;
  email: string;
  name: string;
  company_name?: string;
  role: string;
  email_verified: boolean;
  kyc_status: string;
  mfa_enabled?: boolean;
  enabled_modules?: string[];
}

// Token bundle surfaced by the Microsoft SSO callback (see /sso-landing).
export interface SsoTokenBundle {
  token: string;
  refresh_token?: string;
  refresh_expires_at?: string;
}

// Auth context interface
export interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  acceptSsoTokens: (bundle: SsoTokenBundle) => void;
}

// Register data interface
export interface RegisterData {
  email: string;
  password: string;
  name: string;
  company_name?: string;
  role: string;
}

// MfaRequiredError is thrown by login() when the server requires a TOTP code.
export class MfaRequiredError extends Error {
  constructor(public email: string) {
    super('MFA code required');
    this.name = 'MfaRequiredError';
  }
}

// LockoutError is thrown by login() when brute-force lockout is active.
export class LockoutError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Locked out. Retry in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`);
    this.name = 'LockoutError';
  }
}
