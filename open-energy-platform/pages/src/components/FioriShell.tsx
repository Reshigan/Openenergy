import React, { useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, TrendingUp, CircleDollarSign, Leaf, Building2,
  BarChart3, Zap, PiggyBank, GitBranch, ShoppingCart, Store, Settings,
  Search, Bell, HelpCircle, LogOut, User, ChevronLeft, ChevronRight, Sparkles,
  Menu, Wrench, FileBarChart, Activity, ShieldCheck, Sun, LifeBuoy, Gauge,
} from 'lucide-react';
import { useAuth } from '../lib/useAuth';

type NavItem = {
  path: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  section: string;
  badge?: string;
};

const BASE_NAV: NavItem[] = [
  { path: '/cockpit',     label: 'Launchpad',    icon: LayoutDashboard, section: 'Home' },
  { path: '/contracts',   label: 'Contracts',    icon: FileText,        section: 'Commerce' },
  { path: '/trading',     label: 'Trading',      icon: TrendingUp,      section: 'Commerce' },
  { path: '/settlement',  label: 'Settlement',   icon: CircleDollarSign, section: 'Commerce' },
  { path: '/procurement', label: 'Procurement',  icon: ShoppingCart,    section: 'Commerce' },
  { path: '/marketplace', label: 'Marketplace',  icon: Store,           section: 'Commerce' },
  { path: '/projects',    label: 'IPP Projects', icon: Building2,       section: 'Operations' },
  { path: '/pipeline',    label: 'Pipeline',     icon: GitBranch,       section: 'Operations' },
  { path: '/grid',        label: 'Grid',         icon: Zap,             section: 'Operations' },
  { path: '/om',          label: 'O&M',          icon: Wrench,          section: 'Operations' },
  { path: '/carbon',      label: 'Carbon',       icon: Leaf,            section: 'Sustainability' },
  { path: '/esg',         label: 'ESG',          icon: BarChart3,       section: 'Sustainability' },
  { path: '/funds',       label: 'Funds',        icon: PiggyBank,       section: 'Finance' },
  { path: '/intelligence', label: 'Intelligence', icon: Activity,       section: 'Insights' },
  { path: '/briefing',    label: 'Briefing',     icon: Sun,             section: 'Insights' },
  { path: '/reports',     label: 'Reports',      icon: FileBarChart,    section: 'Insights' },
  { path: '/popia',       label: 'POPIA',        icon: ShieldCheck,     section: 'Compliance' },
  { path: '/admin',       label: 'Admin',        icon: Settings,        section: 'System' },
  { path: '/support',     label: 'Support',      icon: LifeBuoy,        section: 'System' },
  { path: '/admin/monitoring', label: 'Monitoring', icon: Gauge,       section: 'System' },
];

function navForRole(role: string | undefined): NavItem[] {
  // /admin is admin-only; /support is admin + support only. Everyone else
  // gets a curated list without either. POPIA is visible to every role
  // because every user has personal data rights.
  const nonSystem = BASE_NAV.filter(
    (n) => n.path !== '/admin' && n.path !== '/support' && n.path !== '/admin/monitoring',
  );
  if (!role) return nonSystem;
  switch (role) {
    case 'admin':
      return BASE_NAV;
    case 'support':
      // Support staff see a narrow console: their /support page, the action
      // queues and audit surfaces, the shared /admin/monitoring dashboard,
      // and read-only Intelligence/Briefing so they can see what the user is
      // seeing when triaging tickets.
      return BASE_NAV.filter((n) =>
        ['/cockpit', '/support', '/admin/monitoring', '/intelligence', '/briefing', '/popia'].includes(n.path),
      );
    case 'trader':
      return BASE_NAV.filter((n) =>
        ['/cockpit', '/trading', '/settlement', '/contracts', '/marketplace', '/intelligence', '/reports', '/popia', '/briefing'].includes(n.path),
      );
    case 'ipp_developer':
      return BASE_NAV.filter((n) =>
        ['/cockpit', '/projects', '/contracts', '/settlement', '/grid', '/om', '/marketplace', '/esg', '/intelligence', '/reports', '/popia', '/briefing'].includes(
          n.path,
        ),
      );
    case 'carbon_fund':
      return BASE_NAV.filter((n) =>
        ['/cockpit', '/carbon', '/marketplace', '/funds', '/pipeline', '/esg', '/intelligence', '/reports', '/popia', '/briefing'].includes(n.path),
      );
    case 'offtaker':
      return BASE_NAV.filter((n) =>
        ['/cockpit', '/contracts', '/procurement', '/marketplace', '/settlement', '/esg', '/intelligence', '/reports', '/popia', '/briefing'].includes(
          n.path,
        ),
      );
    case 'lender':
      return BASE_NAV.filter((n) =>
        ['/cockpit', '/projects', '/pipeline', '/funds', '/settlement', '/om', '/intelligence', '/reports', '/popia', '/briefing'].includes(n.path),
      );
    case 'grid_operator':
      return BASE_NAV.filter((n) => ['/cockpit', '/grid', '/settlement', '/intelligence', '/reports', '/popia', '/briefing'].includes(n.path));
    case 'regulator':
      // Regulators see the marketplace, ESG, intelligence feed, POPIA and the compliance dashboard — not the admin console.
      return BASE_NAV.filter((n) =>
        ['/cockpit', '/marketplace', '/esg', '/intelligence', '/reports', '/popia', '/briefing'].includes(n.path),
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

export function FioriShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [userMenu, setUserMenu] = useState(false);
  // menuOpen drives the hamburger dropdown (full nav list grouped by section).
  // It exists in addition to `collapsed` so the hamburger works on any
  // viewport — even when the rail is already collapsed to icons.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the hamburger dropdown on route change or outside click—without
  // this it stays open after selecting an item.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
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

  const nav = useMemo(() => navForRole(user?.role), [user?.role]);
  const sections = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of nav) {
      if (!map.has(item.section)) map.set(item.section, []);
      map.get(item.section)!.push(item);
    }
    return Array.from(map.entries());
  }, [nav]);

  // Match exact path or a sub-path — but only pick the single most specific
  // nav entry so /admin/monitoring highlights Monitoring (not both Monitoring
  // and Admin). A path counts as active for nav item `p` iff `p` is the
  // longest registered nav prefix of the current location.
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

  return (
    <div className="min-h-screen" style={{ background: '#f5f6f7' }}>
      {/* Shell Bar */}
      <header
        className="fiori-shell fixed top-0 left-0 right-0 z-50 flex items-center h-11 px-2 sm:px-4"
      >
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center justify-center w-9 h-9 rounded-md text-white/90 hover:bg-white/10 transition-colors"
            aria-label="Open navigation menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <Menu size={18} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Primary navigation"
              className="fixed sm:absolute left-0 sm:left-0 top-11 sm:top-11 mt-1 w-[90vw] sm:w-[320px] max-h-[calc(100vh-56px)] overflow-y-auto bg-white rounded-md shadow-xl border border-[#e5e7eb] z-50"
              style={{ boxShadow: '0 12px 32px rgba(15,23,42,0.18)' }}
            >
              <div className="px-3 py-2 border-b border-[#f0f1f2] flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.08em] text-[#64748b] font-semibold">
                  Navigation
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCollapsed((v) => !v);
                    setMenuOpen(false);
                  }}
                  className="text-[11px] text-[#0a6ed1] hover:underline"
                >
                  {collapsed ? 'Expand rail' : 'Collapse rail'}
                </button>
              </div>
              {sections.length === 0 && (
                <div className="px-4 py-4 text-[13px] text-[#64748b]">
                  Sign in to see navigation.
                </div>
              )}
              {sections.map(([section, items]) => (
                <div key={section} className="py-1">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[#89919a] font-semibold">
                    {section}
                  </div>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-2 px-3 py-2 text-[13px] ${
                          active
                            ? 'bg-[#eff6ff] text-[#0a6ed1] font-semibold'
                            : 'text-[#32363a] hover:bg-[#f5f6f7]'
                        }`}
                      >
                        <Icon size={15} className="shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
              <div className="border-t border-[#f0f1f2] p-2">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#b91c1c] hover:bg-[#fef2f2] rounded-sm"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-1 mr-4 select-none">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg,#0a6ed1 0%,#5d36ff 100%)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.2), 0 2px 6px rgba(10,110,209,0.5)',
            }}
          >
            <Sparkles size={15} className="text-white" />
          </div>
          <div className="leading-tight">
            <div className="fiori-shell-title text-[13px] text-white">Open Energy</div>
            <div className="text-[10px] text-white/60 -mt-0.5 tracking-widest uppercase">
              Exchange
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-white/70 text-[13px] ml-2">
          <span className="opacity-60">/</span>
          <span className="text-white/90 font-medium">{currentLabel}</span>
        </div>

        <div className="flex-1 flex justify-center px-3">
          <div className="relative w-full max-w-md">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search across Open Energy …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-3 rounded-md bg-white/10 text-white placeholder-white/50 text-[13px] border border-white/10 focus:outline-none focus:bg-white/15 focus:border-white/30 transition-colors"
            />
            <kbd className="hidden sm:inline absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/50 border border-white/15 rounded px-1.5 py-[1px]">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button className="relative w-9 h-9 rounded-md text-white/85 hover:bg-white/10 flex items-center justify-center transition-colors">
            <Bell size={16} />
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
              style={{ background: '#ff9800', boxShadow: '0 0 0 2px #354a5f' }}
            />
          </button>
          <button className="w-9 h-9 rounded-md text-white/85 hover:bg-white/10 flex items-center justify-center transition-colors">
            <HelpCircle size={16} />
          </button>
          <div className="relative">
            <button
              onClick={() => setUserMenu((v) => !v)}
              className="flex items-center gap-2 ml-1 pl-1 pr-2 h-9 rounded-md hover:bg-white/10 transition-colors"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg,#ab218e 0%,#e9730c 100%)',
                  boxShadow: '0 0 0 2px rgba(255,255,255,0.15)',
                }}
              >
                {initialsOf(user?.name)}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-[12px] text-white font-semibold">
                  {user?.name?.split(' ')[0] ?? 'Guest'}
                </div>
                <div className="text-[10px] text-white/60 capitalize">
                  {user?.role?.replace(/_/g, ' ') ?? '—'}
                </div>
              </div>
            </button>
            {userMenu && (
              <div
                className="absolute right-0 top-full mt-1 w-60 rounded-lg shadow-lg border overflow-hidden"
                style={{ background: '#ffffff', borderColor: '#e5e5e5' }}
                onMouseLeave={() => setUserMenu(false)}
              >
                <div className="p-3 border-b" style={{ borderColor: '#f0f1f2' }}>
                  <div className="text-[13px] font-semibold" style={{ color: '#32363a' }}>
                    {user?.name ?? 'Guest'}
                  </div>
                  <div className="text-[11px]" style={{ color: '#6a6d70' }}>
                    {user?.email}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: '#efeafe', color: '#5d36ff' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#5d36ff' }} />
                    {user?.role?.replace(/_/g, ' ') ?? '—'}
                  </div>
                </div>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-[#fafafa] transition-colors"
                  style={{ color: '#32363a' }}
                  onClick={() => navigate('/cockpit')}
                >
                  <User size={14} /> My profile
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-[#fafafa] transition-colors"
                  style={{ color: '#32363a' }}
                  onClick={() => navigate('/settings/security')}
                >
                  <ShieldCheck size={14} /> Security &amp; MFA
                </button>
                {user?.role === 'admin' && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-[#fafafa] transition-colors"
                    style={{ color: '#32363a' }}
                    onClick={() => navigate('/admin')}
                  >
                    <Settings size={14} /> Settings
                  </button>
                )}
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-[#ffebeb] transition-colors border-t"
                  style={{ color: '#bb0000', borderColor: '#f0f1f2' }}
                  onClick={handleLogout}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fiori-rail fixed left-0 bottom-0 overflow-y-auto flex flex-col ${collapsed ? 'collapsed' : ''}`}
        style={{
          top: 44,
          width: sidebarWidth,
          transition: 'width 200ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <nav className="flex-1 py-3">
          {sections.length === 0 && !collapsed && (
            <div className="px-4 py-3 text-[12px]" style={{ color: '#89919a' }}>
              Loading navigation…
            </div>
          )}
          {sections.map(([section, items]) => (
            <div key={section} className="mb-2">
              {!collapsed && (
                <div className="fiori-rail-section">{section}</div>
              )}
              {collapsed && (
                <div className="mx-3 my-1 h-px" style={{ background: '#f0f1f2' }} />
              )}
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`fiori-rail-item ${isActive(item.path) ? 'active' : ''}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={16} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: '#f0f1f2' }}>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-full flex items-center gap-2 h-8 px-2 rounded-md text-[12px] hover:bg-[#eff1f2] transition-colors"
            style={{ color: '#6a6d70' }}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Canvas */}
      <main
        className="fiori-canvas-ambient min-h-screen"
        style={{
          paddingTop: 44,
          paddingLeft: sidebarWidth,
          transition: 'padding-left 200ms cubic-bezier(0.4,0,0.2,1)',
          ['--sidebar-width' as any]: `${sidebarWidth}px`,
        }}
      >
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 fade-in">{children}</div>
      </main>
    </div>
  );
}

export default FioriShell;
