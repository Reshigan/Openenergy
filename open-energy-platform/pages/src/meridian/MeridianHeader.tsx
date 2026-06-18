// pages/src/meridian/MeridianHeader.tsx — Shared Meridian header strip.
// Markup matches meridian.css `header` (wordmark · ctx slot · spacer · quicklinks · clock · ⌘K · avatar).
// Extracted from HorizonPage so Ledger, Thread, and future surfaces share the same chrome.
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';

// Header quicklinks. Deals / ESG / Reports are for every signed-in role; the
// last two are oversight surfaces that shouldn't show for an operator role
// (part of the "every role sees everything" complaint). Intelligence is an
// admin analytics console; National (/dashboard) is the regulator/grid/admin
// oversight board.
const QUICKLINKS: { to: string; label: string }[] = [
  { to: '/deals', label: 'Deals' },
  { to: '/esg', label: 'ESG' },
  { to: '/reports', label: 'Reports' },
  { to: '/intelligence', label: 'Intelligence' },
  { to: '/dashboard', label: 'National' },
];
const QUICKLINK_ROLES: Record<string, string[]> = {
  '/intelligence': ['admin'],
  '/dashboard': ['admin', 'regulator', 'grid_operator', 'grid'],
};
// A quicklink with no role restriction is visible to all; a restricted one
// shows only for the listed roles (JWT-suffixed forms, e.g. grid_operator).
export function quicklinkVisible(role: string, to: string): boolean {
  const allowed = QUICKLINK_ROLES[to];
  return !allowed || allowed.includes(role);
}

export function MeridianHeader({ ctx }: { ctx?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const role = user?.role ?? '';
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const now = new Date();
  const clock = `${now.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })} · ${now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })} SAST`;
  const initials = (user?.name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';

  // Close the account menu on Escape so keyboard users aren't trapped.
  React.useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  function signOut() {
    setMenuOpen(false);
    try { logout(); } catch { /* non-fatal — clear local token regardless */ }
    // Belt-and-braces: Playwright suites seed localStorage['token'] directly, so
    // clear it explicitly even though logout()'s setAuthToken(null) also does.
    try { localStorage.removeItem('token'); } catch { /* non-fatal */ }
    nav('/login', { replace: true });
  }

  return (
    <header>
      <Link to="/horizon" className="wordmark">CEC</Link>
      {ctx && <div className="ctx">{ctx}</div>}
      <div className="spacer" />
      <nav className="quicklinks" aria-label="Platform sections">
        {QUICKLINKS.filter(q => quicklinkVisible(role, q.to)).map(q => (
          <Link key={q.to} to={q.to}>{q.label}</Link>
        ))}
      </nav>
      <div className="clock mono">{clock}</div>
      <Link className="head-new" to="/new" title="Start a new transaction">+ New</Link>
      <Link className="kbd-hint" to="/atlas">Atlas — search anything <kbd>⌘K</kbd></Link>
      <div className="avatar-wrap">
        <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={menuOpen}
                aria-label="Account menu" onClick={() => setMenuOpen(o => !o)}>
          {initials}
        </button>
        {menuOpen && (
          <>
            <div className="avatar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div className="avatar-menu" role="menu" aria-label="Account">
              <div className="avatar-id">
                <b>{user?.name ?? 'Signed in'}</b>
                <span>{(user as { email?: string })?.email ?? (user?.role ?? '').replace(/_/g, ' ')}</span>
              </div>
              <button type="button" role="menuitem" className="avatar-item"
                      onClick={() => { setMenuOpen(false); nav('/horizon'); }}>Horizon</button>
              <button type="button" role="menuitem" className="avatar-item danger"
                      onClick={signOut}>Sign out</button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
