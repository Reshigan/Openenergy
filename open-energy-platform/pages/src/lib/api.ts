// ═══════════════════════════════════════════════════════════════════════════
// API Client Module
// ═══════════════════════════════════════════════════════════════════════════

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
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
  enabled_modules?: string[];
}

// Auth context interface
export interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

// Register data interface
export interface RegisterData {
  email: string;
  password: string;
  name: string;
  company_name?: string;
  role: string;
}
