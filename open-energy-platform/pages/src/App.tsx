import React, { useState, useEffect, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, ShieldCheck, Zap, Leaf, Activity, ArrowRight } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './lib/useAuth';
import { api } from './lib/api';
import { FioriShell } from './components/FioriShell';

// Import page components
import { Cockpit } from './components/pages/Cockpit';
import { Contracts } from './components/pages/Contracts';
import { ContractDetail } from './components/pages/ContractDetail';
import { Trading } from './components/pages/Trading';
import { Carbon } from './components/pages/Carbon';
import { ProcurementHub } from './components/pages/ProcurementHub';
import { Projects } from './components/pages/Projects';
import { Grid } from './components/pages/Grid';
import { ESG } from './components/pages/ESG';
import { Funds } from './components/pages/Funds';
import { Marketplace } from './components/pages/Marketplace';
import { Admin } from './components/pages/Admin';
import { Pipeline } from './components/pages/Pipeline';
import { Reports } from './components/pages/Reports';
import { OM } from './components/pages/OM';
import { Lois } from './components/pages/Lois';
import { LoiDetail } from './components/pages/LoiDetail';
import { Intelligence } from './components/pages/Intelligence';
import { Skeleton } from './components/Skeleton';
import { EmptyState } from './components/EmptyState';
import { ErrorBanner } from './components/ErrorBanner';
import { ExportBar } from './components/ExportBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { BatchActionBar } from './components/BatchActionBar';
import { EntityLink } from './components/EntityLink';

// Export formatZAR utility
export const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ionex-canvas">
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

// Layout — Fiori shell wrapper
function Layout({ children }: { children: ReactNode }) {
  return <FioriShell>{children}</FioriShell>;
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
    { path: '/om', label: 'O&M', icon: WrenchIcon },
    { path: '/lois', label: 'Letters of Intent', icon: DocumentIcon },
    { path: '/intelligence', label: 'Intelligence', icon: ChartIcon },
    { path: '/reports', label: 'Reports', icon: ChartIcon },
  ];

  const adminNav = [
    ...baseNav,
    { path: '/admin', label: 'Admin', icon: SettingsIcon },
  ];

  switch (role) {
    case 'admin':
      return adminNav;
    case 'ipp_developer':
      return baseNav.filter((n) => !['/trading', '/funds', '/marketplace'].includes(n.path));
    case 'lender':
      return baseNav.filter((n) => ['/cockpit', '/projects', '/funds', '/om', '/intelligence', '/reports'].includes(n.path));
    case 'trader':
      return baseNav.filter((n) => ['/cockpit', '/contracts', '/trading', '/settlement', '/intelligence', '/reports'].includes(n.path));
    case 'carbon_fund':
      return baseNav.filter((n) => ['/cockpit', '/carbon', '/funds', '/intelligence', '/reports'].includes(n.path));
    case 'grid_operator':
      return baseNav.filter((n) => ['/cockpit', '/grid', '/intelligence', '/reports'].includes(n.path));
    case 'offtaker':
      return baseNav.filter((n) => ['/cockpit', '/contracts', '/lois', '/procurement', '/marketplace', '/intelligence', '/reports'].includes(n.path));
    case 'regulator':
      return baseNav.filter((n) => ['/cockpit', '/esg', '/intelligence', '/reports'].includes(n.path));
    default:
      return [...baseNav.slice(0, 5), { path: '/reports', label: 'Reports', icon: ChartIcon }];
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

function WrenchIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437" />
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

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Demo@2024!');
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_0.9fr]" style={{ background: '#f5f6f7' }}>
      {/* Brand panel */}
      <div
        className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden text-white"
        style={{
          background:
            'radial-gradient(circle at 15% 15%, rgba(10,110,209,0.85) 0%, transparent 45%),' +
            'radial-gradient(circle at 85% 25%, rgba(93,54,255,0.80) 0%, transparent 50%),' +
            'radial-gradient(circle at 70% 90%, rgba(171,33,142,0.80) 0%, transparent 50%),' +
            'radial-gradient(circle at 95% 95%, rgba(233,115,12,0.55) 0%, transparent 45%),' +
            'linear-gradient(135deg, #0a1930 0%, #152030 40%, #354a5f 100%)',
        }}
      >
        <div className="aurora" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg,#0a6ed1,#5d36ff)',
                boxShadow: '0 8px 24px rgba(10,110,209,0.45)',
              }}
            >
              <Sparkles size={22} className="text-white" />
            </div>
            <div>
              <div className="text-[18px] font-bold tracking-tight">Open Energy</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">
                Exchange · Vanta X
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <h1 className="text-[42px] lg:text-[52px] font-bold leading-[1.05] tracking-tight">
            South Africa's{' '}
            <span
              style={{
                background: 'linear-gradient(90deg,#9cc6ff 0%,#c6b8ff 50%,#ffc6eb 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              unified energy exchange
            </span>
            .
          </h1>
          <p className="mt-5 text-white/80 text-[16px] max-w-lg leading-relaxed">
            Trade power, carbon and RECs, originate IPP projects, run procurement,
            and settle with confidence — all on one enterprise-grade platform.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 max-w-lg">
            <FeatureBadge icon={Activity} label="Live trading" tint="#9cc6ff" />
            <FeatureBadge icon={Leaf} label="Carbon & ESG" tint="#9cecb4" />
            <FeatureBadge icon={Zap} label="Grid & settlement" tint="#ffd27a" />
            <FeatureBadge icon={ShieldCheck} label="POPIA & NERSA" tint="#ffc6eb" />
          </div>
        </div>

        <div className="relative z-10 text-[12px] text-white/55">
          © {new Date().getFullYear()} Open Energy · Vanta X Holdings
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#0a6ed1,#5d36ff)' }}
            >
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <div className="text-[16px] font-bold" style={{ color: '#32363a' }}>
                Open Energy
              </div>
              <div className="text-[11px] uppercase tracking-widest" style={{ color: '#89919a' }}>
                Exchange
              </div>
            </div>
          </div>

          <h2 className="text-[28px] font-bold tracking-tight" style={{ color: '#32363a' }}>
            Sign in
          </h2>
          <p className="mt-1 text-[14px]" style={{ color: '#6a6d70' }}>
            Welcome back. Use your Open Energy credentials to continue.
          </p>

          {error && (
            <div
              className="mt-5 rounded-lg border px-3 py-2 text-[13px]"
              style={{
                background: '#ffebeb',
                borderColor: '#e9a2a2',
                color: '#bb0000',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@openenergy.co.za"
                required
                autoFocus
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label">Password</label>
                <Link
                  to="#"
                  className="text-[12px] font-semibold"
                  style={{ color: '#0a6ed1' }}
                >
                  Forgot?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" style={{ borderTopColor: '#ffffff' }} />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: '#e5e5e5' }} />
            <span className="text-[11px] uppercase tracking-widest" style={{ color: '#89919a' }}>
              or use a demo account
            </span>
            <div className="flex-1 h-px" style={{ background: '#e5e5e5' }} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { label: 'Admin',         email: 'admin@openenergy.co.za',     tint: 'indigo'  },
              { label: 'Trader',        email: 'trader@openenergy.co.za',    tint: 'blue'    },
              { label: 'IPP Developer', email: 'ipp@openenergy.co.za',       tint: 'teal'    },
              { label: 'Carbon Fund',   email: 'carbon@openenergy.co.za',    tint: 'green'   },
              { label: 'Offtaker',      email: 'offtaker@openenergy.co.za',  tint: 'amber'   },
              { label: 'Grid Operator', email: 'grid@openenergy.co.za',      tint: 'plum'    },
            ].map((r) => (
              <button
                key={r.email}
                type="button"
                onClick={() => fillDemo(r.email)}
                className="flex items-center justify-between gap-2 h-10 px-3 rounded-lg text-[13px] font-semibold border transition-all hover:-translate-y-0.5"
                style={{
                  background: '#ffffff',
                  borderColor: '#e5e5e5',
                  color: '#32363a',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <span className="flex items-center gap-2">
                  <span className={`fiori-chip ${r.tint === 'indigo' ? 'indigo' : r.tint === 'blue' ? 'info' : r.tint === 'teal' ? 'info' : r.tint === 'green' ? 'good' : r.tint === 'amber' ? 'critical' : 'info'}`} style={{ height: 18, padding: '0 6px', fontSize: 10 }}>
                    {r.label}
                  </span>
                </span>
                <span style={{ color: '#6a6d70', fontWeight: 500 }} className="truncate text-[11px]">
                  {r.email.split('@')[0]}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-6 text-center text-[13px]" style={{ color: '#6a6d70' }}>
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold" style={{ color: '#0a6ed1' }}>
              Request access
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureBadge({
  icon: Icon,
  label,
  tint,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  tint: string;
}) {
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
      style={{
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        style={{ background: 'rgba(255,255,255,0.12)', color: tint }}
      >
        <Icon size={16} />
      </div>
      <span className="text-[13px] font-semibold text-white/90">{label}</span>
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
          <p className="text-white/70">Energy Exchange Platform</p>
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
            <Link to="/login" className="text-ionex-brand hover:underline">
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
          <p className="text-3xl font-bold text-ionex-brand">{data?.notifications || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Unread items</p>
        </div>
        <div className="card p-6">
          <h3 className="text-sm font-medium text-gray-500">Action Items</h3>
          <p className="text-3xl font-bold text-ionex-accent">{data?.action_items?.length || 0}</p>
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
                <div key={p.status} className="p-4 bg-ionex-canvas rounded-lg">
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
              <div key={o.status} className="p-4 bg-ionex-canvas rounded-lg">
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
      <Route path="/cockpit" element={<ProtectedRoute><Layout><Cockpit /></Layout></ProtectedRoute>} />
      <Route path="/contracts" element={<ProtectedRoute><Layout><Contracts /></Layout></ProtectedRoute>} />
      <Route path="/contracts/:id" element={<ProtectedRoute><Layout><ContractDetail /></Layout></ProtectedRoute>} />
      <Route path="/trading" element={<ProtectedRoute><Layout><Trading /></Layout></ProtectedRoute>} />
      <Route path="/settlement" element={<ProtectedRoute><Layout><Cockpit /></Layout></ProtectedRoute>} />
      <Route path="/carbon" element={<ProtectedRoute><Layout><Carbon /></Layout></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Layout><Projects /></Layout></ProtectedRoute>} />
      <Route path="/esg" element={<ProtectedRoute><Layout><ESG /></Layout></ProtectedRoute>} />
      <Route path="/grid" element={<ProtectedRoute><Layout><Grid /></Layout></ProtectedRoute>} />
      <Route path="/funds" element={<ProtectedRoute><Layout><Funds /></Layout></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><Layout><Pipeline /></Layout></ProtectedRoute>} />
      <Route path="/procurement" element={<ProtectedRoute><Layout><ProcurementHub /></Layout></ProtectedRoute>} />
      <Route path="/marketplace" element={<ProtectedRoute><Layout><Marketplace /></Layout></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><Layout><Admin /></Layout></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Layout><Reports /></Layout></ProtectedRoute>} />
      <Route path="/om" element={<ProtectedRoute><Layout><OM /></Layout></ProtectedRoute>} />
      <Route path="/lois" element={<ProtectedRoute><Layout><Lois /></Layout></ProtectedRoute>} />
      <Route path="/lois/:id" element={<ProtectedRoute><Layout><LoiDetail /></Layout></ProtectedRoute>} />
      <Route path="/intelligence" element={<ProtectedRoute><Layout><Intelligence /></Layout></ProtectedRoute>} />
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