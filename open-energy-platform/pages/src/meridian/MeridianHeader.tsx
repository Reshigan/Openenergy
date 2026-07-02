// pages/src/meridian/MeridianHeader.tsx — Shared Meridian header strip.
// Markup matches meridian.css `header` (wordmark · ctx slot · spacer · quicklinks · clock · ⌘K · avatar).
// Extracted from HorizonPage so Ledger, Thread, and future surfaces share the same chrome.
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useTourState } from './useTourState';
import { api } from '../lib/api';

// Re-export so existing './MeridianHeader' importers keep resolving the symbol.
// The pure definition lives in ./quicklinks (no React) for server-side unit tests.
export { quicklinkVisible } from './quicklinks';

export function MeridianHeader({ ctx }: { ctx?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const role = user?.role ?? '';
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [helpBusy, setHelpBusy] = React.useState(false);
  const { resetTours } = useTourState();
  const now = new Date();
  const clock = `${now.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })} · ${now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })} SAST`;
  const initials = (user?.name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';

  // Close either menu on Escape so keyboard users aren't trapped.
  React.useEffect(() => {
    if (!menuOpen && !helpOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); setHelpOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, helpOpen]);

  // ── Help actions — the "reset the onboarding help" affordances ─────────────
  function replayTips() {
    setHelpOpen(false);
    resetTours();
    nav('/cockpit');
  }
  function reopenGettingStarted() {
    setHelpOpen(false);
    try { localStorage.removeItem(`oe_gs_dismissed_${user?.id ?? ''}`); } catch { /* non-fatal */ }
    nav('/cockpit?welcome=1');
  }
  async function restartSetup() {
    if (helpBusy) return;
    setHelpBusy(true);
    try {
      await api.post('/onboarding/reset', {});
      setHelpOpen(false);
      nav('/onboard');
    } catch {
      // Non-fatal — leave the menu open so the user can retry.
    } finally {
      setHelpBusy(false);
    }
  }

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
      <Link to="/cockpit" className="wordmark">CEC</Link>
      {ctx && <div className="ctx">{ctx}</div>}
      <div className="spacer" />
      {/* Platform-section quicklinks (Deals/ESG/Reports/…) retired — the journey
          cockpit's tabs are the navigation now. QUICKLINKS data is kept (journeys.ts
          derives the cross-cutting journeys from it); it's just no longer rendered here. */}
      <div className="clock mono">{clock}</div>
      {/* Both open the one command surface (the global ⌘K palette) — no separate
         /new or /atlas plane. Create otherwise happens in-journey on the cockpit. */}
      <button type="button" className="kbd-hint" title="Search or jump (⌘K)"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
        Search anything <kbd>⌘K</kbd>
      </button>
      {/* Help menu — replay tips, reopen getting-started, restart setup. This is
          the standing home of the onboarding help after the first run. */}
      <div className="avatar-wrap">
        <button type="button" className="help-btn" aria-haspopup="menu" aria-expanded={helpOpen}
                aria-label="Help menu" title="Help & onboarding" onClick={() => { setHelpOpen(o => !o); setMenuOpen(false); }}>
          ?
        </button>
        {helpOpen && (
          <>
            <div className="avatar-backdrop" onClick={() => setHelpOpen(false)} aria-hidden="true" />
            <div className="avatar-menu" role="menu" aria-label="Help">
              <div className="avatar-id">
                <b>Help &amp; onboarding</b>
                <span>Tips replay as you visit each page</span>
              </div>
              <button type="button" role="menuitem" className="avatar-item" onClick={replayTips}>
                Replay page tips
              </button>
              <button type="button" role="menuitem" className="avatar-item" onClick={reopenGettingStarted}>
                Getting-started checklist
              </button>
              <button type="button" role="menuitem" className="avatar-item" onClick={restartSetup} disabled={helpBusy}>
                {helpBusy ? 'Restarting…' : 'Restart workspace setup'}
              </button>
            </div>
          </>
        )}
      </div>
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
                      onClick={() => { setMenuOpen(false); nav('/cockpit'); }}>Home</button>
              <button type="button" role="menuitem" className="avatar-item danger"
                      onClick={signOut}>Sign out</button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
