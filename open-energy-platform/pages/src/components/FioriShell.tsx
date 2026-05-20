import React, { useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { LogoMark } from './Logo';
import { MatIcon } from './OEIcon';
import { LtmLogo } from './LtmLogo';

/* ════════════════════════════════════════════════════════════════════════
 * Open Energy Platform — App Shell
 * Forest Green gradient header · IBM Plex Sans / Metropolis · Material Symbols
 * Industrial-Fintech aesthetic — sized for data-dense workflows
 *
 * Filename retained as `FioriShell` for compat with existing imports.
 * ═══════════════════════════════════════════════════════════════════════ */

type NavItem = {
  path: string;
  label: string;
  icon: string;       // Material Symbols name
  section: string;
  badge?: string;
};

/**
 * Master navigation. Sections track the Stitch Launchpad grouping:
 * Home → Commerce → Operations → Sustainability → Finance → Insights → Compliance → System
 */
const BASE_NAV: NavItem[] = [
  { path: '/launch',       label: 'Launchpad',     icon: 'dashboard',          section: 'Home' },
  { path: '/contracts',    label: 'Contracts',     icon: 'description',        section: 'Commerce' },
  { path: '/lois',         label: 'Letters of Intent', icon: 'assignment',     section: 'Commerce' },
  { path: '/trading',      label: 'Trading',       icon: 'trending_up',        section: 'Commerce' },
  { path: '/settlement',   label: 'Settlement',    icon: 'receipt_long',       section: 'Commerce' },
  { path: '/settlement-ops', label: 'Settlement Ops', icon: 'receipt_long',    section: 'Commerce' },
  { path: '/procurement',  label: 'Procurement',   icon: 'shopping_cart',      section: 'Commerce' },
  { path: '/marketplace',  label: 'Marketplace',   icon: 'storefront',         section: 'Commerce' },
  { path: '/documents',    label: 'Documents',     icon: 'description',        section: 'Commerce' },
  { path: '/projects',     label: 'IPP Projects',  icon: 'apartment',          section: 'Operations' },
  { path: '/ipp/variations', label: 'Variation Orders', icon: 'assignment',    section: 'Operations' },
  { path: '/pipeline',     label: 'Pipeline',      icon: 'account_tree',       section: 'Operations' },
  { path: '/grid',         label: 'Grid',          icon: 'bolt',               section: 'Operations' },
  { path: '/om',           label: 'O&M',           icon: 'build',              section: 'Operations' },
  { path: '/esums-om',     label: 'Esums O&M',     icon: 'build',              section: 'Operations' },
  { path: '/ops/l5',       label: 'L5 Ops Console', icon: 'monitor_heart',     section: 'Operations' },
  { path: '/ops/depth',    label: 'Depth Ops',     icon: 'monitor_heart',      section: 'Operations' },
  { path: '/carbon',       label: 'Carbon',        icon: 'eco',                section: 'Sustainability' },
  { path: '/esg',          label: 'ESG',           icon: 'public',             section: 'Sustainability' },
  { path: '/funds',        label: 'Funds',         icon: 'savings',            section: 'Finance' },
  { path: '/intelligence', label: 'Intelligence',  icon: 'insights',           section: 'Insights' },
  { path: '/briefing',     label: 'Briefing',      icon: 'wb_sunny',           section: 'Insights' },
  { path: '/reports',      label: 'Reports',       icon: 'bar_chart',          section: 'Insights' },
  { path: '/design-gallery', label: 'Design gallery', icon: 'palette',          section: 'Insights' },
  { path: '/popia',        label: 'POPIA',         icon: 'privacy_tip',        section: 'Compliance' },
  { path: '/audit',        label: 'Audit transparency', icon: 'privacy_tip',   section: 'Compliance' },
  { path: '/admin/paia',   label: 'PAIA queue',    icon: 'privacy_tip',        section: 'Compliance' },
  { path: '/settings/compliance-admin', label: 'Compliance admin', icon: 'privacy_tip', section: 'Compliance' },
  { path: '/admin',        label: 'Admin',         icon: 'settings',           section: 'System' },
  { path: '/admin/platform-console', label: 'Platform console', icon: 'settings', section: 'System' },
  { path: '/admin/bulk-ops', label: 'Bulk operations', icon: 'settings',       section: 'System' },
  { path: '/settings/passkeys', label: 'Passkeys', icon: 'settings',           section: 'System' },
  { path: '/support',      label: 'Support',       icon: 'support_agent',      section: 'System' },
  { path: '/admin/monitoring', label: 'Monitoring', icon: 'monitor_heart',     section: 'System' },
];

function navForRole(role: string | undefined): NavItem[] {
  // /admin is admin-only; /support is admin + support only. POPIA is visible
  // to every role because every user has personal data rights. Passkeys are
  // available to every signed-in user.
  const adminOnlyPaths = new Set(['/admin', '/support', '/admin/monitoring', '/admin/platform-console',
    '/admin/bulk-ops', '/settings/compliance-admin']);
  const nonSystem = BASE_NAV.filter((n) => !adminOnlyPaths.has(n.path));
  if (!role) return nonSystem;
  switch (role) {
    case 'admin':
      return BASE_NAV;
    case 'support':
      return BASE_NAV.filter((n) =>
        ['/launch', '/support', '/admin/monitoring', '/intelligence', '/briefing', '/popia',
         '/esums-om', '/admin/paia', '/settlement-ops', '/settings/passkeys', '/documents',
         '/audit'].includes(n.path),
      );
    case 'trader':
      return BASE_NAV.filter((n) =>
        ['/launch', '/trading', '/settlement', '/contracts', '/marketplace', '/intelligence',
         '/reports', '/popia', '/briefing', '/documents', '/ops/l5', '/settings/passkeys'].includes(n.path),
      );
    case 'ipp_developer':
      return BASE_NAV.filter((n) =>
        ['/launch', '/projects', '/contracts', '/settlement', '/grid', '/om', '/marketplace',
         '/esg', '/intelligence', '/reports', '/popia', '/briefing',
         '/esums-om', '/ipp/variations', '/documents', '/settings/passkeys'].includes(n.path),
      );
    case 'carbon_fund':
      return BASE_NAV.filter((n) =>
        ['/launch', '/carbon', '/marketplace', '/funds', '/pipeline', '/esg', '/intelligence',
         '/reports', '/popia', '/briefing', '/documents', '/settings/passkeys'].includes(n.path),
      );
    case 'offtaker':
      return BASE_NAV.filter((n) =>
        ['/launch', '/contracts', '/lois', '/procurement', '/marketplace', '/settlement', '/esg',
         '/intelligence', '/reports', '/popia', '/briefing',
         '/ipp/variations', '/documents', '/settings/passkeys'].includes(n.path),
      );
    case 'lender':
      return BASE_NAV.filter((n) =>
        ['/launch', '/projects', '/pipeline', '/funds', '/settlement', '/om', '/intelligence',
         '/reports', '/popia', '/briefing',
         '/ipp/variations', '/documents', '/settings/passkeys'].includes(n.path),
      );
    case 'grid_operator':
      return BASE_NAV.filter((n) =>
        ['/launch', '/grid', '/settlement', '/intelligence', '/reports', '/popia', '/briefing',
         '/ops/l5', '/documents', '/settings/passkeys'].includes(n.path),
      );
    case 'regulator':
      return BASE_NAV.filter((n) =>
        ['/launch', '/marketplace', '/esg', '/intelligence', '/reports', '/popia', '/briefing',
         '/ops/l5', '/audit', '/documents', '/settings/passkeys'].includes(n.path),
      );
    default:
      return nonSystem;
  }
}

function initialsOf(name: string | undefined): string {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/* The MIcon helper used to render the Material Symbols icon font. We now
 * route every call through the custom OE icon set so nothing in the shell
 * depends on Google's icon font or any stock library. All previous Material
 * Symbol names (`dashboard`, `bolt`, `eco` etc.) are mapped onto our OE
 * SVGs in OEIcon.tsx::MATERIAL_MAP. */
function MIcon({ name, className = '', filled, size = 20 }: { name: string; className?: string; filled?: boolean; size?: number }) {
  return <MatIcon name={name} size={size} className={className} filled={filled} />;
}

/** Shell-bar notifications bell. Polls /api/notifications/unread-count
 *  every 60s; navigates to /notifications on click. Badge shows live
 *  unread count up to 99. */
function NotificationsBell() {
  const [n, setN] = useState(0);
  const navigate = useNavigate();
  // Visibility-aware — no requests while tab is hidden. With ~25% of
  // session time spent on hidden tabs in practice, this alone is a
  // significant reduction in Worker request volume against the
  // unread-count endpoint.
  React.useEffect(() => {
    let cancelled = false;
    let id: ReturnType<typeof setInterval> | null = null;
    const fetchN = async () => {
      try {
        const r = await fetch('/api/notifications/unread-count', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        setN(Number(j?.data?.unread_count || 0));
      } catch { /* swallow */ }
    };
    const start = () => { if (id === null) id = setInterval(fetchN, 60_000); };
    const stop  = () => { if (id !== null) { clearInterval(id); id = null; } };
    const onVis = () => {
      if (document.visibilityState === 'visible') { void fetchN(); start(); }
      else { stop(); }
    };
    void fetchN();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return (
    <button
      type="button"
      aria-label={`Notifications${n > 0 ? ` — ${n} unread` : ''}`}
      onClick={() => navigate('/notifications')}
      className="relative w-10 h-10 rounded-md text-white/90 hover:bg-white/10 flex items-center justify-center transition-colors"
    >
      <MIcon name="notifications" size={18} />
      {n > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#f86c52] text-white text-[9px] font-bold flex items-center justify-center"
          style={{ boxShadow: '0 0 0 2px #0f2540' }}
        >
          {n > 99 ? '99+' : n}
        </span>
      )}
    </button>
  );
}

/** SAST wall clock — surfaces the active timezone in the shell bar so a
 *  trader / regulator viewing from outside SA sees that timestamps render
 *  in Africa/Johannesburg, not their local TZ. Ticks every 30s. */
function SastClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);
  // installSastClock() in main.tsx already injects Africa/Johannesburg
  // as the default for toLocaleTimeString. Pass an explicit timeZone
  // here for safety in case this component renders before the patch.
  const t = now.toLocaleTimeString('en-ZA', {
    timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return (
    <div
      role="status"
      aria-label={`Current time in South African Standard Time: ${t}`}
      title="South African Standard Time (UTC+2)"
      className="hidden md:flex items-center gap-1.5 h-10 px-3 text-white/85 text-[12px] font-mono"
    >
      <span aria-hidden="true">🇿🇦</span>
      <span>{t}</span>
      <span className="text-white/45 text-[10px]">SAST</span>
    </div>
  );
}

/** Track whether the viewport is sub-md (Tailwind's md breakpoint = 768px).
 *  When mobile, the side rail is hidden in favour of the hamburger drawer
 *  + the bottom-nav strip, and the canvas reclaims the left padding. */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < breakpoint,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export function FioriShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [userMenu, setUserMenu] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  // Close hamburger on route change / outside click / Escape.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDown(ev: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Close user menu on outside click.
  useEffect(() => {
    if (!userMenu) return undefined;
    function onDown() { setUserMenu(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [userMenu]);

  // Cmd/Ctrl-K → focus search.
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'k') {
        ev.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const nav = useMemo(() => navForRole(user?.role), [user?.role]);
  const sections = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of nav) {
      if (!map.has(item.section)) map.set(item.section, []);
      map.get(item.section)!.push(item);
    }
    return Array.from(map.entries());
  }, [nav]);

  // Active nav item = longest registered prefix matching the current location.
  const activePath = useMemo(() => {
    const candidates = nav
      .map((n) => n.path)
      .filter((p) => location.pathname === p || location.pathname.startsWith(p + '/'))
      .sort((a, b) => b.length - a.length);
    return candidates[0];
  }, [nav, location.pathname]);
  const isActive = (path: string) => path === activePath;

  const currentLabel = nav.find((n) => n.path === activePath)?.label ?? 'Open Energy';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const sidebarWidth = collapsed ? 56 : 256;

  // Submit search → /search?q= (backed by /api/search cross-entity lookup).
  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:text-primary focus:px-3 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none"
        style={{ color: 'var(--oe-primary)' }}
      >
        Skip to main content
      </a>

      {/* ════════════ Shell Bar — Open Energy header ════════════ */}
      <header
        role="banner"
        className="oe-shell fixed top-0 left-0 right-0 z-50 flex items-center px-2 sm:px-4"
        style={{ height: 'var(--shell-height)' }}
      >
        {/* Hamburger / nav menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center justify-center w-10 h-10 rounded-md text-white/90 hover:bg-white/10 transition-colors"
            aria-label="Open navigation menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MIcon name="menu" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Primary navigation"
              className="fixed sm:absolute left-0 top-14 sm:top-12 mt-1 w-[90vw] sm:w-[340px] max-h-[calc(100vh-72px)] overflow-y-auto bg-white rounded-md shadow-xl border z-50"
              style={{ borderColor: 'var(--oe-outline-variant)', boxShadow: '0 12px 32px rgba(25,28,24,0.18)' }}
            >
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--oe-surface-container)' }}>
                <span className="font-headline text-[11px] uppercase tracking-[0.08em] font-bold" style={{ color: 'var(--oe-on-surface-variant)' }}>
                  Navigation
                </span>
                <button
                  type="button"
                  onClick={() => { setCollapsed((v) => !v); setMenuOpen(false); }}
                  className="text-[11px] font-semibold hover:underline"
                  style={{ color: 'var(--oe-primary)' }}
                >
                  {collapsed ? 'Expand rail' : 'Collapse rail'}
                </button>
              </div>
              {sections.length === 0 && (
                <div className="px-4 py-4 text-[13px]" style={{ color: 'var(--oe-on-surface-variant)' }}>
                  Sign in to see navigation.
                </div>
              )}
              {sections.map(([section, items]) => (
                <div key={section} className="py-1">
                  <div className="px-3 py-1.5 font-headline text-[10px] uppercase tracking-[0.08em] font-bold" style={{ color: 'var(--oe-outline)' }}>
                    {section}
                  </div>
                  {items.map((item) => {
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-[13px] transition-colors"
                        style={{
                          background: active ? 'var(--oe-primary-container)' : 'transparent',
                          color: active ? 'var(--oe-on-primary-container)' : 'var(--oe-on-surface)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        <MIcon name={item.icon} size={18} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
              <div className="border-t p-2" style={{ borderColor: 'var(--oe-surface-container)' }}>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] rounded-sm transition-colors"
                  style={{ color: 'var(--oe-error)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--oe-error-container)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <MIcon name="logout" size={16} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Brand mark — actual three-ring OE logomark + wordmark */}
        <Link to="/launch" className="flex items-center gap-2.5 ml-1 mr-4 select-none group" aria-label="Open Energy — Launchpad">
          <div
            className="flex items-center justify-center rounded p-0.5"
            style={{
              background: 'rgba(255,255,255,0.96)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.30), 0 2px 6px rgba(0,0,0,0.18)',
            }}
          >
            <LogoMark size={28} variant="colour" />
          </div>
          <div className="leading-[0.95]">
            <div className="oe-shell-title text-[13px] text-white">OPEN</div>
            <div className="text-[13px] text-white/85 font-display font-extrabold">ENERGY</div>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-2 text-white/70 text-[13px] ml-2">
          <span className="opacity-50">/</span>
          <span className="text-white/95 font-medium">{currentLabel}</span>
        </div>

        {/* Search */}
        <form onSubmit={onSearchSubmit} className="flex-1 flex justify-center px-3" role="search">
          <div className="relative w-full max-w-xl">
            <MIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/65 pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              aria-label="Search across Open Energy"
              placeholder="Search projects, contracts, counterparties, settlements…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-9 pl-10 pr-12 rounded-md bg-white/12 text-white placeholder-white/55 text-[13px] border border-white/15 focus:outline-none focus:bg-white/18 focus:border-white/35 transition-colors font-body"
            />
            <kbd className="hidden sm:inline absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/55 border border-white/20 rounded px-1.5 py-[1px] font-mono">
              ⌘K
            </kbd>
          </div>
        </form>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          <SastClock />
          <button
            type="button"
            aria-label="Schedule"
            onClick={() => navigate('/schedule')}
            className="w-10 h-10 rounded-md text-white/90 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <MIcon name="event" size={18} />
          </button>
          <NotificationsBell />
          <button
            type="button"
            aria-label="Help"
            onClick={() => navigate('/support')}
            className="w-10 h-10 rounded-md text-white/90 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <MIcon name="help_outline" size={18} />
          </button>

          {/* User menu */}
          <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setUserMenu((v) => !v)}
              aria-label="User menu"
              aria-haspopup="menu"
              aria-expanded={userMenu}
              className="flex items-center gap-2 ml-1 pl-1 pr-2 h-10 rounded-md hover:bg-white/10 transition-colors"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white font-headline"
                style={{
                  background: 'linear-gradient(135deg,#5fa8e8 0%,#1a5d97 100%)',
                  boxShadow: '0 0 0 2px rgba(255,255,255,0.18)',
                }}
              >
                {initialsOf(user?.name)}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-[12px] text-white font-semibold">
                  {user?.name?.split(' ')[0] ?? 'Guest'}
                </div>
                <div className="text-[10px] text-white/65 capitalize font-mono tracking-wide">
                  {user?.role?.replace(/_/g, ' ') ?? '—'}
                </div>
              </div>
            </button>
            {userMenu && (
              <div
                role="menu"
                aria-label="User menu"
                className="absolute right-0 top-full mt-1 w-64 rounded-md shadow-lg border overflow-hidden bg-white"
                style={{ borderColor: 'var(--oe-outline-variant)' }}
              >
                <div className="p-3 border-b" style={{ borderColor: 'var(--oe-surface-container)' }}>
                  <div className="font-headline text-[14px] font-semibold" style={{ color: 'var(--oe-on-surface)' }}>
                    {user?.name ?? 'Guest'}
                  </div>
                  <div className="text-[12px]" style={{ color: 'var(--oe-on-surface-variant)' }}>
                    {user?.email}
                  </div>
                  <div
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--oe-primary-container)', color: 'var(--oe-on-primary-container)' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--oe-primary)' }} />
                    {user?.role?.replace(/_/g, ' ') ?? '—'}
                  </div>
                </div>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors hover:bg-[var(--oe-surface-container-low)]"
                  style={{ color: 'var(--oe-on-surface)' }}
                  onClick={() => { setUserMenu(false); navigate('/settings'); }}
                >
                  <MIcon name="person" size={16} /> Profile &amp; preferences
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors hover:bg-[var(--oe-surface-container-low)]"
                  style={{ color: 'var(--oe-on-surface)' }}
                  onClick={() => { setUserMenu(false); navigate('/settings/security'); }}
                >
                  <MIcon name="security" size={16} /> Security &amp; MFA
                </button>
                {user?.role === 'admin' && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors hover:bg-[var(--oe-surface-container-low)]"
                    style={{ color: 'var(--oe-on-surface)' }}
                    onClick={() => { setUserMenu(false); navigate('/admin'); }}
                  >
                    <MIcon name="admin_panel_settings" size={16} /> Admin console
                  </button>
                )}
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors border-t"
                  style={{ color: 'var(--oe-error)', borderColor: 'var(--oe-surface-container)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--oe-error-container)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={handleLogout}
                >
                  <MIcon name="logout" size={16} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ════════════ Sidebar rail (desktop ≥ 768px only) ════════════ */}
      <aside
        className={`oe-rail fiori-rail hidden md:flex fixed left-0 bottom-0 overflow-y-auto flex-col ${collapsed ? 'collapsed' : ''}`}
        style={{
          top: 'var(--shell-height)',
          width: sidebarWidth,
          transition: 'width 200ms cubic-bezier(0.4,0,0.2,1)',
          zIndex: 40,
        }}
      >
        <nav className="flex-1 py-3" aria-label="Primary">
          {sections.length === 0 && !collapsed && (
            <div className="px-4 py-3 text-[12px]" style={{ color: 'var(--oe-on-surface-variant)' }}>
              Loading navigation…
            </div>
          )}
          {sections.map(([section, items]) => (
            <div key={section} className="mb-2">
              {!collapsed && (
                <div className="oe-rail-section">{section}</div>
              )}
              {collapsed && (
                <div className="mx-3 my-1 h-px" style={{ background: 'var(--oe-surface-container)' }} />
              )}
              {items.map((item) => {
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`oe-rail-item fiori-rail-item ${isActive(item.path) ? 'active' : ''}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <MIcon name={item.icon} size={18} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: 'var(--oe-surface-container)' }}>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-full flex items-center gap-2 h-9 px-2 rounded-md text-[12px] transition-colors hover:bg-[var(--oe-surface-container-low)]"
            style={{ color: 'var(--oe-on-surface-variant)' }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <MIcon name={collapsed ? 'chevron_right' : 'chevron_left'} size={16} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ════════════ Canvas ════════════ */}
      <main
        id="main-content"
        tabIndex={-1}
        className="oe-canvas-ambient fiori-canvas-ambient min-h-screen"
        style={{
          paddingTop: 'var(--shell-height)',
          // On mobile the side rail is hidden, so the canvas gets full width.
          // A bottom nav adds 64px of safe padding for mobile-only.
          paddingLeft: isMobile ? 0 : sidebarWidth,
          paddingBottom: isMobile ? 'calc(64px + env(safe-area-inset-bottom))' : 0,
          transition: 'padding-left 200ms cubic-bezier(0.4,0,0.2,1)',
          ['--sidebar-width' as any]: isMobile ? '0px' : `${sidebarWidth}px`,
        }}
      >
        <div className="mx-auto max-w-[1440px] px-3 sm:px-6 lg:px-8 py-4 sm:py-6 fade-in">
          {children}
        </div>
      </main>

      {/* ════════════ Mobile bottom nav (sub-md only) ════════════ */}
      <MobileBottomNav nav={nav} isActive={isActive} />

      {/* ════════════ Partner brand — LTM Energy Group, bottom-right ════════════ */}
      <LtmLogo />
    </div>
  );
}

/**
 * Sub-md bottom navigation — five most-used destinations per role plus a
 * "More" button that opens the same hamburger drawer the header uses.
 *
 * Mirrors the desktop rail's role gating: takes the first 4 nav entries
 * from the role-scoped list and pins them; a "More" tile opens the menu.
 * The bar respects `env(safe-area-inset-bottom)` for iOS Home indicator.
 */
function MobileBottomNav({
  nav,
  isActive,
}: {
  nav: NavItem[];
  isActive: (path: string) => boolean;
}) {
  // First 4 of the role-scoped nav, but always include /cockpit if present.
  const top4 = (() => {
    const cockpit = nav.find((n) => n.path === '/launch');
    const others = nav.filter((n) => n.path !== '/launch').slice(0, cockpit ? 3 : 4);
    return cockpit ? [cockpit, ...others] : others;
  })();
  if (top4.length === 0) return null;

  return (
    <nav
      className="md:hidden fixed left-0 right-0 bottom-0 bg-white border-t flex items-stretch justify-around"
      style={{
        borderColor: 'var(--oe-outline-variant)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 45,
        boxShadow: '0 -2px 8px rgba(15,28,46,0.08)',
      }}
      role="navigation"
      aria-label="Primary mobile navigation"
    >
      {top4.map((item) => {
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors"
            style={{
              color: active ? 'var(--oe-primary)' : 'var(--oe-on-surface-variant)',
              background: active ? 'var(--oe-primary-container)' : 'transparent',
            }}
          >
            <MIcon name={item.icon} size={20} filled={active} />
            <span className="text-[10px] font-semibold truncate max-w-full px-1">{item.label}</span>
          </Link>
        );
      })}
      <MoreButton />
    </nav>
  );
}

function MoreButton() {
  // Re-fire a click on the header hamburger so we don't duplicate the menu
  // logic. Falls back to navigating to /support if the hamburger isn't
  // present (e.g. partially rendered SSR shell).
  function openMenu() {
    const btn = document.querySelector<HTMLButtonElement>('[aria-label="Open navigation menu"]');
    if (btn) { btn.click(); return; }
  }
  return (
    <button
      onClick={openMenu}
      type="button"
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5"
      style={{ color: 'var(--oe-on-surface-variant)' }}
      aria-label="More navigation"
    >
      <MIcon name="menu" size={20} />
      <span className="text-[10px] font-semibold">More</span>
    </button>
  );
}

export default FioriShell;
