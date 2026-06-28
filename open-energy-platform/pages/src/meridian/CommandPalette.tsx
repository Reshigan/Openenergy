// pages/src/meridian/CommandPalette.tsx — global ⌘K palette (mounted once in AppRoutes).
// Markup follows mockups/meridian/03-atlas.html (.veil / .palette / .hit rows);
// styling from meridian.css (scoped under .mer). Searches the role's function index
// (role config domains→features) plus live cases from fetchHorizon — fetched lazily
// on open so closed palettes cost nothing. Renders null when signed out / unknown role.
import React from 'react';
import './meridian.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { useAuth } from '../lib/useAuth';
import { SURFACE_REGISTRY } from './surfaces';
import { tileTarget } from './reachability';
import { fetchHorizon, type MerCase } from './lib';
import { cleanLabel } from './labels';
import { statusLabel } from './ease/statusLabel';

interface Hit { type: 'function' | 'case'; label: string; sub: string; go: () => void }

// Non-Meridian chrome: the standalone UX prototypes (/apex, /ux-prototype/*) run
// their own command surfaces. Mounting the Meridian palette there is the
// "Atlas everywhere" complaint — ⌘K must not hijack keys outside Meridian.
const EXCLUDED_PREFIXES = ['/apex', '/ux-prototype'];
const isExcludedPath = (p: string) => EXCLUDED_PREFIXES.some(x => p === x || p.startsWith(x + '/'));

export default function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const [cases, setCases] = React.useState<MerCase[]>([]);
  const nav = useNavigate();
  const { pathname } = useLocation();
  // Hooks run unconditionally; the !cfg bail-out below handles signed-out states.
  const { user } = useAuth();
  const role = user?.role ?? '';
  const cfg = getRoleConfig(role);
  // Refs so the global key listener (registered once) always sees the latest cfg
  // and path without re-binding each render. ⌘K must not hijack keys for
  // signed-out users, roles with no Meridian config, or non-Meridian chrome
  // (/apex, /ux-prototype/*) — that's the "Atlas everywhere" complaint.
  const cfgRef = React.useRef(cfg);
  cfgRef.current = cfg;
  const excludedRef = React.useRef(false);
  excludedRef.current = isExcludedPath(pathname);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!cfgRef.current || excludedRef.current) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); setQ(''); setSel(0); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  React.useEffect(() => {
    if (!open || !role) return undefined;
    // Liveness guard (HorizonPage idiom): a close or role switch must not let a
    // late resolve repopulate the list with the previous role's cases.
    let live = true;
    fetchHorizon(role).then(h => { if (live) setCases(h.lanes.flatMap(l => l.cases)); }).catch(() => { /* function hits still work */ });
    return () => { live = false; setCases([]); };
  }, [open, role]);
  // Restore focus to whatever had it before ⌘K, so Escape/Enter doesn't drop focus to <body>.
  React.useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, [open]);
  // Keep the keyboard-selected hit visible inside the scrolling .pal-hits.
  React.useEffect(() => {
    if (open) document.querySelector('.mer .pal-hits .hit.sel')?.scrollIntoView({ block: 'nearest' });
  }, [open, sel]);

  if (!open || !cfg || isExcludedPath(pathname)) return null;
  const ql = q.toLowerCase();
  // Same destination contract + reachability predicate as AtlasPage: chain → Ledger,
  // standalone page → its route, else per-role Meridian surface. A function with no
  // resolvable destination (never-built prototype tile) is omitted from the palette.
  const hasSurface = (key: string) => !!SURFACE_REGISTRY[key];
  const targetFor = (f: { chainKey?: string; route?: string; key: string }) =>
    tileTarget(role, f, hasSurface);
  const hits: Hit[] = [
    ...cfg.domains.flatMap(d => d.features
      .filter(f => cleanLabel(f.label).toLowerCase().includes(ql))
      .map(f => ({ f, to: targetFor(f) }))
      .filter((x): x is { f: typeof x.f; to: string } => x.to !== null)
      .map(({ f, to }) => ({ type: 'function' as const, label: cleanLabel(f.label), sub: cleanLabel(d.label),
        go: () => nav(to) }))),
    ...cases
      .filter(c => `${c.ref} ${c.title} ${c.counterparty ?? ''}`.toLowerCase().includes(ql))
      .map(c => ({ type: 'case' as const, label: `${c.ref} · ${c.title}`,
        sub: statusLabel(c.status).text, go: () => nav(`/thread/${c.chain}/${c.id}`) })),
  ].slice(0, 12);

  return (
    <div className="mer veil" onClick={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={e => e.stopPropagation()}>
        <input autoFocus value={q} placeholder="functions · cases…" aria-label="Search functions and cases"
               role="combobox" aria-expanded="true" aria-controls="pal-hits" aria-autocomplete="list"
               aria-activedescendant={hits[sel] ? `pal-hit-${sel}` : undefined}
               onChange={e => { setQ(e.target.value); setSel(0); }}
               onKeyDown={e => {
                 if (e.key === 'ArrowDown') setSel(s => Math.max(0, Math.min(s + 1, hits.length - 1)));
                 if (e.key === 'ArrowUp') setSel(s => Math.max(s - 1, 0));
                 if (e.key === 'Enter' && hits[sel]) { hits[sel].go(); setOpen(false); }
               }} />
        <div className="pal-hits" role="listbox" id="pal-hits" aria-label="Results">
          {hits.map((hit, i) => (
            <button key={i} type="button" id={`pal-hit-${i}`} role="option" aria-selected={i === sel}
                    className={`hit ${i === sel ? 'sel' : ''}`}
                    onMouseEnter={() => setSel(i)} onClick={() => { hit.go(); setOpen(false); }}>
              <span className={`type ${hit.type === 'function' ? 'fn' : 'case'}`}>{hit.type.toUpperCase()}</span>
              <b>{hit.label}</b><span className="sub">{hit.sub}</span>
            </button>
          ))}
          {hits.length === 0 && <div className="pal-empty">No matches.</div>}
        </div>
      </div>
    </div>
  );
}
