import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

// Types
interface User {
  id: string;
  email: string;
  name: string;
  company_name?: string;
  role: string;
  email_verified: boolean;
  kyc_status: string;
  enabled_modules?: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  company_name?: string;
  role: string;
}

// API Base URL
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const api = axios.create({
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

// Auth Context
const AuthContext = createContext<AuthContextType | null>(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// Auth Provider
function AuthProvider({ children }: { children: ReactNode }) {
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, [token]);

  const login = async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.success) {
      setToken(response.data.data.token);
      setUser(response.data.data.participant);
      localStorage.setItem('token', response.data.data.token);
    } else {
      throw new Error(response.data.error || 'Login failed');
    }
  };

  const register = async (data: RegisterData) => {
    const response = await api.post('/auth/register', data);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Registration failed');
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-oe-cream">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Layout with Sidebar
function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navigation = getNavigationForRole(user?.role || '');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-oe-cream">
      {/* Sidebar */}
      <aside className="w-64 bg-oe-forest text-white flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-xl font-display font-bold">Open Energy</h1>
          <p className="text-sm text-white/60 mt-1">Platform</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.icon && <item.icon size={20} />}
              <span>{item.label}</span>
              {item.badge && (
                <span className="ml-auto bg-oe-accent text-xs px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-oe-accent rounded-full flex items-center justify-center">
              <span className="font-semibold">{user?.name?.charAt(0) || 'U'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.name}</p>
              <p className="text-xs text-white/60 truncate">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            {navigation.find((n) => n.path === location.pathname)?.label || 'Dashboard'}
          </h2>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-gray-100 rounded-lg">
              <span className="sr-only">Notifications</span>
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          </div>
        </header>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

// Navigation items by role
function getNavigationForRole(role: string) {
  const baseNav = [
    { path: '/cockpit', label: 'Cockpit', icon: DashboardIcon },
    { path: '/contracts', label: 'Contracts', icon: DocumentIcon },
    { path: '/trading', label: 'Trading', icon: ChartIcon },
    { path: '/settlement', label: 'Settlement', icon: DollarIcon },
    { path: '/carbon', label: 'Carbon', icon: LeafIcon },
    { path: '/projects', label: 'IPP Projects', icon: BuildingIcon },
    { path: '/esg', label: 'ESG', icon: ChartIcon },
    { path: '/grid', label: 'Grid', icon: ZapIcon },
    { path: '/funds', label: 'Funds', icon: DollarIcon },
    { path: '/pipeline', label: 'Pipeline', icon: FlowIcon },
    { path: '/procurement', label: 'Procurement', icon: ShoppingIcon },
    { path: '/marketplace', label: 'Marketplace', icon: ShopIcon },
  ];

  const adminNav = [
    ...baseNav,
    { path: '/admin', label: 'Admin', icon: SettingsIcon },
  ];

  switch (role) {
    case 'admin':
      return adminNav;
    case 'ipp_developer':
      return baseNav.filter((n) => !['/trading', '/funds'].includes(n.path));
    case 'trader':
      return baseNav.filter((n) => ['/cockpit', '/contracts', '/trading', '/settlement'].includes(n.path));
    case 'carbon_fund':
      return baseNav.filter((n) => ['/cockpit', '/carbon', '/funds'].includes(n.path));
    case 'lender':
      return baseNav.filter((n) => ['/cockpit', '/projects', '/funds'].includes(n.path));
    case 'grid_operator':
      return baseNav.filter((n) => ['/cockpit', '/grid'].includes(n.path));
    default:
      return baseNav.slice(0, 5);
  }
}

// Icons
function DashboardIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function DocumentIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ChartIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function DollarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function LeafIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function BuildingIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function ZapIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function FlowIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  );
}

function ShoppingIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function ShopIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function SettingsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// ─── PAGES ───

// Login Page
function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/cockpit');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-oe-forest to-oe-forest-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold text-white mb-2">Open Energy</h1>
          <p className="text-white/70">Platform</p>
        </div>

        <div className="card p-8">
          <h2 className="text-2xl font-semibold text-center mb-6">Sign In</h2>

          {error && (
            <div className="alert-error mb-4">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-oe-forest hover:underline">
              Register
            </Link>
          </p>
        </div>

        <p className="text-center text-white/50 text-sm mt-6">
          © 2024 Open Energy Platform
        </p>
      </div>
    </div>
  );
}

// Register Page
function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    company_name: '',
    role: 'ipp_developer',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(formData);
      navigate('/login', { state: { registered: true } });
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-oe-forest to-oe-forest-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold text-white mb-2">Open Energy</h1>
          <p className="text-white/70">Platform</p>
        </div>

        <div className="card p-8">
          <h2 className="text-2xl font-semibold text-center mb-6">Create Account</h2>

          {error && (
            <div className="alert-error mb-4">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input"
                placeholder="John Smith"
                required
              />
            </div>
            <div>
              <label className="label">Company Name</label>
              <input
                type="text"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                className="input"
                placeholder="Acme Energy (Pty) Ltd"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input"
                placeholder="you@company.co.za"
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input"
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="label">Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="input"
              >
                <option value="ipp_developer">IPP Developer</option>
                <option value="trader">Trader</option>
                <option value="carbon_fund">Carbon Fund Manager</option>
                <option value="offtaker">Offtaker</option>
                <option value="lender">Lender / Investor</option>
              </select>
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-oe-forest hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// Cockpit / Dashboard Page
function CockpitPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/cockpit').then((res) => {
      if (res.data.success) setData(res.data.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6">
              <div className="skeleton h-4 w-24 mb-2" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {user?.name}</h1>
        <p className="text-gray-600">Here's your {data?.role} dashboard overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6">
          <h3 className="text-sm font-medium text-gray-500">Notifications</h3>
          <p className="text-3xl font-bold text-oe-forest">{data?.notifications || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Unread items</p>
        </div>
        <div className="card p-6">
          <h3 className="text-sm font-medium text-gray-500">Action Items</h3>
          <p className="text-3xl font-bold text-oe-accent">{data?.action_items?.length || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Pending tasks</p>
        </div>
        <div className="card p-6">
          <h3 className="text-sm font-medium text-gray-500">Role</h3>
          <p className="text-lg font-semibold capitalize">{data?.role}</p>
          <p className="text-xs text-gray-500 mt-1">Your access level</p>
        </div>
      </div>

      {/* Role-specific content */}
      {data?.role === 'ipp_developer' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Project Overview</h2>
          {data.projects?.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {data.projects.map((p: any) => (
                <div key={p.status} className="p-4 bg-oe-cream rounded-lg">
                  <p className="text-2xl font-bold">{p.count}</p>
                  <p className="text-sm text-gray-600 capitalize">{p.status.replace('_', ' ')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No projects yet</p>
          )}
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-600">
              Pending Disbursements: <strong>{data.pending_disbursements || 0}</strong> 
              (R{(data.pending_amount || 0).toLocaleString()})
            </p>
          </div>
        </div>
      )}

      {data?.role === 'trader' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Trading Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.orders?.map((o: any) => (
              <div key={o.status} className="p-4 bg-oe-cream rounded-lg">
                <p className="text-2xl font-bold">{o.count}</p>
                <p className="text-sm text-gray-600 capitalize">{o.status}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Items */}
      {data?.action_items?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Action Items</h2>
          </div>
          <div className="divide-y">
            {data.action_items.map((item: any) => (
              <div key={item.id} className="p-4 flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full ${
                  item.priority === 'urgent' ? 'bg-red-500' :
                  item.priority === 'high' ? 'bg-orange-500' :
                  'bg-yellow-500'
                }`} />
                <div className="flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
                {item.due_date && (
                  <span className="text-sm text-gray-500">Due: {item.due_date}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Contracts Page
function ContractsPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/contracts').then((res) => {
      if (res.data.success) setContracts(res.data.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const phaseColors: Record<string, string> = {
    draft: 'badge-neutral',
    loi: 'badge-info',
    term_sheet: 'badge-info',
    hoa: 'badge-warning',
    legal_review: 'badge-warning',
    execution: 'badge-warning',
    active: 'badge-success',
    amended: 'badge-success',
    terminated: 'badge-danger',
    expired: 'badge-danger',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contracts</h1>
          <p className="text-gray-600">Manage your energy contracts</p>
        </div>
        <button className="btn-primary">+ New Contract</button>
      </div>

      {loading ? (
        <div className="card p-6">
          <div className="skeleton h-4 w-full mb-2" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500">No contracts found</p>
          <button className="btn-secondary mt-4">Create your first contract</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Phase</th>
                <th>Counterparty</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.id}>
                  <td className="font-medium">{contract.title}</td>
                  <td>{contract.document_type}</td>
                  <td>
                    <span className={phaseColors[contract.phase] || 'badge-neutral'}>
                      {contract.phase?.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{contract.counterparty_name || '-'}</td>
                  <td className="text-gray-500">{new Date(contract.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Trading Page
function TradingPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOrderForm, setShowOrderForm] = useState(false);

  useEffect(() => {
    api.get('/trading/orders').then((res) => {
      if (res.data.success) setOrders(res.data.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const handlePlaceOrder = async (orderData: any) => {
    await api.post('/trading/orders', orderData);
    setShowOrderForm(false);
    // Refresh orders
    const res = await api.get('/trading/orders');
    if (res.data.success) setOrders(res.data.data || []);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Trading</h1>
          <p className="text-gray-600">Energy order book and execution</p>
        </div>
        <button className="btn-primary" onClick={() => setShowOrderForm(true)}>
          + Place Order
        </button>
      </div>

      {/* Order Book */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Open Orders</h2>
          </div>
          <div className="divide-y">
            {loading ? (
              <div className="p-4"><div className="skeleton h-4 w-full" /></div>
            ) : orders.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No open orders</div>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="p-4 flex items-center justify-between">
                  <div>
                    <span className={`font-semibold ${order.side === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                      {order.side.toUpperCase()}
                    </span>
                    <span className="ml-3">{order.volume_mwh} MWh {order.energy_type}</span>
                  </div>
                  <div className="text-right">
                    {order.price_max && <span>R{order.price_min} - R{order.price_max}</span>}
                    <span className="ml-4 badge-neutral">{order.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Market Summary</h2>
          </div>
          <div className="p-6">
            <p className="text-gray-500">Market data coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Placeholder pages for other routes
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="card p-6">
        <p className="text-gray-500">This page is under construction.</p>
      </div>
    </div>
  );
}

// App Router
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/cockpit" element={<ProtectedRoute><Layout><CockpitPage /></Layout></ProtectedRoute>} />
      <Route path="/contracts" element={<ProtectedRoute><Layout><ContractsPage /></Layout></ProtectedRoute>} />
      <Route path="/trading" element={<ProtectedRoute><Layout><TradingPage /></Layout></ProtectedRoute>} />
      <Route path="/settlement" element={<ProtectedRoute><Layout><PlaceholderPage title="Settlement" /></Layout></ProtectedRoute>} />
      <Route path="/carbon" element={<ProtectedRoute><Layout><PlaceholderPage title="Carbon Market" /></Layout></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Layout><PlaceholderPage title="IPP Projects" /></Layout></ProtectedRoute>} />
      <Route path="/esg" element={<ProtectedRoute><Layout><PlaceholderPage title="ESG Dashboard" /></Layout></ProtectedRoute>} />
      <Route path="/grid" element={<ProtectedRoute><Layout><PlaceholderPage title="Grid Management" /></Layout></ProtectedRoute>} />
      <Route path="/funds" element={<ProtectedRoute><Layout><PlaceholderPage title="Fund Management" /></Layout></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><Layout><PlaceholderPage title="Pipeline" /></Layout></ProtectedRoute>} />
      <Route path="/procurement" element={<ProtectedRoute><Layout><PlaceholderPage title="Procurement" /></Layout></ProtectedRoute>} />
      <Route path="/marketplace" element={<ProtectedRoute><Layout><PlaceholderPage title="Marketplace" /></Layout></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><Layout><PlaceholderPage title="Admin" /></Layout></ProtectedRoute>} />
      <Route path="/" element={<Navigate to="/cockpit" replace />} />
      <Route path="*" element={<Navigate to="/cockpit" replace />} />
    </Routes>
  );
}

// Main App
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}