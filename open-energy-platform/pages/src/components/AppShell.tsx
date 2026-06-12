import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';

const WORKSTATION_PREFIXES = [
  '/launch/',
  '/ipp-lifecycle/', '/trader-risk/', '/lender-suite/', '/offtaker-suite/',
  '/carbon-registry/', '/grid-operator/', '/support/', '/regulator-suite/',
  '/admin-platform/', '/esco/', '/epc/',
];

const ROLE_WS: Record<string, string> = {
  ipp_developer:  '/ipp-lifecycle/workstation',
  trader:         '/trader-risk/workstation',
  lender:         '/lender-suite/workstation',
  offtaker:       '/offtaker-suite/workstation',
  carbon_fund:    '/carbon-registry/workstation',
  grid_operator:  '/grid-operator/workstation',
  regulator:      '/regulator-suite/workstation',
  admin:          '/admin-platform/workstation',
  support:        '/support/workstation',
  esco:           '/esco/workstation',
  epc_contractor: '/epc/workstation',
};

const ROLE_META: Record<string, { label: string; accent: string }> = {
  ipp_developer:  { label: 'IPP Developer',  accent: 'oklch(0.46 0.16 55)'  },
  trader:         { label: 'Trader',          accent: 'oklch(0.46 0.16 250)' },
  lender:         { label: 'Lender',          accent: 'oklch(0.46 0.16 280)' },
  offtaker:       { label: 'Offtaker',        accent: 'oklch(0.46 0.14 200)' },
  carbon_fund:    { label: 'Carbon Fund',     accent: 'oklch(0.46 0.16 145)' },
  grid_operator:  { label: 'Grid Operator',   accent: 'oklch(0.46 0.14 220)' },
  regulator:      { label: 'Regulator',       accent: 'oklch(0.40 0.12 5)'   },
  admin:          { label: 'Platform Admin',  accent: 'oklch(0.30 0.015 250)'},
  support:        { label: 'Support',         accent: 'oklch(0.46 0.14 100)' },
  esco:           { label: 'ESCO / O&M',      accent: 'oklch(0.46 0.14 30)'  },
  epc_contractor: { label: 'EPC Contractor',  accent: 'oklch(0.46 0.14 10)'  },
};

const C = {
  surface: 'oklch(0.99 0.002 80)',
  border:  'oklch(0.88 0.006 250)',
  muted:   'oklch(0.50 0.008 250)',
  text:    'oklch(0.20 0.025 250)',
  active:  'oklch(0.93 0.006 250)',
};

function NavBtn({
  label, active, badge, onClick,
}: {
  label: string; active: boolean; badge?: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 11px',
        borderRadius: 5,
        border: 'none',
        cursor: 'pointer',
        background: active ? C.active : 'transparent',
        color: active ? C.text : C.muted,
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        whiteSpace: 'nowrap',
        transition: 'background 120ms ease-out, color 120ms ease-out',
      }}
    >
      {label}
      {!!badge && badge > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 16, height: 16, padding: '0 4px',
          background: 'oklch(0.55 0.22 25)',
          borderRadius: 8,
          fontSize: 9, fontWeight: 700,
          fontFamily: '"IBM Plex Mono", monospace',
          fontVariantNumeric: 'tabular-nums',
          color: '#fff',
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [urgentCount, setUrgentCount] = useState(0);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const role = user?.role ?? 'trader';
  const meta = ROLE_META[role] ?? { label: role, accent: 'oklch(0.46 0.16 250)' };
  const wsPath = ROLE_WS[role] ?? '/feed';
  const isOnFeed = location.pathname === '/feed';
  const isOnWs = WORKSTATION_PREFIXES.some(p => location.pathname.startsWith(p));

  const loadBadge = useCallback(async () => {
    try {
      const r = await api.get('/feed/badge-counts');
      const counts = r.data?.data ?? {};
      setUrgentCount(counts[role] ?? 0);
    } catch { /* non-blocking */ }
  }, [role]);

  useEffect(() => {
    loadBadge();
    const t = setInterval(loadBadge, 30_000);
    return () => clearInterval(t);
  }, [loadBadge]);

  useEffect(() => {
    if (!avatarOpen) return undefined;
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [avatarOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        navigate('/search');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  const initials = (user?.email ?? 'U')[0].toUpperCase();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'oklch(0.97 0.003 250)',
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      color: C.text,
    }}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header style={{
        height: 52,
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        paddingInline: 20,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        gap: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16, flexShrink: 0 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'oklch(0.50 0.12 250)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em',
          }}>OE</div>
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.10em',
            textTransform: 'uppercase', color: C.muted,
            fontFamily: '"IBM Plex Mono", monospace',
          }}>Open Energy</span>
        </div>

        {/* Role chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '3px 10px', borderRadius: 20,
          background: meta.accent + '18',
          border: `1px solid ${meta.accent}40`,
          color: meta.accent,
          fontSize: 11, fontWeight: 600,
          marginRight: 14, flexShrink: 0,
        }}>
          {meta.label}
        </div>

        {/* Primary nav */}
        <nav style={{ display: 'flex', gap: 1 }}>
          <NavBtn label="Feed" active={isOnFeed} badge={urgentCount} onClick={() => navigate('/feed')} />
          <NavBtn label="Workstation" active={isOnWs} onClick={() => navigate(wsPath)} />
        </nav>

        {/* Right side */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => navigate('/search')}
            title="Search (⌘K)"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 5,
              border: `1px solid ${C.border}`,
              background: 'transparent', cursor: 'pointer',
              color: C.muted, fontSize: 11,
              fontFamily: '"IBM Plex Mono", monospace',
              transition: 'background 120ms ease-out',
            }}
          >
            <svg width={13} height={13} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <span>⌘K</span>
          </button>

          <button
            onClick={() => navigate('/notifications')}
            style={{
              width: 32, height: 32, borderRadius: 6,
              border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.muted,
              transition: 'background 120ms ease-out',
            }}
          >
            <svg width={16} height={16} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>

          <div ref={avatarRef} style={{ position: 'relative', marginLeft: 2 }}>
            <button
              onClick={() => setAvatarOpen(v => !v)}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                border: 'none', cursor: 'pointer',
                background: meta.accent + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: meta.accent,
              }}
            >
              {initials}
            </button>
            {avatarOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 34,
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                boxShadow: '0 4px 16px oklch(0.20 0.01 250 / 0.10)',
                minWidth: 160,
                zIndex: 200,
                overflow: 'hidden',
              }}>
                <div style={{ padding: '8px 12px 6px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{user?.email}</div>
                  <div style={{ fontSize: 11, color: meta.accent, fontWeight: 600, marginTop: 2 }}>{meta.label}</div>
                </div>
                <button
                  onClick={() => { setAvatarOpen(false); navigate('/settings'); }}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: C.text, fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                >
                  Settings
                </button>
                <button
                  onClick={() => { setAvatarOpen(false); logout(); navigate('/login'); }}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'oklch(0.46 0.18 25)', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', borderTop: `1px solid ${C.border}` }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
