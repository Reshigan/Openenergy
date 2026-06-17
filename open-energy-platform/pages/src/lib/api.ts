// ═══════════════════════════════════════════════════════════════════════════
// API Client Module — access-token auto-refresh via refresh_token
// ═══════════════════════════════════════════════════════════════════════════

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// In-memory access token — never written to localStorage.
// XSS cannot steal it; session survives page reload via cookie-based refresh.
let _accessToken: string | null = null;
export function setAuthToken(t: string | null): void {
  _accessToken = t;
  // Clearing the in-memory token must also drop any seeded localStorage['token']
  // (Playwright suites seed it via addInitScript), else the request interceptor's
  // localStorage fallback keeps re-authenticating after logout/refresh-failure.
  if (t === null) { try { localStorage.removeItem('token'); } catch { /* non-fatal */ } }
}
export function getAuthToken(): string | null { return _accessToken; }

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send oe_access / oe_refresh httpOnly cookies
});

api.interceptors.request.use((config) => {
  // In-memory token takes priority; fall back to localStorage for test helpers
  // that seed it via page.addInitScript (see CLAUDE.md § browser tests).
  const token = _accessToken || localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      // No body needed — oe_refresh httpOnly cookie is sent automatically.
      const res = await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true });
      if (res.data?.success) {
        const { token } = res.data.data;
        _accessToken = token;
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
  _stepUpRetry?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined;
    const status = error.response?.status;
    const body = error.response?.data as any;
    const isAuthEndpoint = typeof original?.url === 'string' && /\/auth\/(login|refresh|register|forgot-password|reset-password|verify-email)/.test(original.url);

    // Step-up MFA gate: the server returns 401 + { error: 'step_up_required' }
    // when the op needs a fresh second factor. Show the global modal and,
    // on success, retry the original request once.
    if (status === 401 && body?.error === 'step_up_required' && original && !original._stepUpRetry) {
      original._stepUpRetry = true;
      // Lazy-load the bus to avoid a cycle with App.tsx on initial parse.
      const { requestStepUp } = await import('./stepUp');
      const opType = String(body?.data?.op_type || '*');
      const ok = await requestStepUp(opType);
      if (ok) return api.request(original);
      return Promise.reject(error);
    }

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        if (!original.headers) {
          // Axios InternalAxiosRequestConfig requires AxiosRequestHeaders;
          // construct a fresh AxiosHeaders to satisfy the type guard.
          original.headers = new (axios.AxiosHeaders as any)();
        }
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        return api.request(original);
      }
      setAuthToken(null); // clears in-memory token AND any seeded localStorage['token']
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
