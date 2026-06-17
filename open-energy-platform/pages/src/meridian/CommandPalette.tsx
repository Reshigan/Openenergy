// pages/src/meridian/CommandPalette.tsx — global ⌘K palette (mounted once in AppRoutes).
// Markup follows mockups/meridian/03-atlas.html (.veil / .palette / .hit rows);
// styling from meridian.css (scoped under .mer). Searches the role's function index
// (role config domains→features) plus live cases from fetchHorizon — fetched lazily
// on open so closed palettes cost nothing. Renders null when signed out / unknown role.
import React from 'react';
import './meridian.css';
import { useNavigate } from 'react-router-dom';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { useAuth } from '../lib/useAuth';
import { SURFACE_REGISTRY } from './surfaces';
import { fetchHorizon, type MerCase } from './lib';
import { cleanLabel } from './labels';

interface Hit { type: 'function' | 'case'; label: string; sub: string; go: () => void }

// esums_owner shares ESCO's surfaces; the registry only carries `esco:*` keys.
const surfaceRole = (r: string) => (r === 'esums_owner' ? 'esco' : r);

export default function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const [cases, setCases] = React.useState<MerCase[]>([]);
  const nav = useNavigate();
  // Hooks run unconditionally; the !cfg bail-out below handles signed-out states.
  const { user } = useAuth();
  const role = user?.role ?? '';
  const cfg = getRoleConfig(role);
  // Ref so the global key listener (registered once) always sees the latest cfg
  // without re-binding each render. ⌘K must not hijack keys for signed-out users
  // or roles with no Meridian config — that's the "Atlas everywhere" complaint.
  const cfgRef = React.useRef(cfg);
  cfgRef.current = cfg;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!cfgRef.current) return;
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

  if (!open || !cfg) return null;
  const ql = q.toLowerCase();
  // Same destination contract + reachability predicate as AtlasPage: chain → Ledger,
  // standalone page → its route, else per-role Meridian surface. A function with no
  // resolvable destination (never-built prototype tile) is omitted from the palette.
  const surfaceFor = (key: string) => SURFACE_REGISTRY[`${surfaceRole(role)}:${key}`];
  const targetFor = (f: { chainKey?: string; route?: string; key: string }) =>
    f.chainKey ? `/ledger/${f.chainKey}` : f.route ? f.route : surfaceFor(f.key) ? `/surface/${f.key}` : null;
  const hits: Hit[] = [
    ...cfg.domains.flatMap(d => d.features
      .filter(f => cleanLabel(f.label).toLowerCase().includes(ql))
      .map(f => ({ f, to: targetFor(f) }))
      .filter((x): x is { f: typeof x.f; to: string } => x.to !== null)
      .map(({ f, to }) => ({ type: 'function' as const, label: cleanLabel(f.label), sub: cleanLabel(d.label),
        go: () => nav(to) }))),
    ...cases
      .filter(c => `${c.ref} ${c.title} ${c.counterparty ?? ''}`.toLowerCase().includes(ql))
      .map(c => ({ type: 'case' as const, label: `${c.ref} — ${c.title}`,
        sub: c.status.replace(/_/g, ' '), go: () => nav(`/thread/${c.chain}/${c.id}`) })),
  ].slice(0, 12);

  return (
    <div className="mer veil" onClick={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={e => e.stopPropagation()}>
        <input autoFocus value={q} placeholder="functions · cases…" aria-label="Search functions and cases"
               onChange={e => { setQ(e.target.value); setSel(0); }}
               onKeyDown={e => {
                 if (e.key === 'ArrowDown') setSel(s => Math.max(0, Math.min(s + 1, hits.length - 1)));
                 if (e.key === 'ArrowUp') setSel(s => Math.max(s - 1, 0));
                 if (e.key === 'Enter' && hits[sel]) { hits[sel].go(); setOpen(false); }
               }} />
        <div className="pal-hits">
          {hits.map((hit, i) => (
            <button key={i} type="button" className={`hit ${i === sel ? 'sel' : ''}`}
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
