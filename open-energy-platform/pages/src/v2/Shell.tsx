// ═══════════════════════════════════════════════════════════════════════════
// Shell — the one chrome wrapping all four v2 surfaces. Topbar + nav + the
// global ⌘K command palette (Find-as-palette). data-role on the wrapper drives
// the single --accent token; components never name a role.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { getChains, listTxns } from './api';
import { newEdges, type ChainMap, type TxnRow, type TransitionDecl } from './decl';
import './tokens.css';

const NAV = [
  { to: '/v2', label: 'Home', end: true },
  { to: '/v2/find', label: 'Find' },
  { to: '/v2/trade', label: 'Trade' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const loc = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  const role = user?.role ?? 'admin';

  return (
    <div className="v2" data-role={role}>
      <header className="v2-topbar">
        <div className="v2-brand">Open<span>Energy</span></div>
        <nav className="v2-nav">
          {NAV.map((n) => {
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
        <div className="v2-who">
          <b>{user?.name ?? '—'}</b>
          <span className="v2-role-chip">{role}</span>
        </div>
      </header>
      <main className="v2-main">{children}</main>
      {paletteOpen && <Palette role={role} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

// ── ⌘K palette: objects (txns) + "Start something" (@new edges) ─────────────
function Palette({ role, onClose }: { role: string; onClose: () => void }) {
  const nav = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState('');
  const [chains, setChains] = useState<ChainMap>({});
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => { getChains().then(setChains); }, []);
  useEffect(() => {
    const h = setTimeout(() => { listTxns({ q: q || undefined, limit: 8 }).then(setRows); }, 140);
    return () => clearTimeout(h);
  }, [q]);

  // Start-something = every @new edge across chains, incl. ones this role can't
  // fire (shown disabled — design §Find: "start something, blocked ones disabled").
  const starts = useMemo(() => {
    const out: { chainKey: string; noun: string; t: TransitionDecl; enabled: boolean }[] = [];
    for (const [key, chain] of Object.entries(chains)) {
      for (const t of newEdges(chain)) {
        const enabled = t.by.includes(role);
        if (!q || `${chain.noun} ${t.label} ${key}`.toLowerCase().includes(q.toLowerCase())) {
          out.push({ chainKey: key, noun: chain.noun, t, enabled });
        }
      }
    }
    return out.sort((a, b) => Number(b.enabled) - Number(a.enabled)).slice(0, 8);
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
    else if (item.s.enabled) { nav(`/v2/find?start=${item.s.chainKey}:${item.s.t.id}`); onClose(); }
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
          {starts.map((s, j) => {
            const i = rows.length + j;
            return (
              <div
                key={`${s.chainKey}:${s.t.id}`}
                className={`v2-result ${s.enabled ? '' : 'blocked'} ${active === i ? 'active' : ''}`}
                onClick={() => go(i)}
              >
                <span className="start">＋</span>
                <span className="grow">{s.t.label} <span className="ref">{s.noun}</span></span>
                {!s.enabled && <span className="blockmsg">not your role</span>}
              </div>
            );
          })}
          {flat.length === 0 && <div className="v2-empty">Nothing matches “{q}”.</div>}
        </div>
      </div>
    </dialog>
  );
}
