// pages/src/meridian/MeridianHeader.tsx — Shared Meridian header strip.
// Markup matches meridian.css `header` (wordmark · ctx slot · spacer · quicklinks · clock · ⌘K · avatar).
// Extracted from HorizonPage so Ledger, Thread, and future surfaces share the same chrome.
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';

export function MeridianHeader({ ctx }: { ctx?: React.ReactNode }) {
  const { user } = useAuth();
  const now = new Date();
  const clock = `${now.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })} · ${now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })} SAST`;
  const initials = (user?.name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';
  return (
    <header>
      <div className="wordmark">MERIDIAN</div>
      {ctx && <div className="ctx">{ctx}</div>}
      <div className="spacer" />
      <nav className="quicklinks" aria-label="Platform sections">
        <Link to="/deals">Deals</Link>
        <Link to="/esg">ESG</Link>
        <Link to="/reports">Reports</Link>
        <Link to="/intelligence">Intelligence</Link>
        <Link to="/dashboard">National</Link>
      </nav>
      <div className="clock mono">{clock}</div>
      <Link className="kbd-hint" to="/atlas">Atlas — search anything <kbd>⌘K</kbd></Link>
      <div className="avatar">{initials}</div>
    </header>
  );
}
