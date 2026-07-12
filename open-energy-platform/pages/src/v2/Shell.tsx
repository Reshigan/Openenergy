// ═══════════════════════════════════════════════════════════════════════════
// Shell — the one chrome wrapping all four v2 surfaces. Topbar + nav + the
// global ⌘K command palette (Find-as-palette). data-role on the wrapper drives
// the single --accent token; components never name a role.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import {
  getChains,
  listTxns,
  unreadCount,
  listNotifications,
  markNotifRead,
  notifTxnId,
  type NotifRow,
} from './api';
import { tsToSAST, type ChainMap, type TxnRow } from './decl';
import { roleStarts, hasTrade, type JourneyStart } from './starts';
import './tokens.css';

type NavItem = { to: string; label: string; end?: boolean };
const NAV_HOME: NavItem = { to: '/v2', label: 'Home', end: true };
const NAV_FIND: NavItem = { to: '/v2/find', label: 'Find' };
const NAV_TRADE: NavItem = { to: '/v2/trade', label: 'Trade' };

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chains, setChains] = useState<ChainMap>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { getChains().then(setChains); }, []);

  const role = user?.role ?? 'admin';

  // Trade only shows once we know the role actually trades; omitted while loading.
  const navItems = useMemo(() => {
    const items = [NAV_HOME, NAV_FIND];
    if (hasTrade(chains, role)) items.push(NAV_TRADE);
    return items;
  }, [chains, role]);

  return (
    <div className="v2" data-role={role}>
      <header className="v2-topbar">
        <div className="v2-brand">Open<span>Energy</span></div>
        <nav className="v2-nav">
          {navItems.map((n) => {
            const active = n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} aria-current={active ? 'page' : undefined}>{n.label}</Link>
            );
          })}
        </nav>
        <div className="v2-spacer" />
        <button className="v2-btn v2-btn-ghost" onClick={() => setPaletteOpen(true)}>
          Search <span className="v2-kbd">⌘K</span>
        </button>
        <Bell />
        <div className="v2-account">
          <button
            className="v2-who"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <b>{user?.name ?? '—'}</b>
            <span className="v2-role-chip">{role}</span>
          </button>
          {menuOpen && (
            <>
              <div className="v2-menu-scrim" onClick={() => setMenuOpen(false)} />
              <div className="v2-menu" role="menu">
                <button role="menuitem" onClick={() => { setMenuOpen(false); nav('/settings'); }}>Settings</button>
                <button role="menuitem" onClick={() => { setMenuOpen(false); nav('/kyc'); }}>KYC &amp; verification</button>
                <div className="v2-menu-sep" />
                <button role="menuitem" className="danger" onClick={() => { logout(); nav('/login', { replace: true }); }}>Log out</button>
              </div>
            </>
          )}
        </div>
      </header>
      <main className="v2-main">{children}</main>
      {paletteOpen && <Palette role={role} chains={chains} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

// ── full-surface load-failure state with a retry ─────────────────────────────
export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="v2-empty">
      <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 'var(--sp-2)' }}>
        Couldn’t load {what}.
      </div>
      <div style={{ marginBottom: 'var(--sp-4)' }}>The connection dropped or the service is busy.</div>
      <button className="v2-btn" onClick={onRetry}>Try again</button>
    </div>
  );
}

// ── notifications bell: unread badge + click-to-open popover ─────────────────
function Bell() {
  const nav = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotifRow[]>([]);

  // Poll the unread count on mount and every 60s; clean the interval up.
  useEffect(() => {
    let alive = true;
    const tick = () => unreadCount().then((c) => { if (alive) setCount(c); });
    tick();
    const h = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(h); };
  }, []);

  const openPopover = () => {
    setOpen(true);
    listNotifications(20).then(setRows);
  };

  const pick = (n: NotifRow) => {
    markNotifRead(n.id); // fire and forget
    setCount((c) => Math.max(0, c - 1));
    setOpen(false);
    const id = notifTxnId(n);
    if (id) nav('/v2/t/' + id);
  };

  return (
    <div className="v2-bell">
      <button
        className="v2-bell-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Notifications"
        onClick={() => (open ? setOpen(false) : openPopover())}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && <span className="v2-bell-dot" />}
      </button>
      {open && (
        <>
          <div className="v2-menu-scrim" onClick={() => setOpen(false)} />
          <div className="v2-notif" role="menu">
            {rows.length === 0 && <div className="v2-notif-empty">You're all caught up.</div>}
            {rows.map((n) => (
              <button key={n.id} className="v2-notif-item" role="menuitem" onClick={() => pick(n)}>
                <div className="t">{n.title}</div>
                {n.body && <div className="m">{n.body}</div>}
                <div className="w">{tsToSAST(n.created_at)}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── ⌘K palette: objects (txns) + "Start something" (the role's real journey) ──
function Palette({ role, chains, onClose }: { role: string; chains: ChainMap; onClose: () => void }) {
  const nav = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    const h = setTimeout(() => { listTxns({ q: q || undefined, limit: 8 }).then(setRows); }, 140);
    return () => clearTimeout(h);
  }, [q]);

  // Start-something = the role's own journey starts (already correctly scoped by
  // roleStarts — no per-role gating here). Empty query seeds the first few.
  const starts = useMemo(() => {
    const all = roleStarts(chains, role);
    if (!q) return all.slice(0, 8);
    const needle = q.toLowerCase();
    return all
      .filter((s) => `${s.label} ${s.chain.noun} ${s.chainKey}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [chains, q, role]);

  const flat = useMemo(
    () => [
      ...rows.map((r) => ({ kind: 'txn' as const, r })),
      ...starts.map((s) => ({ kind: 'start' as const, s })),
    ],
    [rows, starts],
  );

  const go = (i: number) => {
    const item = flat[i];
    if (!item) return;
    if (item.kind === 'txn') { nav(`/v2/t/${item.r.id}`); onClose(); }
    else { nav(`/v2/find?start=${item.s.chainKey}:${item.s.edge.id}`); onClose(); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(active); }
    else if (e.key === 'Escape') { onClose(); }
  };

  return (
    <dialog ref={ref} className="v2-dialog" onClose={onClose} onKeyDown={onKey}>
      <div className="v2-palette">
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          placeholder="Find a transaction, or start something…"
        />
        <div className="v2-results">
          {rows.length > 0 && <div className="v2-group-label">Transactions</div>}
          {rows.map((r, i) => (
            <div key={r.id} className={`v2-result ${active === i ? 'active' : ''}`} onClick={() => go(i)}>
              <span className="ref">{r.human_ref}</span>
              <span className="grow">{r.title}</span>
              <span className="ref">{r.state}</span>
            </div>
          ))}
          {starts.length > 0 && <div className="v2-group-label">Start something</div>}
          {starts.map((s: JourneyStart, j) => {
            const i = rows.length + j;
            return (
              <div
                key={`${s.chainKey}:${s.edge.id}`}
                className={`v2-result ${active === i ? 'active' : ''}`}
                onClick={() => go(i)}
              >
                <span className="start">＋</span>
                <span className="grow">{s.label} <span className="ref">{s.chain.noun}</span></span>
              </div>
            );
          })}
          {flat.length === 0 && <div className="v2-empty">Nothing matches “{q}”.</div>}
        </div>
      </div>
    </dialog>
  );
}
